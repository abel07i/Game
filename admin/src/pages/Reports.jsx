import { useState } from "react";
import api from "../api";
import { buildCsvContent } from "../utils/csv";
import { Download, FileText, Users } from "lucide-react";

export default function Reports() {
  const [loading, setLoading] = useState(false);

  const downloadReport = async (type) => {
    setLoading(true);
    try {
      let data;
      if (type === 'players') data = await api.getPlayerReport();
      else if (type === 'games') data = await api.getGameReport();
      else if (type === 'transactions') data = await api.getTransactionReport();
      else if (type === 'profit') data = await api.getProfitReport();
      else if (type === 'referrals') data = await api.getReferralReport();

      // Convert to CSV (with formula injection protection)
      if (!data || !data.length) { alert("No data to export"); return; }
      const csvString = buildCsvContent(data);
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('hidden', '');
      a.setAttribute('href', url);
      a.setAttribute('download', `${type}_report_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Error generating report: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 800 }}>
      <div className="card-header"><div className="card-title">Export Reports</div></div>
      <div className="card-body">
        <p className="text-muted mb-6">Download platform data in CSV format for external analysis and record-keeping.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="flex-between p-4" style={{ background: "var(--bg-glass)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
            <div className="flex-center gap-3">
              <div className="avatar bg-accent-light text-accent"><FileText size={18}/></div>
              <div>
                <div className="font-bold">Players Report</div>
                <div className="text-sm text-muted">Complete list of players, balances, and wager stats.</div>
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => downloadReport('players')} disabled={loading}><Download size={16}/> Export CSV</button>
          </div>

          <div className="flex-between p-4" style={{ background: "var(--bg-glass)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
            <div className="flex-center gap-3">
              <div className="avatar bg-info-light text-info"><FileText size={18}/></div>
              <div>
                <div className="font-bold">Games Report</div>
                <div className="text-sm text-muted">History of all games, winners, and prize distributions.</div>
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => downloadReport('games')} disabled={loading}><Download size={16}/> Export CSV</button>
          </div>

          <div className="flex-between p-4" style={{ background: "var(--bg-glass)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
            <div className="flex-center gap-3">
              <div className="avatar bg-warning-light text-warning"><FileText size={18}/></div>
              <div>
                <div className="font-bold">Transactions Report</div>
                <div className="text-sm text-muted">Complete ledger of all platform transactions.</div>
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => downloadReport('transactions')} disabled={loading}><Download size={16}/> Export CSV</button>
          </div>

          <div className="flex-between p-4" style={{ background: "var(--bg-glass)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
            <div className="flex-center gap-3">
              <div className="avatar text-success" style={{ background: "rgba(16,185,129,0.15)" }}><Users size={18}/></div>
              <div>
                <div className="font-bold">Referral Commissions Report</div>
                <div className="text-sm text-muted">Lifetime referral reward settlements, inviters, winners, and commission audit keys.</div>
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => downloadReport('referrals')} disabled={loading}><Download size={16}/> Export CSV</button>
          </div>
        </div>
      </div>
    </div>
  );
}
