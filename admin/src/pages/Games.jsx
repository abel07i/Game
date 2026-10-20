import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { 
  Search, 
  Eye, 
  Plus, 
  Edit, 
  Trash2, 
  Play, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw, 
  X, 
  Trophy 
} from "lucide-react";

export default function Games() {
  const [data, setData] = useState({ games: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: "", status: "", tier: "", page: 1 });

  // Create Modal State
  const [createModal, setCreateModal] = useState({
    open: false,
    tierCategory: "starter",
    targetJackpot: "500",
    groupSize: "10",
    maxSeatsPerPlayer: "2",
    roundDurationSeconds: "60",
    submitting: false,
    error: ""
  });

  // Edit Modal State
  const [editModal, setEditModal] = useState({
    open: false,
    room: null,
    maxSeatsPerUser: "",
    timeRemaining: "",
    targetJackpot: "",
    ticketPrice: "",
    submitting: false,
    error: ""
  });

  // Toast State
  const [toast, setToast] = useState(null);

  const fetchGames = () => {
    setLoading(true);
    api.getGames(filters)
      .then(res => setData(res))
      .catch(err => showToast("error", err.message || "Failed to load games"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchGames();
  }, [filters.page, filters.status, filters.tier]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (filters.page !== 1) setFilters({ ...filters, page: 1 });
    else fetchGames();
  };

  // ── Create Game ─────────────────────────────────────────────────────────────
  const openCreateModal = () => {
    setCreateModal({
      open: true,
      tierCategory: "starter",
      targetJackpot: "500",
      groupSize: "10",
      maxSeatsPerPlayer: "2",
      roundDurationSeconds: "60",
      submitting: false,
      error: ""
    });
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateModal(prev => ({ ...prev, submitting: true, error: "" }));

    try {
      const jackpot = parseFloat(createModal.targetJackpot);
      const size = parseInt(createModal.groupSize);
      if (isNaN(jackpot) || jackpot <= 0) throw new Error("Invalid target jackpot");
      if (isNaN(size) || size < 2) throw new Error("Group size must be at least 2 players");

      await api.createGame({
        tierCategory: createModal.tierCategory,
        targetJackpot: jackpot,
        groupSize: size,
        maxSeatsPerPlayer: parseInt(createModal.maxSeatsPerPlayer) || null,
        roundDurationSeconds: parseInt(createModal.roundDurationSeconds) || 60
      });

      showToast("success", `Game room created successfully for ${jackpot} ETB (${size} players)!`);
      setCreateModal(prev => ({ ...prev, open: false, submitting: false }));
      fetchGames();
    } catch (err) {
      setCreateModal(prev => ({ ...prev, submitting: false, error: err.message || "Failed to create game" }));
    }
  };

  // ── Edit Game ───────────────────────────────────────────────────────────────
  const openEditModal = (room) => {
    setEditModal({
      open: true,
      room,
      maxSeatsPerUser: String(room.max_seats_per_player || room.maxSeatsPerUser || 2),
      timeRemaining: "60",
      targetJackpot: String(room.target_jackpot || room.targetJackpot || ""),
      ticketPrice: String(room.ticket_price || room.ticketPrice || ""),
      submitting: false,
      error: ""
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editModal.room) return;
    setEditModal(prev => ({ ...prev, submitting: true, error: "" }));

    try {
      const updates = {
        maxSeatsPerUser: parseInt(editModal.maxSeatsPerUser)
      };
      if (editModal.timeRemaining) {
        updates.timeRemaining = parseInt(editModal.timeRemaining);
      }
      if (editModal.room.filled_seats === 0) {
        if (editModal.targetJackpot) updates.targetJackpot = parseFloat(editModal.targetJackpot);
        if (editModal.ticketPrice) updates.ticketPrice = parseFloat(editModal.ticketPrice);
      }

      await api.updateGame(editModal.room.id, updates);
      showToast("success", `Game #${editModal.room.room_number || editModal.room.roomNumber} updated successfully!`);
      setEditModal(prev => ({ ...prev, open: false, submitting: false }));
      fetchGames();
    } catch (err) {
      setEditModal(prev => ({ ...prev, submitting: false, error: err.message || "Failed to update game" }));
    }
  };

  // ── Delete / Refund Game ────────────────────────────────────────────────────
  const handleDeleteGame = async (room) => {
    const filled = room.filled_seats || room.filledSeats || 0;
    const msg = filled > 0
      ? `Game #${room.room_number} currently has ${filled} filled seats.\n\nDeleting this room will AUTOMATICALLY REFUND all player tickets back to their wallets. Proceed?`
      : `Are you sure you want to delete Game #${room.room_number}?`;

    if (!window.confirm(msg)) return;

    try {
      await api.deleteGame(room.id);
      showToast("success", `Game #${room.room_number} deleted / refunded successfully.`);
      fetchGames();
    } catch (err) {
      alert(err.message || "Failed to delete game");
    }
  };

  // ── Force Start Game ────────────────────────────────────────────────────────
  const handleForceStart = async (room) => {
    if (!window.confirm(`Force start Game #${room.room_number}? The draw will begin immediately.`)) return;
    try {
      await api.forceStartGame(room.id);
      showToast("success", `Game #${room.room_number} draw started!`);
      fetchGames();
    } catch (err) {
      alert(err.message || "Failed to force start game");
    }
  };

  // Live ticket price preview for create modal
  const calculatedTicketPrice = useMemo(() => {
    const j = parseFloat(createModal.targetJackpot) || 0;
    const s = parseInt(createModal.groupSize) || 1;
    return s > 0 ? (j / s).toFixed(2) : "0.00";
  }, [createModal.targetJackpot, createModal.groupSize]);


  return (
    <div>
      {/* Toast alert */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type === "success" ? "toast-success" : "toast-error"}`}>
            {toast.type === "success" ? <CheckCircle className="text-success" size={20} /> : <AlertTriangle className="text-danger" size={20} />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex-between mb-6">
        <div>
          <h1 className="page-title">Game Rooms</h1>
          <p className="text-muted">Create, configure, monitor, and manage digital Equb game cycles.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={fetchGames} disabled={loading} title="Refresh">
            <RefreshCw size={16} className={loading ? "spinner" : ""} />
            <span>Refresh</span>
          </button>
          <button className="btn btn-primary" onClick={openCreateModal}>
            <Plus size={16} />
            <span>Create Game Room</span>
          </button>
        </div>
      </div>

      {/* Main Card */}
      <div className="card">
        <div className="card-body">
          {/* Filter Row */}
          <form onSubmit={handleSearch} className="filter-row mb-6">
            <div className="search-input-wrapper">
              <Search size={16} />
              <input
                type="text"
                className="form-input"
                placeholder="Search by Room # (e.g. 43403)..."
                value={filters.search}
                onChange={e => setFilters({ ...filters, search: e.target.value })}
              />
            </div>
            <select
              className="form-select"
              style={{ width: "auto" }}
              value={filters.status}
              onChange={e => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">All Statuses</option>
              <option value="open">Open (Accepting Players)</option>
              <option value="drawing">Drawing (In Progress)</option>
              <option value="settled">Settled (Winner Picked)</option>
              <option value="refunded">Refunded (Cancelled)</option>
            </select>
            <select
              className="form-select"
              style={{ width: "auto" }}
              value={filters.tier}
              onChange={e => setFilters({ ...filters, tier: e.target.value })}
            >
              <option value="">All Tiers</option>
              <option value="starter">Starter</option>
              <option value="bronze">Bronze</option>
              <option value="silver">Silver</option>
              <option value="gold">Gold</option>
            </select>
            <button type="submit" className="btn btn-primary btn-sm">Filter</button>
          </form>

          {/* Table */}
          {loading ? (
            <div className="loading-overlay">
              <div className="spinner"></div>
              <span>Loading games...</span>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Room #</th>
                    <th>Tier</th>
                    <th>Target Jackpot</th>
                    <th>Ticket Price</th>
                    <th>Capacity / Progress</th>
                    <th>Status</th>
                    <th>Winner</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.games.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="text-center text-muted py-8">
                        No game rooms found matching current criteria.
                      </td>
                    </tr>
                  ) : (
                    data.games.map(g => {
                      const filled = g.filled_seats || 0;
                      const size = g.group_size || 10;
                      const pct = Math.min(100, (filled / size) * 100);

                      return (
                        <tr key={g.id}>
                          {/* Room Number */}
                          <td className="font-bold">
                            <Link to={`/games/${g.id}`} className="hover:underline text-primary">
                              Game #{g.room_number}
                            </Link>
                          </td>

                          {/* Tier */}
                          <td>
                            <span className={`tier-${g.tier} font-medium capitalize`}>
                              {g.tier}
                            </span>
                          </td>

                          {/* Jackpot */}
                          <td className="font-bold text-warning">
                            {parseFloat(g.target_jackpot).toLocaleString()} ETB
                          </td>

                          {/* Ticket Price */}
                          <td className="font-mono">
                            {parseFloat(g.ticket_price).toLocaleString()} ETB
                          </td>

                          {/* Capacity / Progress */}
                          <td style={{ minWidth: 160 }}>
                            <div className="flex-between text-xs mb-1">
                              <span>{filled} / {size} Seats</span>
                              <span className="text-muted">{Math.round(pct)}%</span>
                            </div>
                            <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                              <div
                                style={{
                                  height: "100%",
                                  background: pct >= 100 ? "var(--warning)" : "var(--accent)",
                                  width: `${pct}%`,
                                  transition: "width 0.3s ease"
                                }}
                              />
                            </div>
                          </td>

                          {/* Status */}
                          <td>
                            <span
                              className={`badge ${
                                g.status === "open"
                                  ? "badge-success"
                                  : g.status === "drawing"
                                  ? "badge-warning"
                                  : g.status === "settled"
                                  ? "badge-accent"
                                  : "badge-muted"
                              }`}
                            >
                              {g.status === "open" && <Clock size={12} />}
                              {g.status === "drawing" && <Play size={12} />}
                              {g.status === "settled" && <Trophy size={12} />}
                              {g.status.toUpperCase()}
                            </span>
                          </td>

                          {/* Winner */}
                          <td>
                            {g.winner_name ? (
                              <div className="font-medium text-success flex-center gap-1">
                                <Trophy size={14} />
                                <span>{g.winner_name}</span>
                              </div>
                            ) : (
                              <span className="text-muted text-xs">-</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td>
                            <div className="flex gap-2 items-center">
                              <Link to={`/games/${g.id}`} className="btn btn-ghost btn-sm" title="View details">
                                <Eye size={14} />
                              </Link>

                              {g.status === "open" && (
                                <>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    title="Edit room settings"
                                    onClick={() => openEditModal(g)}
                                  >
                                    <Edit size={14} />
                                  </button>

                                  <button
                                    className="btn btn-primary btn-sm"
                                    title="Force start game"
                                    disabled={filled < 2}
                                    onClick={() => handleForceStart(g)}
                                  >
                                    <Play size={14} />
                                  </button>

                                  <button
                                    className="btn btn-danger btn-sm"
                                    title="Delete or refund room"
                                    onClick={() => handleDeleteGame(g)}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="pagination">
            <div className="pagination-info">
              Showing {Math.min((filters.page - 1) * 20 + 1, data.total)} to{" "}
              {Math.min(filters.page * 20, data.total)} of {data.total} games
            </div>
            <div className="pagination-controls">
              <button
                className="page-btn"
                disabled={filters.page === 1}
                onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
              >
                ←
              </button>
              <span className="text-sm font-medium px-2">Page {filters.page}</span>
              <button
                className="page-btn"
                disabled={filters.page * 20 >= data.total}
                onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
              >
                →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── CREATE GAME MODAL ──────────────────────────────────────────────── */}
      {createModal.open && (
        <div className="modal-overlay" onClick={() => !createModal.submitting && setCreateModal({ ...createModal, open: false })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title flex-center gap-2">
                <Plus size={18} className="text-accent" />
                <span>Create New Game Room</span>
              </h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setCreateModal({ ...createModal, open: false })}
                disabled={createModal.submitting}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="modal-body space-y-4">
                {createModal.error && (
                  <div className="p-3 rounded text-sm" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid var(--danger)", color: "var(--danger)" }}>
                    {createModal.error}
                  </div>
                )}

                {/* Tier Selection */}
                <div className="form-group">
                  <label className="form-label">Tier Category</label>
                  <select
                    className="form-select"
                    value={createModal.tierCategory}
                    onChange={e => setCreateModal({ ...createModal, tierCategory: e.target.value })}
                  >
                    <option value="starter">Starter (≤ 500 ETB)</option>
                    <option value="bronze">Bronze (1,000 – 5,000 ETB)</option>
                    <option value="silver">Silver (10,000 – 50,000 ETB)</option>
                    <option value="gold">Gold (≥ 100,000 ETB)</option>
                  </select>
                </div>

                {/* Group Size and Jackpot Grid */}
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Group Size (Seats)</label>
                    <select
                      className="form-select"
                      value={createModal.groupSize}
                      onChange={e => setCreateModal({ ...createModal, groupSize: e.target.value })}
                    >
                      <option value="5">5 Players</option>
                      <option value="10">10 Players</option>
                      <option value="15">15 Players</option>
                      <option value="20">20 Players</option>
                      <option value="40">40 Players</option>
                      <option value="50">50 Players</option>
                      <option value="60">60 Players</option>
                      <option value="80">80 Players</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Target Jackpot (ETB)</label>
                    <input
                      type="number"
                      className="form-input"
                      min="10"
                      step="10"
                      required
                      placeholder="e.g. 500"
                      value={createModal.targetJackpot}
                      onChange={e => setCreateModal({ ...createModal, targetJackpot: e.target.value })}
                    />
                  </div>
                </div>

                {/* Live Ticket Price Preview Card */}
                <div className="p-4 rounded-lg flex-between" style={{ background: "var(--bg-glass)", border: "1px solid var(--border)" }}>
                  <div>
                    <div className="text-muted text-xs">CALCULATED TICKET PRICE</div>
                    <div className="font-bold text-success" style={{ fontSize: 20 }}>
                      {calculatedTicketPrice} ETB
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted">
                    <div>Gross Pool: {parseFloat(createModal.targetJackpot || 0).toLocaleString()} ETB</div>
                    <div>Net Payout (85%): {(parseFloat(createModal.targetJackpot || 0) * 0.85).toLocaleString()} ETB</div>
                  </div>
                </div>

                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Max Seats Per Player</label>
                    <input
                      type="number"
                      className="form-input"
                      min="1"
                      max={createModal.groupSize}
                      required
                      value={createModal.maxSeatsPerPlayer}
                      onChange={e => setCreateModal({ ...createModal, maxSeatsPerPlayer: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Cycle Duration (Seconds)</label>
                    <input
                      type="number"
                      className="form-input"
                      min="10"
                      max="3600"
                      required
                      value={createModal.roundDurationSeconds}
                      onChange={e => setCreateModal({ ...createModal, roundDurationSeconds: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setCreateModal({ ...createModal, open: false })}
                  disabled={createModal.submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={createModal.submitting}>
                  {createModal.submitting ? (
                    <>
                      <div className="spinner" style={{ width: 14, height: 14 }}></div>
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>Launch Room</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT GAME MODAL ────────────────────────────────────────────────── */}
      {editModal.open && editModal.room && (
        <div className="modal-overlay" onClick={() => !editModal.submitting && setEditModal({ ...editModal, open: false })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title flex-center gap-2">
                <Edit size={18} className="text-primary" />
                <span>Edit Game #{editModal.room.room_number || editModal.room.roomNumber}</span>
              </h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setEditModal({ ...editModal, open: false })}
                disabled={editModal.submitting}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="modal-body space-y-4">
                {editModal.error && (
                  <div className="p-3 rounded text-sm" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid var(--danger)", color: "var(--danger)" }}>
                    {editModal.error}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Max Seats Per Player (Quota)</label>
                  <input
                    type="number"
                    className="form-input"
                    min="1"
                    max={editModal.room.group_size}
                    required
                    value={editModal.maxSeatsPerUser}
                    onChange={e => setEditModal({ ...editModal, maxSeatsPerUser: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Reset Timer Countdown (Seconds)</label>
                  <input
                    type="number"
                    className="form-input"
                    min="5"
                    max="600"
                    placeholder="e.g. 60"
                    value={editModal.timeRemaining}
                    onChange={e => setEditModal({ ...editModal, timeRemaining: e.target.value })}
                  />
                  <span className="text-muted text-xs">Leave blank or set new countdown in seconds.</span>
                </div>

                {/* Only editable if 0 tickets purchased */}
                {editModal.room.filled_seats === 0 ? (
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Target Jackpot (ETB)</label>
                      <input
                        type="number"
                        className="form-input"
                        value={editModal.targetJackpot}
                        onChange={e => setEditModal({ ...editModal, targetJackpot: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Ticket Price (ETB)</label>
                      <input
                        type="number"
                        className="form-input"
                        step="0.01"
                        value={editModal.ticketPrice}
                        onChange={e => setEditModal({ ...editModal, ticketPrice: e.target.value })}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded text-xs text-muted" style={{ background: "var(--bg-glass)" }}>
                    ℹ️ Price and jackpot cannot be modified because tickets have already been purchased for this game cycle.
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setEditModal({ ...editModal, open: false })}
                  disabled={editModal.submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={editModal.submitting}>
                  {editModal.submitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
