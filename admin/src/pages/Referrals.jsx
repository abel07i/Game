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
  AlertCircle,
  Share2,
  Calendar,
  X,
  Copy,
  Check,
  Edit2
} from "lucide-react";

export default function Referrals() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("commissions"); // 'commissions' | 'network' | 'leaderboard'
  
  // Commissions ledger state
  const [commissionsData, setCommissionsData] = useState({ commissions: [], total: 0, page: 1, totalPages: 1 });
  const [commissionsLoading, setCommissionsLoading] = useState(false);
  const [filters, setFilters] = useState({ search: "", status: "all", dateFrom: "", dateTo: "", page: 1, limit: 15 });

  // Referral relationships / network state
  const [networkData, setNetworkData] = useState({ relationships: [], total: 0, page: 1, totalPages: 1 });
  const [networkLoading, setNetworkLoading] = useState(false);
  const [networkFilters, setNetworkFilters] = useState({ search: "", page: 1, limit: 15 });

  // Top referrers state
  const [topReferrers, setTopReferrers] = useState([]);
  const [topLoading, setTopLoading] = useState(false);

  // Rate edit modal state
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [rateInput, setRateInput] = useState("1.0");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rateUpdating, setRateUpdating] = useState(false);

  // Copy feedback state
  const [copiedKey, setCopiedKey] = useState(null);

  // Toast / error
  const [toast, setToast] = useState(null);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const fetchStats = async () => {
    try {
      const res = await api.getReferralStats();
      setStats(res);
      if (res?.activeCommissionRatePercent != null) {
        setRateInput(res.activeCommissionRatePercent.toString());
      } else if (res?.commissionRatePercent != null) {
        setRateInput(res.commissionRatePercent.toString());
      }
    } catch (err) {
      console.error("Failed to load referral stats:", err);
      showToast("error", err.message || "Failed to load referral stats");
    }
  };

  const fetchCommissions = async (overrideFilters) => {
    const activeFilters = overrideFilters || filters;
    setCommissionsLoading(true);
    try {
      const res = await api.getReferralCommissions(activeFilters);
      setCommissionsData(res || { commissions: [], total: 0, page: 1, totalPages: 1 });
    } catch (err) {
      console.error("Failed to load referral commissions:", err);
      showToast("error", err.message || "Failed to load commissions ledger");
    } finally {
      setCommissionsLoading(false);
    }
  };

  const fetchNetwork = async (overrideFilters) => {
    const activeFilters = overrideFilters || networkFilters;
    setNetworkLoading(true);
    try {
      const res = await api.getReferralRelationships(activeFilters);
      setNetworkData(res || { relationships: [], total: 0, page: 1, totalPages: 1 });
    } catch (err) {
      console.error("Failed to load referral network:", err);
      showToast("error", err.message || "Failed to load referral relationships");
    } finally {
      setNetworkLoading(false);
    }
  };

  const fetchTopReferrers = async () => {
    setTopLoading(true);
    try {
      const res = await api.getTopReferrers(25);
      const list = Array.isArray(res) ? res : (res?.referrers || res?.top || []);
      setTopReferrers(list);
    } catch (err) {
      console.error("Failed to load top referrers:", err);
      showToast("error", err.message || "Failed to load leaderboard");
    } finally {
      setTopLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStats(), fetchCommissions(), fetchTopReferrers(), fetchNetwork()]).finally(() => {
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!loading) {
      fetchCommissions();
    }
  }, [filters.page, filters.status]);

  useEffect(() => {
    if (!loading && activeTab === "network") {
      fetchNetwork();
    }
  }, [networkFilters.page, activeTab]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const next = { ...filters, page: 1 };
    setFilters(next);
    fetchCommissions(next);
  };

  const handleClearFilters = () => {
    const cleared = { search: "", status: "all", dateFrom: "", dateTo: "", page: 1, limit: 15 };
    setFilters(cleared);
    fetchCommissions(cleared);
  };

  const handleNetworkSearchSubmit = (e) => {
    e.preventDefault();
    const next = { ...networkFilters, page: 1 };
    setNetworkFilters(next);
    fetchNetwork(next);
  };

  const handleClearNetworkFilters = () => {
    const cleared = { search: "", page: 1, limit: 15 };
    setNetworkFilters(cleared);
    fetchNetwork(cleared);
  };

  const handleUpdateCommissionRate = async (e) => {
    e.preventDefault();
    const val = parseFloat(rateInput);
    if (isNaN(val) || val < 0 || val > 50) {
      showToast("error", "Commission percentage must be between 0% and 50%");
      return;
    }
    if (!confirmPassword) {
      showToast("error", "Admin password is required for security confirmation");
      return;
    }
    setRateUpdating(true);
    try {
      await api.updateSettings({ referralCommissionRate: val / 100, confirmPassword });
      showToast("success", `Lifetime referral commission rate set to ${val.toFixed(1)}%!`);
      setRateModalOpen(false);
      setConfirmPassword("");
      fetchStats();
    } catch (err) {
      showToast("error", err.message || "Failed to update commission rate");
    } finally {
      setRateUpdating(false);
    }
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

  // Safe resolved values supporting both camelCase and snake_case backend schemas
  const totalReferredPlayers = stats?.totalReferredPlayers ?? stats?.total_referred_players ?? 0;
  const totalReferrers = stats?.totalReferrers ?? stats?.total_referrers ?? 0;
  const totalCommissionsPaid = stats?.totalCommissionsPaid ?? stats?.total_commissions_paid ?? 0;
  const totalCommissionsCount = stats?.totalCommissionsCount ?? stats?.total_commissions_count ?? 0;
  const totalReferralBalanceHeld = stats?.totalReferralBalanceHeld ?? stats?.total_unclaimed_referral_balance ?? 0;
  const totalReferralWithdrawn = stats?.totalReferralWithdrawn ?? stats?.total_referral_withdrawn ?? 0;
  const activeRatePercent = stats?.activeCommissionRatePercent ?? stats?.commissionRatePercent ?? "1.0";

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
            onClick={() => { fetchStats(); fetchCommissions(); fetchTopReferrers(); fetchNetwork(); }}
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
          <div className="stat-card-value">{totalReferredPlayers}</div>
          <div className="stat-card-sub">
            Across <strong style={{ color: "var(--text-primary)" }}>{totalReferrers}</strong> active inviters
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: "rgba(99,102,241,0.15)", color: "var(--accent)" }}>
            <TrendingUp size={22} />
          </div>
          <div className="stat-card-label">Total Commissions Paid</div>
          <div className="stat-card-value" style={{ color: "var(--accent)" }}>
            {Number(totalCommissionsPaid).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
          </div>
          <div className="stat-card-sub">
            {totalCommissionsCount} winning settlement rewards
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: "rgba(245,158,11,0.15)", color: "var(--warning)" }}>
            <DollarSign size={22} />
          </div>
          <div className="stat-card-label">Unclaimed Referral Wallets</div>
          <div className="stat-card-value">
            {Number(totalReferralBalanceHeld).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
          </div>
          <div className="stat-card-sub">
            {Number(totalReferralWithdrawn).toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB withdrawn
          </div>
        </div>

        <div className="stat-card" style={{ position: "relative" }}>
          <div className="stat-card-icon" style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>
            <Percent size={22} />
          </div>
          <div className="flex-between" style={{ alignItems: "flex-start" }}>
            <div>
              <div className="stat-card-label">Active Commission Rate</div>
              <div className="stat-card-value" style={{ color: "var(--success)" }}>
                {activeRatePercent}%
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setRateModalOpen(true)}
              style={{ padding: "4px 8px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}
              title="Edit Referral Rate"
            >
              <Edit2 size={12} /> Edit
            </button>
          </div>
          <div className="stat-card-sub">
            Platform funded • 100% net to winner
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: 12, borderBottom: "1px solid var(--border)", paddingBottom: 8, overflowX: "auto" }}>
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
            gap: 8,
            whiteSpace: "nowrap"
          }}
        >
          <TrendingUp size={16} /> Commissions Ledger ({commissionsData.total})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("network")}
          style={{
            background: "none",
            border: "none",
            padding: "8px 16px",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            borderBottom: activeTab === "network" ? "2px solid var(--accent)" : "2px solid transparent",
            color: activeTab === "network" ? "var(--accent)" : "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            whiteSpace: "nowrap"
          }}
        >
          <Share2 size={16} /> Referral Network ({networkData.total || totalReferredPlayers})
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
            gap: 8,
            whiteSpace: "nowrap"
          }}
        >
          <Award size={16} /> Top Referrers Leaderboard ({topReferrers.length})
        </button>
      </div>

      {/* TAB 1: COMMISSIONS LEDGER */}
      {activeTab === "commissions" && (
        <div className="card">
          <div className="card-header" style={{ padding: "16px 20px" }}>
            <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ position: "relative", minWidth: 260, flex: "1 1 260px" }}>
                <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                <input
                  type="text"
                  placeholder="Search by referrer, player, phone, room #..."
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
                style={{ width: 140 }}
              >
                <option value="all">All Statuses</option>
                <option value="credited">Credited</option>
                <option value="reversed">Reversed</option>
              </select>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="date"
                  className="form-input"
                  value={filters.dateFrom}
                  onChange={e => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  style={{ width: 135 }}
                  title="From Date"
                />
                <span style={{ color: "var(--text-muted)", fontSize: 13 }}>to</span>
                <input
                  type="date"
                  className="form-input"
                  value={filters.dateTo}
                  onChange={e => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  style={{ width: 135 }}
                  title="To Date"
                />
              </div>

              <button type="submit" className="btn btn-ghost" style={{ padding: "8px 16px" }}>
                Filter
              </button>

              {(filters.search || filters.status !== "all" || filters.dateFrom || filters.dateTo) && (
                <button type="button" className="btn btn-ghost" onClick={handleClearFilters} style={{ padding: "8px 12px", color: "var(--text-muted)" }} title="Clear all filters">
                  <X size={15} /> Clear
                </button>
              )}
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
                      <th>Game Room</th>
                      <th>Inviter (Referrer)</th>
                      <th>Winning Player</th>
                      <th style={{ textAlign: "right" }}>Player Payout</th>
                      <th style={{ textAlign: "right" }}>Rate</th>
                      <th style={{ textAlign: "right" }}>Commission</th>
                      <th style={{ textAlign: "center" }}>Status</th>
                      <th style={{ textAlign: "center" }}>Audit Key</th>
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
                          {Number(comm.winning_payout || comm.winning_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
                        </td>
                        <td style={{ textAlign: "right", fontSize: 13, color: "var(--text-muted)" }}>
                          {(Number(comm.commission_rate) * 100).toFixed(1)}%
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: comm.status === 'credited' ? "var(--success)" : "var(--danger)" }}>
                          {comm.status === 'credited' ? '+' : '-'}{Number(comm.commission_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className={`badge ${comm.status === 'credited' ? 'badge-success' : 'badge-danger'}`} style={{ textTransform: "capitalize" }}>
                            {comm.status}
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {comm.idempotency_key ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => copyToClipboard(comm.idempotency_key, comm.id)}
                              style={{ padding: "2px 6px", fontSize: 11, fontFamily: "monospace" }}
                              title={comm.idempotency_key}
                            >
                              {copiedKey === comm.id ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
                              <span style={{ marginLeft: 4 }}>Key</span>
                            </button>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>-</span>
                          )}
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

      {/* TAB 2: REFERRAL NETWORK / RELATIONSHIPS */}
      {activeTab === "network" && (
        <div className="card">
          <div className="card-header flex-between" style={{ flexWrap: "wrap", gap: 12 }}>
            <form onSubmit={handleNetworkSearchSubmit} style={{ display: "flex", gap: 10, flexWrap: "wrap", flex: 1 }}>
              <div style={{ position: "relative", minWidth: 260, flex: "1 1 260px" }}>
                <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                <input
                  type="text"
                  placeholder="Search inviter, referred player, phone, invite code..."
                  value={networkFilters.search}
                  onChange={e => setNetworkFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="form-input"
                  style={{ paddingLeft: 36, width: "100%" }}
                />
              </div>

              <button type="submit" className="btn btn-ghost" style={{ padding: "8px 16px" }}>
                Search
              </button>

              {networkFilters.search && (
                <button type="button" className="btn btn-ghost" onClick={handleClearNetworkFilters} style={{ padding: "8px 12px", color: "var(--text-muted)" }}>
                  <X size={15} /> Clear
                </button>
              )}
            </form>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {networkLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                <div className="spinner" style={{ margin: "0 auto 12px" }}></div>
                Loading referral relationships...
              </div>
            ) : networkData.relationships.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
                <Share2 size={36} style={{ opacity: 0.3, margin: "0 auto 12px" }} />
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>No referral relationships found</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>When players register using friend invite links, their permanent associations will appear here.</div>
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Joined Date</th>
                      <th>Inviter (Referrer)</th>
                      <th>Invite Code Used</th>
                      <th>Referred Player</th>
                      <th style={{ textAlign: "center" }}>Games Played / Won</th>
                      <th style={{ textAlign: "right" }}>Commissions Generated</th>
                      <th>Last Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {networkData.relationships.map((rel) => (
                      <tr key={rel.id}>
                        <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                          {new Date(rel.joined_at).toLocaleDateString()}
                        </td>
                        <td>
                          <Link to={`/players/${rel.referrer_id}`} style={{ fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 4 }}>
                            {rel.referrer_name || "Player"} <ArrowUpRight size={12} color="var(--text-muted)" />
                          </Link>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{rel.referrer_phone}</div>
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
                            {rel.invite_code || "-"}
                          </span>
                        </td>
                        <td>
                          <Link to={`/players/${rel.referred_user_id}`} style={{ fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 4 }}>
                            {rel.referred_name || "Player"} <ArrowUpRight size={12} color="var(--text-muted)" />
                          </Link>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {rel.referred_phone} {rel.referred_active === false && <span style={{ color: "var(--danger)" }}>(Inactive)</span>}
                          </div>
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 600 }}>
                          <span style={{ color: "var(--text-primary)" }}>{rel.games_played || 0}</span>
                          <span style={{ color: "var(--text-muted)", margin: "0 4px" }}>/</span>
                          <span style={{ color: (rel.games_won || 0) > 0 ? "var(--success)" : "var(--text-muted)" }}>{rel.games_won || 0} wins</span>
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: Number(rel.total_commissions_earned || 0) > 0 ? "var(--success)" : "var(--text-muted)" }}>
                          +{Number(rel.total_commissions_earned || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
                        </td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                          {rel.last_commission_at ? new Date(rel.last_commission_at).toLocaleDateString() : "Never"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {networkData.totalPages > 1 && (
            <div className="card-footer flex-between" style={{ padding: "12px 16px" }}>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Showing page {networkData.page} of {networkData.totalPages} ({networkData.total} total)
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={networkData.page <= 1}
                  onClick={() => setNetworkFilters(prev => ({ ...prev, page: prev.page - 1 }))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={networkData.page >= networkData.totalPages}
                  onClick={() => setNetworkFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TOP REFERRERS LEADERBOARD */}
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
                            {ref.referrer_name || ref.display_name || "Player"} <ArrowUpRight size={13} color="var(--text-muted)" />
                          </Link>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{ref.referrer_phone || ref.phone_number || "-"}</div>
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
                            {ref.referral_code || ref.invite_code || "-"}
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

      {/* MODAL: CONFIGURE REFERRAL RATE */}
      {rateModalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1100,
          padding: 16
        }}>
          <div className="card" style={{ maxWidth: 440, width: "100%", boxShadow: "0 20px 40px rgba(0,0,0,0.6)" }}>
            <div className="card-header flex-between">
              <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Percent size={18} color="var(--accent)" /> Configure Referral Rate
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRateModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleUpdateCommissionRate}>
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                    Lifetime Winning Commission Percentage (%)
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="50"
                      value={rateInput}
                      onChange={e => setRateInput(e.target.value)}
                      className="form-input"
                      style={{ paddingRight: 36, width: "100%", fontSize: 15, fontWeight: 700 }}
                      required
                    />
                    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontWeight: 700 }}>
                      %
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                    Example: At 1.0%, when a referred player wins 1,000 ETB, their inviter automatically earns 10 ETB platform-funded commission.
                  </div>
                </div>

                <div style={{ padding: 12, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: "var(--radius-sm)", fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: "var(--accent)", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <ShieldCheck size={14} /> Platform Funded Protection
                  </div>
                  The referred winner receives 100% of their net payout. The referral bonus is paid directly by the platform treasury and tracked in financial audit logs.
                </div>

                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                    Admin Password Confirmation (Step-Up Verification)
                  </label>
                  <input
                    type="password"
                    placeholder="Enter your admin password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="form-input"
                    style={{ width: "100%" }}
                    required
                  />
                </div>
              </div>

              <div className="card-footer flex-between" style={{ padding: "12px 20px" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setRateModalOpen(false)}
                  disabled={rateUpdating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={rateUpdating}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  {rateUpdating ? "Updating..." : "Save Rate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
