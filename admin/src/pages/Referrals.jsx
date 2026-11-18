import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { 
  Users, 
  Award, 
  TrendingUp, 
  DollarSign, 
  Percent, 
  Search, 
  RefreshCw, 
  Download, 
  ArrowUpRight,
  ShieldCheck,
  CheckCircle,
  AlertCircle
} from "lucide-react";

export default function Referrals() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("commissions"); // 'commissions' | 'leaderboard'
  
  // Commissions ledger state
  const [commissionsData, setCommissionsData] = useState({ commissions: [], total: 0, page: 1, totalPages: 1 });
  const [commissionsLoading, setCommissionsLoading] = useState(false);
  const [filters, setFilters] = useState({ search: "", status: "all", page: 1, limit: 15 });

  // Top referrers state
  const [topReferrers, setTopReferrers] = useState([]);
  const [topLoading, setTopLoading] = useState(false);

  // Toast / error
  const [toast, setToast] = useState(null);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchStats = async () => {
    try {
      const res = await api.getReferralStats();
      setStats(res);
    } catch (err) {
      console.error("Failed to load referral stats:", err);
      showToast("error", err.message || "Failed to load referral stats");
    }
  };

  const fetchCommissions = async () => {
    setCommissionsLoading(true);
    try {
      const res = await api.getReferralCommissions(filters);
      setCommissionsData(res || { commissions: [], total: 0, page: 1, totalPages: 1 });
    } catch (err) {
      console.error("Failed to load referral commissions:", err);
      showToast("error", err.message || "Failed to load commissions ledger");
    } finally {
      setCommissionsLoading(false);
    }
  };

  const fetchTopReferrers = async () => {
    setTopLoading(true);
    try {
      const res = await api.getTopReferrers(20);
      setTopReferrers(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error("Failed to load top referrers:", err);
      showToast("error", err.message || "Failed to load leaderboard");
    } finally {
      setTopLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStats(), fetchCommissions(), fetchTopReferrers()]).finally(() => {
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!loading) {
      fetchCommissions();
    }
  }, [filters.page, filters.status]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setFilters(prev => ({ ...prev, page: 1 }));
    fetchCommissions();
  };

  const handleExportCsv = async () => {
    try {
      const data = await api.getReferralReport();
      if (!data || !data.length) {
        showToast("error", "No referral commission records found to export");
        return;
      }
      const headers = Object.keys(data[0]);
      const csvRows = [
        headers.join(","),
        ...data.map(row => headers.map(h => `"${(row[h] ?? '').toString().replace(/"/g, '""')}"`).join(","))
      ];
      const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `referral_commissions_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast("success", "Referral commissions report downloaded successfully!");
    } catch (err) {
      showToast("error", err.message || "Failed to export CSV report");
    }
  };

  if (loading && !stats) {
    return <div className="loading-overlay"><div className="spinner"></div> Loading referral analytics...</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 1000,
          padding: "12px 20px",
          borderRadius: "var(--radius-sm)",
          background: toast.type === "error" ? "var(--danger)" : "var(--success)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          fontWeight: 600,
          fontSize: 14
        }}>
          {toast.type === "error" ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          {toast.message}
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex-between" style={{ flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <Users size={26} color="var(--accent)" /> Lifetime Referral System
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "4px 0 0 0" }}>
            Track player invitations, automated 1% winning settlement commissions, and top brand ambassadors.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button 
            type="button" 
            className="btn btn-ghost" 
            onClick={() => { fetchStats(); fetchCommissions(); fetchTopReferrers(); }}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <RefreshCw size={15} /> Refresh
          </button>
          <button 
            type="button" 
            className="btn btn-primary" 
            onClick={handleExportCsv}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <Download size={15} /> Export CSV Report
          </button>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: "rgba(16,185,129,0.15)", color: "var(--success)" }}>
            <Users size={22} />
          </div>
          <div className="stat-card-label">Referred Players</div>
          <div className="stat-card-value">{stats?.totalReferredPlayers || 0}</div>
          <div className="stat-card-sub">
            Across <strong style={{ color: "var(--text-primary)" }}>{stats?.totalReferrers || 0}</strong> active inviters
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: "rgba(99,102,241,0.15)", color: "var(--accent)" }}>
            <TrendingUp size={22} />
          </div>
          <div className="stat-card-label">Total Commissions Paid</div>
          <div className="stat-card-value" style={{ color: "var(--accent)" }}>
            {(stats?.totalCommissionsPaid || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
          </div>
          <div className="stat-card-sub">
            {stats?.totalCommissionsCount || 0} winning settlement rewards
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: "rgba(245,158,11,0.15)", color: "var(--warning)" }}>
            <DollarSign size={22} />
          </div>
          <div className="stat-card-label">Unclaimed Referral Wallets</div>
          <div className="stat-card-value">
            {(stats?.totalReferralBalanceHeld || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
          </div>
          <div className="stat-card-sub">
            Held in separate referral wallets
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>
            <Percent size={22} />
          </div>
          <div className="stat-card-label">Active Commission Rate</div>
          <div className="stat-card-value" style={{ color: "var(--success)" }}>
            {stats?.activeCommissionRatePercent != null ? stats.activeCommissionRatePercent : "1.0"}%
          </div>
          <div className="stat-card-sub">
            Platform funded • 100% net to winner
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: 12, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
        <button
          type="button"
          onClick={() => setActiveTab("commissions")}
          style={{
            background: "none",
            border: "none",
            padding: "8px 16px",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            borderBottom: activeTab === "commissions" ? "2px solid var(--accent)" : "2px solid transparent",
            color: activeTab === "commissions" ? "var(--accent)" : "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 8
          }}
        >
          <TrendingUp size={16} /> Commissions Ledger ({commissionsData.total})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("leaderboard")}
          style={{
            background: "none",
            border: "none",
            padding: "8px 16px",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            borderBottom: activeTab === "leaderboard" ? "2px solid var(--accent)" : "2px solid transparent",
            color: activeTab === "leaderboard" ? "var(--accent)" : "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 8
          }}
        >
          <Award size={16} /> Top Referrers Leaderboard
        </button>
      </div>

      {/* TAB 1: COMMISSIONS LEDGER */}
      {activeTab === "commissions" && (
        <div className="card">
          <div className="card-header flex-between" style={{ flexWrap: "wrap", gap: 12 }}>
            <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 10, flexWrap: "wrap", flex: 1 }}>
              <div style={{ position: "relative", minWidth: 260, flex: "1 1 260px" }}>
                <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                <input
                  type="text"
                  placeholder="Search by referrer or player name, phone..."
                  value={filters.search}
                  onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="form-input"
                  style={{ paddingLeft: 36, width: "100%" }}
                />
              </div>

              <select
                className="form-select"
                value={filters.status}
                onChange={e => setFilters(prev => ({ ...prev, status: e.target.value, page: 1 }))}
                style={{ width: 160 }}
              >
                <option value="all">All Statuses</option>
                <option value="credited">Credited Only</option>
                <option value="reversed">Reversed Only</option>
              </select>

              <button type="submit" className="btn btn-ghost" style={{ padding: "8px 16px" }}>
                Search
              </button>
            </form>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {commissionsLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                <div className="spinner" style={{ margin: "0 auto 12px" }}></div>
                Loading commissions...
              </div>
            ) : commissionsData.commissions.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
                <Users size={36} style={{ opacity: 0.3, margin: "0 auto 12px" }} />
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>No referral commissions found</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Commissions will automatically appear here whenever referred players win games.</div>
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Date / Time</th>
                      <th>Game</th>
                      <th>Inviter (Referrer)</th>
                      <th>Winning Player</th>
                      <th style={{ textAlign: "right" }}>Player Payout</th>
                      <th style={{ textAlign: "right" }}>Commission Rate</th>
                      <th style={{ textAlign: "right" }}>Commission Earned</th>
                      <th style={{ textAlign: "center" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissionsData.commissions.map((comm) => (
                      <tr key={comm.id}>
                        <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                          {new Date(comm.created_at).toLocaleString()}
                        </td>
                        <td>
                          {comm.room_id ? (
                            <Link to={`/games/${comm.room_id}`} style={{ fontWeight: 600, color: "var(--accent)", display: "flex", alignItems: "center", gap: 4 }}>
                              #{comm.room_number || comm.room_id.slice(0, 8)} <ArrowUpRight size={13} />
                            </Link>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>#{comm.room_number || "-"}</span>
                          )}
                        </td>
                        <td>
                          <Link to={`/players/${comm.referrer_id}`} style={{ fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 4 }}>
                            {comm.referrer_name || "Player"} <ArrowUpRight size={12} color="var(--text-muted)" />
                          </Link>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{comm.referrer_phone}</div>
                        </td>
                        <td>
                          <Link to={`/players/${comm.referred_user_id}`} style={{ fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 4 }}>
                            {comm.referred_name || "Player"} <ArrowUpRight size={12} color="var(--text-muted)" />
                          </Link>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{comm.referred_phone}</div>
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          {Number(comm.winning_payout).toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB
                        </td>
                        <td style={{ textAlign: "right", fontSize: 13, color: "var(--text-muted)" }}>
                          {(Number(comm.commission_rate) * 100).toFixed(1)}%
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: comm.status === 'credited' ? "var(--success)" : "var(--danger)" }}>
                          {comm.status === 'credited' ? '+' : '-'}{Number(comm.commission_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className={`badge ${comm.status === 'credited' ? 'badge-success' : 'badge-danger'}`} style={{ textTransform: "capitalize" }}>
                            {comm.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {commissionsData.totalPages > 1 && (
            <div className="card-footer flex-between" style={{ padding: "12px 16px" }}>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Showing page {commissionsData.page} of {commissionsData.totalPages} ({commissionsData.total} total)
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={commissionsData.page <= 1}
                  onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={commissionsData.page >= commissionsData.totalPages}
                  onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TOP REFERRERS LEADERBOARD */}
      {activeTab === "leaderboard" && (
        <div className="card">
          <div className="card-header flex-between">
            <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Award size={18} color="var(--warning)" /> Top Brand Ambassadors
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Ranked by total lifetime referral commissions earned
            </div>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {topLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                <div className="spinner" style={{ margin: "0 auto 12px" }}></div>
                Loading top referrers...
              </div>
            ) : topReferrers.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
                <Users size={36} style={{ opacity: 0.3, margin: "0 auto 12px" }} />
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>No referral data available yet</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Once users share their invite links and friends play, the rankings will appear here.</div>
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 60, textAlign: "center" }}>Rank</th>
                      <th>Ambassador</th>
                      <th>Referral Code</th>
                      <th style={{ textAlign: "right" }}>Invited Players</th>
                      <th style={{ textAlign: "right" }}>Active Winners</th>
                      <th style={{ textAlign: "right" }}>Total Commissions Earned</th>
                      <th style={{ textAlign: "right" }}>Referral Wallet Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topReferrers.map((ref, idx) => (
                      <tr key={ref.referrer_id}>
                        <td style={{ textAlign: "center", fontWeight: 700, fontSize: 14 }}>
                          {idx === 0 ? "🥇 1" : idx === 1 ? "🥈 2" : idx === 2 ? "🥉 3" : `#${idx + 1}`}
                        </td>
                        <td>
                          <Link to={`/players/${ref.referrer_id}`} style={{ fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                            {ref.referrer_name || "Player"} <ArrowUpRight size={13} color="var(--text-muted)" />
                          </Link>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{ref.referrer_phone}</div>
                        </td>
                        <td>
                          <span style={{ 
                            padding: "3px 8px", 
                            borderRadius: 4, 
                            background: "var(--bg-glass)", 
                            border: "1px solid var(--border)", 
                            fontFamily: "monospace", 
                            fontSize: 12, 
                            fontWeight: 700 
                          }}>
                            {ref.referral_code || "-"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          {ref.total_invited}
                        </td>
                        <td style={{ textAlign: "right", color: ref.active_players > 0 ? "var(--success)" : "var(--text-muted)", fontWeight: 600 }}>
                          {ref.active_players}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: "var(--accent)" }}>
                          {Number(ref.total_earned || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          {Number(ref.current_referral_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
