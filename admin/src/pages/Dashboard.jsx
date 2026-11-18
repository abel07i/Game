import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { Users, Gamepad2, TrendingUp, DollarSign, Activity, Share2, ArrowUpRight } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.getDashboardStats(),
      api.getRevenueChart()
    ]).then(([statsData, chartRes]) => {
      setStats(statsData);
      setChartData(Array.isArray(chartRes) ? chartRes : []);
    }).catch(err => {
      setError(err.message || "Failed to load dashboard");
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-overlay"><div className="spinner"></div> Loading dashboard...</div>;
  if (!stats) return <div className="empty-state">{error || "Failed to load dashboard stats."}</div>;

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
            <Users size={24} />
          </div>
          <div className="stat-card-label">Total Players</div>
          <div className="stat-card-value">{stats.players.total_players}</div>
          <div className="stat-card-sub"><span className="text-success">{stats.players.active_players}</span> active today</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: "var(--info-light)", color: "var(--info)" }}>
            <Gamepad2 size={24} />
          </div>
          <div className="stat-card-label">Games Played</div>
          <div className="stat-card-value">{stats.finance.total_settled_games}</div>
          <div className="stat-card-sub">{stats.games.open_rooms} open / {stats.games.drawing_rooms} drawing</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: "var(--success-light)", color: "var(--success)" }}>
            <TrendingUp size={24} />
          </div>
          <div className="stat-card-label">Platform Profit</div>
          <div className="stat-card-value">{stats.finance.total_platform_fees} ETB</div>
          <div className="stat-card-sub"><span className="text-success">+{stats.today.today_fees} ETB</span> today</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: "var(--warning-light)", color: "var(--warning)" }}>
            <DollarSign size={24} />
          </div>
          <div className="stat-card-label">Total Volume</div>
          <div className="stat-card-value">{stats.finance.total_gross} ETB</div>
          <div className="stat-card-sub">{stats.finance.total_payouts} ETB paid out</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Revenue (Last 30 Days)</div>
          </div>
          <div className="card-body">
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--success)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickFormatter={str => new Date(str).toLocaleDateString(undefined, {month:'short', day:'numeric'})} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}
                    labelFormatter={str => new Date(str).toLocaleDateString()}
                  />
                  <Area type="monotone" dataKey="profit" name="Profit (ETB)" stroke="var(--success)" strokeWidth={2} fillOpacity={1} fill="url(#colorProfit)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Today's Snapshot</div>
          </div>
          <div className="card-body">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ padding: 16, background: "var(--bg-glass)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>Today's Gross Volume</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.today.today_gross} ETB</div>
              </div>
              <div style={{ padding: 16, background: "var(--bg-glass)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>Today's Platform Profit</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--success)" }}>{stats.today.today_fees} ETB</div>
              </div>
              <div style={{ padding: 16, background: "var(--bg-glass)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>Today's Payouts</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.today.today_payouts} ETB</div>
              </div>
              <div style={{ padding: 16, background: "var(--bg-glass)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>Games Played Today</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.today.today_games}</div>
                </div>
                <Activity size={24} color="var(--info)" />
              </div>
            </div>
          </div>
        </div>

        {/* Lifetime Referral System Snapshot */}
        {stats.referrals && (
          <div className="card" style={{ gridColumn: "1 / -1", marginTop: 8 }}>
            <div className="card-header flex-between">
              <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Share2 size={18} color="var(--accent)" /> Lifetime Referral System Overview
              </div>
              <Link to="/referrals" className="btn btn-ghost btn-sm" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                Manage Referrals <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="card-body" style={{ padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
                <div style={{ padding: 12, background: "var(--bg-glass)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Referred Players</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>
                    {stats.referrals.totalReferredPlayers || stats.referrals.total_referred_players || 0}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    From {stats.referrals.totalReferrers || stats.referrals.total_referrers || 0} active inviters
                  </div>
                </div>

                <div style={{ padding: 12, background: "var(--bg-glass)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Total Commissions Paid</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)" }}>
                    {Number(stats.referrals.totalCommissionsPaid || stats.referrals.total_commissions_paid || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {stats.referrals.totalCommissionsCount || stats.referrals.total_commissions_count || 0} rewards distributed
                  </div>
                </div>

                <div style={{ padding: 12, background: "var(--bg-glass)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Unclaimed Referral Wallets</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>
                    {Number(stats.referrals.totalReferralBalanceHeld || stats.referrals.total_unclaimed_referral_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    Available for telebirr payout
                  </div>
                </div>

                <div style={{ padding: 12, background: "var(--bg-glass)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Active Commission Rate</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--success)" }}>
                    {stats.referrals.activeCommissionRatePercent != null ? stats.referrals.activeCommissionRatePercent : (stats.referrals.active_commission_rate_percent || "1.0")}%
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    Platform funded (100% winner payout)
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
