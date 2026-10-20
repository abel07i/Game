-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE user_role AS ENUM ('player', 'admin', 'bot');
CREATE TYPE account_mode AS ENUM ('real', 'demo');
CREATE TYPE room_status AS ENUM ('open', 'drawing', 'settled', 'refunded');
CREATE TYPE transaction_type AS ENUM ('deposit', 'withdrawal', 'ticket_buy', 'payout_win', 'platform_tax', 'refund');
CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed');

-- 1. Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    display_name VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'player',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Wallets Table (Supports Dual Mode: Real & Demo with strict non-negative check)
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    mode account_mode NOT NULL DEFAULT 'real',
    balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0.00),
    demo_rounds_played INT DEFAULT 0,
    demo_rounds_won INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_wallet_mode UNIQUE(user_id, mode)
);

-- 3. Game Rooms Table
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_number SERIAL UNIQUE,
    tier_category VARCHAR(20) NOT NULL, -- 'starter', 'bronze', 'silver', 'gold'
    target_jackpot NUMERIC(14, 2) NOT NULL,
    group_size INT NOT NULL CHECK (group_size IN (5, 10, 20, 30, 40, 50, 60, 70, 80)),
    ticket_price NUMERIC(14, 2) NOT NULL,
    max_seats_per_player INT NOT NULL,
    status room_status DEFAULT 'open',
    gross_pool NUMERIC(14, 2) DEFAULT 0.00,
    platform_fee NUMERIC(14, 2) DEFAULT 0.00, -- 15% platform commission
    net_winner_payout NUMERIC(14, 2) DEFAULT 0.00, -- 85% payout
    winner_ticket_id UUID NULL,
    winner_user_id UUID REFERENCES users(id) NULL,
    round_duration_seconds INT DEFAULT 45,
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE NULL
);

-- 4. Tickets Table (Seats booked in rooms)
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    mode account_mode NOT NULL DEFAULT 'real',
    seat_number INT NOT NULL,
    is_winner BOOLEAN DEFAULT FALSE,
    purchased_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_room_seat UNIQUE(room_id, seat_number)
);

-- 5. Ledger / Financial Transactions Table
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID REFERENCES wallets(id) ON DELETE RESTRICT,
    room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
    tx_type transaction_type NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    fee_deducted NUMERIC(14, 2) DEFAULT 0.00,
    status transaction_status DEFAULT 'completed',
    reference_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Platform Revenue Treasury Table
CREATE TABLE platform_treasury (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) UNIQUE,
    gross_pool NUMERIC(14, 2) NOT NULL,
    tax_rate NUMERIC(4, 2) DEFAULT 0.15,
    tax_collected NUMERIC(14, 2) NOT NULL,
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for ultra-fast query execution
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_tickets_room_id ON tickets(room_id);
CREATE INDEX idx_tickets_user_id ON tickets(user_id);
CREATE INDEX idx_wallets_user_mode ON wallets(user_id, mode);
CREATE INDEX idx_tx_wallet_id ON transactions(wallet_id);

-- Stored Procedure for Purchasing Tickets with Financial Integrity
CREATE OR REPLACE FUNCTION buy_tickets(
    p_user_id UUID,
    p_room_id UUID,
    p_total_price NUMERIC,
    p_seat_numbers INT[]
) RETURNS BOOLEAN AS $$
DECLARE
    v_balance NUMERIC;
    v_wallet_id UUID;
    v_ticket_price NUMERIC;
BEGIN
    -- Row-level locking on wallet to prevent double spending
    SELECT id, balance INTO v_wallet_id, v_balance
    FROM wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_balance < p_total_price THEN
        RAISE EXCEPTION 'Insufficient balance';
    END IF;

    -- Update balance
    UPDATE wallets
    SET balance = balance - p_total_price,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Record transaction
    INSERT INTO transactions (wallet_id, room_id, tx_type, amount, fee_deducted, status)
    VALUES (v_wallet_id, p_room_id, 'ticket_buy', p_total_price, 0.00, 'completed');

    -- Calculate ticket price
    v_ticket_price := p_total_price / array_length(p_seat_numbers, 1);

    -- Insert seats (assuming room constraints are handled in app layer or here)
    FOR i IN 1..array_length(p_seat_numbers, 1) LOOP
        INSERT INTO tickets (room_id, user_id, wallet_id, purchase_price, seat_number)
        VALUES (p_room_id, p_user_id, v_wallet_id, v_ticket_price, p_seat_numbers[i]);
    END LOOP;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
