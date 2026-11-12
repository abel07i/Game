-- ══════════════════════════════════════════════════════════════════════════════
--  FAST DERASH — Post-Schema Sync Migration
--  Synchronizes schema.sql with all tables, columns, and stored procedures used
--  by the current backend (safe & idempotent on both fresh and existing DBs).
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Support 15-player and custom group sizes in rooms & seat_quotas
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS chk_room_group_size;
ALTER TABLE seat_quotas DROP CONSTRAINT IF EXISTS chk_quota_group_size;

INSERT INTO seat_quotas (group_size, max_seats_per_user, tier_index)
VALUES (15, 3, 10)
ON CONFLICT (group_size) DO NOTHING;

-- 2. System Configuration Table
CREATE TABLE IF NOT EXISTS system_config (
    config_key   VARCHAR(100) PRIMARY KEY,
    config_value TEXT
);

INSERT INTO system_config (config_key, config_value) VALUES
    ('PLATFORM_FEE_RATE', '0.15'),
    ('MIN_WITHDRAWAL_AMOUNT', '10.00'),
    ('MAX_WITHDRAWAL_AMOUNT', '50000.00'),
    ('MAX_PENDING_WITHDRAWALS', '1'),
    ('TELEBIRR_PHONE', ''),
    ('TELEBIRR_NAME', ''),
    ('VERIFY_ET_API_KEY', '')
ON CONFLICT (config_key) DO NOTHING;

