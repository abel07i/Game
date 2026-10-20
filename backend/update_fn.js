const db = require('./src/db');
async function run() {
  try {
    await db.query(`
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
          -- 0. Get fee rate from config
          SELECT COALESCE((SELECT config_value::NUMERIC FROM system_config WHERE config_key = 'PLATFORM_FEE_RATE'), 0.15) INTO v_fee_rate;

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
          v_fee   := ROUND(v_gross * v_fee_rate, 2);
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
                  format('Winner payout for room #%s (gross: %s, fee %s%%: %s)', v_room.room_number, v_gross, (v_fee_rate * 100)::INT, v_fee));

          -- 7. Record platform fee transaction (system ledger entry)
          INSERT INTO transactions (wallet_id, room_id, tx_type, amount, direction, running_balance, reference_note)
          VALUES (v_wallet.id, p_room_id, 'platform_tax', v_fee, -1, v_new_balance,
                  format('%s%% platform commission from room #%s', (v_fee_rate * 100)::INT, v_room.room_number));

          -- 8. Record in platform treasury
          INSERT INTO platform_treasury (room_id, gross_pool, tax_rate, tax_collected, net_paid_out, winner_user_id)
          VALUES (p_room_id, v_gross, v_fee_rate, v_fee, v_net, v_winner_ticket.user_id);

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
      $function$
    `);
    
    // Also insert the default config value just in case
    await db.query("INSERT INTO system_config (config_key, config_value) VALUES ('PLATFORM_FEE_RATE', '0.15') ON CONFLICT DO NOTHING");

    console.log("Function updated successfully");
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
