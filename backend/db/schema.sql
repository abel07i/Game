-- ══════════════════════════════════════════════════════════════════════════════
--  FAST DERASH — Complete PostgreSQL Database Schema
--  Production-grade migration with ACID-compliant financial integrity
-- ══════════════════════════════════════════════════════════════════════════════

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │  0. EXTENSIONS                                                          │
-- └──────────────────────────────────────────────────────────────────────────┘

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";        -- For gen_random_bytes / HMAC


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │  1. ENUM TYPES                                                          │
-- └──────────────────────────────────────────────────────────────────────────┘

CREATE TYPE user_role        AS ENUM ('player', 'admin', 'bot');
CREATE TYPE account_mode     AS ENUM ('real', 'demo');
CREATE TYPE room_status      AS ENUM ('open', 'drawing', 'settled', 'refunded');
CREATE TYPE tier_category    AS ENUM ('starter', 'bronze', 'silver', 'gold');
CREATE TYPE transaction_type AS ENUM (
    'deposit', 'withdrawal', 'ticket_buy', 'payout_win',
    'platform_tax', 'refund', 'demo_credit', 'adjustment'
);
CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed', 'reversed');


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │  2. TABLES                                                              │
-- └──────────────────────────────────────────────────────────────────────────┘

-- ─── 2.1  Users ─────────────────────────────────────────────────────────────

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number    VARCHAR(20) UNIQUE,                         -- NULL for bots / demo users
    display_name    VARCHAR(50) NOT NULL,
    password_hash   VARCHAR(255),                               -- NULL for demo / bot accounts
    role            user_role NOT NULL DEFAULT 'player',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  users IS 'All system users: players, admins, and bot accounts';
COMMENT ON COLUMN users.phone_number IS 'Unique phone for real players; NULL for bots/demo';


-- ─── 2.2  Wallets (Dual Mode: Real & Demo) ─────────────────────────────────

CREATE TABLE wallets (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode                account_mode NOT NULL DEFAULT 'real',
    balance             NUMERIC(14, 2) NOT NULL DEFAULT 0.00
                            CONSTRAINT chk_wallet_balance_non_negative CHECK (balance >= 0.00),
    total_deposited     NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_withdrawn     NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_wagered       NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_won           NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    demo_rounds_played  INTEGER NOT NULL DEFAULT 0,
    demo_rounds_won     INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_wallet_user_mode UNIQUE (user_id, mode)
);

COMMENT ON TABLE  wallets IS 'Each user has up to 2 wallets: real and demo. Balance CHECK >= 0 prevents overdraft.';
COMMENT ON COLUMN wallets.demo_rounds_played IS 'Tracks sliding window for demo 35% win-rate rigging';


-- ─── 2.3  Game Rooms ────────────────────────────────────────────────────────

CREATE TABLE rooms (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_number             SERIAL UNIQUE,
    tier                    tier_category NOT NULL,
    target_jackpot          NUMERIC(14, 2) NOT NULL
                                CONSTRAINT chk_room_jackpot_positive CHECK (target_jackpot > 0),
    group_size              INTEGER NOT NULL
                                CONSTRAINT chk_room_group_size CHECK (group_size IN (5,10,20,30,40,50,60,70,80)),
    ticket_price            NUMERIC(14, 2) NOT NULL
                                CONSTRAINT chk_room_ticket_price_positive CHECK (ticket_price > 0),
    max_seats_per_player    INTEGER NOT NULL DEFAULT 1,
    filled_seats            INTEGER NOT NULL DEFAULT 0,
    status                  room_status NOT NULL DEFAULT 'open',

    -- Provably Fair Seeds (revealed after settlement)
    server_seed             VARCHAR(128),
    server_seed_hash        VARCHAR(128),       -- SHA-256 hash shown to players BEFORE draw
    client_seed             VARCHAR(128),
    nonce                   INTEGER DEFAULT 0,

    -- Financial Settlement
    gross_pool              NUMERIC(14, 2) DEFAULT 0.00,
    platform_fee            NUMERIC(14, 2) DEFAULT 0.00,   -- 15% commission
    net_winner_payout       NUMERIC(14, 2) DEFAULT 0.00,   -- 85% to winner

    -- Winner info
    winner_ticket_id        UUID,
    winner_user_id          UUID REFERENCES users(id),

    -- Timing
    round_duration_seconds  INTEGER NOT NULL DEFAULT 45,
    started_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    draw_started_at         TIMESTAMP WITH TIME ZONE,
    settled_at              TIMESTAMP WITH TIME ZONE,

    -- Computed price check
    CONSTRAINT chk_room_price_matches CHECK (
        ABS(ticket_price - (target_jackpot / group_size)) < 0.01
    )
);

