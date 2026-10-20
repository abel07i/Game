import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { ArrowUpRight } from "lucide-react";

export default function Transactions() {
  const [data, setData] = useState({ transactions: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ type: "", page: 1 });

  const fetchTx = () => {
    setLoading(true);
    api.getTransactions(filters)
      .then(res => setData(res))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTx();
  }, [filters.page, filters.type]);

  const getTxColor = (type) => {
    if (['DEPOSIT', 'WIN', 'REFUND'].includes(type)) return 'var(--success)';
    if (['WITHDRAWAL', 'WAGER'].includes(type)) return 'var(--danger)';
    return 'var(--text-primary)';
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Transaction Ledger</div>
      </div>
      <div className="card-body">
        <form className="filter-row" onSubmit={e => e.preventDefault()}>
          <select
            className="form-select"
            style={{ width: "auto" }}
            value={filters.type}
            onChange={e => setFilters({ ...filters, type: e.target.value, page: 1 })}
          >
            <option value="">All Types</option>
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
            <option value="wager">Wager</option>
            <option value="win">Win</option>
            <option value="refund">Refund</option>
          </select>
        </form>

        {loading ? (
          <div className="loading-overlay"><div className="spinner"></div></div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>ID</th>
                  <th>Player</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Post Balance</th>
                  <th>Reference / Details</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.length === 0 ? (
                  <tr><td colSpan="7" className="text-center text-muted py-8">No transactions found.</td></tr>
                ) : data.transactions.map(tx => (
                  <tr key={tx.id}>
                    <td className="text-sm text-muted">{new Date(tx.created_at).toLocaleString()}</td>
                    <td className="text-sm font-mono text-muted">{tx.id.substring(0, 8)}...</td>
                    <td><Link to={`/players/${tx.user_id}`} className="hover:underline font-medium">{tx.player_name || "System"}</Link></td>
                    <td>
                      <span className="badge badge-muted" style={{ border: `1px solid ${getTxColor(tx.tx_type.toUpperCase())}`, color: getTxColor(tx.tx_type.toUpperCase()) }}>
                        {tx.tx_type.toUpperCase()}
                      </span>
                    </td>
                    <td className="font-bold" style={{ color: getTxColor(tx.tx_type.toUpperCase()) }}>
                      {tx.direction > 0 ? '+' : '-'}{tx.amount} ETB
                    </td>
                    <td className="font-medium">{tx.running_balance} ETB</td>
                    <td>
                      <div className="flex items-center gap-2">
                        {tx.reference_note && <span className="text-muted text-sm">{tx.reference_note}</span>}
                        {tx.room_id && (
                          <Link to={`/games/${tx.room_id}`} className="text-accent hover:underline text-sm" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            View Game <ArrowUpRight size={14} />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="pagination">
          <div className="pagination-info">
            Showing {Math.min((filters.page - 1) * 20 + 1, data.total)} to {Math.min(filters.page * 20, data.total)} of {data.total} transactions
          </div>
          <div className="pagination-controls">
            <button
              className="page-btn"
              disabled={filters.page === 1}
              onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
            >←</button>
            <span className="text-sm font-medium px-2">Page {filters.page}</span>
            <button
              className="page-btn"
              disabled={filters.page * 20 >= data.total}
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
            >→</button>
          </div>
        </div>
      </div>
    </div>
  );
}
