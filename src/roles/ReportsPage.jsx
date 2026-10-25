import { PaginatedTable } from "../components/Pagination.jsx";
import { useState, useMemo } from "react";
import { E, scope, petName, VETS, TODAY, Badge } from "../lib.jsx";
import {
  FileText,
  Download,
  Printer,
  Calendar,
  Search,
  Filter,
  CheckCircle2,
  Syringe,
  Stethoscope,
  PawPrint,
  Clock,
  Sparkles,
  ChevronDown
} from "lucide-react";

const CLINIC = {
  name: "PawCare Veterinary Clinic",
  subtitle: "Animal Health Care & Digital Immunization Services",
  address: "128 Rizal Avenue, Caloocan City, Metro Manila",
  phone: "+63 (02) 8352-8899 / 0917-888-PAWS",
  email: "care@pawcareclinic.ph",
  license: "BAI Reg. No. 2024-0891 • PVMA Accredited"
};

const REPORT_CONFIG = {
  appts: {
    title: "Appointments & Visits Audit",
    sub: "Clinic appointment scheduling, attendance records, and consultation slots.",
    icon: Calendar,
    color: "#2563eb",
    bg: "#eff6ff",
    headers: ["Date", "Time", "Patient", "Species", "Owner", "Veterinarian", "Reason / Service", "Status"],
    toCsvRow: (x, db) => {
      const p = (db.pets || []).find(p => p.id === x.petId) || {};
      const o = (db.owners || []).find(o => o.id === p.ownerId) || {};
      const vet = (VETS.find(v => v[0] === x.vetId) || [])[1] || x.vetId || "Unassigned";
      return [
        x.date || "",
        x.time || "",
        p.name || x.petId || "",
        p.species || "",
        o.name || "",
        vet,
        x.reason || x.service || "",
        x.status || "Scheduled"
      ];
    }
  },
  vacc: {
    title: "Vaccination & Booster Recalls",
    sub: "Administered vaccines, core booster protocols, batch lots, and recall schedules.",
    icon: Syringe,
    color: "#d97706",
    bg: "#fffbeb",
    headers: ["Date Administered", "Patient", "Species", "Owner", "Vaccine Name", "Brand", "Lot / Batch", "Next Booster Due", "Status"],
    toCsvRow: (x, db) => {
      const p = (db.pets || []).find(p => p.id === x.petId) || {};
      const o = (db.owners || []).find(o => o.id === p.ownerId) || {};
      return [
        x.date || "",
        p.name || x.petId || "",
        p.species || "",
        o.name || "",
        x.vaccine || "",
        x.brand || "",
        x.batch || "",
        x.nextDue || "Completed",
        x.done ? "Completed" : (x.nextDue < TODAY ? "Overdue" : "On Track")
      ];
    }
  },
  records: {
    title: "Veterinary Consultations & EMR",
    sub: "Signed clinical examination SOAP records, diagnoses, and treatments.",
    icon: Stethoscope,
    color: "#059669",
    bg: "#ecfdf5",
    headers: ["Date", "Patient", "Owner", "Attending Veterinarian", "Diagnosis / Assessment", "Treatment & Plan", "Prescriptions"],
    toCsvRow: (x, db) => {
      const p = (db.pets || []).find(p => p.id === x.petId) || {};
      const o = (db.owners || []).find(o => o.id === p.ownerId) || {};
      const vet = (VETS.find(v => v[0] === x.vetId) || [])[1] || x.vetId || "Attending Vet";
      return [
        x.date || "",
        p.name || x.petId || "",
        o.name || "",
        vet,
        x.diagnosis || "",
        x.treatment || "",
        x.prescription || ""
      ];
    }
  },
  pets: {
    title: "Registered Patients Masterlist",
    sub: "Animal patient demographics, breeds, birth dates, weights, and owner links.",
    icon: PawPrint,
    color: "#7c3aed",
    bg: "#f5f3ff",
    headers: ["Patient ID", "Pet Name", "Species", "Breed", "Sex", "Birth Date", "Weight (kg)", "Owner Name", "Owner Phone", "Card ID"],
    toCsvRow: (x, db) => {
      const o = (db.owners || []).find(o => o.id === x.ownerId) || {};
      return [
        x.id || "",
        x.name || "",
        x.species || "",
        x.breed || "",
        x.sex || "",
        x.birth || "",
        x.weight || "",
        o.name || "",
        o.phone || "",
        x.vaccinationCardId || ""
      ];
    }
  }
};

