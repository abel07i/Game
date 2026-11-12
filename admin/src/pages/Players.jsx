import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { Search, Eye, ShieldAlert, ShieldCheck, Edit, Trash2, UserPlus, X } from "lucide-react";

export default function Players() {
  const initialFilters = {
    search: "",
    status: "",
    balanceFilter: "",
    minBalance: "",
    maxBalance: "",
    sortBy: "",
    page: 1
  };
  const [data, setData] = useState({ players: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(initialFilters);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editPlayerId, setEditPlayerId] = useState(null);
  const [formData, setFormData] = useState({ phoneNumber: "", displayName: "", password: "", telegramId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  
  // Bulk Selection State
  const [selectedPlayers, setSelectedPlayers] = useState([]);

  const fetchPlayers = (activeFilters = filters) => {
    setLoading(true);
    const cleanParams = Object.fromEntries(
      Object.entries(activeFilters).filter(([, v]) => v !== "" && v !== null && v !== undefined)
    );
    api.getPlayers(cleanParams)
      .then(res => setData(res || { players: [], total: 0 }))
      .catch(err => console.error("Failed to load players:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPlayers(filters);
  }, [filters.page, filters.status, filters.balanceFilter, filters.sortBy]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (filters.page !== 1) setFilters({ ...filters, page: 1 });
    else fetchPlayers(filters);
  };

  const hasActiveFilters = Boolean(
    filters.search || filters.status || filters.balanceFilter || filters.minBalance || filters.maxBalance || filters.sortBy
  );

  const handleResetFilters = () => {
    setFilters(initialFilters);
    fetchPlayers(initialFilters);
  };

  const toggleStatus = async (player) => {
    if (!window.confirm(`Are you sure you want to ${player.is_active ? 'block' : 'unblock'} ${player.display_name}?`)) return;
    try {
      await api.updatePlayerStatus(player.id, !player.is_active);
      fetchPlayers();
    } catch (err) { alert(err.message); }
  };

  const handleDelete = async (player) => {
    if (!window.confirm(`Are you sure you want to DELETE ${player.display_name}? This action cannot be undone.`)) return;
    try {
      await api.deletePlayer(player.id);
      fetchPlayers();
      setSelectedPlayers(prev => prev.filter(id => id !== player.id));
    } catch (err) { alert(err.message); }
  };

  const handleBulkDelete = async () => {
    if (selectedPlayers.length === 0) return;
    if (!window.confirm(`Are you sure you want to DELETE ${selectedPlayers.length} selected players? This action cannot be undone.`)) return;
    
    try {
      await api.bulkDeletePlayers({ ids: selectedPlayers });
      fetchPlayers();
      setSelectedPlayers([]);
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleSelectAll = () => {
    if (selectedPlayers.length === data.players.length && data.players.length > 0) {
      setSelectedPlayers([]);
    } else {
      setSelectedPlayers(data.players.map(p => p.id));
    }
  };

  const toggleSelect = (id) => {
    setSelectedPlayers(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const openCreateModal = () => {
    setEditPlayerId(null);
    setFormData({ phoneNumber: "", displayName: "", password: "", telegramId: "" });
    setError("");
    setModalOpen(true);
  };

  const openEditModal = (player) => {
    setEditPlayerId(player.id);
    setFormData({ phoneNumber: player.phone_number || "", displayName: player.display_name, password: "", telegramId: player.telegram_id || "" });
    setError("");
    setModalOpen(true);
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      if (editPlayerId) {
        await api.updatePlayer(editPlayerId, formData);
      } else {
        await api.createPlayer(formData);
      }
      setModalOpen(false);
      fetchPlayers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title">All Players</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {selectedPlayers.length > 0 && (
              <button className="btn btn-danger btn-sm" onClick={handleBulkDelete}>
                <Trash2 size={16} /> Delete Selected ({selectedPlayers.length})
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={openCreateModal}>
              <UserPlus size={16} /> Add Player
            </button>
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={handleSearch} className="filter-row" style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
            <div className="search-input-wrapper" style={{ flex: "1 1 220px", position: "relative" }}>
              <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: 38, width: "100%" }}
                placeholder="Search by name or phone..."
                value={filters.search}
                onChange={e => setFilters({ ...filters, search: e.target.value })}
              />
            </div>
            <select
              className="form-select"
              style={{ width: "auto" }}
              value={filters.status}
              onChange={e => setFilters({ ...filters, status: e.target.value, page: 1 })}
              aria-label="Filter by status"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Blocked</option>
            </select>
            <select
              className="form-select"
              style={{ width: "auto" }}
              value={filters.balanceFilter}
              onChange={e => setFilters({ ...filters, balanceFilter: e.target.value, page: 1 })}
              aria-label="Filter by balance preset"
            >
              <option value="">All Balances</option>
              <option value="zero">0 ETB (Empty)</option>
              <option value="positive">&gt; 0 ETB (Has Balance)</option>
              <option value="high">1,000+ ETB</option>
            </select>
            <input
              type="number"
              min="0"
              step="any"
              className="form-input"
              style={{ width: 115 }}
              placeholder="Min ETB"
              value={filters.minBalance}
              onChange={e => setFilters({ ...filters, minBalance: e.target.value })}
              aria-label="Minimum balance ETB"
            />
            <input
              type="number"
              min="0"
              step="any"
              className="form-input"
              style={{ width: 115 }}
              placeholder="Max ETB"
              value={filters.maxBalance}
              onChange={e => setFilters({ ...filters, maxBalance: e.target.value })}
              aria-label="Maximum balance ETB"
            />
            <select
              className="form-select"
              style={{ width: "auto" }}
              value={filters.sortBy}
              onChange={e => setFilters({ ...filters, sortBy: e.target.value, page: 1 })}
              aria-label="Sort players"
            >
              <option value="">Newest First</option>
              <option value="balance_desc">Balance: High to Low</option>
              <option value="balance_asc">Balance: Low to High</option>
            </select>
            <button type="submit" className="btn btn-primary">Filter</button>
            {hasActiveFilters && (
              <button type="button" className="btn btn-ghost" onClick={handleResetFilters}>Clear</button>
            )}
          </form>

          {loading ? (
            <div className="loading-overlay"><div className="spinner"></div></div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedPlayers.length > 0 && selectedPlayers.length === data.players.length}
                        onChange={toggleSelectAll}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                    </th>
                    <th>Player</th>
                    <th>Phone Number</th>
                    <th>Balance</th>
                    <th>Total Wagered</th>
                    <th>Games Played</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.players.length === 0 ? (
                    <tr><td colSpan="8" className="text-center" style={{ padding: "32px 0", color: "var(--text-muted)" }}>No players found.</td></tr>
                  ) : data.players.map(p => (
                    <tr key={p.id} className={selectedPlayers.includes(p.id) ? "selected-row" : ""}>
                      <td style={{ textAlign: 'center' }}>
                        <input 
                          type="checkbox"
                          checked={selectedPlayers.includes(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          style={{ width: 16, height: 16, cursor: 'pointer' }}
                        />
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div className="avatar" style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent-light)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{(p.display_name || "U")[0].toUpperCase()}</div>
                          <div>
                            <div style={{ fontWeight: 500 }}>{p.display_name}</div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Joined {new Date(p.created_at).toLocaleDateString()}</div>
                          </div>
                        </div>
                      </td>
                      <td>{p.phone_number || "-"}</td>
                      <td style={{ fontWeight: 500 }}>{p.real_balance} ETB</td>
                      <td>{p.total_wagered} ETB</td>
                      <td>{p.games_played}</td>
                      <td>
                        <span className={`badge ${p.is_active ? 'badge-success' : 'badge-danger'}`}>
                          {p.is_active ? 'Active' : 'Blocked'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Link to={`/players/${p.id}`} className="btn btn-ghost btn-icon" title="View Details">
                            <Eye size={16} />
                          </Link>
                          <button
                            className="btn btn-icon btn-ghost"
                            style={{ color: "var(--info)" }}
                            onClick={() => openEditModal(p)}
                            title="Edit Player"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            className="btn btn-icon btn-ghost"
                            style={{ color: p.is_active ? 'var(--danger)' : 'var(--success)' }}
                            onClick={() => toggleStatus(p)}
                            title={p.is_active ? "Block Player" : "Unblock Player"}
                          >
                            {p.is_active ? <ShieldAlert size={16} /> : <ShieldCheck size={16} />}
                          </button>
                          <button
                            className="btn btn-icon btn-ghost"
                            style={{ color: "var(--danger)" }}
                            onClick={() => handleDelete(p)}
                            title="Delete Player"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Showing {Math.min((filters.page - 1) * 20 + 1, data.total)} to {Math.min(filters.page * 20, data.total)} of {data.total} players
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button
                className="btn btn-ghost btn-sm"
                disabled={filters.page === 1}
                onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
              >← Prev</button>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Page {filters.page}</span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={filters.page * 20 >= data.total}
                onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
              >Next →</button>
            </div>
          </div>
        </div>
      </div>

      {/* Player Modal */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{editPlayerId ? "Edit Player" : "Add New Player"}</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleModalSubmit}>
              <div className="modal-body">
                {error && <div style={{ padding: 12, borderRadius: 8, background: "var(--danger-light)", color: "var(--danger)", border: "1px solid var(--danger)", marginBottom: 16, fontSize: 14 }}>{error}</div>}
                
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>Phone Number</label>
                  <input
                    type="tel"
                    className="form-input"
                    required
                    placeholder="+251..."
                    value={formData.phoneNumber}
                    onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
                  />
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>Display Name</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    placeholder="John Doe"
                    value={formData.displayName}
                    onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                  />
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Password {editPlayerId && <span style={{ color: "var(--text-muted)", fontWeight: "normal" }}>(Leave blank to keep current)</span>}
                  </label>
                  <input
                    type="password"
                    className="form-input"
                    required={!editPlayerId}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>Telegram ID (Optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="123456789"
                    value={formData.telegramId}
                    onChange={e => setFormData({ ...formData, telegramId: e.target.value })}
                  />
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Get Telegram ID from @userinfobot on Telegram</div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : "Save Player"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
