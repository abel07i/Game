-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Enhanced Withdrawals Security & Features
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Add extra columns to withdrawal_requests if they do not exist
ALTER TABLE withdrawal_requests 
ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;

ALTER TABLE withdrawal_requests 
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'telebirr';

ALTER TABLE withdrawal_requests 
ADD COLUMN IF NOT EXISTS account_holder_name VARCHAR(100);

-- 2. Create indexes for high-speed queries and status lookups
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_status ON withdrawal_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_created ON withdrawal_requests(created_at DESC);

-- 3. Stored function for atomic wallet refund (decrement total_withdrawn, add balance, ledger tx_type = 'refund')
CREATE OR REPLACE FUNCTION public.fn_wallet_refund(
    p_user_id uuid, 
    p_amount numeric, 
    p_mode account_mode DEFAULT 'real', 
    p_note text DEFAULT 'Refund', 
    p_idempotency character varying DEFAULT NULL::character varying
)
RETURNS TABLE(success boolean, new_balance numeric)
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

    -- Lock wallet for update
    SELECT * INTO v_wallet FROM wallets WHERE user_id = p_user_id AND mode = p_mode FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0::NUMERIC(14,2);
        RETURN;
    END IF;

    v_new_bal := v_wallet.balance + p_amount;
    
    -- Refund: update balance and adjust total_withdrawn
    UPDATE wallets
    SET balance         = v_new_bal,
        total_withdrawn = GREATEST(0, total_withdrawn - p_amount),
        updated_at      = NOW()
    WHERE id = v_wallet.id;

    -- Insert ledger entry with 'refund' transaction type
    INSERT INTO transactions (wallet_id, tx_type, amount, direction, running_balance, reference_note, idempotency_key)
    VALUES (v_wallet.id, 'refund', p_amount, 1, v_new_bal, p_note, p_idempotency);

    RETURN QUERY SELECT TRUE, v_new_bal;
END;
$$;

-- 4. Insert or update default withdrawal configuration limits in system_config
INSERT INTO system_config (config_key, config_value)
VALUES 
    ('MIN_WITHDRAWAL_AMOUNT', '10.00'),
    ('MAX_WITHDRAWAL_AMOUNT', '50000.00'),
    ('MAX_PENDING_WITHDRAWALS', '1')
ON CONFLICT (config_key) DO NOTHING;