-- 3. External Telebirr Deposits Lock Table (Prevents double-spending)
CREATE TABLE IF NOT EXISTS external_deposits (
    transaction_id VARCHAR(128) PRIMARY KEY,
    user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    amount         NUMERIC(14, 2),
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. User Invite / Referral Tracking
CREATE TABLE IF NOT EXISTS user_invites (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    invite_code  VARCHAR(50) NOT NULL,
    bonus_amount NUMERIC(14, 2) DEFAULT 25.00,
    referrer_id  UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Withdrawal Requests Table
CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount              NUMERIC(14, 2) NOT NULL,
    phone_number        VARCHAR(50) NOT NULL,
    status              VARCHAR(20) DEFAULT 'pending',
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    admin_id            UUID REFERENCES users(id),
    notes               TEXT,
    transaction_id      UUID REFERENCES transactions(id) ON DELETE SET NULL,
    payment_method      VARCHAR(50) DEFAULT 'telebirr',
    account_holder_name VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_status ON withdrawal_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_created ON withdrawal_requests(created_at DESC);

-- 6. Telegram Password Reset & Link Sessions
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id VARCHAR(50) UNIQUE;

CREATE TABLE IF NOT EXISTS password_reset_codes (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code       VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used       BOOLEAN NOT NULL DEFAULT FALSE,
    attempts   INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE password_reset_codes ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_id ON password_reset_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_expires_at ON password_reset_codes(expires_at);

CREATE TABLE IF NOT EXISTS telegram_link_sessions (
    id               BIGSERIAL PRIMARY KEY,
    telegram_chat_id VARCHAR(50) NOT NULL,
    state            VARCHAR(50) NOT NULL DEFAULT 'awaiting_contact',
    expires_at       TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Updated Stored Procedures
DROP FUNCTION IF EXISTS fn_purchase_seats(uuid, uuid, integer, account_mode);

CREATE OR REPLACE FUNCTION public.fn_purchase_seats(
    p_room_id      UUID,
    p_user_id      UUID,
    p_seat_count   INTEGER,
    p_mode         account_mode,
    p_seat_numbers INTEGER[] DEFAULT NULL::INTEGER[]
)
RETURNS TABLE(
    success       BOOLEAN,
    error_message TEXT,
    new_balance   NUMERIC,
    total_cost    NUMERIC,
    seat_numbers  INTEGER[]
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_room          RECORD;
    v_wallet        RECORD;
    v_max_seats     INTEGER;
    v_user_seats    INTEGER;
    v_total_cost    NUMERIC(14,2);
    v_new_balance   NUMERIC(14,2);
    v_seat_nums     INTEGER[] := '{}';
    v_ticket_id     UUID;
    v_idempotency   VARCHAR(128);
    v_seat          INTEGER;
    v_occupied      INTEGER[];
BEGIN
    IF p_seat_count IS NULL OR p_seat_count < 1 THEN
        RETURN QUERY SELECT FALSE, 'Seat count must be at least 1'::TEXT, 0::NUMERIC(14,2), 0::NUMERIC(14,2), '{}'::INTEGER[];
        RETURN;
    END IF;

    SELECT r.*, sq.max_seats_per_user AS quota_max
    INTO v_room
    FROM rooms r
    JOIN seat_quotas sq ON sq.group_size = r.group_size
    WHERE r.id = p_room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Room not found'::TEXT, 0::NUMERIC(14,2), 0::NUMERIC(14,2), '{}'::INTEGER[];
        RETURN;
    END IF;

    IF v_room.status != 'open' THEN
        RETURN QUERY SELECT FALSE, 'Room is not open'::TEXT, 0::NUMERIC(14,2), 0::NUMERIC(14,2), '{}'::INTEGER[];
        RETURN;
    END IF;

    IF v_room.filled_seats + p_seat_count > v_room.group_size THEN
        RETURN QUERY SELECT FALSE, 'Not enough seats remaining'::TEXT, 0::NUMERIC(14,2), 0::NUMERIC(14,2), '{}'::INTEGER[];
        RETURN;
    END IF;

    SELECT COUNT(*) INTO v_user_seats
    FROM tickets
    WHERE room_id = p_room_id AND user_id = p_user_id AND is_refunded = FALSE;

    v_max_seats := v_room.quota_max;

    IF v_user_seats + p_seat_count > v_max_seats THEN
        RETURN QUERY SELECT FALSE,
            format('Max %s seats allowed per player for group size %s', v_max_seats, v_room.group_size)::TEXT,
            0::NUMERIC(14,2), 0::NUMERIC(14,2), '{}'::INTEGER[];
        RETURN;
    END IF;

    v_total_cost := v_room.ticket_price * p_seat_count;

    SELECT * INTO v_wallet
    FROM wallets
    WHERE user_id = p_user_id AND mode = p_mode
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Wallet not found'::TEXT, 0::NUMERIC(14,2), 0::NUMERIC(14,2), '{}'::INTEGER[];
        RETURN;
    END IF;

    IF v_wallet.balance < v_total_cost THEN
        RETURN QUERY SELECT FALSE, 'Insufficient balance'::TEXT, v_wallet.balance, v_total_cost, '{}'::INTEGER[];
        RETURN;
    END IF;

    SELECT COALESCE(array_agg(seat_number), '{}') INTO v_occupied
    FROM tickets
    WHERE room_id = p_room_id AND is_refunded = FALSE;

    IF p_seat_numbers IS NOT NULL AND array_length(p_seat_numbers, 1) > 0 THEN
        IF array_length(p_seat_numbers, 1) != p_seat_count THEN
            RETURN QUERY SELECT FALSE, 'Seat count does not match selected seats'::TEXT, v_wallet.balance, v_total_cost, '{}'::INTEGER[];
            RETURN;
        END IF;

        FOREACH v_seat IN ARRAY p_seat_numbers LOOP
            IF v_seat < 1 OR v_seat > v_room.group_size THEN
                RETURN QUERY SELECT FALSE, format('Seat %s is out of range (1-%s)', v_seat, v_room.group_size)::TEXT, v_wallet.balance, v_total_cost, '{}'::INTEGER[];
                RETURN;
            END IF;
            IF v_seat = ANY(v_occupied) THEN
                RETURN QUERY SELECT FALSE, format('Seat %s is already taken', v_seat)::TEXT, v_wallet.balance, v_total_cost, '{}'::INTEGER[];
                RETURN;
            END IF;
            IF v_seat = ANY(v_seat_nums) THEN
                RETURN QUERY SELECT FALSE, format('Duplicate seat %s in selection', v_seat)::TEXT, v_wallet.balance, v_total_cost, '{}'::INTEGER[];
                RETURN;
            END IF;
            v_seat_nums := array_append(v_seat_nums, v_seat);
        END LOOP;
    ELSE
        v_seat := 1;
        WHILE (array_length(v_seat_nums, 1) IS NULL OR array_length(v_seat_nums, 1) < p_seat_count) AND v_seat <= v_room.group_size LOOP
            IF NOT (v_seat = ANY(v_occupied)) THEN
                v_seat_nums := array_append(v_seat_nums, v_seat);
            END IF;
            v_seat := v_seat + 1;
        END LOOP;

        IF array_length(v_seat_nums, 1) < p_seat_count THEN
            RETURN QUERY SELECT FALSE, 'Not enough seats available'::TEXT, v_wallet.balance, v_total_cost, '{}'::INTEGER[];
            RETURN;
        END IF;
    END IF;

    v_new_balance := v_wallet.balance - v_total_cost;

    UPDATE wallets
    SET balance       = v_new_balance,
        total_wagered = total_wagered + v_total_cost,
        updated_at    = NOW()
    WHERE id = v_wallet.id;

    FOREACH v_seat IN ARRAY v_seat_nums LOOP
        v_ticket_id := uuid_generate_v4();

        INSERT INTO tickets (id, room_id, user_id, wallet_id, mode, seat_number, purchase_price)
        VALUES (v_ticket_id, p_room_id, p_user_id, v_wallet.id, p_mode, v_seat, v_room.ticket_price);

        v_idempotency := format('ticket_buy_%s_%s_%s_%s', p_room_id, p_user_id, v_seat, extract(epoch from now())::bigint);

        INSERT INTO transactions (wallet_id, room_id, ticket_id, tx_type, amount, direction, running_balance, reference_note, idempotency_key)
        VALUES (v_wallet.id, p_room_id, v_ticket_id, 'ticket_buy', v_room.ticket_price, -1, v_new_balance,
                format('Seat #%s in room #%s', v_seat, v_room.room_number), v_idempotency);
    END LOOP;

    UPDATE rooms
    SET filled_seats = (SELECT COUNT(*) FROM tickets WHERE room_id = p_room_id AND is_refunded = FALSE),
        gross_pool   = ticket_price * (SELECT COUNT(*) FROM tickets WHERE room_id = p_room_id AND is_refunded = FALSE)
    WHERE id = p_room_id;

    RETURN QUERY SELECT TRUE, NULL::TEXT, v_new_balance, v_total_cost, v_seat_nums;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_settle_room(p_room_id uuid, p_winner_ticket_id uuid)
RETURNS TABLE(success boolean, error_message text, gross_pool_out numeric, platform_fee_out numeric, net_payout_out numeric, winner_user_id_out uuid, winner_new_balance numeric)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_room          RECORD;
    v_winner_ticket RECORD;
    v_wallet        RECORD;
    v_gross         NUMERIC(14,2);
    v_fee           NUMERIC(14,2);
    v_net           NUMERIC(14,2);
    v_new_balance   NUMERIC(14,2);
    v_fee_rate      NUMERIC;
BEGIN
    SELECT COALESCE((SELECT NULLIF(config_value, '')::NUMERIC FROM system_config WHERE config_key = 'PLATFORM_FEE_RATE'), 0.15) INTO v_fee_rate;

    SELECT * INTO v_room FROM rooms WHERE id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Room not found'::TEXT, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, NULL::UUID, 0::NUMERIC;
        RETURN;
    END IF;

    IF v_room.status != 'drawing' THEN
        RETURN QUERY SELECT FALSE, 'Room is not in drawing state'::TEXT, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, NULL::UUID, 0::NUMERIC;
        RETURN;
    END IF;

    SELECT * INTO v_winner_ticket FROM tickets WHERE id = p_winner_ticket_id AND room_id = p_room_id;
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Winner ticket not found in this room'::TEXT, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, NULL::UUID, 0::NUMERIC;
        RETURN;
    END IF;

    v_gross := v_room.ticket_price * v_room.filled_seats;
    v_fee   := ROUND(v_gross * v_fee_rate, 2);
    v_net   := v_gross - v_fee;

    UPDATE tickets SET is_winner = TRUE WHERE id = p_winner_ticket_id;

    SELECT * INTO v_wallet FROM wallets WHERE id = v_winner_ticket.wallet_id FOR UPDATE;
    v_new_balance := v_wallet.balance + v_net;

    UPDATE wallets
    SET balance    = v_new_balance,
        total_won  = total_won + v_net,
        updated_at = NOW()
    WHERE id = v_wallet.id;

    INSERT INTO transactions (wallet_id, room_id, ticket_id, tx_type, amount, direction, running_balance, fee_deducted, reference_note)
    VALUES (v_wallet.id, p_room_id, p_winner_ticket_id, 'payout_win', v_net, 1, v_new_balance, v_fee,
            format('Winner payout for room #%s (gross: %s, fee %s%%: %s)', v_room.room_number, v_gross, (v_fee_rate * 100)::INT, v_fee));

    INSERT INTO transactions (wallet_id, room_id, tx_type, amount, direction, running_balance, reference_note)
    VALUES (v_wallet.id, p_room_id, 'platform_tax', v_fee, -1, v_new_balance,
            format('%s%% platform commission from room #%s', (v_fee_rate * 100)::INT, v_room.room_number));

    INSERT INTO platform_treasury (room_id, gross_pool, tax_rate, tax_collected, net_paid_out, winner_user_id)
    VALUES (p_room_id, v_gross, v_fee_rate, v_fee, v_net, v_winner_ticket.user_id);

    UPDATE rooms
    SET status            = 'settled',
        gross_pool        = v_gross,
        platform_fee      = v_fee,
        net_winner_payout = v_net,
        winner_ticket_id  = p_winner_ticket_id,
        winner_user_id    = v_winner_ticket.user_id,
        settled_at        = NOW()
    WHERE id = p_room_id;

    IF v_winner_ticket.mode = 'demo' THEN
        UPDATE wallets SET demo_rounds_won = demo_rounds_won + 1 WHERE id = v_wallet.id;
    END IF;

    RETURN QUERY SELECT TRUE, NULL::TEXT, v_gross, v_fee, v_net, v_winner_ticket.user_id, v_new_balance;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_wallet_deposit(
    p_user_id     uuid,
    p_amount      numeric,
    p_mode        account_mode,
    p_idempotency character varying DEFAULT NULL::character varying
)
RETURNS TABLE(success boolean, new_balance numeric)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_wallet  RECORD;
    v_new_bal NUMERIC(14,2);
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN QUERY SELECT FALSE, 0::NUMERIC(14,2);
        RETURN;
    END IF;

    IF p_idempotency IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM transactions WHERE idempotency_key = p_idempotency) THEN
            SELECT w.balance INTO v_new_bal FROM wallets w WHERE user_id = p_user_id AND mode = p_mode;
            RETURN QUERY SELECT TRUE, v_new_bal;
            RETURN;
        END IF;
    END IF;

    SELECT * INTO v_wallet FROM wallets WHERE user_id = p_user_id AND mode = p_mode FOR UPDATE;
    IF NOT FOUND THEN
        INSERT INTO wallets (user_id, mode, balance, total_deposited)
        VALUES (p_user_id, p_mode, p_amount, p_amount)
        RETURNING * INTO v_wallet;
        v_new_bal := p_amount;
    ELSE
        v_new_bal := v_wallet.balance + p_amount;
        UPDATE wallets
        SET balance         = v_new_bal,
            total_deposited = total_deposited + p_amount,
            updated_at      = NOW()
        WHERE id = v_wallet.id;
    END IF;

    INSERT INTO transactions (wallet_id, tx_type, amount, direction, running_balance, reference_note, idempotency_key)
    VALUES (v_wallet.id, 'deposit', p_amount, 1, v_new_bal, 'Wallet deposit', p_idempotency);

    RETURN QUERY SELECT TRUE, v_new_bal;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_wallet_withdraw(
    p_user_id     uuid,
    p_amount      numeric,
    p_mode        account_mode,
    p_idempotency character varying DEFAULT NULL::character varying
)
RETURNS TABLE(success boolean, error_message text, new_balance numeric)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_wallet  RECORD;
    v_new_bal NUMERIC(14,2);
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN QUERY SELECT FALSE, 'Withdrawal amount must be positive'::TEXT, 0::NUMERIC(14,2);
        RETURN;
    END IF;

    IF p_idempotency IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM transactions WHERE idempotency_key = p_idempotency) THEN
            SELECT w.balance INTO v_new_bal FROM wallets w WHERE user_id = p_user_id AND mode = p_mode;
            RETURN QUERY SELECT TRUE, NULL::TEXT, v_new_bal;
            RETURN;
        END IF;
    END IF;

    SELECT * INTO v_wallet FROM wallets WHERE user_id = p_user_id AND mode = p_mode FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Wallet not found'::TEXT, 0::NUMERIC(14,2);
        RETURN;
    END IF;

    IF v_wallet.balance < p_amount THEN
        RETURN QUERY SELECT FALSE, 'Insufficient balance'::TEXT, v_wallet.balance;
        RETURN;
    END IF;

    v_new_bal := v_wallet.balance - p_amount;

    UPDATE wallets
    SET balance         = v_new_bal,
        total_withdrawn = total_withdrawn + p_amount,
        updated_at      = NOW()
    WHERE id = v_wallet.id;

    INSERT INTO transactions (wallet_id, tx_type, amount, direction, running_balance, reference_note, idempotency_key)
    VALUES (v_wallet.id, 'withdrawal', p_amount, -1, v_new_bal, 'Wallet withdrawal', p_idempotency);

    RETURN QUERY SELECT TRUE, NULL::TEXT, v_new_bal;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_wallet_refund(
    p_user_id     uuid,
    p_amount      numeric,
    p_mode        account_mode DEFAULT 'real',
    p_note        text DEFAULT 'Refund',
    p_idempotency character varying DEFAULT NULL::character varying
)
RETURNS TABLE(success boolean, new_balance numeric)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_wallet  RECORD;
    v_new_bal NUMERIC(14,2);
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN QUERY SELECT FALSE, 0::NUMERIC(14,2);
        RETURN;
    END IF;

    IF p_idempotency IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM transactions WHERE idempotency_key = p_idempotency) THEN
            SELECT w.balance INTO v_new_bal FROM wallets w WHERE user_id = p_user_id AND mode = p_mode;
            RETURN QUERY SELECT TRUE, v_new_bal;
            RETURN;
        END IF;
    END IF;

    SELECT * INTO v_wallet FROM wallets WHERE user_id = p_user_id AND mode = p_mode FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0::NUMERIC(14,2);
        RETURN;
    END IF;

    v_new_bal := v_wallet.balance + p_amount;

    UPDATE wallets
    SET balance         = v_new_bal,
        total_withdrawn = GREATEST(0, total_withdrawn - p_amount),
        updated_at      = NOW()
    WHERE id = v_wallet.id;

    INSERT INTO transactions (wallet_id, tx_type, amount, direction, running_balance, reference_note, idempotency_key)
    VALUES (v_wallet.id, 'refund', p_amount, 1, v_new_bal, p_note, p_idempotency);

    RETURN QUERY SELECT TRUE, v_new_bal;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_prevent_tx_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF current_setting('app.allow_tx_delete', true) = 'true' THEN
            RETURN OLD;
        END IF;
        RAISE EXCEPTION 'Transaction ledger is append-only: DELETE not allowed';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF current_setting('app.allow_tx_delete', true) = 'true' THEN
            RETURN NEW;
        END IF;
        IF OLD.amount != NEW.amount OR OLD.wallet_id != NEW.wallet_id OR OLD.direction != NEW.direction THEN
            RAISE EXCEPTION 'Transaction ledger is immutable: cannot modify amount, wallet, or direction';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

-- 8. Immutable Admin Audit Log Table (forensic trail for sensitive ledger actions)
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id        UUID,
    admin_username  VARCHAR(50),
    action          VARCHAR(64) NOT NULL,
    target_type     VARCHAR(64) NOT NULL,
    target_ids      TEXT[] NOT NULL DEFAULT '{}',
    snapshot        JSONB NOT NULL DEFAULT '[]'::jsonb,
    ip_address      VARCHAR(64),
    user_agent      TEXT,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Keep forensic admin_id immutable even if the user row is later removed
ALTER TABLE admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_admin_id_fkey;

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id ON admin_audit_logs(admin_id);

CREATE OR REPLACE FUNCTION public.fn_prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'Security audit log is strictly immutable: % not allowed', TG_OP;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_mutation ON admin_audit_logs;
CREATE TRIGGER trg_prevent_audit_log_mutation
    BEFORE UPDATE OR DELETE ON admin_audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_audit_log_mutation();

