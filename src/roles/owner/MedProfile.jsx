import { PaginatedTable } from "../../components/Pagination.jsx";
import { ShieldCheck, AlertTriangle, Scale, Hospital, ClipboardList, Info } from "lucide-react";
import { useState } from "react";
import { formatSpeciesLabel } from "../../preventiveSchedule.js";
import { Icon } from "./ui.jsx";

const byDate = a => [...a].sort((x, y) => x.date.localeCompare(y.date));

/* Owners can read recorded clinical data; corrections are handled by clinic staff. */
export default function MedProfile({ p }) {
  const weights = byDate(p.weights || []);
  const allergies = p.allergies || [];

  // Sparkline calculations
  const W = 360, H = 100, pad = 18;
  const kgs = weights.map(w => w.kg);
  const lo = kgs.length ? Math.min(...kgs) : 0;
  const hi = kgs.length ? Math.max(...kgs) : 10;
  const span = hi - lo || 1;
  const pts = weights.map((w, i) => [
    weights.length === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (weights.length - 1),
    H - pad - ((w.kg - lo) / span) * (H - 2 * pad)
  ]);

  return (
    <div className="ow-mp" style={{ maxWidth: "100%", padding: "4px 0" }}>
      {/* 1. Verified Allergies Section */}
      <section aria-labelledby="mp-al" style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <h4 id="mp-al" style={{ margin: 0, fontSize: "1.1rem", color: "var(--navy)", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldCheck size={20} aria-hidden="true" /> <span>Recorded Allergies &amp; Sensitivities</span>
          </h4>
          <span style={{ fontSize: "0.78rem", color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: "6px", fontWeight: 600 }}>
            Official Clinical Record
          </span>
        </div>
        <p style={{ margin: "0 0 12px", color: "var(--mu)", fontSize: "0.88rem" }}>
          Known adverse clinical reactions on file for {p.name} (food, medications, topical treatments, or environmental triggers).
        </p>

        {allergies.length ? (
          <ul className="ow-tags" style={{ margin: 0 }}>
            {allergies.map(a => (
              <li
                className="ow-tag"
                key={a}
                style={{
                  padding: "6px 14px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  background: "#fee2e2",
                  color: "#991b1b",
                  border: "1px solid #fca5a5",
                  borderRadius: "8px"
                }}
              >
                <AlertTriangle size={14} aria-hidden="true" /> {a}
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ background: "#f8fafc", border: "1px dashed var(--ln)", borderRadius: "10px", padding: "14px 18px", color: "#64748b", fontSize: "0.88rem" }}>
            <span>No allergies recorded for {p.name}. Tell the clinic about any known reactions.</span>
          </div>
        )}
      </section>

      {/* 2. Official Weight History & Vitals Section */}
      <section aria-labelledby="mp-wt" style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", flexWrap: "wrap", gap: "8px" }}>
          <h4 id="mp-wt" style={{ margin: 0, fontSize: "1.1rem", color: "var(--navy)", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
            <Scale size={20} aria-hidden="true" /> <span>Official Weight History &amp; Vital Growth</span>
          </h4>
          <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: "8px", padding: "4px 12px", fontSize: "0.85rem", color: "#1e40af", fontWeight: 700 }}>
            Last recorded weight: <b>{p.weight != null ? `${p.weight} kg` : "—"}</b>
          </div>
        </div>

        {/* Clinical Policy Notice */}
        <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", color: "#166534", fontSize: "0.82rem", lineHeight: 1.45 }}>
          <b>Weight records:</b> This history may include registration weights and clinic measurements. The assistant records arrival measurements, and the veterinarian reviews them when deciding treatment. Ask the clinic to correct any inaccurate entry.
        </div>

        {weights.length > 1 && (
          <div style={{ background: "#fff", border: "1px solid var(--ln)", borderRadius: "12px", padding: "14px", marginBottom: "14px" }}>
            <div style={{ fontSize: "0.78rem", color: "var(--mu)", fontWeight: 700, marginBottom: "8px", textTransform: "uppercase" }}>
              Weight Progression Trend (kg)
            </div>
            <svg
              className="ow-spark"
              viewBox={`0 0 ${W} ${H}`}
              style={{ width: "100%", height: "110px", overflow: "visible" }}
              role="img"
              aria-label={`Weight trend for ${p.name}`}
            >
              <polyline
                points={pts.map(q => q.join(",")).join(" ")}
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {pts.map((q, i) => (
                <g key={i}>
                  <circle cx={q[0]} cy={q[1]} r="4.5" fill="#2563eb" stroke="#fff" strokeWidth="1.5" />
                  <text x={q[0]} y={q[1] - 8} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#0f172a">
                    {weights[i].kg} kg
                  </text>
                </g>
              ))}
            </svg>
          </div>
        )}

        {weights.length ? (
          <div className="tw" style={{ border: "1px solid var(--ln)", borderRadius: "10px", overflow: "hidden" }}>
            <PaginatedTable label="Weight history" resetKey={p.id} style={{ margin: 0, width: "100%", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                  <th style={{ padding: "10px 12px" }}>Date Weighed</th>
                  <th style={{ padding: "10px 12px" }}>Measured Weight</th>
                  <th style={{ padding: "10px 12px" }}>Weight Change</th>
                  <th style={{ padding: "10px 12px" }}>Recorded source</th>
                </tr>
              </thead>
              <tbody>
                {weights
                  .map((w, i) => ({ w, prev: weights[i - 1] }))
                  .reverse()
                  .map(({ w, prev }) => {
                    const diff = prev ? +(w.kg - prev.kg).toFixed(2) : null;
                    const sourceLabel =
                      w.by === "frontdesk_checkin"
                        ? "Front Desk Arrival Check-in"
                        : w.by === "registration" || w.by === "Initial Registration"
                        ? "Pet Registration Record"
                        : w.by || "Source not recorded";
                    return (
                      <tr key={w.date} style={{ borderBottom: "1px solid var(--ln)" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 600 }}>{w.date}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--navy)" }}>{w.kg} kg</td>
                        <td style={{ padding: "10px 12px" }}>
                          {diff === null ? (
                            <span style={{ color: "var(--mu)" }}>Baseline</span>
                          ) : diff === 0 ? (
                            <span style={{ color: "#64748b" }}>No change</span>
                          ) : (
                            <span style={{ fontWeight: 700, color: diff > 0 ? "#2563eb" : "#059669" }}>
                              {diff > 0 ? `+${diff}` : `${diff}`} kg
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.78rem", color: "#334155", background: "#f1f5f9", padding: "2px 8px", borderRadius: "6px" }}>
                            <Hospital size={14} aria-hidden="true" /> {sourceLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </PaginatedTable>
          </div>
        ) : (
          <p className="ow-none">No clinical weight measurements on file.</p>
        )}
      </section>

      {/* 3. Clinical Care Notes Section */}
      <section aria-labelledby="mp-nt">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <h4 id="mp-nt" style={{ margin: 0, fontSize: "1.1rem", color: "var(--navy)", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
            <ClipboardList size={20} aria-hidden="true" /> <span>Clinical Care &amp; Handling Notes</span>
          </h4>
          <span style={{ fontSize: "0.78rem", color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: "6px", fontWeight: 600 }}>
            Read Only
          </span>
        </div>
        <p style={{ margin: "0 0 10px", color: "var(--mu)", fontSize: "0.88rem" }}>
          Special behavior, fears, temperament, or dietary guidance recorded on {p.name}’s patient file.
        </p>

        <div style={{ background: "#f8fafc", border: "1px solid var(--ln)", borderRadius: "10px", padding: "14px 16px" }}>
          {p.notes ? (
            <p style={{ margin: 0, fontSize: "0.92rem", color: "#1e293b", lineHeight: 1.5 }}>
              “{p.notes}”
            </p>
          ) : (
            <span style={{ color: "#64748b", fontSize: "0.88rem", fontStyle: "italic" }}>
              No special temperament or handling notes recorded on file.
            </span>
          )}
          <div style={{ marginTop: "10px", fontSize: "0.75rem", color: "#64748b", borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}>
            <Info size={16} aria-hidden="true" /> To update care instructions or reported sensitivities, notify the Vet Assistant during your next clinic visit.
          </div>
        </div>
      </section>
    </div>
  );
}