COMMENT ON TABLE  rooms IS 'Each room is a single round. Resolves when full OR timer expires with >=2 players.';
COMMENT ON COLUMN rooms.server_seed_hash IS 'Published before draw begins so players can verify fairness after reveal.';


-- ─── 2.4  Tickets (Seats) ───────────────────────────────────────────────────

CREATE TABLE tickets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id         UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_id       UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    mode            account_mode NOT NULL DEFAULT 'real',
    seat_number     INTEGER NOT NULL,
    purchase_price  NUMERIC(14, 2) NOT NULL,
    is_winner       BOOLEAN NOT NULL DEFAULT FALSE,
    is_refunded     BOOLEAN NOT NULL DEFAULT FALSE,
    purchased_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_ticket_room_seat UNIQUE (room_id, seat_number),
    CONSTRAINT chk_ticket_seat_positive CHECK (seat_number > 0)
);

COMMENT ON TABLE tickets IS 'Each row = one seat purchased in a room. Unique seat per room enforced.';


-- ─── 2.5  Financial Transactions (Double-Entry Ledger) ──────────────────────

CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id       UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    room_id         UUID REFERENCES rooms(id) ON DELETE SET NULL,
    ticket_id       UUID REFERENCES tickets(id) ON DELETE SET NULL,
    tx_type         transaction_type NOT NULL,
    amount          NUMERIC(14, 2) NOT NULL,          -- Always positive
    direction       SMALLINT NOT NULL DEFAULT 1        -- +1 = credit, -1 = debit
                        CONSTRAINT chk_tx_direction CHECK (direction IN (1, -1)),
    running_balance NUMERIC(14, 2),                    -- Balance AFTER this transaction
    fee_deducted    NUMERIC(14, 2) DEFAULT 0.00,
    status          transaction_status NOT NULL DEFAULT 'completed',
    reference_note  TEXT,
    idempotency_key VARCHAR(128) UNIQUE,               -- Prevent duplicate processing
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  transactions IS 'Immutable append-only ledger. Every balance change has a corresponding row.';
COMMENT ON COLUMN transactions.direction IS '+1 for credit (deposit/win), -1 for debit (buy/withdraw)';
COMMENT ON COLUMN transactions.running_balance IS 'Wallet balance immediately after this transaction applied';
COMMENT ON COLUMN transactions.idempotency_key IS 'Unique key to prevent duplicate transaction processing';


-- ─── 2.6  Platform Revenue Treasury ─────────────────────────────────────────

CREATE TABLE platform_treasury (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id         UUID NOT NULL REFERENCES rooms(id),
    gross_pool      NUMERIC(14, 2) NOT NULL,
    tax_rate        NUMERIC(5, 4) NOT NULL DEFAULT 0.1500,   -- 15.00%
    tax_collected   NUMERIC(14, 2) NOT NULL,
    net_paid_out    NUMERIC(14, 2) NOT NULL,
    winner_user_id  UUID REFERENCES users(id),
    collected_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_treasury_room UNIQUE (room_id),
    CONSTRAINT chk_treasury_math CHECK (
        ABS(tax_collected - ROUND(gross_pool * tax_rate, 2)) < 0.02
        AND ABS(net_paid_out - (gross_pool - tax_collected)) < 0.02
    )
);

COMMENT ON TABLE platform_treasury IS 'One row per settled room. CHECK constraint verifies 15% math integrity.';


-- ─── 2.7  Demo Win-Rate Tracking ────────────────────────────────────────────

CREATE TABLE demo_win_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id         UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    round_index     INTEGER NOT NULL,           -- demo_rounds_played at time of game
    did_win         BOOLEAN NOT NULL,
    window_wins     INTEGER NOT NULL,           -- Wins in last 10 games at this point
    window_total    INTEGER NOT NULL,           -- Total games in window (max 10)
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE demo_win_history IS 'Audit trail for demo mode 35% win-rate enforcement (3-4 wins per 10 games window)';


-- ─── 2.8  Seat Quota Configuration ─────────────────────────────────────────

