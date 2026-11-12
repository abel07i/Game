import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { 
  ArrowUpRight, 
  Trash2, 
  Search, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  History
} from "lucide-react";

export default function Transactions() {
  const [data, setData] = useState({ transactions: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ type: "", search: "", page: 1 });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [toast, setToast] = useState(null);

  // Security Audit Log state
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState({
    open: false,
    isBulk: false,
    item: null, // single tx or null for bulk
    confirmPassword: "",
    showPassword: false,
    submitting: false,
    error: null
  });

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchTx = () => {
    setLoading(true);
    api.getTransactions(filters)
      .then(res => {
        setData(res || { transactions: [], total: 0 });
        setSelectedIds(new Set()); // Reset selections on page change or refresh
      })
      .catch(err => {
        console.error("Failed to fetch transactions:", err);
        showToast("error", err.message || "Failed to load transactions");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTx();
  }, [filters.page, filters.type, filters.search]);

  const getTxColor = (type) => {
    if (['DEPOSIT', 'WIN', 'PAYOUT_WIN', 'REFUND'].includes(type)) return 'var(--success)';
    if (['WITHDRAWAL', 'WAGER', 'TICKET_BUY'].includes(type)) return 'var(--danger)';
    return 'var(--text-primary)';
  };

  // ─── Selection Logic ────────────────────────────────────────────────────────
  const handleToggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === data.transactions.length && data.transactions.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.transactions.map(t => t.id)));
    }
  };

  const fetchAuditLogs = async () => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await api.getTransactionAuditLogs();
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

  // ─── Delete Modal Handlers ──────────────────────────────────────────────────
  const openSingleDelete = (tx) => {
    setDeleteModal({
      open: true,
      isBulk: false,
      item: tx,
      confirmPassword: "",
      showPassword: false,
      submitting: false,
      error: null
    });
  };

  const openBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setDeleteModal({
      open: true,
      isBulk: true,
      item: null,
      confirmPassword: "",
      showPassword: false,
      submitting: false,
      error: null
    });
  };

  const closeDeleteModal = () => {
    if (deleteModal.submitting) return;
    setDeleteModal({
      open: false,
      isBulk: false,
      item: null,
      confirmPassword: "",
      showPassword: false,
      submitting: false,
      error: null
    });
  };

  const confirmDelete = async () => {
    if (!deleteModal.confirmPassword.trim()) {
      setDeleteModal(prev => ({ ...prev, error: "Please enter your admin password to confirm." }));
      return;
    }
    setDeleteModal(prev => ({ ...prev, submitting: true, error: null }));
    try {
      if (deleteModal.isBulk) {
        const ids = Array.from(selectedIds);
        const res = await api.bulkDeleteTransactions(ids, deleteModal.confirmPassword);
        showToast("success", `Successfully deleted ${res.deletedCount || ids.length} transaction(s).`);
        setSelectedIds(new Set());
      } else if (deleteModal.item) {
        await api.deleteTransaction(deleteModal.item.id, deleteModal.confirmPassword);
        showToast("success", "Transaction deleted and recorded in audit log.");
      }
      setDeleteModal({
        open: false,
        isBulk: false,
        item: null,
        confirmPassword: "",
        showPassword: false,
        submitting: false,
        error: null
      });
      fetchTx();
      if (auditOpen) fetchAuditLogs();
    } catch (err) {
      setDeleteModal(prev => ({ ...prev, submitting: false, error: err.message || "Failed to delete transaction" }));
    }
  };

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
      <div className="flex-between mb-6" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="page-title">Transaction Ledger</h1>
          <p className="text-muted">Audit, search, and manage financial transactions and player ledger records.</p>
        </div>
        <div className="flex gap-2">
          <button
            className={`btn ${auditOpen ? "btn-primary" : "btn-ghost"}`}
            onClick={toggleAuditLogs}
            title="Toggle Security Audit Log"
          >
            <History size={16} />
            <span>{auditOpen ? "Hide Audit Log" : "Security Audit Log"}</span>
          </button>
          <button className="btn btn-ghost" onClick={fetchTx} disabled={loading} title="Refresh transactions">
            <RefreshCw size={16} className={loading ? "spinner" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Protected Ledger Security Notice */}
      <div
        className="flex-between mb-4 p-3 rounded-lg"
        style={{
          background: "rgba(16, 185, 129, 0.08)",
          border: "1px solid rgba(16, 185, 129, 0.3)",
          flexWrap: "wrap",
          gap: 10
        }}
      >
        <div className="flex-center gap-2" style={{ fontSize: 13 }}>
          <ShieldCheck size={18} style={{ color: "#10b981", flexShrink: 0 }} />
          <span>
            <strong>Protected Ledger:</strong> Ledger deletions require admin password re-authentication, are rate-limited, and write a permanent snapshot to the immutable security audit trail.
          </span>
        </div>
      </div>

      {/* Forensic Security Audit Log Panel */}
      {auditOpen && (
        <div className="card mb-6">
          <div className="card-body">
            <div className="flex-between mb-3" style={{ flexWrap: "wrap", gap: 10 }}>
              <div className="flex-center gap-2">
                <Lock size={16} style={{ color: "var(--warning)" }} />
                <h3 style={{ margin: 0, fontSize: 16 }}>Immutable Security Audit Log</h3>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={fetchAuditLogs} disabled={auditLoading}>
                <RefreshCw size={14} className={auditLoading ? "spinner" : ""} />
                <span>Reload Log</span>
              </button>
            </div>

            {auditError && (
              <div className="p-3 mb-3 rounded" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13 }}>
                {auditError}
              </div>
            )}

            {auditLoading ? (
              <p className="text-muted text-sm">Loading audit trail...</p>
            ) : auditLogs.length === 0 ? (
              <p className="text-muted text-sm">No transaction deletion events have been recorded yet.</p>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Admin</th>
                      <th>Action</th>
                      <th>Records</th>
                      <th>Deleted IDs / Amounts</th>
                      <th>IP Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map(log => {
                      const snap = Array.isArray(log.snapshot) ? log.snapshot : [];
                      const totalAmt = snap.reduce((acc, s) => acc + parseFloat(s.amount || 0), 0);
                      return (
                        <tr key={log.id}>
                          <td className="text-xs text-muted">{new Date(log.created_at).toLocaleString()}</td>
                          <td className="text-sm font-medium">{log.admin_username || log.admin_id?.slice(0, 8) || "Admin"}</td>
                          <td><span className="badge badge-warning">{log.action}</span></td>
                          <td className="text-sm">{(log.target_ids || []).length}</td>
                          <td className="text-xs font-mono">
                            {(log.target_ids || []).slice(0, 3).map(id => id.slice(0, 8)).join(", ")}
                            {(log.target_ids || []).length > 3 ? ` +${log.target_ids.length - 3} more` : ""}
                            {snap.length > 0 ? ` (${totalAmt.toLocaleString()} ETB)` : ""}
                          </td>
                          <td className="text-xs font-mono text-muted">{log.ip_address || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body">
          {/* Controls / Filter row */}
          <div className="filter-row mb-4">
            <div className="flex gap-2" style={{ flexWrap: "wrap", flex: 1 }}>
              <select
                className="form-select"
                style={{ width: "auto" }}
                value={filters.type}
                onChange={e => setFilters({ ...filters, type: e.target.value, page: 1 })}
              >
                <option value="">All Types</option>
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
                <option value="ticket_buy">Ticket Buy / Wager</option>
                <option value="payout_win">Payout Win</option>
                <option value="refund">Refund</option>
              </select>

              <div className="search-input-wrapper" style={{ flex: 1, maxWidth: 360 }}>
                <Search size={18} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search player, phone, or note..."
                  value={filters.search}
                  onChange={e => setFilters({ ...filters, search: e.target.value, page: 1 })}
                />
              </div>
            </div>
          </div>

          {/* Bulk Actions Bar when 1+ selected */}
          {selectedIds.size > 0 && (
            <div 
              className="flex-between mb-4 p-3 rounded-lg"
              style={{ 
                background: "rgba(234, 161, 27, 0.12)", 
                border: "1px solid rgba(234, 161, 27, 0.35)",
                flexWrap: "wrap",
                gap: "10px"
              }}
            >
              <div className="flex-center gap-2">
                <span className="badge badge-warning" style={{ fontSize: 13, padding: "4px 10px" }}>
                  {selectedIds.size} Selected
                </span>
                <span className="text-muted text-xs">
                  of {data.transactions.length} displayed records
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  className="btn btn-sm flex-center gap-1"
                  style={{ background: "rgba(239, 68, 68, 0.2)", color: "var(--danger)", border: "1px solid var(--danger)" }}
                  onClick={openBulkDelete}
                  title="Bulk delete selected transaction records"
                >
                  <Trash2 size={14} />
                  <span>Bulk Delete ({selectedIds.size})</span>
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="loading-overlay"><div className="spinner"></div></div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={data.transactions.length > 0 && selectedIds.size === data.transactions.length}
                        onChange={handleToggleSelectAll}
                        title="Select/Deselect all visible transactions"
                        style={{ cursor: "pointer", width: 16, height: 16 }}
                      />
                    </th>
                    <th>Time</th>
                    <th>ID</th>
                    <th>Player</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Post Balance</th>
                    <th>Reference / Details</th>
                    <th style={{ width: 60, textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.length === 0 ? (
                    <tr><td colSpan="9" className="text-center text-muted py-8">No transactions found.</td></tr>
                  ) : data.transactions.map(tx => {
                    const isSelected = selectedIds.has(tx.id);
                    const txType = (tx.tx_type || "").toUpperCase();

                    return (
                      <tr key={tx.id} style={{ background: isSelected ? "rgba(234, 161, 27, 0.05)" : undefined }}>
                        {/* Checkbox */}
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(tx.id)}
                            style={{ cursor: "pointer", width: 16, height: 16 }}
                          />
                        </td>

                        {/* Date & Time */}
                        <td className="text-sm text-muted">
                          {new Date(tx.created_at).toLocaleString()}
                        </td>

                        {/* ID */}
                        <td className="text-sm font-mono text-muted" title={tx.id}>
                          {tx.id.substring(0, 8)}...
                        </td>

                        {/* Player */}
                        <td>
                          {tx.user_id ? (
                            <Link to={`/players/${tx.user_id}`} className="hover:underline font-medium text-primary">
                              {tx.player_name || "Unknown"}
                            </Link>
                          ) : (
                            <span className="text-muted">{tx.player_name || "System"}</span>
                          )}
                        </td>

                        {/* Type */}
                        <td>
                          <span 
                            className="badge badge-muted" 
                            style={{ 
                              border: `1px solid ${getTxColor(txType)}`, 
                              color: getTxColor(txType) 
                            }}
                          >
                            {txType}
                          </span>
                        </td>

                        {/* Amount */}
                        <td className="font-bold" style={{ color: getTxColor(txType) }}>
                          {tx.direction > 0 ? '+' : '-'}{parseFloat(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB
                        </td>

                        {/* Post Balance */}
                        <td className="font-medium font-mono text-sm">
                          {parseFloat(tx.running_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB
                        </td>

                        {/* Details */}
                        <td>
                          <div className="flex items-center gap-2">
                            {tx.reference_note && <span className="text-muted text-sm">{tx.reference_note}</span>}
                            {tx.room_id && (
                              <Link to={`/games/${tx.room_id}`} className="text-accent hover:underline text-sm flex items-center gap-1">
                                View Game <ArrowUpRight size={14} />
                              </Link>
                            )}
                          </div>
                        </td>

                        {/* Single Delete Button */}
                        <td style={{ textAlign: "center" }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: "var(--danger)", padding: "4px 8px" }}
                            onClick={() => openSingleDelete(tx)}
                            title="Delete transaction record"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="pagination">
            <div className="pagination-info">
              Showing {Math.min((filters.page - 1) * 20 + 1, data.total)} to {Math.min(filters.page * 20, data.total)} of {data.total} transactions
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

      {/* Delete Confirmation Modal (Single or Bulk) */}
      {deleteModal.open && (
        <div className="modal-overlay" onClick={closeDeleteModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex-center gap-2">
                <Trash2 className="text-danger" size={20} />
                <h3 className="modal-title">
                  {deleteModal.isBulk ? `Bulk Delete (${selectedIds.size} Transactions)` : "Delete Transaction Record"}
                </h3>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={closeDeleteModal} disabled={deleteModal.submitting}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              {deleteModal.error && (
                <div className="p-3 mb-4 rounded" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13 }}>
                  {deleteModal.error}
                </div>
              )}

              {deleteModal.isBulk ? (
                <p className="text-secondary text-sm">
                  Are you sure you want to permanently delete the <strong>{selectedIds.size}</strong> selected transaction records?
                  <br />
                  <span className="text-warning text-xs mt-2 block">
                    ⚠️ This action is irreversible and will remove these entries from the transaction ledger.
                  </span>
                </p>
              ) : (
                <p className="text-secondary text-sm">
                  Are you sure you want to delete transaction <strong className="text-white font-mono">{deleteModal.item?.id?.substring(0, 8)}...</strong> (
                  <span className="font-bold text-warning">{parseFloat(deleteModal.item?.amount || 0).toLocaleString()} ETB</span>)?
                </p>
              )}

              <div className="mt-4">
                <label className="form-label text-xs font-medium" htmlFor="tx-delete-confirm-pw">
                  Confirm Your Admin Password
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="tx-delete-confirm-pw"
                    type={deleteModal.showPassword ? "text" : "password"}
                    className="form-input"
                    style={{ paddingRight: 38 }}
                    placeholder="Enter your admin password"
                    autoComplete="current-password"
                    value={deleteModal.confirmPassword}
                    disabled={deleteModal.submitting}
                    onChange={e => setDeleteModal(prev => ({ ...prev, confirmPassword: e.target.value, error: null }))}
                    onKeyDown={e => {
                      if (e.key === "Enter" && deleteModal.confirmPassword.trim() && !deleteModal.submitting) {
                        confirmDelete();
                      }
                    }}
                  />
                  <button
                    type="button"
                    aria-label={deleteModal.showPassword ? "Hide password" : "Show password"}
                    onClick={() => setDeleteModal(prev => ({ ...prev, showPassword: !prev.showPassword }))}
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: 4
                    }}
                  >
                    {deleteModal.showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <span className="text-muted text-xs mt-1 block">
                  A full snapshot of the deleted record(s) will be preserved in the Security Audit Log.
                </span>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={closeDeleteModal} disabled={deleteModal.submitting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmDelete}
                disabled={deleteModal.submitting || !deleteModal.confirmPassword.trim()}
              >
                {deleteModal.submitting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
