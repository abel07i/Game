import { useState, useEffect } from "react";
import api from "../api";
import { TrendingUp, CreditCard, Gamepad2, Award } from "lucide-react";

export default function Profit() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getProfitSummary().then(res => setData(res)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-overlay"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="card mb-6">
        <div className="card-header"><div className="card-title">All-Time Financial Summary</div></div>
        <div className="card-body">
          <div className="grid-auto gap-4">
            <div style={{ padding: 24, background: "var(--success-light)", border: "1px solid var(--success)", borderRadius: "var(--radius)" }}>
              <div className="text-sm font-bold text-success uppercase mb-2 flex-center gap-2"><TrendingUp size={16}/> Total Platform Profit</div>
              <div style={{ fontSize: 36, fontWeight: 800, color: "var(--success)" }}>{data.platform_profit} ETB</div>
              <div className="text-sm mt-2" style={{ color: "var(--success)", opacity: 0.8 }}>Gross Volume - Total Payouts</div>
            </div>
            <div style={{ padding: 24, background: "var(--bg-glass)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
              <div className="text-sm font-bold text-muted uppercase mb-2 flex-center gap-2"><Gamepad2 size={16}/> Total Gross Volume</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>{data.total_wagered} ETB</div>
            </div>
            <div style={{ padding: 24, background: "var(--bg-glass)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
              <div className="text-sm font-bold text-muted uppercase mb-2 flex-center gap-2"><Award size={16}/> Total Prize Payouts</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>{data.total_won} ETB</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header"><div className="card-title flex-center gap-2"><CreditCard size={18}/> Cash Flow (Deposits / Withdrawals)</div></div>
          <div className="card-body">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="flex-between p-4" style={{ background: "var(--bg-glass)", borderRadius: "var(--radius-sm)" }}>
                <div>
                  <div className="text-sm text-muted mb-1">Total Money In (Deposits)</div>
                  <div className="font-bold text-success" style={{ fontSize: 24 }}>{data.total_deposits} ETB</div>
                </div>
              </div>
              <div className="flex-between p-4" style={{ background: "var(--bg-glass)", borderRadius: "var(--radius-sm)" }}>
                <div>
                  <div className="text-sm text-muted mb-1">Total Money Out (Withdrawals)</div>
                  <div className="font-bold text-danger" style={{ fontSize: 24 }}>{data.total_withdrawals} ETB</div>
                </div>
              </div>
              <div className="flex-between p-4 mt-4" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="font-bold text-muted">Net Cash Flow</div>
                <div className="font-bold" style={{ fontSize: 20 }}>{data.total_deposits - data.total_withdrawals} ETB</div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title flex-center gap-2"><Gamepad2 size={18}/> Player Balances Liability</div></div>
          <div className="card-body">
            <div style={{ padding: 24, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius)", textAlign: "center" }}>
              <div className="text-muted mb-2">Total Funds Held in Player Wallets</div>
              <div style={{ fontSize: 48, fontWeight: 800 }}>{data.total_player_balances} ETB</div>
              <div className="text-sm text-muted mt-4 mt-2">This represents the platform's current liability to players.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
