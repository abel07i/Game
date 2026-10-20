CREATE OR REPLACE FUNCTION buy_tickets(
    p_user_id UUID,
    p_room_id UUID,
    p_total_price NUMERIC,
    p_seat_numbers INT[],
    p_mode account_mode DEFAULT 'real'
) RETURNS BOOLEAN AS $$
DECLARE
    v_balance NUMERIC;
    v_wallet_id UUID;
    v_ticket_price NUMERIC;
BEGIN
    SELECT id, balance INTO v_wallet_id, v_balance
    FROM wallets
    WHERE user_id = p_user_id AND mode = p_mode
    FOR UPDATE;

    IF v_wallet_id IS NULL THEN
        RAISE EXCEPTION 'Wallet not found for mode %', p_mode;
    END IF;

    IF v_balance < p_total_price THEN
        RAISE EXCEPTION 'Insufficient balance';
    END IF;

    UPDATE wallets
    SET balance = balance - p_total_price,
        updated_at = NOW()
    WHERE id = v_wallet_id;

    INSERT INTO transactions (wallet_id, room_id, tx_type, amount, fee_deducted, status)
    VALUES (v_wallet_id, p_room_id, 'ticket_buy', p_total_price, 0.00, 'completed');

    v_ticket_price := p_total_price / array_length(p_seat_numbers, 1);

    FOR i IN 1..array_length(p_seat_numbers, 1) LOOP
        INSERT INTO tickets (room_id, user_id, wallet_id, mode, purchase_price, seat_number)
        VALUES (p_room_id, p_user_id, v_wallet_id, p_mode, v_ticket_price, p_seat_numbers[i]);
    END LOOP;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
