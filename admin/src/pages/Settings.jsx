import { useState, useEffect } from "react";
import api from "../api";
import { useAuth } from "../contexts/AuthContext";
import AdminPasswordField from "../components/AdminPasswordField";
import { AlertCircle, CheckCircle, UserPlus, Info, Users, Trash2, X, Edit2, Shield, ShieldCheck, Lock, History, Eye, EyeOff } from "lucide-react";

export default function Settings() {
  const { refreshAdmin } = useAuth();
  const [data, setData] = useState({ configs: [], settings: null, admins: [] });
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  
  // Admin creation state
  const [newAdmin, setNewAdmin] = useState({ phoneNumber: "", displayName: "", password: "" });
  const [showNewAdminPw, setShowNewAdminPw] = useState(false);

  // Admin edit modal state
  const [editAdminModal, setEditAdminModal] = useState({
    open: false,
    id: null,
    phoneNumber: "",
    displayName: "",
    password: "",
    isActive: true,
    confirmPassword: "",
    showPw: false,
    submitting: false,
    error: ""
  });

  // Shared step-up confirmation modal (Create/Delete Admin, Fee Update, Telebirr Settings)
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    description: "",
    confirmLabel: "Confirm Action",
    danger: false,
    confirmPassword: "",
    submitting: false,
    error: "",
    onConfirm: null
  });

  // Security Audit Log state
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");

  // Platform fee state
  const [platformFeeInput, setPlatformFeeInput] = useState("");

  // Telebirr state
  const [paymentConfig, setPaymentConfig] = useState({ phone: "", name: "", apiKey: "" });

  // Quota modal state
  const [quotaModal, setQuotaModal] = useState({ open: false, groupSize: null, maxSeats: 2, confirmPassword: "", submitting: false, error: "" });

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
            apiKey: ''
          });
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchSettings(); }, []);

  const fetchAuditLogs = async () => {
    setAuditLoading(true);
    setAuditError("");
    try {
      const res = await api.getSettingsAuditLogs();
      setAuditLogs(res.logs || []);
    } catch (err) {
      setAuditError(err.message || "Failed to load security audit logs");
    } finally {
      setAuditLoading(false);
    }
  };

  const toggleAuditLogs = () => {
    const next = !auditOpen;
    setAuditOpen(next);
    if (next) fetchAuditLogs();
  };

  const openStepUpModal = ({ title, description, confirmLabel = "Confirm Action", danger = false, onConfirm }) => {
    setConfirmModal({
      open: true,
      title,
      description,
      confirmLabel,
      danger,
      confirmPassword: "",
      submitting: false,
      error: "",
      onConfirm
    });
  };

  const handleStepUpSubmit = async (e) => {
    e.preventDefault();
    if (!confirmModal.confirmPassword.trim()) {
      setConfirmModal(prev => ({ ...prev, error: "Admin password confirmation is required." }));
      return;
    }
    setConfirmModal(prev => ({ ...prev, submitting: true, error: "" }));
    try {
      await confirmModal.onConfirm(confirmModal.confirmPassword);
      setConfirmModal({ open: false, title: "", description: "", confirmLabel: "Confirm Action", danger: false, confirmPassword: "", submitting: false, error: "", onConfirm: null });
      if (auditOpen) fetchAuditLogs();
    } catch (err) {
      setConfirmModal(prev => ({ ...prev, submitting: false, error: err.message || "Verification failed" }));
    }
  };

  const openQuotaModal = (groupSize, currentMaxSeats) => {
    setQuotaModal({
      open: true,
      groupSize,
      maxSeats: currentMaxSeats,
      confirmPassword: "",
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
    if (!quotaModal.confirmPassword.trim()) {
      setQuotaModal(prev => ({ ...prev, error: "Admin password confirmation is required." }));
      return;
    }

    setQuotaModal(prev => ({ ...prev, submitting: true, error: "" }));
    try {
      await api.updateQuota(quotaModal.groupSize, newMax, quotaModal.confirmPassword);
      setMessage(`Quota for ${quotaModal.groupSize}-player rooms updated to max ${newMax} seats!`);
      setQuotaModal({ open: false, groupSize: null, maxSeats: 2, confirmPassword: "", submitting: false, error: "" });
      fetchSettings();
      if (auditOpen) fetchAuditLogs();
      setTimeout(() => setMessage(""), 4000);
    } catch (err) {
      setQuotaModal(prev => ({ ...prev, submitting: false, error: err.message || "Failed to update quota" }));
    }
  };

  const handleCreateAdmin = (e) => {
    e.preventDefault();
    setError("");
    openStepUpModal({
      title: "Confirm New Administrator",
      description: `Create new admin account for "${newAdmin.displayName}" (${newAdmin.phoneNumber})?`,
      confirmLabel: "Create Admin",
      onConfirm: async (confirmPassword) => {
        await api.createAdmin({ ...newAdmin, confirmPassword });
        setMessage(`Admin account for ${newAdmin.displayName} created successfully!`);
        setNewAdmin({ phoneNumber: "", displayName: "", password: "" });
        setShowNewAdminPw(false);
        fetchSettings();
        setTimeout(() => setMessage(""), 5000);
      }
    });
  };

  const openEditAdminModal = (adm) => {
    setEditAdminModal({
      open: true,
      id: adm.id,
      phoneNumber: adm.phone_number || "",
      displayName: adm.display_name || "",
      password: "",
      isActive: adm.is_active !== false,
      confirmPassword: "",
      showPw: false,
      submitting: false,
      error: ""
    });
  };

  const handleUpdateAdmin = async (e) => {
    e.preventDefault();
    const phoneNumber = editAdminModal.phoneNumber.trim();
    const displayName = editAdminModal.displayName.trim();
    const password = editAdminModal.password;

    if (!phoneNumber || !displayName) {
      setEditAdminModal(prev => ({ ...prev, error: "Username / phone number and display name are required." }));
      return;
    }
    if (password.length > 0 && password.trim().length < 6) {
      setEditAdminModal(prev => ({ ...prev, error: "New password must be at least 6 characters." }));
      return;
    }
    if (!editAdminModal.confirmPassword.trim()) {
      setEditAdminModal(prev => ({ ...prev, error: "Your current admin password confirmation is required." }));
      return;
    }

    setEditAdminModal(prev => ({ ...prev, submitting: true, error: "" }));
    try {
      const payload = {
        phoneNumber,
        displayName,
        isActive: editAdminModal.isActive,
        confirmPassword: editAdminModal.confirmPassword
      };
      if (password.length > 0) payload.password = password;

      const res = await api.updateAdmin(editAdminModal.id, payload);
      if (res?.token) {
        localStorage.setItem("admin_token", res.token);
      }
      if (currentAdmin && currentAdmin.id === editAdminModal.id && refreshAdmin) {
        await refreshAdmin().catch(() => {});
      }
      setEditAdminModal({
        open: false,
        id: null,
        phoneNumber: "",
        displayName: "",
        password: "",
        isActive: true,
        confirmPassword: "",
        showPw: false,
        submitting: false,
        error: ""
      });
      setMessage(`Administrator ${displayName} updated successfully!`);
      fetchSettings();
      if (auditOpen) fetchAuditLogs();
      setTimeout(() => setMessage(""), 5000);
    } catch (err) {
      setEditAdminModal(prev => ({
        ...prev,
        submitting: false,
        error: err.message || "Failed to update administrator"
      }));
    }
  };

  const handleDeleteAdmin = (admin) => {
    if (currentAdmin && currentAdmin.id === admin.id) {
      alert("You cannot delete your own admin account.");
      return;
    }
    if (data.admins.length <= 1) {
      alert("Cannot delete the last remaining administrator account.");
      return;
    }
    openStepUpModal({
      title: "Delete Administrator Account",
      description: `Permanently remove administrator "${admin.display_name}" (${admin.phone_number})?`,
      confirmLabel: "Delete Administrator",
      danger: true,
      onConfirm: async (confirmPassword) => {
        await api.deleteAdmin(admin.id, confirmPassword);
        setMessage(`Admin ${admin.display_name} removed successfully.`);
        fetchSettings();
        setTimeout(() => setMessage(""), 4000);
      }
    });
  };

  const handleUpdatePayment = (e) => {
    e.preventDefault();
    setError("");
    openStepUpModal({
      title: "Update Telebirr Integration",
      description: "Save Telebirr receiver and Verify.ET API key changes?",
      confirmLabel: "Save Configuration",
      onConfirm: async (confirmPassword) => {
        const payload = {
          telebirrPhone: paymentConfig.phone,
          telebirrName: paymentConfig.name,
          confirmPassword
        };
        if (paymentConfig.apiKey.trim()) {
          payload.verifyEtApiKey = paymentConfig.apiKey.trim();
        }
        await api.updateSettings(payload);
        setMessage("Payment configuration updated successfully!");
        fetchSettings();
        setTimeout(() => setMessage(""), 5000);
      }
    });
  };

  const handleUpdateFee = (e) => {
    e.preventDefault();
    const feeVal = parseFloat(platformFeeInput) / 100;
    if (isNaN(feeVal) || feeVal < 0 || feeVal > 1) {
      alert("Invalid fee percentage (must be between 0 and 100)");
      return;
    }
    setError("");
    openStepUpModal({
      title: "Update Platform Commission Fee",
      description: `Change platform commission rate to ${(feeVal * 100).toFixed(1)}%?`,
      confirmLabel: "Update Fee",
      onConfirm: async (confirmPassword) => {
        await api.updateSettings({ platformFee: feeVal, confirmPassword });
        setMessage("Prize commission configuration updated successfully!");
        fetchSettings();
        setTimeout(() => setMessage(""), 5000);
      }
    });
  };

  if (loading) return <div className="loading-overlay"><div className="spinner"></div></div>;

  return (
    <div className="card" style={{ maxWidth: 920 }}>
      <div className="card-header flex-between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={18} color="var(--success)" /> Platform Settings &amp; Security
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={toggleAuditLogs}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <History size={14} /> {auditOpen ? "Hide Security Audit Log" : "Security Audit Log"}
        </button>
      </div>
      <div className="card-body">
        <div
          style={{
            marginBottom: 20,
            padding: "12px 16px",
            borderRadius: "var(--radius-sm)",
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.28)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
            color: "var(--text-secondary)"
          }}
        >
          <Shield size={16} color="var(--success)" style={{ flexShrink: 0 }} />
          <span>
            <strong style={{ color: "var(--text-primary)" }}>Protected Settings:</strong> All fee, integration, quota, and administrator account changes require password re-authentication and are written to the immutable audit trail.
          </span>
        </div>

        {auditOpen && (
          <div style={{ marginBottom: 24, padding: 16, borderRadius: "var(--radius-sm)", background: "var(--bg-glass)", border: "1px solid var(--border)" }}>
            <div className="flex-between mb-3">
              <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                <History size={15} color="var(--accent)" /> Recent Security &amp; Configuration Audit Logs
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={fetchAuditLogs} disabled={auditLoading}>
                {auditLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            {auditError && (
              <div style={{ marginBottom: 12, padding: 10, borderRadius: 6, background: "var(--danger-light)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 12 }}>
                {auditError}
              </div>
            )}
            {auditLoading ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading audit trail...</div>
            ) : auditLogs.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No recorded settings or security events yet.</div>
            ) : (
              <div className="table-wrapper" style={{ maxHeight: 260, overflowY: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Admin</th>
                      <th>Action</th>
                      <th>Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{new Date(log.created_at).toLocaleString()}</td>
                        <td style={{ fontSize: 12 }}>{log.admin_name || log.admin_phone || "Admin"}</td>
                        <td style={{ fontSize: 12, fontWeight: 600 }}>{log.action}</td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{log.target_type}{log.target_id ? `:${log.target_id}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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
        <h3 style={{ fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><Info size={18} color="var(--accent)"/> Prize &amp; Platform Commission</h3>
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
          <button type="submit" className="btn btn-primary" style={{ padding: "11px 20px" }}>
             Update Fee
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
              <label style={{ fontSize: 13, marginBottom: 4, display: "block", color: "var(--text-secondary)" }}>
                Verify.ET API Key {data.settings?.hasVerifyEtApiKey && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(masked for security — leave blank to keep current key)</span>}
              </label>
              <input
                type="password"
                className="form-input"
                autoComplete="off"
                required={!data.settings?.hasVerifyEtApiKey}
                placeholder={data.settings?.hasVerifyEtApiKey ? `Configured (${data.settings.verifyEtApiKeyMasked}) — enter new key to replace` : "VERIFY_BANK_ET_..."}
                value={paymentConfig.apiKey}
                onChange={e => setPaymentConfig({...paymentConfig, apiKey: e.target.value})}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ padding: "11px 20px" }}>
               Save Configuration
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
                  <th>Display Name</th>
                  <th>Username / Phone</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.admins.map(adm => {
                  const isCurrent = currentAdmin && currentAdmin.id === adm.id;
                  const isActive = adm.is_active !== false;
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span className="badge badge-primary">{adm.role}</span>
                          <span className={`badge ${isActive ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: 10 }}>
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </td>
                      <td className="text-sm text-muted">
                        {adm.created_at ? new Date(adm.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => openEditAdminModal(adm)}
                            style={{ padding: "4px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}
                          >
                            <Edit2 size={13} /> Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={isCurrent || data.admins.length <= 1}
                            title={isCurrent ? "Cannot delete yourself" : (data.admins.length <= 1 ? "Cannot delete last admin" : "Delete administrator")}
                            onClick={() => handleDeleteAdmin(adm)}
                            style={{ padding: "4px 8px", opacity: (isCurrent || data.admins.length <= 1) ? 0.4 : 1 }}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
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
                <label style={{ fontSize: 13, marginBottom: 4, display: "block", color: "var(--text-secondary)" }}>Username / Phone Number</label>
                <input type="text" maxLength={20} className="form-input" required placeholder="+251... or username" value={newAdmin.phoneNumber} onChange={e => setNewAdmin({...newAdmin, phoneNumber: e.target.value})} />
              </div>
              <div style={{ flex: '1 1 180px' }}>
                <label style={{ fontSize: 13, marginBottom: 4, display: "block", color: "var(--text-secondary)" }}>Display Name</label>
                <input type="text" maxLength={50} className="form-input" required placeholder="Admin Name" value={newAdmin.displayName} onChange={e => setNewAdmin({...newAdmin, displayName: e.target.value})} />
              </div>
              <div style={{ flex: '1 1 180px' }}>
                <label style={{ fontSize: 13, marginBottom: 4, display: "block", color: "var(--text-secondary)" }}>Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showNewAdminPw ? "text" : "password"}
                    minLength={6}
                    className="form-input"
                    style={{ paddingRight: 36 }}
                    required
                    placeholder="Min 6 characters"
                    value={newAdmin.password}
                    onChange={e => setNewAdmin({...newAdmin, password: e.target.value})}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewAdminPw(!showNewAdminPw)}
                    title={showNewAdminPw ? "Hide password" : "Show password"}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}
                  >
                    {showNewAdminPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ padding: "11px 20px" }}>
                 Create Admin
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
              <button className="btn btn-ghost btn-sm" onClick={() => setQuotaModal({ open: false, groupSize: null, maxSeats: 2, confirmPassword: "", submitting: false, error: "" })}>
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
                <AdminPasswordField
                  id="quota-confirm-pw"
                  value={quotaModal.confirmPassword}
                  onChange={val => setQuotaModal({ ...quotaModal, confirmPassword: val })}
                  submitting={quotaModal.submitting}
                />
              </div>
              <div className="card-footer flex justify-end gap-3" style={{ padding: "16px 24px", borderTop: "1px solid var(--border)" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setQuotaModal({ open: false, groupSize: null, maxSeats: 2, confirmPassword: "", submitting: false, error: "" })}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={quotaModal.submitting || !quotaModal.confirmPassword.trim()}
                >
                  {quotaModal.submitting ? "Saving..." : "Save Quota"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Administrator Modal */}
      {editAdminModal.open && (
        <div className="modal-overlay" style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16
        }}>
          <div className="card" style={{ maxWidth: 460, width: "100%", border: "1px solid var(--border)", boxShadow: "0 20px 40px rgba(0,0,0,0.6)" }}>
            <div className="card-header flex-between">
              <div className="card-title">Edit Administrator Account</div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEditAdminModal(prev => ({ ...prev, open: false }))}
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleUpdateAdmin}>
              <div className="card-body">
                {editAdminModal.error && (
                  <div style={{ marginBottom: 16, padding: 12, borderRadius: 6, background: "var(--danger-light)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13 }}>
                    {editAdminModal.error}
                  </div>
                )}

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 13, marginBottom: 6, color: "var(--text-secondary)" }}>
                    Username / Phone Number
                  </label>
                  <input
                    type="text"
                    maxLength={20}
                    className="form-input"
                    required
                    placeholder="+251... or admin username"
                    value={editAdminModal.phoneNumber}
                    onChange={e => setEditAdminModal(prev => ({ ...prev, phoneNumber: e.target.value }))}
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 13, marginBottom: 6, color: "var(--text-secondary)" }}>
                    Display Name
                  </label>
                  <input
                    type="text"
                    maxLength={50}
                    className="form-input"
                    required
                    placeholder="Administrator name"
                    value={editAdminModal.displayName}
                    onChange={e => setEditAdminModal(prev => ({ ...prev, displayName: e.target.value }))}
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 13, marginBottom: 6, color: "var(--text-secondary)" }}>
                    New Password <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(leave blank to keep current)</span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={editAdminModal.showPw ? "text" : "password"}
                      minLength={6}
                      className="form-input"
                      style={{ paddingRight: 36 }}
                      placeholder="Enter new password (min 6 chars)"
                      value={editAdminModal.password}
                      onChange={e => setEditAdminModal(prev => ({ ...prev, password: e.target.value }))}
                    />
                    <button
                      type="button"
                      onClick={() => setEditAdminModal(prev => ({ ...prev, showPw: !prev.showPw }))}
                      title={editAdminModal.showPw ? "Hide password" : "Show password"}
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}
                    >
                      {editAdminModal.showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, cursor: (currentAdmin && currentAdmin.id === editAdminModal.id) ? "not-allowed" : "pointer" }}>
                  <input
                    type="checkbox"
                    checked={editAdminModal.isActive}
                    disabled={Boolean(currentAdmin && currentAdmin.id === editAdminModal.id)}
                    onChange={e => setEditAdminModal(prev => ({ ...prev, isActive: e.target.checked }))}
                  />
                  <span>Account Active {currentAdmin && currentAdmin.id === editAdminModal.id ? "(cannot deactivate current session)" : ""}</span>
                </label>

                <AdminPasswordField
                  id="edit-admin-confirm-pw"
                  value={editAdminModal.confirmPassword}
                  onChange={val => setEditAdminModal(prev => ({ ...prev, confirmPassword: val }))}
                  submitting={editAdminModal.submitting}
                />
              </div>
              <div className="card-footer flex justify-end gap-3" style={{ padding: "16px 24px", borderTop: "1px solid var(--border)" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditAdminModal(prev => ({ ...prev, open: false }))}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={editAdminModal.submitting || !editAdminModal.confirmPassword.trim()}
                >
                  {editAdminModal.submitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shared Step-Up Confirmation Modal */}
      {confirmModal.open && (
        <div className="modal-overlay" style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16
        }}>
          <div className="card" style={{ maxWidth: 440, width: "100%", border: "1px solid var(--border)", boxShadow: "0 20px 40px rgba(0,0,0,0.6)" }}>
            <div className="card-header flex-between">
              <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Lock size={16} color={confirmModal.danger ? "var(--danger)" : "var(--accent)"} />
                {confirmModal.title}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmModal(prev => ({ ...prev, open: false, confirmPassword: "", error: "" }))}
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleStepUpSubmit}>
              <div className="card-body">
                {confirmModal.error && (
                  <div style={{ marginBottom: 16, padding: 12, borderRadius: 6, background: "var(--danger-light)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13 }}>
                    {confirmModal.error}
                  </div>
                )}
                {confirmModal.description && (
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
                    {confirmModal.description}
                  </p>
                )}
                <AdminPasswordField
                  id="settings-action-confirm-pw"
                  value={confirmModal.confirmPassword}
                  onChange={val => setConfirmModal(prev => ({ ...prev, confirmPassword: val }))}
                  submitting={confirmModal.submitting}
                />
              </div>
              <div className="card-footer flex justify-end gap-3" style={{ padding: "16px 24px", borderTop: "1px solid var(--border)" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirmModal(prev => ({ ...prev, open: false, confirmPassword: "", error: "" }))}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn ${confirmModal.danger ? "btn-danger" : "btn-primary"} btn-sm`}
                  disabled={confirmModal.submitting || !confirmModal.confirmPassword.trim()}
                >
                  {confirmModal.submitting ? "Verifying..." : confirmModal.confirmLabel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