CREATE TABLE seat_quotas (
    group_size          INTEGER PRIMARY KEY
                            CONSTRAINT chk_quota_group_size CHECK (group_size IN (5,10,20,30,40,50,60,70,80)),
    max_seats_per_user  INTEGER NOT NULL
                            CONSTRAINT chk_quota_max_seats CHECK (max_seats_per_user >= 1 AND max_seats_per_user <= group_size),
    tier_index          INTEGER NOT NULL UNIQUE
);

-- Populate the fixed quota table
INSERT INTO seat_quotas (group_size, max_seats_per_user, tier_index) VALUES
    (5,  1, 1),
    (10, 2, 2),
    (20, 4, 3),
    (30, 5, 4),
    (40, 6, 5),
    (50, 7, 6),
    (60, 8, 7),
    (70, 9, 8),
    (80, 10, 9);

COMMENT ON TABLE seat_quotas IS 'Immutable configuration: max seats per player scaled by group size tier index';


-- ─── 2.9  Tier Jackpot Configuration ───────────────────────────────────────

CREATE TABLE tier_config (
    id              SERIAL PRIMARY KEY,
    tier            tier_category NOT NULL,
    jackpot_amount  NUMERIC(14, 2) NOT NULL,

    CONSTRAINT uq_tier_jackpot UNIQUE (tier, jackpot_amount)
);

-- Starter: 500 ETB
INSERT INTO tier_config (tier, jackpot_amount) VALUES ('starter', 500);

-- Bronze: 1,000 to 9,000 (interval 1,000)
INSERT INTO tier_config (tier, jackpot_amount)
SELECT 'bronze', generate_series(1000, 9000, 1000)::NUMERIC;

-- Silver: 10,000 to 90,000 (interval 10,000)
INSERT INTO tier_config (tier, jackpot_amount)
SELECT 'silver', generate_series(10000, 90000, 10000)::NUMERIC;

-- Gold: 100,000 to 1,000,000 (interval 100,000)
INSERT INTO tier_config (tier, jackpot_amount)
SELECT 'gold', generate_series(100000, 1000000, 100000)::NUMERIC;

COMMENT ON TABLE tier_config IS 'Valid tier/jackpot combinations. Rooms must use a jackpot from this table.';


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │  3. INDEXES — Ultra-fast query execution                                │
-- └──────────────────────────────────────────────────────────────────────────┘

-- Users
CREATE INDEX idx_users_phone         ON users(phone_number) WHERE phone_number IS NOT NULL;
CREATE INDEX idx_users_role          ON users(role);

-- Wallets
CREATE INDEX idx_wallets_user_mode   ON wallets(user_id, mode);

-- Rooms
CREATE INDEX idx_rooms_status        ON rooms(status);
CREATE INDEX idx_rooms_tier_status   ON rooms(tier, status);
CREATE INDEX idx_rooms_started       ON rooms(started_at DESC);

-- Tickets
CREATE INDEX idx_tickets_room        ON tickets(room_id);
CREATE INDEX idx_tickets_user        ON tickets(user_id);
CREATE INDEX idx_tickets_room_user   ON tickets(room_id, user_id);
CREATE INDEX idx_tickets_winner      ON tickets(room_id) WHERE is_winner = TRUE;

-- Transactions
CREATE INDEX idx_tx_wallet           ON transactions(wallet_id);
CREATE INDEX idx_tx_wallet_created   ON transactions(wallet_id, created_at DESC);
CREATE INDEX idx_tx_room             ON transactions(room_id) WHERE room_id IS NOT NULL;
CREATE INDEX idx_tx_type             ON transactions(tx_type);
CREATE INDEX idx_tx_idempotency      ON transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Platform Treasury
CREATE INDEX idx_treasury_collected  ON platform_treasury(collected_at DESC);

-- Demo Win History
CREATE INDEX idx_demo_history_user   ON demo_win_history(user_id, created_at DESC);


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │  4. STORED PROCEDURES — Atomic financial operations                     │
-- └──────────────────────────────────────────────────────────────────────────┘

-- ─── 4.1  Atomic Ticket Purchase ────────────────────────────────────────────
-- Uses SELECT ... FOR UPDATE to lock the wallet row, preventing double-spend

