-- Drop existing versions to avoid parameter overload mismatch
DROP FUNCTION IF EXISTS fn_purchase_seats(UUID, UUID, INTEGER, account_mode);
DROP FUNCTION IF EXISTS fn_purchase_seats(UUID, UUID, INTEGER, account_mode, INTEGER[]);

CREATE OR REPLACE FUNCTION fn_purchase_seats(
    p_room_id       UUID,
    p_user_id       UUID,
    p_seat_count    INTEGER,
    p_mode          account_mode,
    p_seat_numbers  INTEGER[] DEFAULT NULL
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
    v_ticket_id     UUID;
    v_idempotency   VARCHAR(128);
    v_seat          INTEGER;
    v_occupied      INTEGER[];
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
    WHERE room_id = p_room_id AND user_id = p_user_id AND is_refunded = FALSE;

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

    -- 6. Determine seat numbers to assign
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
        -- Auto-assign lowest available seat numbers
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

    -- 7. Debit wallet
    v_new_balance := v_wallet.balance - v_total_cost;

    UPDATE wallets
    SET balance       = v_new_balance,
        total_wagered = total_wagered + v_total_cost,
        updated_at    = NOW()
    WHERE id = v_wallet.id;

    -- 8. Create tickets and ledger entries
    FOREACH v_seat IN ARRAY v_seat_nums LOOP
        v_ticket_id := uuid_generate_v4();

        INSERT INTO tickets (id, room_id, user_id, wallet_id, mode, seat_number, purchase_price)
        VALUES (v_ticket_id, p_room_id, p_user_id, v_wallet.id, p_mode, v_seat, v_room.ticket_price);

        v_idempotency := format('ticket_buy_%s_%s_%s_%s', p_room_id, p_user_id, v_seat, extract(epoch from now())::bigint);

        INSERT INTO transactions (wallet_id, room_id, ticket_id, tx_type, amount, direction, running_balance, reference_note, idempotency_key)
        VALUES (v_wallet.id, p_room_id, v_ticket_id, 'ticket_buy', v_room.ticket_price, -1, v_new_balance, 
                format('Seat #%s in room #%s', v_seat, v_room.room_number), v_idempotency);
    END LOOP;

    -- 9. Update room filled seats
    UPDATE rooms
    SET filled_seats = (SELECT COUNT(*) FROM tickets WHERE room_id = p_room_id AND is_refunded = FALSE),
        gross_pool   = ticket_price * (SELECT COUNT(*) FROM tickets WHERE room_id = p_room_id AND is_refunded = FALSE)
    WHERE id = p_room_id;

    RETURN QUERY SELECT TRUE, NULL::TEXT, v_new_balance, v_total_cost, v_seat_nums;
END;
$$;
