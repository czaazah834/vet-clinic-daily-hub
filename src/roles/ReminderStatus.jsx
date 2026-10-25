import { PaginatedTable } from "../components/Pagination.jsx";
import { useEffect, useState } from 'react';
import { clinicRequest } from '../clinicApi.js';
import {
  Bell,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Phone,
  Clock,
  ShieldCheck,
  Send,
  Radio
} from 'lucide-react';

export default function ReminderStatus() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setData(await clinicRequest('GET', '/api/reminders/status'));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);

  const pending = data?.summary?.pending || 0;
  const accepted = data?.summary?.accepted || 0;
  const issues = (data?.summary?.failed || 0) + (data?.summary?.uncertain || 0);

  const formatLastRun = (iso) => {
    if (!iso) return "Awaiting initial run";
    try {
      const dt = new Date(iso);
      const diffMin = Math.round((Date.now() - dt.getTime()) / 60000);
      if (diffMin < 1) return "Just now";
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHours = Math.round(diffMin / 60);
      return `${diffHours}h ago`;
    } catch {
      return iso;
    }
  };

  const isHealthy = data?.health?.emailConfigured && data?.health?.smsConfigured;

  return (
    <section className="card" style={{ marginBottom: 20, padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "18px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
              color: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <Bell size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "17px", color: "var(--navy, #0f172a)", fontWeight: 700 }}>
                Automatic Vaccination Recall Reminders
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "#64748b" }}>
                Auto-dispatched via Email &amp; TextBee SMS at 30, 14, and 3 days before clinical booster dates.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 10px",
            borderRadius: "99px",
            fontSize: "11.5px",
            fontWeight: 700,
            background: isHealthy ? "#dcfce7" : "#fef3c7",
            color: isHealthy ? "#15803d" : "#b45309",
            border: `1px solid ${isHealthy ? "#86efac" : "#fde68a"}`
          }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: isHealthy ? "#16a34a" : "#d97706" }} />
            <span>{isHealthy ? "Dual Gateway Live" : "Configuration Needed"}</span>
          </span>

          <button
            type="button"
            className="btn ghost sm"
            onClick={load}
            disabled={loading}
            style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", padding: "5px 10px" }}
            title="Refresh reminder status"
          >
            <RefreshCw size={13} className={loading ? "spin" : ""} />
            <span>{loading ? "Checking..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>{error}</span>
          <button className="btn ghost sm" onClick={load} style={{ fontSize: "12px" }}>Retry</button>
        </div>
      )}

      {/* Metrics Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "18px" }}>
        {/* Pending Card */}
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#64748b", fontSize: "12px", fontWeight: 600 }}>
            <span>Queued / Scheduled</span>
            <Clock size={16} color="#3b82f6" />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "#1e40af", marginTop: "6px" }}>
            {data ? pending : "—"}
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
            Scheduled for future booster dates
          </div>
        </div>

        {/* Accepted Card */}
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "14px", padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#166534", fontSize: "12px", fontWeight: 600 }}>
            <span>Dispatched &amp; Accepted</span>
            <CheckCircle2 size={16} color="#16a34a" />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "#15803d", marginTop: "6px" }}>
            {data ? accepted : "—"}
          </div>
          <div style={{ fontSize: "11px", color: "#166534", marginTop: "2px" }}>
            Delivered to pet owners
          </div>
        </div>

        {/* Attention Card */}
        <div style={{ background: issues > 0 ? "#fffbeb" : "#f8fafc", border: `1px solid ${issues > 0 ? "#fde68a" : "#e2e8f0"}`, borderRadius: "14px", padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: issues > 0 ? "#b45309" : "#64748b", fontSize: "12px", fontWeight: 600 }}>
            <span>Needs Attention</span>
            <AlertTriangle size={16} color={issues > 0 ? "#d97706" : "#94a3b8"} />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: issues > 0 ? "#b45309" : "#334155", marginTop: "6px" }}>
            {data ? issues : "—"}
          </div>
          <div style={{ fontSize: "11px", color: issues > 0 ? "#92400e" : "#64748b", marginTop: "2px" }}>
            {issues > 0 ? "Requires contact check" : "Zero delivery errors"}
          </div>
        </div>

        {/* Worker Health Card */}
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#64748b", fontSize: "12px", fontWeight: 600 }}>
            <span>Auto Worker</span>
            <Radio size={16} color="#059669" />
          </div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", marginTop: "10px" }}>
            {data ? formatLastRun(data.health?.lastRun) : "Checking..."}
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
            Runs continuously in background
          </div>
        </div>
      </div>

      {/* Gateway Status Strip */}
      <div style={{ background: "#f8fafc", borderRadius: "12px", padding: "10px 16px", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "16px", fontSize: "12.5px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Mail size={15} color={data?.health?.emailConfigured ? "#16a34a" : "#dc2626"} />
            <span style={{ color: "#334155", fontWeight: 600 }}>Email Gateway (SMTP/Gmail):</span>
            <span style={{ color: data?.health?.emailConfigured ? "#15803d" : "#b91c1c", fontWeight: 700 }}>
              {data?.health?.emailConfigured ? "Connected" : "Not configured"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Phone size={15} color={data?.health?.smsConfigured ? "#16a34a" : "#dc2626"} />
            <span style={{ color: "#334155", fontWeight: 600 }}>SMS Gateway (TextBee Android):</span>
            <span style={{ color: data?.health?.smsConfigured ? "#15803d" : "#b91c1c", fontWeight: 700 }}>
              {data?.health?.smsConfigured ? "Connected" : "Device offline"}
            </span>
          </div>
        </div>

        <span style={{ color: "#64748b", fontSize: "11.5px" }}>
          Dispatches to Philippine mobile (+63) &amp; verified owner emails
        </span>
      </div>

      {/* Attention Required Table */}
      {data?.attention && data.attention.length > 0 ? (
        <div>
          <h4 style={{ margin: "0 0 10px", fontSize: "13.5px", color: "#991b1b", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
            <AlertTriangle size={15} />
            <span>Reminders Requiring Manual Staff Review ({data.attention.length})</span>
          </h4>
          <div style={{ overflowX: "auto", border: "1px solid #fed7aa", borderRadius: "12px" }}>
            <PaginatedTable label="Reminder delivery issues" className="tbl" style={{ margin: 0, fontSize: "12.5px" }}>
              <thead>
                <tr style={{ background: "#fff7ed" }}>
                  <th style={{ padding: "8px 12px" }}>Patient</th>
                  <th style={{ padding: "8px 12px" }}>Vaccine &amp; Due Date</th>
                  <th style={{ padding: "8px 12px" }}>Channel</th>
                  <th style={{ padding: "8px 12px" }}>Status</th>
                  <th style={{ padding: "8px 12px" }}>Recommended Action</th>
                </tr>
              </thead>
              <tbody>
                {data.attention.map((r) => (
                  <tr key={r.id}>
                    <td style={{ padding: "8px 12px", fontWeight: 700, color: "#1e3a8a" }}>
                      {r.petName}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <b>{r.vaccine}</b> &bull; {r.dueDate}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#f1f5f9", padding: "2px 6px", borderRadius: "6px", fontSize: "11px", fontWeight: 600 }}>
                        {r.channel === "sms" ? <Phone size={11} /> : <Mail size={11} />}
                        <span>{r.channel.toUpperCase()}</span>
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ color: "#dc2626", fontWeight: 700, textTransform: "capitalize" }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px", color: "#475569" }}>
                      {r.status === "uncertain"
                        ? "Check gateway transmission log before re-attempting."
                        : "Verify owner phone/email in client profile; call owner."}
                    </td>
                  </tr>
                ))}
              </tbody>
            </PaginatedTable>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#15803d", fontSize: "12.5px", background: "#f0fdf4", padding: "8px 14px", borderRadius: "10px", border: "1px solid #bbf7d0" }}>
          <CheckCircle2 size={16} />
          <span><b>All Reminders Running Smoothly:</b> No failed booster reminder deliveries on record.</span>
        </div>
      )}
    </section>
  );
}
