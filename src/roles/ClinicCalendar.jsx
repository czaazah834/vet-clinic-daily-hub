import { useState } from "react";
import { VETS, TODAY, scope, petName, ownerName, dueState, moveAppt, LABEL, Badge } from "../lib.jsx";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const STATUS_COLORS = {
  Scheduled: "wa",
  Confirmed: "ok",
  "Checked-in": "b2",
  "In consultation": "b0",
  Completed: "ok",
  Cancelled: "er",
  "No-show": "er",
};

export default function ClinicCalendar({ db, setDb, me, go, say }) {
  const t = new Date();
  const [cur, setCur] = useState({ y: t.getFullYear(), m: t.getMonth() });
  const [vetFilter, setVetFilter] = useState(me.role === "vet" ? me.vetId || "v1" : "");
  const [sel, setSel] = useState(TODAY);

  const appts = db.appts.filter(a => (!vetFilter || a.vetId === vetFilter) && a.status !== "Cancelled");

  const ev = {};
  const add = (d, e) => { if (d) (ev[d] = ev[d] || []).push(e); };

  appts.forEach(a => {
    add(a.date, {
      id: a.id,
      time: a.time,
      pet: petName(db, a.petId),
      owner: (db.pets.find(p => p.id === a.petId) || {}).ownerId ? ownerName(db, (db.pets.find(p => p.id === a.petId) || {}).ownerId) : "",
      reason: a.reason,
      status: a.status,
      vet: (VETS.find(v => v[0] === a.vetId) || [])[1] || "",
      appt: a,
    });
  });

  const first = new Date(cur.y, cur.m, 1);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(cur.y, cur.m, 1 - first.getDay() + i));
  const move = n => { const d = new Date(cur.y, cur.m + n, 1); setCur({ y: d.getFullYear(), m: d.getMonth() }); };

  const dayEvents = (ev[sel] || []).slice().sort((a, b) => a.time.localeCompare(b.time));
  const niceDate = new Date(sel + "T00:00:00").toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const handleAction = (a, action) => {
    moveAppt(setDb, a.id, action, me);
    say && say(`${LABEL[action] || action} done`);
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: "16px", padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button className="btn ghost sm" onClick={() => move(-1)} aria-label="Previous month">‹</button>
            <h2 style={{ margin: 0, fontSize: "20px" }}>{MONTHS[cur.m]} {cur.y}</h2>
            <button className="btn ghost sm" onClick={() => move(1)} aria-label="Next month">›</button>
            <button className="btn ghost sm" onClick={() => { setCur({ y: t.getFullYear(), m: t.getMonth() }); setSel(TODAY); }}>Today</button>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "600", margin: 0 }}>
              Veterinarian:
              <select value={vetFilter} onChange={e => setVetFilter(e.target.value)} style={{ width: "auto", padding: "6px 10px" }}>
                <option value="">All Veterinarians</option>
                {VETS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <button className="btn sm gold" onClick={() => go("appts")}>+ Book Visit</button>
          </div>
        </div>

        <div className="ow-grid" role="grid" style={{ marginTop: "16px" }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="ow-dow">{d}</div>)}
          {cells.map(d => {
            const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            const items = ev[k] || [];
            const out = d.getMonth() !== cur.m;
            const isToday = k === TODAY;
            const isSel = k === sel;

            return (
              <button
                key={k}
                className={`ow-day${out ? " out" : ""}${isToday ? " today" : ""}${isSel ? " sel" : ""}`}
                onClick={() => { setSel(k); if (out) setCur({ y: d.getFullYear(), m: d.getMonth() }); }}
                style={{ minHeight: "84px" }}
              >
                <b>{d.getDate()}</b>
                <div className="ow-evs" style={{ marginTop: "4px" }}>
                  {items.slice(0, 3).map((item, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: "11px",
                        lineHeight: "1.3",
                        padding: "2px 5px",
                        borderRadius: "4px",
                        background: item.status === "Checked-in" ? "#dbeafe" : item.status === "Completed" ? "#dcfce7" : "#f1f5f9",
                        color: item.status === "Checked-in" ? "#1d4ed8" : item.status === "Completed" ? "#15803d" : "#334155",
                        fontWeight: "600",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        marginBottom: "2px",
                      }}
                      title={`${item.time} ${item.pet} (${item.status})`}
                    >
                      {item.time} {item.pet}
                    </div>
                  ))}
                  {items.length > 3 && (
                    <span style={{ fontSize: "10.5px", color: "#64748b", fontWeight: "700" }}>+{items.length - 3} more</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "18px" }}>{niceDate} {sel === TODAY ? "(Today)" : ""}</h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>{dayEvents.length} clinic visit(s) scheduled on this day</p>
          </div>
          <button className="btn sm ghost" onClick={() => go("appts")}>Manage in Appointments Table →</button>
        </div>

        {dayEvents.length ? (
          <div style={{ display: "grid", gap: "10px" }}>
            {dayEvents.map(e => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  background: e.status === "Checked-in" ? "#f0f7ff" : "#fff",
                }}
              >
                <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
                  <b style={{ fontSize: "16px", color: "var(--navy)", minWidth: "55px" }}>{e.time}</b>
                  <div>
                    <div style={{ fontWeight: "700", fontSize: "14.5px" }}>
                      {e.pet} <span style={{ fontWeight: "400", color: "#64748b" }}>({e.owner})</span>
                    </div>
                    <div style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>
                      <b>Reason:</b> {e.reason} &bull; <b>Doctor:</b> {e.vet}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <Badge v={e.status} />
                  {me.role === "assistant" && e.status === "Scheduled" && (
                    <button className="btn sm" onClick={() => handleAction(e.appt, "Confirmed")}>Confirm</button>
                  )}
                  {me.role === "assistant" && ["Scheduled", "Confirmed"].includes(e.status) && (
                    <button className="btn sm gold" onClick={() => handleAction(e.appt, "Checked-in")}>Check in</button>
                  )}
                  {me.role === "vet" && e.status === "Checked-in" && (
                    <button className="btn sm gold" onClick={() => { handleAction(e.appt, "In consultation"); go("records"); }}>
                      Start Consultation
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty sm" style={{ padding: "28px" }}>
            No clinic visits scheduled on this date.
          </div>
        )}
      </div>
    </div>
  );
}

