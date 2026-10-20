import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api from "../api";
import {
  ArrowLeft, CheckCircle, XCircle, User, Edit, Trash2,
  Play, Shield, Copy, Check, Hash, Key, X
} from "lucide-react";

export default function GameDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState(null);

  // Edit Modal State
  const [editModal, setEditModal] = useState({
    open: false,
    maxSeatsPerUser: "",
    timeRemaining: "60",
    targetJackpot: "",
    ticketPrice: "",
    submitting: false,
    error: ""
  });

  useEffect(() => {
    fetchGame();
  }, [id]);

  const fetchGame = () => {
    setLoading(true);
    api.getGame(id)
      .then(res => setData(res))
      .catch(err => {
        console.error("Failed to load game:", err);
      })
      .finally(() => setLoading(false));
  };

  const handleCopy = (key, text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleForceStart = async () => {
    if (!window.confirm(`Force start Game #${data.game.room_number}? The draw animation and winner determination will execute immediately.`)) return;
    try {
      await api.forceStartGame(id);
      fetchGame();
    } catch (err) {
      alert(err.message || "Failed to force start game");
    }
  };

  const handleDelete = async () => {
    const filled = data.game.filled_seats || 0;
    const msg = filled > 0
      ? `Game #${data.game.room_number} currently has ${filled} filled seats.\n\nDeleting this room will AUTOMATICALLY REFUND all player tickets back to their wallets. Proceed with cancellation and refund?`
      : `Are you sure you want to delete Game #${data.game.room_number}?`;

    if (!window.confirm(msg)) return;
    try {
      await api.deleteGame(id);
      alert(`Game #${data.game.room_number} deleted / cancelled.`);
      navigate("/games");
    } catch (err) {
      alert(err.message || "Failed to delete game");
    }
  };

  const openEditModal = () => {
    const g = data.game;
    setEditModal({
      open: true,
      maxSeatsPerUser: String(g.max_seats_per_player || 2),
      timeRemaining: "60",
      targetJackpot: String(g.target_jackpot || ""),
      ticketPrice: String(g.ticket_price || ""),
      submitting: false,
      error: ""
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditModal(prev => ({ ...prev, submitting: true, error: "" }));
    try {
      const updates = {
        maxSeatsPerUser: parseInt(editModal.maxSeatsPerUser, 10)
      };
      if (editModal.timeRemaining) {
        updates.timeRemaining = parseInt(editModal.timeRemaining, 10);
      }
      if (data.game.filled_seats === 0) {
        if (editModal.targetJackpot) updates.targetJackpot = parseFloat(editModal.targetJackpot);
        if (editModal.ticketPrice) updates.ticketPrice = parseFloat(editModal.ticketPrice);
      }

      await api.updateGame(id, updates);
      setEditModal(prev => ({ ...prev, open: false, submitting: false }));
      fetchGame();
    } catch (err) {
      setEditModal(prev => ({ ...prev, submitting: false, error: err.message || "Failed to update game" }));
    }
  };

  if (loading) return <div className="loading-overlay"><div className="spinner"></div></div>;
  if (!data || !data.game) return <div className="empty-state">Game not found</div>;

  const { game, tickets } = data;
  const isSettled = game.status === "settled";
  const isOpen = game.status === "open";
  const isCancelled = ["cancelled", "refunded"].includes(game.status);

  return (
    <div>
      <div className="mb-6 flex-between">
        <Link to="/games" className="btn btn-ghost btn-sm">
          <ArrowLeft size={16} /> Back to Games
        </Link>
        <div className="text-sm text-muted font-mono">
          UUID: {game.id}
        </div>
      </div>

      <div className="card mb-6">
        <div className="card-body">
          <div className="flex-between mb-6 flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Game #{game.room_number}</h2>
                <span className={`badge ${
                  isOpen ? 'badge-success' :
                  game.status === 'drawing' ? 'badge-warning' :
                  isSettled ? 'badge-accent' : 'badge-danger'
                }`} style={{ fontSize: 13, padding: "5px 12px" }}>
                  {game.status.toUpperCase()}
                </span>
                <span className={`badge tier-${game.tier}`} style={{ fontSize: 13, textTransform: "capitalize" }}>
                  {game.tier} Tier
                </span>
              </div>
              <div className="text-muted text-sm mt-1">
                Created on {new Date(game.created_at).toLocaleString()}
                {game.settled_at && ` • Settled on ${new Date(game.settled_at).toLocaleString()}`}
              </div>
            </div>

            {/* Actions for Game */}
            <div className="flex gap-2 items-center flex-wrap">
              {isOpen && (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={openEditModal} style={{ border: "1px solid var(--border)" }}>
                    <Edit size={15} /> Edit Room
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={handleForceStart}>
                    <Play size={15} /> Force Start
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={handleDelete}>
                    <Trash2 size={15} /> Cancel & Refund
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid-auto gap-4">
            <div style={{ padding: 16, background: "var(--bg-glass)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
              <div className="text-xs text-muted mb-1">Ticket Price</div>
              <div className="font-bold text-lg">{game.ticket_price} ETB</div>
            </div>

            <div style={{ padding: 16, background: "var(--bg-glass)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
              <div className="text-xs text-muted mb-1">Target Jackpot</div>
              <div className="font-bold text-lg text-accent">{game.target_jackpot} ETB</div>
            </div>

            <div style={{ padding: 16, background: "var(--bg-glass)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
              <div className="text-xs text-muted mb-1">Seats Sold / Total</div>
              <div className="font-bold text-lg">{game.filled_seats} / {game.group_size}</div>
              <div style={{ width: "100%", height: 4, background: "var(--border)", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
                <div style={{
                  width: `${Math.min(100, Math.round((game.filled_seats / game.group_size) * 100))}%`,
                  height: "100%",
                  background: game.filled_seats === game.group_size ? "var(--accent)" : "var(--primary)"
                }} />
              </div>
            </div>

            <div style={{ padding: 16, background: "var(--bg-glass)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
              <div className="text-xs text-muted mb-1">Max Seats / Player</div>
              <div className="font-bold text-lg">{game.max_seats_per_player || 2}</div>
            </div>

            <div style={{ padding: 16, background: "var(--bg-glass)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
              <div className="text-xs text-muted mb-1">Platform Treasury Fee</div>
              <div className="font-bold text-lg">{game.platform_fee ? `${game.platform_fee} ETB` : "Pending"}</div>
            </div>

            <div style={{ padding: 16, background: "var(--bg-glass)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
              <div className="text-xs text-muted mb-1">Net Winner Payout</div>
              <div className="font-bold text-lg text-success">{game.net_winner_payout ? `${game.net_winner_payout} ETB` : "Pending"}</div>
            </div>
          </div>

          {/* Winner Box */}
          {isSettled && (
            <div className="mt-6 p-4 rounded" style={{ background: "var(--success-light)", border: "1px solid var(--success)" }}>
              <div className="flex-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <CheckCircle size={28} className="text-success" />
                  <div>
                    <div className="font-bold text-success" style={{ fontSize: 16 }}>
                      Winning Seat Number: #{game.winning_number}
                    </div>
                    <div className="text-sm">
                      Winner:{" "}
                      <Link to={`/players/${game.winner_user_id}`} className="font-semibold hover:underline text-success">
                        {game.winner_name || "Unknown"}
                      </Link>{" "}
                      {game.winner_phone && <span className="text-muted font-mono">({game.winner_phone})</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted">Amount Won</div>
                  <div className="font-bold text-success text-lg">{game.net_winner_payout} ETB</div>
                </div>
              </div>
            </div>
          )}

          {/* Cancelled Notice */}
          {isCancelled && (
            <div className="mt-6 p-4 rounded" style={{ background: "var(--danger-light)", border: "1px solid var(--danger)", color: "var(--danger)" }}>
              <div className="flex items-center gap-3">
                <XCircle size={24} />
                <div>
                  <div className="font-bold">Room Cancelled / Refunded</div>
                  <div className="text-xs">All participants have had their wagers automatically refunded to their wallet balance.</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Provably Fair Cryptographic Audit Section */}
      {(game.server_seed_hash || isSettled) && (
        <div className="card mb-6" style={{ border: "1px solid var(--border)" }}>
          <div className="card-header flex-between">
            <div className="card-title flex items-center gap-2">
              <Shield size={18} color="var(--accent)" /> Provably Fair Cryptographic Verification
            </div>
            <span className="badge badge-accent" style={{ fontSize: 11 }}>HMAC-SHA256</span>
          </div>
          <div className="card-body">
            <p className="text-sm text-muted mb-4">
              The winner selection uses cryptographic seed commitments to guarantee deterministic and unmanipulated outcomes.
            </p>

            <div className="grid-2 gap-4">
              <div style={{ background: "var(--bg-glass)", padding: 14, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                <div className="flex-between mb-1">
                  <span className="text-xs text-muted flex items-center gap-1"><Hash size={13} /> Server Seed Hash (Pre-commitment)</span>
                  {game.server_seed_hash && (
                    <button className="btn btn-ghost btn-sm" style={{ padding: "2px 6px", height: "auto" }} onClick={() => handleCopy("hash", game.server_seed_hash)}>
                      {copiedKey === "hash" ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                    </button>
                  )}
                </div>
                <div className="font-mono text-xs text-accent" style={{ wordBreak: "break-all" }}>
                  {game.server_seed_hash || "Generated at draw initiation"}
                </div>
              </div>

              <div style={{ background: "var(--bg-glass)", padding: 14, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                <div className="flex-between mb-1">
                  <span className="text-xs text-muted flex items-center gap-1"><Key size={13} /> Revealed Server Seed</span>
                  {game.server_seed && (
                    <button className="btn btn-ghost btn-sm" style={{ padding: "2px 6px", height: "auto" }} onClick={() => handleCopy("seed", game.server_seed)}>
                      {copiedKey === "seed" ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                    </button>
                  )}
                </div>
                <div className="font-mono text-xs text-success" style={{ wordBreak: "break-all" }}>
                  {game.server_seed || (isSettled ? "Not recorded" : "Hidden until game settlement")}
                </div>
              </div>

              <div style={{ background: "var(--bg-glass)", padding: 14, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                <div className="text-xs text-muted mb-1">Client Seed</div>
                <div className="font-mono text-xs" style={{ wordBreak: "break-all" }}>
                  {game.client_seed || "equb-client-seed-v1"}
                </div>
              </div>

              <div style={{ background: "var(--bg-glass)", padding: 14, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                <div className="text-xs text-muted mb-1">Nonce & Winning Seat</div>
                <div className="font-mono text-xs">
                  Nonce: <span className="font-bold">{game.nonce || 1}</span> &nbsp;|&nbsp; Seat: <span className="text-success font-bold">#{game.winning_number || "—"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Participants Table */}
      <div className="card">
        <div className="card-header flex-between">
          <div className="card-title">Participants ({tickets.length})</div>
          <div className="text-xs text-muted">
            {tickets.length > 0 ? `${tickets.length} seats occupied` : "No seats purchased yet"}
          </div>
        </div>
        <div className="card-body">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Phone</th>
                  <th>Seat #</th>
                  <th>Purchased At</th>
                  <th>Price Paid</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map(t => (
                  <tr key={t.id} style={t.is_winner ? { background: "var(--success-light)" } : {}}>
                    <td>
                      <Link to={`/players/${t.user_id}`} className="flex items-center gap-2 hover:underline font-medium">
                        <User size={14} /> {t.player_name}
                      </Link>
                    </td>
                    <td className="font-mono text-xs text-muted">{t.phone_number || "—"}</td>
                    <td className="font-medium">#{t.seat_number}</td>
                    <td className="text-sm text-muted">{new Date(t.purchased_at).toLocaleString()}</td>
                    <td>{t.purchase_price} ETB</td>
                    <td>
                      {t.is_winner ? (
                        <span className="badge badge-success">Winner</span>
                      ) : t.is_refunded ? (
                        <span className="badge badge-warning">Refunded</span>
                      ) : (
                        <span className="badge badge-muted">Participant</span>
                      )}
                    </td>
                  </tr>
                ))}
                {tickets.length === 0 && (
                  <tr>
                    <td colSpan="6" className="text-center text-muted py-8">
                      No tickets purchased yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Room Modal */}
      {editModal.open && (
        <div className="modal-overlay" style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16
        }}>
          <div className="card" style={{ maxWidth: 460, width: "100%", border: "1px solid var(--border)", boxShadow: "0 20px 40px rgba(0,0,0,0.6)" }}>
            <div className="card-header flex-between">
              <div className="card-title">Edit Game #{game.room_number}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditModal({ ...editModal, open: false })}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="card-body">
                {editModal.error && (
                  <div style={{ marginBottom: 16, padding: 12, borderRadius: 6, background: "var(--danger-light)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13 }}>
                    {editModal.error}
                  </div>
                )}

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 13, marginBottom: 6, color: "var(--text-secondary)" }}>
                    Max Seats Per User
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={game.group_size - 1}
                    className="form-input"
                    value={editModal.maxSeatsPerUser}
                    onChange={e => setEditModal({ ...editModal, maxSeatsPerUser: e.target.value })}
                    required
                  />
                  <div className="text-muted text-xs mt-1">Must be &lt; total capacity ({game.group_size}).</div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 13, marginBottom: 6, color: "var(--text-secondary)" }}>
                    Round Duration / Countdown (Seconds)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="600"
                    className="form-input"
                    value={editModal.timeRemaining}
                    onChange={e => setEditModal({ ...editModal, timeRemaining: e.target.value })}
                  />
                  <div className="text-muted text-xs mt-1">Adjusts room round duration or active timer.</div>
                </div>

                {game.filled_seats === 0 ? (
                  <>
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: "block", fontSize: 13, marginBottom: 6, color: "var(--text-secondary)" }}>
                        Target Jackpot (ETB)
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="form-input"
                        value={editModal.targetJackpot}
                        onChange={e => setEditModal({ ...editModal, targetJackpot: e.target.value })}
                      />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: "block", fontSize: 13, marginBottom: 6, color: "var(--text-secondary)" }}>
                        Ticket Price (ETB)
                      </label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        className="form-input"
                        value={editModal.ticketPrice}
                        onChange={e => setEditModal({ ...editModal, ticketPrice: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted" style={{ padding: 12, background: "var(--bg-glass)", borderRadius: 6 }}>
                    Note: Jackpot and Ticket Price cannot be modified because {game.filled_seats} seats have already been purchased.
                  </div>
                )}
              </div>
              <div className="card-footer flex justify-end gap-3" style={{ padding: "16px 24px", borderTop: "1px solid var(--border)" }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditModal({ ...editModal, open: false })}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={editModal.submitting}>
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
