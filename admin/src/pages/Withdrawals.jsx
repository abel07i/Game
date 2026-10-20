import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Search, 
  Copy, 
  Check, 
  RefreshCw, 
  AlertTriangle,
  Trash2,
  CheckSquare,
  Square
} from "lucide-react";

export default function Withdrawals() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending"); // default to pending for admin focus
  const [search, setSearch] = useState("");
  
  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Single Process Modal state (Approve / Reject)
  const [modal, setModal] = useState({
    open: false,
    request: null,
    action: "approve", // 'approve' | 'reject'
    notes: "",
    submitting: false,
    error: null
  });

  // Single Delete Modal state
  const [deleteModal, setDeleteModal] = useState({
    open: false,
    request: null,
    refundPending: true,
    submitting: false,
    error: null
  });

  // Bulk Action Modal state (Bulk Approve | Bulk Reject | Bulk Delete)
  const [bulkModal, setBulkModal] = useState({
    open: false,
    action: "delete", // 'delete' | 'approve' | 'reject'
    refundPending: true,
    notes: "",
    submitting: false,
    error: null
  });

  // Copy feedback & toast
  const [copiedId, setCopiedId] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetchWithdrawals();
  }, []);

  const fetchWithdrawals = () => {
    setLoading(true);
    api.getWithdrawals()
      .then(res => {
        setWithdrawals(Array.isArray(res) ? res : []);
        setSelectedIds(new Set()); // Reset selection on refresh
      })
      .catch(err => {
        console.error("Failed to load withdrawals:", err);
        showToast("error", err.message || "Failed to load withdrawals");
      })
      .finally(() => setLoading(false));
  };

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
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
    if (selectedIds.size === filteredList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredList.map(w => w.id)));
    }
  };

  // ─── Single Process Modal (Approve / Reject) ────────────────────────────────
  const openProcessModal = (request, action) => {
    setModal({
      open: true,
      request,
      action,
      notes: action === "approve" ? "Paid via Telebirr" : "Incorrect Telebirr account details",
      submitting: false,
      error: null
    });
  };

  const closeModal = () => {
    if (modal.submitting) return;
    setModal({ open: false, request: null, action: "approve", notes: "", submitting: false, error: null });
  };

  const submitProcess = async (e) => {
    e.preventDefault();
    if (!modal.request) return;

    setModal(prev => ({ ...prev, submitting: true, error: null }));
    try {
      await api.updateWithdrawal(modal.request.id, {
        status: modal.action === "approve" ? "approved" : "rejected",
        notes: modal.notes.trim()
      });

      showToast(
        "success",
        modal.action === "approve"
          ? `Withdrawal of ${parseFloat(modal.request.amount).toLocaleString()} ETB approved and marked as paid.`
          : `Withdrawal of ${parseFloat(modal.request.amount).toLocaleString()} ETB rejected and refunded to player's wallet.`
      );

      closeModal();
      fetchWithdrawals();
    } catch (err) {
      setModal(prev => ({ ...prev, submitting: false, error: err.message || "Failed to process withdrawal" }));
    }
  };

  // ─── Single Delete Modal ───────────────────────────────────────────────────
  const openDeleteModal = (request) => {
    setDeleteModal({
      open: true,
      request,
      refundPending: true,
      submitting: false,
      error: null
    });
  };

  const closeDeleteModal = () => {
    if (deleteModal.submitting) return;
    setDeleteModal({ open: false, request: null, refundPending: true, submitting: false, error: null });
  };

  const submitSingleDelete = async () => {
    if (!deleteModal.request) return;
    setDeleteModal(prev => ({ ...prev, submitting: true, error: null }));
    try {
      await api.deleteWithdrawal(deleteModal.request.id, deleteModal.refundPending);
      showToast("success", "Withdrawal request record deleted successfully.");
      closeDeleteModal();
      fetchWithdrawals();
    } catch (err) {
      setDeleteModal(prev => ({ ...prev, submitting: false, error: err.message || "Failed to delete request" }));
    }
  };

  // ─── Bulk Action Modal (Approve, Reject, Delete) ───────────────────────────
  const openBulkModal = (action) => {
    setBulkModal({
      open: true,
      action,
      refundPending: true,
      notes: action === "approve" ? "Bulk approved via Telebirr" : action === "reject" ? "Rejected via bulk admin review" : "",
      submitting: false,
      error: null
    });
  };

  const closeBulkModal = () => {
    if (bulkModal.submitting) return;
    setBulkModal({ open: false, action: "delete", refundPending: true, notes: "", submitting: false, error: null });
  };

  const submitBulkAction = async (e) => {
    if (e) e.preventDefault();
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setBulkModal(prev => ({ ...prev, submitting: true, error: null }));
    try {
      if (bulkModal.action === "delete") {
        const res = await api.bulkDeleteWithdrawals(ids, bulkModal.refundPending);
        showToast("success", `Successfully deleted ${res.deletedCount} request(s)${res.refundedCount ? ` (refunded ${res.refundedCount} pending)` : ''}.`);
      } else {
        const res = await api.bulkUpdateWithdrawals(ids, bulkModal.action, bulkModal.notes);
        showToast("success", `Successfully ${bulkModal.action === 'approve' ? 'approved' : 'rejected'} ${res.processedCount} request(s).`);
      }

      closeBulkModal();
      fetchWithdrawals();
    } catch (err) {
      setBulkModal(prev => ({ ...prev, submitting: false, error: err.message || "Bulk operation failed" }));
    }
  };

  // ─── Calculate Stats ───────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let pendingCount = 0, pendingAmount = 0;
    let approvedCount = 0, approvedAmount = 0;
    let rejectedCount = 0, rejectedAmount = 0;

    for (const w of withdrawals) {
      const amt = parseFloat(w.amount) || 0;
      if (w.status === "pending") {
        pendingCount++;
        pendingAmount += amt;
      } else if (w.status === "approved") {
        approvedCount++;
        approvedAmount += amt;
      } else if (w.status === "rejected") {
        rejectedCount++;
        rejectedAmount += amt;
      }
    }

    return {
      pending: { count: pendingCount, amount: pendingAmount },
      approved: { count: approvedCount, amount: approvedAmount },
      rejected: { count: rejectedCount, amount: rejectedAmount },
      totalCount: withdrawals.length
    };
  }, [withdrawals]);

  // ─── Filtered and Searched List ───────────────────────────────────────────
  const filteredList = useMemo(() => {
    return withdrawals.filter(w => {
      // Status filter
      if (filter !== "all" && w.status !== filter) return false;

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const userName = (w.user_name || "").toLowerCase();
        const phone = (w.phone_number || "").toLowerCase();
        const notes = (w.notes || "").toLowerCase();
        const amount = String(w.amount || "");
        const id = String(w.id || "").toLowerCase();
        if (!userName.includes(q) && !phone.includes(q) && !notes.includes(q) && !amount.includes(q) && !id.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [withdrawals, filter, search]);

  // Identify how many of the selected are pending
  const selectedPendingCount = useMemo(() => {
    return withdrawals.filter(w => selectedIds.has(w.id) && w.status === 'pending').length;
  }, [withdrawals, selectedIds]);

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
          <h1 className="page-title">Withdrawal Requests</h1>
          <p className="text-muted">Review, approve, and process player payout requests to Telebirr with bulk management tools.</p>
        </div>
        <button className="btn btn-ghost" onClick={fetchWithdrawals} disabled={loading} title="Refresh requests">
          <RefreshCw size={16} className={loading ? "spinner" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="stat-grid mb-6">
        <div className="stat-card" style={{ borderColor: stats.pending.count > 0 ? "rgba(245, 158, 11, 0.4)" : undefined }}>
          <div className="stat-card-icon" style={{ background: "rgba(245, 158, 11, 0.15)", color: "var(--warning)" }}>
            <Clock size={24} />
          </div>
          <div className="stat-card-label">Pending Requests</div>
          <div className="stat-card-value text-warning">{stats.pending.count}</div>
          <div className="stat-card-sub">{stats.pending.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB awaiting payout</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: "rgba(16, 185, 129, 0.15)", color: "var(--success)" }}>
            <CheckCircle size={24} />
          </div>
          <div className="stat-card-label">Approved & Paid</div>
          <div className="stat-card-value text-success">{stats.approved.count}</div>
          <div className="stat-card-sub">{stats.approved.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB successfully paid</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: "rgba(239, 68, 68, 0.15)", color: "var(--danger)" }}>
            <XCircle size={24} />
          </div>
          <div className="stat-card-label">Rejected & Refunded</div>
          <div className="stat-card-value text-danger">{stats.rejected.count}</div>
          <div className="stat-card-sub">{stats.rejected.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB returned to wallets</div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card">
        <div className="card-body">
          {/* Controls row */}
          <div className="filter-row mb-4">
            {/* Filter tabs */}
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              <button
                className={`btn btn-sm ${filter === "pending" ? "btn-warning" : "btn-ghost"}`}
                onClick={() => setFilter("pending")}
              >
                Pending ({stats.pending.count})
              </button>
              <button
                className={`btn btn-sm ${filter === "approved" ? "btn-success" : "btn-ghost"}`}
                onClick={() => setFilter("approved")}
              >
                Approved ({stats.approved.count})
              </button>
              <button
                className={`btn btn-sm ${filter === "rejected" ? "btn-danger" : "btn-ghost"}`}
                onClick={() => setFilter("rejected")}
              >
                Rejected ({stats.rejected.count})
              </button>
              <button
                className={`btn btn-sm ${filter === "all" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setFilter("all")}
              >
                All Requests ({stats.totalCount})
              </button>
            </div>

            {/* Search input */}
            <div className="search-input-wrapper">
              <Search size={18} />
              <input
                type="text"
                className="form-input"
                placeholder="Search by player, phone number, notes, ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Bulk Action Bar when 1+ selected */}
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
                  ({selectedPendingCount} pending)
                </span>
              </div>

              <div className="flex gap-2">
                {selectedPendingCount > 0 && (
                  <>
                    <button
                      className="btn btn-sm btn-success flex-center gap-1"
                      onClick={() => openBulkModal("approve")}
                      title="Bulk approve selected pending requests"
                    >
                      <CheckCircle size={14} />
                      <span>Bulk Approve ({selectedPendingCount})</span>
                    </button>
                    <button
                      className="btn btn-sm btn-danger flex-center gap-1"
                      onClick={() => openBulkModal("reject")}
                      title="Bulk reject and refund selected pending requests"
                    >
                      <XCircle size={14} />
                      <span>Bulk Reject ({selectedPendingCount})</span>
                    </button>
                  </>
                )}
                <button
                  className="btn btn-sm flex-center gap-1"
                  style={{ background: "rgba(239, 68, 68, 0.2)", color: "var(--danger)", border: "1px solid var(--danger)" }}
                  onClick={() => openBulkModal("delete")}
                  title="Bulk delete selected request records"
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
            <div className="loading-overlay">
              <div className="spinner"></div>
              <span>Loading withdrawal requests...</span>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="empty-state">
              <Clock className="empty-state-icon" />
              <h3>No withdrawal requests found</h3>
              <p className="text-muted">
                {filter === "pending"
                  ? "Great! All pending player withdrawals have been processed."
                  : "No requests match the selected filter criteria."}
              </p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={filteredList.length > 0 && selectedIds.size === filteredList.length}
                        onChange={handleToggleSelectAll}
                        title="Select/Deselect all visible requests"
                        style={{ cursor: "pointer", width: 16, height: 16 }}
                      />
                    </th>
                    <th>Date & Time</th>
                    <th>Player</th>
                    <th>Telebirr Phone</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Details & Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map(w => {
                    const amountNum = parseFloat(w.amount) || 0;
                    const isSelected = selectedIds.has(w.id);

                    return (
                      <tr key={w.id} style={{ background: isSelected ? "rgba(234, 161, 27, 0.05)" : undefined }}>
                        {/* Checkbox */}
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(w.id)}
                            style={{ cursor: "pointer", width: 16, height: 16 }}
                          />
                        </td>

                        {/* Date */}
                        <td className="text-sm">
                          <div className="font-medium text-primary">
                            {new Date(w.created_at).toLocaleDateString()}
                          </div>
                          <div className="text-muted text-xs">
                            {new Date(w.created_at).toLocaleTimeString()}
                          </div>
                        </td>

                        {/* Player */}
                        <td>
                          <div className="flex-center gap-2">
                            <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                              {(w.user_name || "P").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <Link
                                to={`/players/${w.user_id}`}
                                className="font-medium text-primary hover:underline"
                              >
                                {w.user_name}
                              </Link>
                              {w.user_balance !== undefined && (
                                <div className="text-muted text-xs">
                                  Bal: {parseFloat(w.user_balance).toLocaleString()} ETB
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Phone with Copy */}
                        <td>
                          <div className="flex-center gap-2">
                            <span className="font-mono font-bold text-white">{w.phone_number}</span>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ padding: "3px 6px" }}
                              title="Copy phone number"
                              onClick={() => handleCopy(w.phone_number, `phone-${w.id}`)}
                            >
                              {copiedId === `phone-${w.id}` ? (
                                <Check size={14} className="text-success" />
                              ) : (
                                <Copy size={14} />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Amount with Copy */}
                        <td>
                          <div className="flex-center gap-2">
                            <span className="font-bold text-warning" style={{ fontSize: 15 }}>
                              {amountNum.toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB
                            </span>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ padding: "3px 6px" }}
                              title="Copy amount"
                              onClick={() => handleCopy(String(amountNum), `amt-${w.id}`)}
                            >
                              {copiedId === `amt-${w.id}` ? (
                                <Check size={14} className="text-success" />
                              ) : (
                                <Copy size={14} />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Status */}
                        <td>
                          <span
                            className={`badge ${
                              w.status === "pending"
                                ? "badge-warning"
                                : w.status === "approved"
                                ? "badge-success"
                                : w.status === "cancelled"
                                ? "badge-secondary"
                                : "badge-danger"
                            }`}
                          >
                            {w.status === "pending" && <Clock size={12} />}
                            {w.status === "approved" && <CheckCircle size={12} />}
                            {w.status === "rejected" && <XCircle size={12} />}
                            {w.status === "cancelled" && <XCircle size={12} />}
                            {w.status.toUpperCase()}
                          </span>
                        </td>

                        {/* Details / Admin Notes */}
                        <td>
                          <div className="text-sm">
                            <div className="text-secondary">{w.notes || "-"}</div>
                            {w.admin_name && (
                              <div className="text-muted text-xs">
                                By {w.admin_name} • {w.updated_at ? new Date(w.updated_at).toLocaleDateString() : ""}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td>
                          <div className="flex gap-1.5 items-center">
                            {w.status === "pending" ? (
                              <>
                                <button
                                  className="btn btn-success btn-sm"
                                  onClick={() => openProcessModal(w, "approve")}
                                  title="Approve and mark as paid"
                                >
                                  <CheckCircle size={14} />
                                  <span>Approve</span>
                                </button>
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() => openProcessModal(w, "reject")}
                                  title="Reject request and refund to wallet"
                                >
                                  <XCircle size={14} />
                                  <span>Reject</span>
                                </button>
                              </>
                            ) : null}

                            {/* Individual Delete Button */}
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: "var(--danger)", padding: "4px 8px" }}
                              onClick={() => openDeleteModal(w)}
                              title="Delete this withdrawal request record"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Single Process Modal (Approve / Reject) */}
      {modal.open && modal.request && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex-center gap-2">
                {modal.action === "approve" ? (
                  <CheckCircle className="text-success" size={20} />
                ) : (
                  <AlertTriangle className="text-danger" size={20} />
                )}
                <h3 className="modal-title">
                  {modal.action === "approve" ? "Approve & Mark as Paid" : "Reject Withdrawal & Refund"}
                </h3>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={closeModal} disabled={modal.submitting}>
                ✕
              </button>
            </div>

            <form onSubmit={submitProcess}>
              <div className="modal-body">
                {/* Error Banner */}
                {modal.error && (
                  <div className="p-3 mb-4 rounded" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13 }}>
                    {modal.error}
                  </div>
                )}

                {/* Recipient Details Card */}
                <div className="p-4 mb-4 rounded-lg" style={{ background: "var(--bg-glass)", border: "1px solid var(--border)" }}>
                  <div className="flex-between mb-2">
                    <span className="text-muted text-sm">Player</span>
                    <span className="font-bold text-white">{modal.request.user_name}</span>
                  </div>

                  <div className="flex-between mb-2">
                    <span className="text-muted text-sm">Telebirr Phone</span>
                    <div className="flex-center gap-2">
                      <span className="font-mono font-bold text-warning">{modal.request.phone_number}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: "2px 6px" }}
                        onClick={() => handleCopy(modal.request.phone_number, "modal-phone")}
                      >
                        {copiedId === "modal-phone" ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex-between">
                    <span className="text-muted text-sm">Payout Amount</span>
                    <div className="flex-center gap-2">
                      <span className="font-bold text-success" style={{ fontSize: 16 }}>
                        {parseFloat(modal.request.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: "2px 6px" }}
                        onClick={() => handleCopy(String(modal.request.amount), "modal-amt")}
                      >
                        {copiedId === "modal-amt" ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Context message */}
                {modal.action === "approve" ? (
                  <div className="text-muted text-sm mb-4">
                    Send <strong>{parseFloat(modal.request.amount).toLocaleString()} ETB</strong> to <strong>{modal.request.phone_number}</strong> on Telebirr, then record the transaction reference below:
                  </div>
                ) : (
                  <div className="p-3 mb-4 rounded text-sm" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", color: "var(--warning)" }}>
                    ⚠️ <strong>Refund Notice:</strong> Rejecting this request will immediately credit <strong>{parseFloat(modal.request.amount).toLocaleString()} ETB</strong> back to the player's wallet balance.
                  </div>
                )}

                {/* Note/Reference Input */}
                <div className="form-group">
                  <label className="form-label">
                    {modal.action === "approve" ? "Telebirr Transaction ID / Reference (Optional)" : "Reason for Rejection"}
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={
                      modal.action === "approve"
                        ? "e.g., MP240315.1234.A5678 or Paid via Telebirr"
                        : "e.g., Incorrect account number, account unverified..."
                    }
                    value={modal.notes}
                    onChange={e => setModal(prev => ({ ...prev, notes: e.target.value }))}
                    autoFocus
                    required={modal.action === "reject"}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={closeModal} disabled={modal.submitting}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn ${modal.action === "approve" ? "btn-success" : "btn-danger"}`}
                  disabled={modal.submitting}
                >
                  {modal.submitting ? (
                    <>
                      <div className="spinner" style={{ width: 14, height: 14 }}></div>
                      <span>Processing...</span>
                    </>
                  ) : modal.action === "approve" ? (
                    <>
                      <CheckCircle size={16} />
                      <span>Confirm & Mark Paid</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={16} />
                      <span>Confirm Rejection & Refund</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Single Delete Confirmation Modal */}
      {deleteModal.open && deleteModal.request && (
        <div className="modal-overlay" onClick={closeDeleteModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex-center gap-2">
                <Trash2 className="text-danger" size={20} />
                <h3 className="modal-title">Delete Withdrawal Request</h3>
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

              <p className="text-secondary text-sm mb-4">
                Are you sure you want to permanently delete this withdrawal request for{" "}
                <strong className="text-white">{deleteModal.request.user_name}</strong> (
                <span className="text-warning font-bold">{parseFloat(deleteModal.request.amount).toLocaleString()} ETB</span>)?
              </p>

              {deleteModal.request.status === "pending" && (
                <div className="p-3 mb-3 rounded text-sm" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", color: "var(--warning)" }}>
                  <label className="flex items-center gap-2 cursor-pointer font-bold">
                    <input
                      type="checkbox"
                      checked={deleteModal.refundPending}
                      onChange={e => setDeleteModal(prev => ({ ...prev, refundPending: e.target.checked }))}
                    />
                    <span>Automatically refund {parseFloat(deleteModal.request.amount).toLocaleString()} ETB to player's wallet before deletion</span>
                  </label>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={closeDeleteModal} disabled={deleteModal.submitting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={submitSingleDelete}
                disabled={deleteModal.submitting}
              >
                {deleteModal.submitting ? "Deleting..." : "Delete Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Action Modal (Bulk Delete | Bulk Approve | Bulk Reject) */}
      {bulkModal.open && (
        <div className="modal-overlay" onClick={closeBulkModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex-center gap-2">
                {bulkModal.action === "delete" ? (
                  <Trash2 className="text-danger" size={20} />
                ) : bulkModal.action === "approve" ? (
                  <CheckCircle className="text-success" size={20} />
                ) : (
                  <AlertTriangle className="text-danger" size={20} />
                )}
                <h3 className="modal-title capitalize">
                  {bulkModal.action === "delete"
                    ? `Bulk Delete (${selectedIds.size} Requests)`
                    : bulkModal.action === "approve"
                    ? `Bulk Approve (${selectedPendingCount} Pending Requests)`
                    : `Bulk Reject (${selectedPendingCount} Pending Requests)`}
                </h3>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={closeBulkModal} disabled={bulkModal.submitting}>
                ✕
              </button>
            </div>

            <form onSubmit={submitBulkAction}>
              <div className="modal-body">
                {bulkModal.error && (
                  <div className="p-3 mb-4 rounded" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13 }}>
                    {bulkModal.error}
                  </div>
                )}

                {bulkModal.action === "delete" ? (
                  <div>
                    <p className="text-secondary text-sm mb-4">
                      You are about to delete <strong>{selectedIds.size}</strong> withdrawal request records permanently.
                    </p>

                    {selectedPendingCount > 0 && (
                      <div className="p-3 mb-3 rounded text-sm" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", color: "var(--warning)" }}>
                        <div className="font-bold mb-2">
                          ⚠️ Notice: {selectedPendingCount} of the selected requests are currently PENDING.
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer font-bold text-white">
                          <input
                            type="checkbox"
                            checked={bulkModal.refundPending}
                            onChange={e => setBulkModal(prev => ({ ...prev, refundPending: e.target.checked }))}
                          />
                          <span>Refund funds to players' wallets before deleting pending requests</span>
                        </label>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-secondary text-sm mb-4">
                      You are about to {bulkModal.action === "approve" ? "approve and mark as paid" : "reject and refund"}{" "}
                      <strong>{selectedPendingCount}</strong> pending withdrawal requests.
                    </p>

                    <div className="form-group">
                      <label className="form-label">
                        {bulkModal.action === "approve" ? "Batch Reference / Note (Optional)" : "Reason for Rejection"}
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder={bulkModal.action === "approve" ? "e.g. Bulk Telebirr Payout" : "Reason..."}
                        value={bulkModal.notes}
                        onChange={e => setBulkModal(prev => ({ ...prev, notes: e.target.value }))}
                        required={bulkModal.action === "reject"}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={closeBulkModal} disabled={bulkModal.submitting}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn ${bulkModal.action === "delete" || bulkModal.action === "reject" ? "btn-danger" : "btn-success"}`}
                  disabled={bulkModal.submitting}
                >
                  {bulkModal.submitting ? "Processing..." : `Confirm ${bulkModal.action === "delete" ? "Delete" : bulkModal.action === "approve" ? "Approval" : "Rejection"}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
