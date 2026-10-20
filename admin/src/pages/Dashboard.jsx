import { useState, useEffect } from "react";
import api from "../api";
import { Users, Gamepad2, TrendingUp, DollarSign, Activity } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getDashboardStats(),
      api.getRevenueChart()
    ]).then(([statsData, chartRes]) => {
      setStats(statsData);
      setChartData(chartRes);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-overlay"><div className="spinner"></div> Loading dashboard...</div>;

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
      </div>
    </div>
  );
}