CREATE OR REPLACE FUNCTION fn_purchase_seats(
    p_room_id       UUID,
    p_user_id       UUID,
    p_seat_count    INTEGER,
    p_mode          account_mode
)
RETURNS TABLE (
    success         BOOLEAN,
    error_message   TEXT,
    new_balance     NUMERIC(14,2),
    total_cost      NUMERIC(14,2),
    seat_numbers    INTEGER[]
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_room          RECORD;
    v_wallet        RECORD;
    v_max_seats     INTEGER;
    v_user_seats    INTEGER;
    v_total_cost    NUMERIC(14,2);
    v_new_balance   NUMERIC(14,2);
    v_seat_nums     INTEGER[] := '{}';
    v_next_seat     INTEGER;
    v_ticket_id     UUID;
    v_idempotency   VARCHAR(128);
    i               INTEGER;
BEGIN
    -- 1. Lock and fetch room
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

    -- 2. Check remaining capacity
    IF v_room.filled_seats + p_seat_count > v_room.group_size THEN
        RETURN QUERY SELECT FALSE, 'Not enough seats remaining'::TEXT, 0::NUMERIC(14,2), 0::NUMERIC(14,2), '{}'::INTEGER[];
        RETURN;
    END IF;

    -- 3. Enforce per-user seat quota
    SELECT COUNT(*) INTO v_user_seats
    FROM tickets
    WHERE room_id = p_room_id AND user_id = p_user_id;

    v_max_seats := v_room.quota_max;

    IF v_user_seats + p_seat_count > v_max_seats THEN
        RETURN QUERY SELECT FALSE,
            format('Max %s seats allowed per player for group size %s', v_max_seats, v_room.group_size)::TEXT,
            0::NUMERIC(14,2), 0::NUMERIC(14,2), '{}'::INTEGER[];
        RETURN;
    END IF;

    -- 4. Calculate cost
    v_total_cost := v_room.ticket_price * p_seat_count;

    -- 5. Lock wallet and debit
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

    -- Debit wallet
    v_new_balance := v_wallet.balance - v_total_cost;

    UPDATE wallets
    SET balance       = v_new_balance,
        total_wagered = total_wagered + v_total_cost,
        updated_at    = NOW()
    WHERE id = v_wallet.id;

    -- 6. Create tickets and assign seat numbers
    v_next_seat := v_room.filled_seats;

    FOR i IN 1..p_seat_count LOOP
        v_next_seat := v_next_seat + 1;
        v_ticket_id := uuid_generate_v4();

        INSERT INTO tickets (id, room_id, user_id, wallet_id, mode, seat_number, purchase_price)
        VALUES (v_ticket_id, p_room_id, p_user_id, v_wallet.id, p_mode, v_next_seat, v_room.ticket_price);

        v_seat_nums := array_append(v_seat_nums, v_next_seat);

        -- Record transaction for each ticket
        v_idempotency := format('ticket_buy_%s_%s_%s', p_room_id, p_user_id, v_next_seat);

        INSERT INTO transactions (wallet_id, room_id, ticket_id, tx_type, amount, direction, running_balance, reference_note, idempotency_key)
        VALUES (v_wallet.id, p_room_id, v_ticket_id, 'ticket_buy', v_room.ticket_price, -1, v_new_balance, 
                format('Seat #%s in room %s', v_next_seat, v_room.room_number), v_idempotency);
    END LOOP;

    -- 7. Update room filled seats
    UPDATE rooms
    SET filled_seats = v_next_seat,
        gross_pool   = ticket_price * v_next_seat
    WHERE id = p_room_id;

    RETURN QUERY SELECT TRUE, NULL::TEXT, v_new_balance, v_total_cost, v_seat_nums;
END;
$$;

COMMENT ON FUNCTION fn_purchase_seats IS 'Atomic seat purchase: locks wallet FOR UPDATE, validates quota, debits, creates tickets. Zero double-spend risk.';


-- ─── 4.2  Atomic Room Settlement ────────────────────────────────────────────
-- Settles the room: picks winner, calculates 15% fee, credits winner, records treasury

CREATE OR REPLACE FUNCTION fn_settle_room(
    p_room_id           UUID,
    p_winner_ticket_id  UUID
)
RETURNS TABLE (
    success             BOOLEAN,
    error_message       TEXT,
    gross_pool_out      NUMERIC(14,2),
    platform_fee_out    NUMERIC(14,2),
    net_payout_out      NUMERIC(14,2),
    winner_user_id_out  UUID,
    winner_new_balance  NUMERIC(14,2)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_room          RECORD;
    v_winner_ticket RECORD;
    v_wallet        RECORD;
    v_gross         NUMERIC(14,2);
    v_fee           NUMERIC(14,2);
    v_net           NUMERIC(14,2);
    v_new_balance   NUMERIC(14,2);
BEGIN
    -- 1. Lock room
    SELECT * INTO v_room
    FROM rooms
    WHERE id = p_room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Room not found'::TEXT, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, NULL::UUID, 0::NUMERIC;
        RETURN;
    END IF;

    IF v_room.status != 'drawing' THEN
        RETURN QUERY SELECT FALSE, 'Room is not in drawing state'::TEXT, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, NULL::UUID, 0::NUMERIC;
        RETURN;
    END IF;

    -- 2. Validate winner ticket
    SELECT * INTO v_winner_ticket
    FROM tickets
    WHERE id = p_winner_ticket_id AND room_id = p_room_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Winner ticket not found in this room'::TEXT, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, NULL::UUID, 0::NUMERIC;
        RETURN;
    END IF;

    -- 3. Calculate payouts
    v_gross := v_room.ticket_price * v_room.filled_seats;
    v_fee   := ROUND(v_gross * 0.15, 2);
    v_net   := v_gross - v_fee;

    -- 4. Mark winning ticket
    UPDATE tickets SET is_winner = TRUE WHERE id = p_winner_ticket_id;

    -- 5. Credit winner's wallet (with lock)
    SELECT * INTO v_wallet
    FROM wallets
    WHERE id = v_winner_ticket.wallet_id
    FOR UPDATE;

    v_new_balance := v_wallet.balance + v_net;

    UPDATE wallets
    SET balance    = v_new_balance,
        total_won  = total_won + v_net,
        updated_at = NOW()
    WHERE id = v_wallet.id;

    -- 6. Record payout transaction
    INSERT INTO transactions (wallet_id, room_id, ticket_id, tx_type, amount, direction, running_balance, fee_deducted, reference_note)
    VALUES (v_wallet.id, p_room_id, p_winner_ticket_id, 'payout_win', v_net, 1, v_new_balance, v_fee,
            format('Winner payout for room #%s (gross: %s, fee 15%%: %s)', v_room.room_number, v_gross, v_fee));

    -- 7. Record platform fee transaction (system ledger entry)
    INSERT INTO transactions (wallet_id, room_id, tx_type, amount, direction, running_balance, reference_note)
    VALUES (v_wallet.id, p_room_id, 'platform_tax', v_fee, -1, v_new_balance,
            format('15%% platform commission from room #%s', v_room.room_number));

    -- 8. Record in platform treasury
    INSERT INTO platform_treasury (room_id, gross_pool, tax_rate, tax_collected, net_paid_out, winner_user_id)
    VALUES (p_room_id, v_gross, 0.15, v_fee, v_net, v_winner_ticket.user_id);

    -- 9. Update room to settled
    UPDATE rooms
    SET status            = 'settled',
        gross_pool        = v_gross,
        platform_fee      = v_fee,
        net_winner_payout = v_net,
        winner_ticket_id  = p_winner_ticket_id,
        winner_user_id    = v_winner_ticket.user_id,
        settled_at        = NOW()
    WHERE id = p_room_id;

    -- 10. Update demo stats if applicable
    IF v_winner_ticket.mode = 'demo' THEN
        UPDATE wallets
        SET demo_rounds_won = demo_rounds_won + 1
        WHERE id = v_wallet.id;
    END IF;

    RETURN QUERY SELECT TRUE, NULL::TEXT, v_gross, v_fee, v_net, v_winner_ticket.user_id, v_new_balance;
END;
$$;

COMMENT ON FUNCTION fn_settle_room IS 'Atomic settlement: locks room+wallet, calculates 15% fee, credits winner, records treasury. Single transaction.';


-- ─── 4.3  Atomic Room Refund ────────────────────────────────────────────────
-- Refunds all tickets in a room (when timer expires with < 2 players)

CREATE OR REPLACE FUNCTION fn_refund_room(
    p_room_id UUID
)
RETURNS TABLE (
    success         BOOLEAN,
    error_message   TEXT,
    refunded_count  INTEGER,
    total_refunded  NUMERIC(14,2)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_room          RECORD;
    v_ticket        RECORD;
    v_wallet        RECORD;
    v_new_balance   NUMERIC(14,2);
    v_count         INTEGER := 0;
    v_total         NUMERIC(14,2) := 0;
BEGIN
    -- Lock room
    SELECT * INTO v_room
    FROM rooms
    WHERE id = p_room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Room not found'::TEXT, 0, 0::NUMERIC(14,2);
        RETURN;
    END IF;

    -- Process each ticket
    FOR v_ticket IN
        SELECT t.* FROM tickets t WHERE t.room_id = p_room_id AND t.is_refunded = FALSE
        ORDER BY t.seat_number
    LOOP
        -- Lock wallet
        SELECT * INTO v_wallet
        FROM wallets WHERE id = v_ticket.wallet_id FOR UPDATE;

        v_new_balance := v_wallet.balance + v_ticket.purchase_price;

        -- Credit refund
        UPDATE wallets
        SET balance    = v_new_balance,
            updated_at = NOW()
        WHERE id = v_wallet.id;

        -- Mark ticket refunded
        UPDATE tickets SET is_refunded = TRUE WHERE id = v_ticket.id;

        -- Record refund transaction
        INSERT INTO transactions (wallet_id, room_id, ticket_id, tx_type, amount, direction, running_balance, reference_note)
        VALUES (v_wallet.id, p_room_id, v_ticket.id, 'refund', v_ticket.purchase_price, 1, v_new_balance,
                format('Refund for seat #%s in room #%s (insufficient players)', v_ticket.seat_number, v_room.room_number));

        v_count := v_count + 1;
        v_total := v_total + v_ticket.purchase_price;
    END LOOP;

    -- Update room status
    UPDATE rooms
    SET status     = 'refunded',
        settled_at = NOW()
    WHERE id = p_room_id;

    RETURN QUERY SELECT TRUE, NULL::TEXT, v_count, v_total;
END;
$$;

COMMENT ON FUNCTION fn_refund_room IS 'Atomic refund: locks each wallet FOR UPDATE, credits purchase price back, marks tickets refunded.';


-- ─── 4.4  Wallet Deposit ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_wallet_deposit(
    p_user_id       UUID,
    p_amount        NUMERIC(14,2),
    p_mode          account_mode,
    p_idempotency   VARCHAR(128) DEFAULT NULL
)
RETURNS TABLE (
    success         BOOLEAN,
    new_balance     NUMERIC(14,2)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_wallet    RECORD;
    v_new_bal   NUMERIC(14,2);
BEGIN
    -- Idempotency check
    IF p_idempotency IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM transactions WHERE idempotency_key = p_idempotency) THEN
            SELECT w.balance INTO v_new_bal FROM wallets w WHERE user_id = p_user_id AND mode = p_mode;
            RETURN QUERY SELECT TRUE, v_new_bal;
            RETURN;
        END IF;
    END IF;

    -- Lock wallet
    SELECT * INTO v_wallet FROM wallets WHERE user_id = p_user_id AND mode = p_mode FOR UPDATE;

    IF NOT FOUND THEN
        -- Auto-create wallet
        INSERT INTO wallets (user_id, mode, balance)
        VALUES (p_user_id, p_mode, p_amount)
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
$$;


-- ─── 4.5  Wallet Withdrawal ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_wallet_withdraw(
    p_user_id       UUID,
    p_amount        NUMERIC(14,2),
    p_mode          account_mode,
    p_idempotency   VARCHAR(128) DEFAULT NULL
)
RETURNS TABLE (
    success         BOOLEAN,
    error_message   TEXT,
    new_balance     NUMERIC(14,2)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_wallet    RECORD;
    v_new_bal   NUMERIC(14,2);
BEGIN
    -- Idempotency check
    IF p_idempotency IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM transactions WHERE idempotency_key = p_idempotency) THEN
            SELECT w.balance INTO v_new_bal FROM wallets w WHERE user_id = p_user_id AND mode = p_mode;
            RETURN QUERY SELECT TRUE, NULL::TEXT, v_new_bal;
            RETURN;
        END IF;
    END IF;

    -- Lock wallet
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
    SET balance          = v_new_bal,
        total_withdrawn  = total_withdrawn + p_amount,
        updated_at       = NOW()
    WHERE id = v_wallet.id;

    INSERT INTO transactions (wallet_id, tx_type, amount, direction, running_balance, reference_note, idempotency_key)
    VALUES (v_wallet.id, 'withdrawal', p_amount, -1, v_new_bal, 'Wallet withdrawal', p_idempotency);

    RETURN QUERY SELECT TRUE, NULL::TEXT, v_new_bal;
END;
$$;


-- ─── 4.6  Provably Fair Draw Computation ────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_provably_fair_draw(
    p_server_seed   TEXT,
    p_client_seed   TEXT,
    p_nonce         INTEGER,
    p_total_tickets INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
    v_message   TEXT;
    v_hmac      BYTEA;
    v_hex       TEXT;
    v_decimal   BIGINT;
BEGIN
    IF p_total_tickets <= 0 THEN
        RETURN 0;
    END IF;

    v_message := p_client_seed || ':' || p_nonce::TEXT;
    v_hmac    := hmac(v_message::BYTEA, p_server_seed::BYTEA, 'sha256');
    v_hex     := encode(v_hmac, 'hex');

    -- Use first 8 hex chars (4 bytes) to compute index
    v_decimal := ('x' || left(v_hex, 8))::BIT(32)::BIGINT;

    RETURN (v_decimal % p_total_tickets) + 1;  -- 1-indexed seat number
END;
$$;

COMMENT ON FUNCTION fn_provably_fair_draw IS 'HMAC-SHA256 provably fair winner selection. Deterministic: same inputs always produce same result.';


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │  5. TRIGGERS                                                            │
-- └──────────────────────────────────────────────────────────────────────────┘

-- ─── 5.1  Auto-update `updated_at` timestamp ────────────────────────────────

CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_wallets_updated_at
    BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();


-- ─── 5.2  Prevent ticket insertion on non-open rooms ────────────────────────

CREATE OR REPLACE FUNCTION fn_validate_ticket_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_status room_status;
BEGIN
    SELECT status INTO v_status FROM rooms WHERE id = NEW.room_id;

    IF v_status != 'open' THEN
        RAISE EXCEPTION 'Cannot purchase ticket: room % is not open (status: %)', NEW.room_id, v_status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickets_validate_room_open
    BEFORE INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION fn_validate_ticket_insert();


-- ─── 5.3  Prevent transaction ledger mutations (append-only) ────────────────

CREATE OR REPLACE FUNCTION fn_prevent_tx_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Transaction ledger is append-only: DELETE not allowed';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        -- Only allow status updates (pending → completed/failed)
        IF OLD.amount != NEW.amount OR OLD.wallet_id != NEW.wallet_id OR OLD.direction != NEW.direction THEN
            RAISE EXCEPTION 'Transaction ledger is immutable: cannot modify amount, wallet, or direction';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_immutable
    BEFORE UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION fn_prevent_tx_mutation();


-- ─── 5.4  Validate room creation: ticket_price = target_jackpot / group_size

CREATE OR REPLACE FUNCTION fn_validate_room_pricing()
RETURNS TRIGGER AS $$
BEGIN
    IF ABS(NEW.ticket_price - (NEW.target_jackpot / NEW.group_size)) > 0.01 THEN
        RAISE EXCEPTION 'Invalid ticket price: expected %, got %',
            ROUND(NEW.target_jackpot / NEW.group_size, 2), NEW.ticket_price;
    END IF;

    -- Set max_seats_per_player from quota table
    SELECT max_seats_per_user INTO NEW.max_seats_per_player
    FROM seat_quotas WHERE group_size = NEW.group_size;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rooms_validate_pricing
    BEFORE INSERT ON rooms
    FOR EACH ROW EXECUTE FUNCTION fn_validate_room_pricing();


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │  6. VIEWS — Reporting & Analytics                                       │
-- └──────────────────────────────────────────────────────────────────────────┘

-- ─── 6.1  Active rooms with fill percentage ─────────────────────────────────

CREATE OR REPLACE VIEW vw_active_rooms AS
SELECT
    r.id,
    r.room_number,
    r.tier,
    r.target_jackpot,
    r.group_size,
    r.ticket_price,
    r.filled_seats,
    r.group_size - r.filled_seats AS seats_remaining,
    ROUND((r.filled_seats::NUMERIC / r.group_size) * 100, 1) AS fill_percent,
    r.max_seats_per_player,
    r.status,
    r.started_at,
    EXTRACT(EPOCH FROM (r.started_at + (r.round_duration_seconds || ' seconds')::INTERVAL - NOW())) AS seconds_remaining
FROM rooms r
WHERE r.status IN ('open', 'drawing')
ORDER BY r.tier, r.target_jackpot;

COMMENT ON VIEW vw_active_rooms IS 'Real-time view of all rooms currently accepting players or mid-draw';


-- ─── 6.2  Platform revenue summary ──────────────────────────────────────────

CREATE OR REPLACE VIEW vw_platform_revenue AS
SELECT
    DATE_TRUNC('day', pt.collected_at) AS revenue_date,
    r.tier,
    COUNT(*)                            AS rooms_settled,
    SUM(pt.gross_pool)                  AS total_gross,
    SUM(pt.tax_collected)               AS total_fees,
    SUM(pt.net_paid_out)                AS total_payouts,
    ROUND(AVG(pt.gross_pool), 2)        AS avg_pool_size
FROM platform_treasury pt
JOIN rooms r ON r.id = pt.room_id
GROUP BY DATE_TRUNC('day', pt.collected_at), r.tier
ORDER BY revenue_date DESC, r.tier;

COMMENT ON VIEW vw_platform_revenue IS 'Daily platform revenue breakdown by tier';


-- ─── 6.3  Player leaderboard ────────────────────────────────────────────────

CREATE OR REPLACE VIEW vw_player_leaderboard AS
SELECT
    u.id AS user_id,
    u.display_name,
    w.mode,
    w.balance,
    w.total_wagered,
    w.total_won,
    CASE WHEN w.total_wagered > 0
         THEN ROUND((w.total_won / w.total_wagered) * 100, 2)
         ELSE 0
    END AS roi_percent,
    COUNT(DISTINCT t.room_id) AS rooms_played,
    COUNT(t.id) FILTER (WHERE t.is_winner = TRUE) AS wins
FROM users u
JOIN wallets w ON w.user_id = u.id
LEFT JOIN tickets t ON t.user_id = u.id AND t.mode = w.mode
WHERE u.role = 'player'
GROUP BY u.id, u.display_name, w.mode, w.balance, w.total_wagered, w.total_won
ORDER BY w.total_won DESC;

COMMENT ON VIEW vw_player_leaderboard IS 'Player rankings by total winnings and ROI';


-- ─── 6.4  User ticket history with outcomes ─────────────────────────────────

CREATE OR REPLACE VIEW vw_ticket_history AS
SELECT
    t.id AS ticket_id,
    t.user_id,
    u.display_name,
    r.room_number,
    r.tier,
    r.target_jackpot,
    r.ticket_price,
    t.seat_number,
    t.mode,
    t.purchased_at,
    t.is_winner,
    t.is_refunded,
    r.status AS room_status,
    r.settled_at,
    CASE
        WHEN t.is_winner THEN r.net_winner_payout
        WHEN t.is_refunded THEN t.purchase_price
        ELSE 0
    END AS amount_received
FROM tickets t
JOIN rooms r ON r.id = t.room_id
JOIN users u ON u.id = t.user_id
ORDER BY t.purchased_at DESC;

COMMENT ON VIEW vw_ticket_history IS 'Full ticket history with win/refund outcomes for player history page';


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │  7. SEED DATA — Initial admin user                                      │
-- └──────────────────────────────────────────────────────────────────────────┘

-- Create system admin
INSERT INTO users (id, display_name, role)
VALUES ('00000000-0000-0000-0000-000000000001', 'System Admin', 'admin');

-- Create platform treasury wallet (system account)
INSERT INTO wallets (user_id, mode, balance)
VALUES ('00000000-0000-0000-0000-000000000001', 'real', 0.00);


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │  8. GRANTS — Least-privilege access (adjust role names as needed)       │
-- └──────────────────────────────────────────────────────────────────────────┘

-- Application role (read/write to tables, execute functions)
-- Uncomment and adjust for your deployment:
--
-- CREATE ROLE fastderash_app LOGIN PASSWORD 'your_secure_password';
-- GRANT USAGE ON SCHEMA public TO fastderash_app;
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO fastderash_app;
-- GRANT DELETE ON demo_win_history TO fastderash_app;  -- Cleanup only
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fastderash_app;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO fastderash_app;
--
-- Read-only reporting role:
-- CREATE ROLE fastderash_readonly LOGIN PASSWORD 'your_secure_password';
-- GRANT USAGE ON SCHEMA public TO fastderash_readonly;
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO fastderash_readonly;


-- ══════════════════════════════════════════════════════════════════════════════
--  END OF MIGRATION
-- ══════════════════════════════════════════════════════════════════════════════
