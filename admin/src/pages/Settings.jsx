import { useState, useEffect } from "react";
import api from "../api";
import { AlertCircle, CheckCircle, UserPlus, Info, Users, Trash2, X, Edit2, Shield } from "lucide-react";

export default function Settings() {
  const [data, setData] = useState({ configs: [], settings: null, admins: [] });
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  
  // Admin creation state
  const [newAdmin, setNewAdmin] = useState({ phoneNumber: "", displayName: "", password: "" });
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  // Platform fee state
  const [platformFeeInput, setPlatformFeeInput] = useState("");
  const [updatingFee, setUpdatingFee] = useState(false);

  // Telebirr state
  const [paymentConfig, setPaymentConfig] = useState({ phone: "", name: "", apiKey: "" });
  const [updatingPayment, setUpdatingPayment] = useState(false);

  // Quota modal state
  const [quotaModal, setQuotaModal] = useState({ open: false, groupSize: null, maxSeats: 2, submitting: false, error: "" });

  const fetchSettings = () => {
    Promise.all([
      api.getRoomConfigs().catch(() => ({ quotas: [] })),
      api.getSettings().catch(() => null),
      api.getAdmins().catch(() => []),
      api.getMe().catch(() => null)
    ])
      .then(([roomRes, setRes, adminsRes, meRes]) => {
        setData({
          configs: roomRes?.quotas || [],
          settings: setRes,
          admins: adminsRes || []
        });
        if (meRes) setCurrentAdmin(meRes);
        if (setRes) {
          setPlatformFeeInput((setRes.platformFee * 100).toString());
          setPaymentConfig({
            phone: setRes.telebirrPhone || '',
            name: setRes.telebirrName || '',
            apiKey: setRes.verifyEtApiKey || ''
          });
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchSettings(); }, []);

  const openQuotaModal = (groupSize, currentMaxSeats) => {
    setQuotaModal({
      open: true,
      groupSize,
      maxSeats: currentMaxSeats,
      submitting: false,
      error: ""
    });
  };

  const handleQuotaSubmit = async (e) => {
    e.preventDefault();
    const newMax = parseInt(quotaModal.maxSeats, 10);
    if (isNaN(newMax) || newMax < 1 || newMax >= parseInt(quotaModal.groupSize, 10)) {
      setQuotaModal(prev => ({
        ...prev,
        error: `Must be between 1 and ${parseInt(quotaModal.groupSize, 10) - 1} seats.`
      }));
      return;
    }

    setQuotaModal(prev => ({ ...prev, submitting: true, error: "" }));
    try {
      await api.updateQuota(quotaModal.groupSize, newMax);
      setMessage(`Quota for ${quotaModal.groupSize}-player rooms updated to max ${newMax} seats!`);
      setQuotaModal({ open: false, groupSize: null, maxSeats: 2, submitting: false, error: "" });
      fetchSettings();
      setTimeout(() => setMessage(""), 4000);
    } catch (err) {
      setQuotaModal(prev => ({ ...prev, submitting: false, error: err.message || "Failed to update quota" }));
    }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setCreatingAdmin(true);
    setError("");
    try {
      await api.createAdmin(newAdmin);
      setMessage(`Admin account for ${newAdmin.displayName} created successfully!`);
      setNewAdmin({ phoneNumber: "", displayName: "", password: "" });
      fetchSettings();
      setTimeout(() => setMessage(""), 5000);
    } catch (err) {
      setError(err.message || "Failed to create admin");
      setTimeout(() => setError(""), 5000);
    } finally {
      setCreatingAdmin(false);
    }
  };

  const handleDeleteAdmin = async (admin) => {
    if (currentAdmin && currentAdmin.id === admin.id) {
      alert("You cannot delete your own admin account.");
      return;
    }
    if (data.admins.length <= 1) {
      alert("Cannot delete the last remaining administrator account.");
      return;
    }
    if (!window.confirm(`Are you sure you want to remove administrator ${admin.display_name} (${admin.phone_number})?`)) {
      return;
    }

    try {
      await api.deleteAdmin(admin.id);
      setMessage(`Admin ${admin.display_name} removed successfully.`);
      fetchSettings();
      setTimeout(() => setMessage(""), 4000);
    } catch (err) {
      setError(err.message || "Failed to delete admin");
      setTimeout(() => setError(""), 5000);
    }
  };

  const handleUpdatePayment = async (e) => {
    e.preventDefault();
    setUpdatingPayment(true);
    setError("");
    try {
      await api.updateSettings({
        telebirrPhone: paymentConfig.phone,
        telebirrName: paymentConfig.name,
        verifyEtApiKey: paymentConfig.apiKey
      });
      setMessage("Payment configuration updated successfully!");
      fetchSettings();
      setTimeout(() => setMessage(""), 5000);
    } catch (err) {
      setError(err.message || "Failed to update payment configuration");
      setTimeout(() => setError(""), 5000);
    } finally {
      setUpdatingPayment(false);
    }
  };

  const handleUpdateFee = async (e) => {
    e.preventDefault();
    const feeVal = parseFloat(platformFeeInput) / 100;
    if (isNaN(feeVal) || feeVal < 0 || feeVal > 1) {
      alert("Invalid fee percentage (must be between 0 and 100)");
      return;
    }
    setUpdatingFee(true);
    setError("");
    try {
      await api.updateSettings({ platformFee: feeVal });
      setMessage("Prize commission configuration updated successfully!");
      fetchSettings();
      setTimeout(() => setMessage(""), 5000);
    } catch (err) {
      setError(err.message || "Failed to update fee");
      setTimeout(() => setError(""), 5000);
    } finally {
      setUpdatingFee(false);
    }
  };

  if (loading) return <div className="loading-overlay"><div className="spinner"></div></div>;

  return (
    <div className="card" style={{ maxWidth: 920 }}>
      <div className="card-header"><div className="card-title">Platform Settings & Security</div></div>
      <div className="card-body">
        {message && (
          <div style={{ marginBottom: 24, padding: 16, borderRadius: "var(--radius-sm)", background: "var(--success-light)", border: "1px solid var(--success)", color: "var(--success)", display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle size={18} /> {message}
          </div>
        )}
        {error && (
          <div style={{ marginBottom: 24, padding: 16, borderRadius: "var(--radius-sm)", background: "var(--danger-light)", border: "1px solid var(--danger)", color: "var(--danger)", display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={18} /> {error}
          </div>
        )}

        {/* Prize Management Form */}
        <h3 style={{ fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><Info size={18} color="var(--accent)"/> Prize & Platform Commission</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 20 }}>Configure the percentage of the gross pool that the platform takes as commission. The remainder goes directly to the winner.</p>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
           <div style={{ padding: 16, borderRadius: "var(--radius-sm)", background: 'var(--bg-glass)', border: '1px solid var(--border)' }}>
             <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>Platform Commission Fee</div>
             <div style={{ fontSize: 24, fontWeight: 800 }}>{data.settings ? (data.settings.platformFee * 100).toFixed(0) : 0}%</div>
           </div>
           <div style={{ padding: 16, borderRadius: "var(--radius-sm)", background: 'var(--bg-glass)', border: '1px solid var(--border)' }}>
             <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>Winner Net Payout</div>
             <div style={{ fontSize: 24, fontWeight: 800, color: "var(--success)" }}>{data.settings ? (data.settings.prizePct * 100).toFixed(0) : 0}%</div>
           </div>
        </div>

        <form onSubmit={handleUpdateFee} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 32 }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ fontSize: 13, marginBottom: 4, display: "block", color: "var(--text-secondary)" }}>New Platform Fee (%)</label>
            <input type="number" className="form-input" min="0" max="100" required value={platformFeeInput} onChange={e => setPlatformFeeInput(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={updatingFee} style={{ padding: "11px 20px" }}>
             {updatingFee ? "Saving..." : "Update Fee"}
          </button>
        </form>

        {/* Payment Settings Form */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 32, marginBottom: 32 }}>
          <h3 style={{ fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><Info size={18} color="var(--warning)"/> Telebirr Integration</h3>
          <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 20 }}>Configure the Telebirr payment receiver details displayed to players and the Verify.ET automated API key.</p>
          <form onSubmit={handleUpdatePayment} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ fontSize: 13, marginBottom: 4, display: "block", color: "var(--text-secondary)" }}>Telebirr Phone</label>
              <input type="text" className="form-input" required placeholder="09..." value={paymentConfig.phone} onChange={e => setPaymentConfig({...paymentConfig, phone: e.target.value})} />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ fontSize: 13, marginBottom: 4, display: "block", color: "var(--text-secondary)" }}>Telebirr Name</label>
              <input type="text" className="form-input" required placeholder="Receiver Name" value={paymentConfig.name} onChange={e => setPaymentConfig({...paymentConfig, name: e.target.value})} />
            </div>
            <div style={{ flex: '1 1 100%' }}>
              <label style={{ fontSize: 13, marginBottom: 4, display: "block", color: "var(--text-secondary)" }}>Verify.ET API Key</label>
              <input type="text" className="form-input" required placeholder="VERIFY_BANK_ET_..." value={paymentConfig.apiKey} onChange={e => setPaymentConfig({...paymentConfig, apiKey: e.target.value})} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={updatingPayment} style={{ padding: "11px 20px" }}>
               {updatingPayment ? "Saving..." : "Save Configuration"}
            </button>
          </form>
        </div>

        {/* Admin Management (CRUD) */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 32, marginBottom: 32 }}>
          <div className="flex-between mb-4">
            <div>
              <h3 style={{ fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                <Users size={18} color="var(--info)"/> Administrator Accounts ({data.admins.length})
              </h3>
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
                Active administrative accounts with dashboard and financial authority.
              </p>
            </div>
          </div>

          {/* Admins Table */}
          <div className="table-wrapper mb-6">
            <table>
              <thead>
                <tr>
                  <th>Admin Name</th>
                  <th>Phone Number</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.admins.map(adm => {
                  const isCurrent = currentAdmin && currentAdmin.id === adm.id;
                  return (
                    <tr key={adm.id}>
                      <td style={{ fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Shield size={14} color="var(--accent)" />
                          {adm.display_name}
                          {isCurrent && (
                            <span className="badge badge-accent" style={{ fontSize: 10, padding: "2px 6px" }}>You</span>
                          )}
                        </div>
                      </td>
                      <td className="font-mono text-sm">{adm.phone_number}</td>
                      <td>
                        <span className="badge badge-primary">{adm.role}</span>
                      </td>
                      <td className="text-sm text-muted">
                        {adm.created_at ? new Date(adm.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={isCurrent || data.admins.length <= 1}
                          title={isCurrent ? "Cannot delete yourself" : (data.admins.length <= 1 ? "Cannot delete last admin" : "Delete administrator")}
                          onClick={() => handleDeleteAdmin(adm)}
                          style={{ padding: "4px 8px", opacity: (isCurrent || data.admins.length <= 1) ? 0.4 : 1 }}
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add Admin Form */}
          <div style={{ background: "var(--bg-glass)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 20 }}>
            <h4 style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <UserPlus size={16} /> Add New Administrator
            </h4>
            <form onSubmit={handleCreateAdmin} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 180px' }}>
                <label style={{ fontSize: 13, marginBottom: 4, display: "block", color: "var(--text-secondary)" }}>Phone Number</label>
                <input type="tel" className="form-input" required placeholder="+251..." value={newAdmin.phoneNumber} onChange={e => setNewAdmin({...newAdmin, phoneNumber: e.target.value})} />
              </div>
              <div style={{ flex: '1 1 180px' }}>
                <label style={{ fontSize: 13, marginBottom: 4, display: "block", color: "var(--text-secondary)" }}>Display Name</label>
                <input type="text" className="form-input" required placeholder="Admin Name" value={newAdmin.displayName} onChange={e => setNewAdmin({...newAdmin, displayName: e.target.value})} />
              </div>
              <div style={{ flex: '1 1 180px' }}>
                <label style={{ fontSize: 13, marginBottom: 4, display: "block", color: "var(--text-secondary)" }}>Password</label>
                <input type="password" className="form-input" required placeholder="••••••••" value={newAdmin.password} onChange={e => setNewAdmin({...newAdmin, password: e.target.value})} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={creatingAdmin} style={{ padding: "11px 20px" }}>
                 {creatingAdmin ? "Creating..." : "Create Admin"}
              </button>
            </form>
          </div>
        </div>

        {/* Room Restrictions */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 32 }}>
          <h3 style={{ fontWeight: 600, marginBottom: 16 }}>Room Restrictions & Seat Quotas</h3>
          <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 20 }}>Manage maximum seats an individual player may occupy per room size to ensure equitable chance distribution.</p>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Room Size</th>
                  <th>Max Seats Per User</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.configs.map(c => (
                  <tr key={c.group_size}>
                    <td style={{ fontWeight: 600 }}>{c.group_size} Players</td>
                    <td style={{ fontWeight: 500 }}>{c.max_seats_per_user} seats</td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => openQuotaModal(c.group_size, c.max_seats_per_user)}
                        style={{ display: "flex", alignItems: "center", gap: 6 }}
                      >
                        <Edit2 size={14} /> Edit Quota
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Quota Modal */}
      {quotaModal.open && (
        <div className="modal-overlay" style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16
        }}>
          <div className="card" style={{ maxWidth: 440, width: "100%", border: "1px solid var(--border)", boxShadow: "0 20px 40px rgba(0,0,0,0.6)" }}>
            <div className="card-header flex-between">
              <div className="card-title">Edit Seat Quota ({quotaModal.groupSize} Players)</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setQuotaModal({ open: false, groupSize: null, maxSeats: 2, submitting: false, error: "" })}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleQuotaSubmit}>
              <div className="card-body">
                {quotaModal.error && (
                  <div style={{ marginBottom: 16, padding: 12, borderRadius: 6, background: "var(--danger-light)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13 }}>
                    {quotaModal.error}
                  </div>
                )}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 13, marginBottom: 6, color: "var(--text-secondary)" }}>
                    Maximum Seats A Single Player Can Buy
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={parseInt(quotaModal.groupSize, 10) - 1}
                    className="form-input"
                    value={quotaModal.maxSeats}
                    onChange={e => setQuotaModal({ ...quotaModal, maxSeats: e.target.value })}
                    required
                  />
                  <div className="text-muted text-xs mt-2">
                    Must be at least 1 and less than total room size ({quotaModal.groupSize}).
                  </div>
                </div>
              </div>
              <div className="card-footer flex justify-end gap-3" style={{ padding: "16px 24px", borderTop: "1px solid var(--border)" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setQuotaModal({ open: false, groupSize: null, maxSeats: 2, submitting: false, error: "" })}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={quotaModal.submitting}
                >
                  {quotaModal.submitting ? "Saving..." : "Save Quota"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
