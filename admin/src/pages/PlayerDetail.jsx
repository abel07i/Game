import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api";
import { ArrowLeft, Wallet, ShieldAlert, ShieldCheck, Award } from "lucide-react";

export default function PlayerDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adjustModal, setAdjustModal] = useState({ open: false, amount: "", type: "add" });

  const fetchPlayer = () => {
    api.getPlayer(id).then(res => setData(res)).finally(() => setLoading(false));
  };

  useEffect(() => { fetchPlayer(); }, [id]);

  const toggleStatus = async () => {
    const p = data.player;
    if (!window.confirm(`Are you sure you want to ${p.is_active ? 'block' : 'unblock'} ${p.display_name}?`)) return;
    try {
      await api.updatePlayerStatus(p.id, !p.is_active);
      fetchPlayer();
    } catch (err) { alert(err.message); }
  };

  const handleAdjust = async (e) => {
    e.preventDefault();
    try {
      const amt = parseFloat(adjustModal.amount);
      const finalAmt = adjustModal.type === "add" ? amt : -amt;
      await api.adjustPlayerBalance(id, finalAmt, "real");
      setAdjustModal({ open: false, amount: "", type: "add" });
      fetchPlayer();
    } catch (err) { alert(err.message); }
  };

  if (loading) return <div className="loading-overlay"><div className="spinner"></div></div>;
  if (!data) return <div className="empty-state">Player not found</div>;

  const { player, wallets, tickets } = data;
  const realWallet = wallets.find(w => w.mode === "real") || { balance: 0, total_deposited: 0, total_withdrawn: 0, total_won: 0 };

  return (
    <div>
      <div className="mb-6">
        <Link to="/players" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /> Back to Players</Link>
      </div>

      <div className="grid-2 mb-6">
        <div className="card">
          <div className="card-body">
            <div className="flex-between mb-6">
              <div className="flex-center gap-4">
                <div className="avatar" style={{ width: 64, height: 64, fontSize: 24 }}>
                  {(player.display_name || "U")[0].toUpperCase()}
                </div>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700 }}>{player.display_name}</h2>
                  <div className="text-muted">{player.phone_number}</div>
                </div>
              </div>
              <span className={`badge ${player.is_active ? 'badge-success' : 'badge-danger'}`}>
                {player.is_active ? 'Active' : 'Blocked'}
              </span>
            </div>

            <div className="grid-2 gap-4">
              <div>
                <div className="text-sm text-muted mb-1">Joined Date</div>
                <div className="font-medium">{new Date(player.created_at).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted mb-1">Last Login</div>
                <div className="font-medium">{player.last_login_at ? new Date(player.last_login_at).toLocaleString() : 'Never'}</div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t" style={{ borderTop: "1px solid var(--border)" }}>
              <button
                className={`btn ${player.is_active ? 'btn-danger' : 'btn-success'}`}
                onClick={toggleStatus}
              >
                {player.is_active ? <ShieldAlert size={16} /> : <ShieldCheck size={16} />}
                {player.is_active ? "Block Player" : "Unblock Player"}
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title flex-center gap-2"><Wallet size={18} /> Wallet Overview</div>
            <button className="btn btn-primary btn-sm" onClick={() => setAdjustModal({ open: true, amount: "", type: "add" })}>
              Adjust Balance
            </button>
          </div>
          <div className="card-body">
            <div className="mb-6">
              <div className="text-sm text-muted mb-2">Current Balance</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>{realWallet.balance} ETB</div>
            </div>

            <div className="grid-2 gap-4">
              <div style={{ padding: 12, background: "var(--bg-glass)", borderRadius: "var(--radius-sm)" }}>
                <div className="text-sm text-muted mb-1">Total Deposited</div>
                <div className="font-bold text-success">{realWallet.total_deposited} ETB</div>
              </div>
              <div style={{ padding: 12, background: "var(--bg-glass)", borderRadius: "var(--radius-sm)" }}>
                <div className="text-sm text-muted mb-1">Total Withdrawn</div>
                <div className="font-bold text-danger">{realWallet.total_withdrawn} ETB</div>
              </div>
              <div style={{ padding: 12, background: "var(--bg-glass)", borderRadius: "var(--radius-sm)" }}>
                <div className="text-sm text-muted mb-1">Total Wagered</div>
                <div className="font-bold">{realWallet.total_wagered} ETB</div>
              </div>
              <div style={{ padding: 12, background: "var(--bg-glass)", borderRadius: "var(--radius-sm)" }}>
                <div className="text-sm text-muted mb-1">Total Won</div>
                <div className="font-bold text-success">{realWallet.total_won} ETB</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Recent Tickets ({tickets.length})</div>
        </div>
        <div className="card-body">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Room</th>
                  <th>Tier / Jackpot</th>
                  <th>Seat</th>
                  <th>Price</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map(t => (
                  <tr key={t.id}>
                    <td>{new Date(t.purchased_at).toLocaleString()}</td>
                    <td><Link to={`/games/${t.room_id}`} className="text-accent hover:underline">Game #{t.room_number}</Link></td>
                    <td><span className={`tier-${t.tier} font-medium capitalize`}>{t.tier}</span> / {t.target_jackpot}</td>
                    <td>#{t.seat_number}</td>
                    <td>{t.purchase_price} ETB</td>
                    <td>
                      {t.is_winner ? <span className="badge badge-success"><Award size={12} className="mr-1" /> Won {t.amount_received} ETB</span> :
                       t.is_refunded ? <span className="badge badge-warning">Refunded</span> :
                       <span className="badge badge-muted">Lost</span>}
                    </td>
                  </tr>
                ))}
                {tickets.length === 0 && <tr><td colSpan="6" className="text-center text-muted py-8">No tickets found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {adjustModal.open && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Adjust Balance</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setAdjustModal({ ...adjustModal, open: false })}>✕</button>
            </div>
            <form onSubmit={handleAdjust}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Adjustment Type</label>
                  <select
                    className="form-select"
                    value={adjustModal.type}
                    onChange={e => setAdjustModal({ ...adjustModal, type: e.target.value })}
                  >
                    <option value="add">Add Funds (+)</option>
                    <option value="subtract">Deduct Funds (-)</option>
                  </select>
                </div>
                <div className="form-group mb-0">
                  <label className="form-label">Amount (ETB)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={adjustModal.amount}
                    onChange={e => setAdjustModal({ ...adjustModal, amount: e.target.value })}
                    required
                    min="1"
                    step="0.01"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setAdjustModal({ ...adjustModal, open: false })}>Cancel</button>
                <button type="submit" className="btn btn-primary">Confirm Adjustment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