export default function ReportsPage({ db, me }) {
  const [reportType, setReportType] = useState("appts");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const currentCfg = REPORT_CONFIG[reportType] || REPORT_CONFIG.appts;
  const isDateFiltered = reportType !== "pets";
  const isDateInvalid = from && to && from > to;

  // Retrieve base list
  const rawList = useMemo(() => {
    const l = [...(scope(db, me, reportType) || [])];
    if (E[reportType]?.sort) l.sort(E[reportType].sort);
    return l;
  }, [db, me, reportType]);

  // Apply date and search filters
  const filteredList = useMemo(() => {
    let l = rawList;
    if (isDateFiltered) {
      if (from) l = l.filter(x => (x.date || "") >= from);
      if (to) l = l.filter(x => (x.date || "") <= to);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      l = l.filter(x => {
        const p = (db.pets || []).find(p => p.id === x.petId) || {};
        const o = (db.owners || []).find(o => o.id === (p.ownerId || x.ownerId)) || {};
        const text = [
          x.name, x.reason, x.vaccine, x.diagnosis, x.treatment,
          p.name, p.species, p.breed, o.name, o.phone, x.batch, x.brand
        ].filter(Boolean).join(" ").toLowerCase();
        return text.includes(q);
      });
    }
    return l;
  }, [rawList, isDateFiltered, from, to, search, db]);

  // Quick Date Range Presets
  const applyPreset = (preset) => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === "all") {
      setFrom("");
      setTo("");
    } else if (preset === "today") {
      const t = fmt(now);
      setFrom(t);
      setTo(t);
    } else if (preset === "week") {
      const lastWeek = new Date(now.getTime() - 7 * 864e5);
      setFrom(fmt(lastWeek));
      setTo(fmt(now));
    } else if (preset === "month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setFrom(fmt(startOfMonth));
      setTo(fmt(now));
    }
  };

  // CSV Export Generation
  const handleExportCsv = () => {
    if (!filteredList.length) return;
    const cfg = REPORT_CONFIG[reportType];
    const headers = cfg.headers;
    const rows = filteredList.map(item => cfg.toCsvRow(item, db));

    const escapeCsv = (val) => {
      const str = String(val ?? "");
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [
      headers.map(escapeCsv).join(","),
      ...rows.map(r => r.map(escapeCsv).join(","))
    ].join("\r\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const todayStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("href", url);
    link.setAttribute("download", `pawcare-${reportType}-report-${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const IconCmp = currentCfg.icon;

  return (
    <>
      <style>{`
        @media print {
          body { background: #ffffff !important; color: #000000 !important; font-size: 11pt !important; }
          .side, .sidefoot, .rep-noprint, button, input, select { display: none !important; }
          .main { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
          .rep-sheet { box-shadow: none !important; border: none !important; padding: 0 !important; }
          .rep-print-header { display: block !important; margin-bottom: 20px !important; }
          .rep-print-footer { display: block !important; margin-top: 30px !important; }
          table { width: 100% !important; border-collapse: collapse !important; }
          th, td { border: 1px solid #cbd5e1 !important; padding: 6px 8px !important; font-size: 9.5pt !important; }
          th { background: #f1f5f9 !important; font-weight: bold !important; }
        }
      `}</style>

      {/* Screen Header & Report Switcher (Hidden in Print) */}
      <div className="rep-noprint" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "14px", marginBottom: "18px" }}>
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: "22px", color: "var(--navy, #0f172a)", fontWeight: 800 }}>
              Reports &amp; Regulatory Audits
            </h2>
            <p style={{ margin: 0, fontSize: "13.5px", color: "#64748b" }}>
              Filter, audit clinical records, export CSV spreadsheets, and generate certified printed documents.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn gold"
              onClick={handleExportCsv}
              disabled={!filteredList.length}
              style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontWeight: 700 }}
              title="Download spreadsheet in CSV format"
            >
              <Download size={16} />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={handlePrint}
              disabled={!filteredList.length}
              style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontWeight: 700 }}
              title="Print official letterhead document"
            >
              <Printer size={16} />
              <span>Print Document</span>
            </button>
          </div>
        </div>

        {/* Report Type Selector Pills */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px", marginBottom: "16px" }}>
          {Object.entries(REPORT_CONFIG).map(([key, cfg]) => {
            const isSel = reportType === key;
            const ItemIcon = cfg.icon;
            const count = (scope(db, me, key) || []).length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => { setReportType(key); setFrom(""); setTo(""); setSearch(""); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  border: isSel ? `2px solid ${cfg.color}` : "1.5px solid #e2e8f0",
                  background: isSel ? cfg.bg : "#ffffff",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                  boxShadow: isSel ? "0 4px 12px rgba(0,0,0,0.04)" : "none"
                }}
              >
                <div style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "10px",
                  background: isSel ? cfg.color : "#f1f5f9",
                  color: isSel ? "#ffffff" : "#475569",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}>
                  <ItemIcon size={20} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: isSel ? cfg.color : "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {cfg.title.split("&")[0].trim()}
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>
                    <b>{count}</b> saved record{count === 1 ? "" : "s"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Filter Controls Bar */}
        <div style={{ background: "#ffffff", padding: "16px 20px", borderRadius: "16px", border: "1px solid #e2e8f0", boxShadow: "0 2px 6px rgba(0,0,0,0.02)", display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "center", justifyContent: "space-between" }}>
          {/* Date Range & Presets */}
          {isDateFiltered && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#475569" }}>Date Range:</span>
              <input
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
                style={{ fontSize: "12.5px", padding: "6px 10px" }}
                aria-label="Filter from date"
              />
              <span style={{ color: "#94a3b8" }}>➜</span>
              <input
                type="date"
                value={to}
                onChange={e => setTo(e.target.value)}
                style={{ fontSize: "12.5px", padding: "6px 10px" }}
                aria-label="Filter to date"
              />

              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {[
                  ["all", "All Time"],
                  ["today", "Today"],
                  ["week", "Last 7D"],
                  ["month", "This Month"]
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className="btn ghost sm"
                    onClick={() => applyPreset(key)}
                    style={{ fontSize: "11px", padding: "3px 8px" }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Search Within Report */}
          <div style={{ position: "relative", flex: "1 1 240px" }}>
            <Search size={14} color="#94a3b8" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="search"
              placeholder={`Search in ${currentCfg.title.toLowerCase()}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", paddingLeft: "32px", fontSize: "12.5px" }}
            />
          </div>
        </div>

        {isDateInvalid && (
          <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "10px", padding: "8px 12px", fontSize: "12.5px", marginTop: "10px" }}>
            The "From" date cannot be after the "To" date.
          </div>
        )}
      </div>

      {/* Main Report Document Sheet */}
      <section className="card rep-sheet" style={{ padding: "32px", background: "#ffffff" }}>
        
        {/* Printable Official Clinic Header */}
        <div className="rep-print-header" style={{ borderBottom: "2px solid #0f172a", paddingBottom: "16px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <PawPrint size={22} aria-hidden="true" />
                <h1 style={{ margin: 0, fontSize: "21px", color: "var(--navy, #0f172a)", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {CLINIC.name}
                </h1>
              </div>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#475569", fontWeight: 600 }}>
                {CLINIC.subtitle}
              </p>
              <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "4px" }}>
                {CLINIC.address} &bull; {CLINIC.phone} &bull; {CLINIC.email}
              </div>
              <div style={{ fontSize: "11px", color: "#0369a1", fontWeight: 700, marginTop: "2px" }}>
                {CLINIC.license}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ display: "inline-block", background: currentCfg.bg, color: currentCfg.color, border: `1px solid ${currentCfg.color}`, padding: "4px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 800, textTransform: "uppercase", marginBottom: "6px" }}>
                Official Certified Report
              </div>
              <div style={{ fontSize: "11.5px", color: "#475569" }}>
                <b>Date Generated:</b> {new Date().toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
              <div style={{ fontSize: "11px", color: "#64748b" }}>
                <b>Generated By:</b> {me.name} ({String(me.role).toUpperCase()})
              </div>
              {isDateFiltered && (from || to) && (
                <div style={{ fontSize: "11px", color: "#1e3a8a", fontWeight: 700, marginTop: "2px" }}>
                  Date Filter: {from || "Beginning"} ➜ {to || "Present"}
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: "14px", paddingTop: "10px", borderTop: "1px dashed #cbd5e1" }}>
            <h3 style={{ margin: 0, fontSize: "16px", color: "#0f172a", fontWeight: 800 }}>
              {currentCfg.title}
            </h3>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              {currentCfg.sub} &bull; Displaying <b>{filteredList.length}</b> total matching record(s)
            </span>
          </div>
        </div>

        {/* Data Table */}
        {filteredList.length === 0 ? (
          <div className="empty sm" style={{ padding: "40px 20px" }}>
            <p style={{ margin: 0, fontWeight: 600, color: "#64748b" }}>
              No records match your selected report filters.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <PaginatedTable label="Report records" resetKey={[reportType,from,to,search]} className="tbl" style={{ width: "100%", margin: 0, fontSize: "12.5px" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {currentCfg.headers.map((h, i) => (
                    <th key={i} style={{ padding: "9px 12px", textAlign: "left", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredList.map((item, idx) => {
                  const row = currentCfg.toCsvRow(item, db);
                  return (
                    <tr key={item.id || idx}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} style={{ padding: "8px 12px" }}>
                          {cIdx === row.length - 1 && ["Scheduled", "Confirmed", "Completed", "Cancelled", "Overdue", "On Track"].includes(cell) ? (
                            <Badge v={cell} />
                          ) : (
                            <span>{cell || "—"}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </PaginatedTable>
          </div>
        )}

        {/* Printable Official Sign-off Block */}
        <div className="rep-print-footer" style={{ marginTop: "40px", paddingTop: "20px", borderTop: "1px solid #cbd5e1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "24px" }}>
            <div>
              <div style={{ border: "2px dashed #059669", padding: "6px 14px", borderRadius: "8px", display: "inline-block", color: "#047857", fontSize: "11px", fontWeight: 800, textTransform: "uppercase" }}>
                Official Document Seal: {CLINIC.name}
              </div>
              <p style={{ margin: "6px 0 0", fontSize: "11px", color: "#64748b" }}>
                This clinical record is an authentic summary exported directly from the PawCare Clinic Portal.
              </p>
            </div>

            <div style={{ textAlign: "center", minWidth: "220px" }}>
              <div style={{ borderBottom: "1.5px solid #0f172a", width: "220px", marginBottom: "6px", height: "30px" }} />
              <b style={{ fontSize: "12px", color: "#0f172a", display: "block" }}>{me.name}</b>
              <span style={{ fontSize: "11px", color: "#64748b" }}>Certified Attending Officer &bull; PawCare</span>
            </div>
          </div>
        </div>

      </section>
    </>
  );
}

