import { useState, useEffect } from "react";
import api from "../api";
import { TrendingUp, CreditCard, Gamepad2, Award, RefreshCw, Share2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const fmt = (val) => Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Profit() {
  const [data, setData] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [period, setPeriod] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchSummary = () => {
    setLoading(true);
    setError("");
    Promise.all([api.getProfitSummary(), api.getProfitChart(period)])
      .then(([summaryRes, chartRes]) => {
        setData(summaryRes);
        setChartData(Array.isArray(chartRes) ? chartRes : []);
      })
      .catch(err => setError(err.message || "Failed to load profit summary"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  useEffect(() => {
    if (!data) return;
    setChartLoading(true);
    api.getProfitChart(period)
      .then(res => setChartData(Array.isArray(res) ? res : []))
      .catch(() => {})
      .finally(() => setChartLoading(false));
  }, [period]);

  if (loading && !data) return <div className="loading-overlay"><div className="spinner"></div></div>;
  if (!data) return <div className="empty-state">{error || "Failed to load profit summary."}</div>;

  const netCashFlow = (parseFloat(data.total_deposits || 0) - parseFloat(data.total_withdrawals || 0));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="flex-between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="page-title">Profit &amp; Revenue</h1>
          <p className="text-muted">Platform treasury accounting, referral commission costs, cash flow, and player wallet liabilities.</p>
        </div>
        <button className="btn btn-ghost" onClick={fetchSummary} disabled={loading}>
          <RefreshCw size={16} className={loading ? "spinner" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">All-Time Financial Summary</div></div>
        <div className="card-body">
          <div className="grid-auto gap-4">
            <div style={{ padding: 24, background: "var(--success-light)", border: "1px solid var(--success)", borderRadius: "var(--radius)" }}>
              <div className="text-sm font-bold text-success uppercase mb-2 flex-center gap-2"><TrendingUp size={16}/> Net Platform Profit</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "var(--success)" }}>{fmt(data.platform_profit)} ETB</div>
              <div className="text-xs mt-2" style={{ color: "var(--success)", opacity: 0.85 }}>
                Gross Fees ({fmt(data.gross_platform_fees ?? data.platform_profit)} ETB) − Referral Costs ({fmt(data.total_referral_commissions || 0)} ETB)
              </div>
            </div>

            <div style={{ padding: 24, background: "var(--bg-glass)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
              <div className="text-sm font-bold text-muted uppercase mb-2 flex-center gap-2"><Gamepad2 size={16}/> Total Gross Volume</div>
              <div style={{ fontSize: 30, fontWeight: 800 }}>{fmt(data.total_wagered)} ETB</div>
              <div className="text-xs text-muted mt-2">{data.settled_games || 0} settled game rounds</div>
            </div>

            <div style={{ padding: 24, background: "var(--bg-glass)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
              <div className="text-sm font-bold text-muted uppercase mb-2 flex-center gap-2"><Award size={16}/> Total Prize Payouts</div>
              <div style={{ fontSize: 30, fontWeight: 800 }}>{fmt(data.total_won)} ETB</div>
              <div className="text-xs text-muted mt-2">85% net pool paid to winners</div>
            </div>

            <div style={{ padding: 24, background: "var(--bg-glass)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
              <div className="text-sm font-bold text-muted uppercase mb-2 flex-center gap-2"><Share2 size={16}/> Referral Commissions</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: "var(--accent)" }}>{fmt(data.total_referral_commissions || 0)} ETB</div>
              <div className="text-xs text-muted mt-2">Platform-funded 1% winner bonuses</div>
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="card">
        <div className="card-header flex-between" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="card-title">Platform Fees &amp; Volume Trend</div>
          <div style={{ display: "flex", gap: 6 }}>
            {["7d", "30d", "90d"].map(p => (
              <button
                key={p}
                type="button"
                className={`btn btn-sm ${period === p ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setPeriod(p)}
                disabled={chartLoading}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="card-body">
          {chartData.length === 0 ? (
            <div className="text-center text-muted" style={{ padding: "48px 0" }}>
              No settled game profit recorded in the last {period}.
            </div>
          ) : (
            <div className="chart-container" style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorProfitPage" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--success)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickFormatter={str => new Date(str).toLocaleDateString(undefined, { month: "short", day: "numeric" })} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}
                    labelFormatter={str => new Date(str).toLocaleDateString()}
                  />
                  <Area type="monotone" dataKey="profit" name="Gross Fees (ETB)" stroke="var(--success)" strokeWidth={2} fillOpacity={1} fill="url(#colorProfitPage)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header"><div className="card-title flex-center gap-2"><CreditCard size={18}/> Cash Flow (Deposits / Withdrawals)</div></div>
          <div className="card-body">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="flex-between p-4" style={{ background: "var(--bg-glass)", borderRadius: "var(--radius-sm)" }}>
                <div>
                  <div className="text-sm text-muted mb-1">Total Money In (Completed Deposits)</div>
                  <div className="font-bold text-success" style={{ fontSize: 24 }}>{fmt(data.total_deposits)} ETB</div>
                </div>
              </div>
              <div className="flex-between p-4" style={{ background: "var(--bg-glass)", borderRadius: "var(--radius-sm)" }}>
                <div>
                  <div className="text-sm text-muted mb-1">Total Money Out (Approved Withdrawals)</div>
                  <div className="font-bold text-danger" style={{ fontSize: 24 }}>{fmt(data.total_withdrawals)} ETB</div>
                  {(data.pending_withdrawals_count || 0) > 0 && (
                    <div className="text-xs text-warning mt-1">
                      +{fmt(data.pending_withdrawals)} ETB pending ({data.pending_withdrawals_count} request{data.pending_withdrawals_count === 1 ? "" : "s"})
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-between p-4 mt-2" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="font-bold text-muted">Net Cash Flow</div>
                <div className="font-bold" style={{ fontSize: 20, color: netCashFlow >= 0 ? "var(--success)" : "var(--danger)" }}>
                  {netCashFlow >= 0 ? "+" : ""}{fmt(netCashFlow)} ETB
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title flex-center gap-2"><Gamepad2 size={18}/> Player Balances Liability</div></div>
          <div className="card-body">
            <div style={{ padding: 24, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius)", textAlign: "center" }}>
              <div className="text-muted mb-2">Total Funds Held in Player Wallets</div>
              <div style={{ fontSize: 40, fontWeight: 800 }}>{fmt(data.total_player_balances)} ETB</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 16, fontSize: 13 }}>
                <div>
                  <span className="text-muted">Game Wallets: </span>
                  <strong>{fmt(data.real_player_balances ?? data.total_player_balances)} ETB</strong>
                </div>
                <div>
                  <span className="text-muted">Referral Wallets: </span>
                  <strong style={{ color: "var(--accent)" }}>{fmt(data.referral_player_balances || 0)} ETB</strong>
                </div>
              </div>
              <div className="text-sm text-muted mt-4">This represents the platform&apos;s current liability to players.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
