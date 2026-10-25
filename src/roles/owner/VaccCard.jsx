import DigitalVetCard from '../DigitalVetCard.jsx';
import { PaginatedTable } from "../../components/Pagination.jsx";
import PetPortrait from "../PetPortrait.jsx";
import { useState, useEffect, useRef } from "react";
import { Badge, scope, petName, ICON, I } from "../../lib.jsx";
import { auth, OFFLINE_MSG } from "../../authApi.js";
import { setPrefill, toSquare, pick, Icon, Modal, fmt12 } from "./ui.jsx";
import { formatSpeciesLabel } from "../../preventiveSchedule.js";
import { today as bookingToday } from "../../booking.js";
import { currentVaccinationDue, vaccinationStatus, vaccinationAppointment, vaccinationBooking } from "../../ownerVaccination.js";
import MedProfile from "./MedProfile.jsx";



const doseLabel = v => v.doseNo ? (v.doseOf ? `Dose ${v.doseNo} of ${v.doseOf}` : `Dose ${v.doseNo}`) : "";


const parseDateSafe = d => {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  const s = String(d).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const dt = new Date(s.slice(0, 10) + "T00:00:00");
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
};

const daysTo = d => {
  const dt = parseDateSafe(d);
  if (!dt) return 0;
  const today = parseDateSafe(bookingToday()) || new Date();
  return Math.round((dt - today) / 864e5);
};

const fmtDate = d => {
  const dt = parseDateSafe(d);
  return dt ? dt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";
};

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const rel = d => {
  if (!d) return "None scheduled";
  const dt = parseDateSafe(d);
  if (!dt) return "None scheduled";
  const n = daysTo(d);
  return n === 0 ? "Today" : n > 0 ? `in ${plural(n, "day")}` : `${plural(-n, "day")} overdue`;
};
const veterinarianLabel = (v, vets) => {
  if (!v) return "PawCare Clinic";
  if (v.isExternal || v.recorded_by?.includes("External") || v.recordedBy?.includes("External") || v.brand?.includes("External") || v.protocolType?.includes("External") || v.notes?.includes("External")) {
    return "External Clinic (Guide)";
  }
  const n = v.vetName || vets.find(x => x.id === v.vetId)?.name;
  return n ? `${/^dr\.?\s/i.test(n) ? "" : "Dr. "}${n}${v.vetLicense ? ` · Lic. ${v.vetLicense}` : ""}` : "Veterinarian not recorded";
};
const tone = s => s === "Overdue" ? "er" : s === "Due soon" ? "wa" : "";

export function OwnerVacc({ db, setDb, me, go, say }) {
  const pets = scope(db, me, "pets").filter(p=>!p.registrationStatus || p.registrationStatus==='Verified');
  const vetOf = v => veterinarianLabel(v, db.vets || []);
  const [selectedId, setSel] = useState(() => (pick.petId && pets.some(p => p.id === pick.petId) ? pick.petId : pets[0] ? pets[0].id : ""));
  const sel = pets.some(p => p.id === selectedId) ? selectedId : pets[0]?.id || "";
  const [det, setDet] = useState(null), [st, setSt] = useState(""), [q, setQ] = useState(""), [tab, setTab] = useState("vacc");

  const fileInputRef = useRef(null);

  useEffect(() => { pick.petId = null; }, []);

  // Whenever selected pet changes, reset to page 1
  useEffect(() => { setDet(null); }, [sel]);

  const all = (scope(db, me, "vacc") || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const current = currentVaccinationDue(all);
  const hasBooster = v => Boolean(v && v.nextDue);
  const stateOf = v => vaccinationStatus(v, current);
  const getApptForRecord = v => v && v.nextDue ? vaccinationAppointment(v, scope(db, me, "appts")) : null;

  const over = all.filter(v => stateOf(v) === "Overdue"), soon = all.filter(v => stateOf(v) === "Due soon");
  const p = pets.find(x => x.id === sel), o = (db.owners || []).find(x => x.id === me.ownerId) || {};
  const mine = all.filter(v => v.petId === sel);
  const count = s => mine.filter(v => stateOf(v) === s).length;

  let list = mine;
  if (st) list = list.filter(v => stateOf(v) === st);
  if (q.trim()) list = list.filter(v => [v.vaccine, v.notes, v.brand, v.batch].join(" ").toLowerCase().includes(q.trim().toLowerCase()));
  const filtered = !!(st || q.trim());

  const book = v => {
    setPrefill(vaccinationBooking(v));
    go("appts");
  };

  const savePhoto = async photo => {
    try {
      const r = await auth.petPhoto(sel, photo);
      const updatedPet = r?.pet || { ...p, photo };
      setDb(d => ({
        ...d,
        pets: (d.pets || []).map(x => x.id === sel ? { ...x, ...updatedPet, photo } : x)
      }));
      say(photo ? "Picture saved to vaccination card" : "Picture removed");
    } catch (x) {
      console.warn("Photo save error:", x);
      say(x.offline ? OFFLINE_MSG : x.message || "We couldn’t save the picture. Please try again.");
    }
  };

  const handlePhotoFileChange = async e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      say("Only JPG, PNG or WEBP pictures are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      say("Picture is too big. The limit is 5 MB.");
      return;
    }
    try {
      const squareBase64 = await toSquare(file);
      await savePhoto(squareBase64);
    } catch (err) {
      say(err.message === "small" ? "Picture is too small. Use at least 64 × 64 pixels." : "Could not process picture.");
    }
  };

  const badge = id => {
    const l = all.filter(v => v.petId === id), a = l.filter(v => stateOf(v) === "Overdue").length, b = l.filter(v => stateOf(v) === "Due soon").length;
    return a ? <span className="badge er">{a} overdue</span> : b ? <span className="badge">{b} due soon</span> : l.some(v => !v.done) ? <span className="badge">Vet review needed</span> : l.length ? <span className="badge ok">No booster due soon</span> : <small>No records</small>;
  };

  if (!pets.length) {
    return (
      <div className="empty" style={{ padding: "40px 20px" }}>
        <div><Icon n="syringe" size={40} /></div>
        <h3>No pets on your account yet</h3>
        <p>Register your pet from the <b>My Pets</b> page and request a visit. The official Digital Vet Card is published after consultation completion and saved payment using verified clinic details.</p>
        <button className="btn gold" onClick={() => go("home")}>+ Add your pet</button>
      </div>
    );
  }

  const cardIdFormatted = p?.vaccinationCardId || "Awaiting internal reference";

  const handleRowClick = (v) => {
    setDet(v);
  };

  const petIndex = pets.findIndex(x => x.id === sel);
  const selectPet = id => {
    setSel(id);
    setDet(null);
    setSt("");
    setQ("");

  };
  const movePet = step => {
    if (pets.length <= 1) return;
    let nextIdx = petIndex + step;
    if (nextIdx < 0) nextIdx = pets.length - 1;
    if (nextIdx >= pets.length) nextIdx = 0;
    selectPet(pets[nextIdx].id);
  };

  return (
    <>
      {over.length > 0 && (
        <div className="ow-banner">
          <span><b>{over.length} overdue:</b> {over.map(v => `${petName(db, v.petId)} (${v.vaccine})`).join(", ")}</span>
          <button className="btn sm" onClick={() => book(over[0])}>Book a visit</button>
        </div>
      )}
      {soon.length > 0 && (
        <div className="ow-banner wa">
          <span><b>{soon.length} due within 14 days:</b> {soon.map(v => `${petName(db, v.petId)} (${v.vaccine})`).join(", ")}</span>
          <button className="btn sm" onClick={() => book(soon[0])}>Book a visit</button>
        </div>
      )}

      {p && (
        <section className="ow-vc vc-card-shell print-document" style={{ border: "none", background: "transparent", overflow: "visible", width: "100%" }} aria-label={`${p.name}’s vaccination card`}>
          <div className="vc-toolbar vc-noprint">
            {/* Prominent Pet Navigation Toolbar: < PET NAME VACCINATION CARD > */}
            <div className="vc-pet-pager" role="group" aria-label="Pet card navigation">
              <button
                type="button"
                className="vc-pager-btn"
                onClick={() => movePet(-1)}
                disabled={pets.length <= 1}
                aria-label="Previous pet"
                title={pets.length > 1 ? "Switch to previous pet" : "Only 1 pet on account"}
              >
                ‹
              </button>

              <div className="vc-pager-center">
                <div className="vc-pager-title">
                  {pets.length > 1 && <span className="vc-pager-bracket">&lt;&nbsp;</span>}
                  {String(p.name || "PET").toUpperCase()} VACCINATION CARD
                  {pets.length > 1 && <span className="vc-pager-bracket">&nbsp;&gt;</span>}
                </div>
                <div className="vc-pager-sub">
                  <span>{pets.length > 1 ? `Pet ${petIndex + 1} of ${pets.length}` : formatSpeciesLabel(p.species)}</span>
                  <span className="vc-pager-sep">•</span>
                  {badge(sel)}
                </div>
              </div>

              <button
                type="button"
                className="vc-pager-btn"
                onClick={() => movePet(1)}
                disabled={pets.length <= 1}
                aria-label="Next pet"
                title={pets.length > 1 ? "Switch to next pet" : "Only 1 pet on account"}
              >
                ›
              </button>
            </div>

            <div className="vc-toolbar-actions">
              <span className="vc-passport-stamp">Internal treatment reference · {cardIdFormatted}</span>
            </div>
          </div>

          {/* Quick Pet Switcher Pills (If owner has multiple pets) */}
          {pets.length > 1 && (
            <div className="vc-pet-pills vc-noprint" style={{ display: "flex", gap: "8px", justifyContent: "flex-start", marginBottom: "14px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", color: "#64748b", alignSelf: "center", fontWeight: 600 }}>Your Pets:</span>
              {pets.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => selectPet(x.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "4px 12px",
                    borderRadius: "99px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    border: x.id === sel ? "2px solid #2563eb" : "1.5px solid #cbd5e1",
                    background: x.id === sel ? "#eff6ff" : "#ffffff",
                    color: x.id === sel ? "#1e40af" : "#475569",
                    boxShadow: x.id === sel ? "0 2px 8px rgba(37,99,235,0.15)" : "none"
                  }}
                >
                  <Icon n="paw" size={24} />
                  <span>{x.name}</span>
                  {x.id === sel && <span style={{ fontSize: "10px", background: "#2563eb", color: "#fff", padding: "1px 5px", borderRadius: "6px" }}>Active</span>}
                </button>
              ))}
            </div>
          )}

            <DigitalVetCard key={p.id} petId={p.id} portrait={<PetPortrait pet={p} inputRef={fileInputRef} onChange={handlePhotoFileChange} onRemove={() => savePhoto("")} />} />

            {/* Navigation Tabs (Vaccinations / Medical Profile) */}
            <div className="ow-tabs vc-noprint" role="tablist" aria-label={`${p.name} sections`}>
              <button role="tab" aria-selected={tab === "vacc"} className={tab === "vacc" ? "on" : ""} onClick={() => setTab("vacc")}>
                Vaccination Records Table ({mine.length})
              </button>
              <button role="tab" aria-selected={tab === "med"} className={tab === "med" ? "on" : ""} onClick={() => setTab("med")}>
                Medical Profile & Allergies
              </button>
            </div>

            {/* Tab content */}
            <div className="ow-vcb" style={{ padding: 0 }}>
              {tab === "med" ? (
                <MedProfile key={p.id} p={p} db={db} setDb={setDb} me={me} say={say} />
              ) : (
                <>
                  <div className="vc-only-print"><h2>Immunization record</h2><p>{filtered?`Filtered records · Status: ${st || 'All'} · Search: ${q.trim() || 'None'}`:'All saved vaccination records for this patient.'}</p></div>
                  {/* Filters */}
                  <div className="vc-bar vc-noprint" style={{ marginBottom: 10 }}>
                    <div>
                      <label className="ow-lbl" htmlFor="vc-st">Filter by Status</label>
                      <select id="vc-st" value={st} onChange={e => setSt(e.target.value)}>
                        <option value="">All statuses</option>
                        {["Overdue", "Due soon", "On track", "Completed", "Vet review needed", "External reference · unverified"].map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="ow-lbl" htmlFor="vc-q">Search vaccine or brand</label>
                      <div className="vc-search">
                        <Icon n="search" size={16} />
                        <input id="vc-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. Rabies, DHPP, Deworming..." />
                      </div>
                    </div>
                    {filtered && <button className="btn ghost sm" onClick={() => { setSt(""); setQ(""); }}>Clear filters</button>}
                  </div>

                  <p className="ow-hint vc-noprint" style={{ marginBottom: 8 }}>
                    <b>Tip:</b> Click a row to inspect its saved vaccination record. Use Download PDF above for the complete published card.
                  </p>

                  {/* Interactive Table with Single-Click Open */}
                  {list.length ? (
                    <div className="tw">
                      <PaginatedTable label="Immunization log" resetKey={[sel,st,q]} className="vc-tbl">
                        <thead>
                          <tr>
                            <th>Vaccine</th>
                            <th>Date given</th>
                            <th>Next dose</th>
                            <th>Status</th>
                            <th>Product / Batch</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map(v => {
                            const s = stateOf(v), t = tone(s), reference=v.batch==='EXTERNAL-HIST' || /external history.*guide/i.test(v.protocolType || '');
                            const matchedAppt = getApptForRecord(v);
                            const hasNext = hasBooster(v);
                            return (
                              <tr
                                key={v.id}
                                className={`vc-r ${t}`}
                                tabIndex={0}
                                style={{ cursor: "pointer" }}
                                title="Click to view vaccination card"
                                onClick={() => handleRowClick(v)}
                                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleRowClick(v); } }}
                              >
                                <td data-label="Vaccine">
                                  <span>
                                    <b>{v.vaccine}</b>
                                    {doseLabel(v) && <em className="vc-dose">{doseLabel(v)}</em>}
                                    {v.brand && <small className="vc-rel">{v.brand}</small>}
                                  </span>
                                </td>
                                <td data-label="Date given">
                                  <span>
                                    {reference ? <i>Unknown · unverified external report</i> : v.done ? fmtDate(v.date) : <i>Planned · Not administered</i>}
                                    {vetOf(v) && <small className="vc-rel">{vetOf(v)}</small>}
                                  </span>
                                </td>
                                <td data-label="Next dose">
                                  <span>
                                    {reference ? "Requires veterinarian review" : v.nextDue ? fmtDate(v.nextDue) : "—"}
                                    {hasBooster(v) && <small className={`vc-rel ${t}`}>{rel(v.nextDue)}</small>}
                                    {matchedAppt && (
                                      <small style={{ display: "block", color: "#166534", fontWeight: 700, marginTop: "2px" }}>
                                        ✓ {matchedAppt.status} · {fmtDate(matchedAppt.date)} {matchedAppt.time ? `• ${fmt12(matchedAppt.time)}` : ""}
                                      </small>
                                    )}
                                  </span>
                                </td>
                                <td data-label="Status">
                                  <span>
                                    {matchedAppt ? (
                                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#dcfce7", color: "#15803d", border: "1px solid #86efac", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700 }}>
                                        ✓ {matchedAppt.status}
                                      </span>
                                    ) : (
                                      <Badge v={s} />
                                    )}
                                    {reference ? <small className="vc-rel">Previous-clinic reference only</small> : v.done ? (
                                      <small className="vc-rel">Dose administered</small>
                                    ) : matchedAppt ? (
                                      <small className="vc-rel" style={{ color: "#166534" }}>{matchedAppt.status}</small>
                                    ) : null}
                                  </span>
                                </td>
                                <td data-label="Product / Batch">
                                  <span>{v.batch ? `Lot ${v.batch}` : "Lot not recorded"}</span>
                                </td>
                                <td className="act vc-noprint">
                                  {matchedAppt ? (
                                    <button
                                      type="button"
                                      className="btn ghost sm"
                                      style={{ color: "#15803d", borderColor: "#86efac", background: "#f0fdf4", fontWeight: 700, whiteSpace: "nowrap" }}
                                      onClick={e => {
                                        e.stopPropagation();
                                        setPrefill(null);
                                        go("appts");
                                      }}
                                      title={`Visit scheduled for ${fmtDate(matchedAppt.date)} at ${fmt12(matchedAppt.time)}. Click to view in My Appointments.`}
                                    >
                                      View appointment
                                    </button>
                                  ) : hasNext ? (
                                    <button
                                      type="button"
                                      className={`btn sm ${s === "Overdue" ? "gold" : s === "Due soon" ? "gold" : ""}`}
                                      style={{ whiteSpace: "nowrap" }}
                                      onClick={e => {
                                        e.stopPropagation();
                                        book(v);
                                      }}
                                      title={`Book visit on ${fmtDate(v.nextDue)} by picking your time slot`}
                                    >
                                      Book visit by time
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn ghost sm"
                                      onClick={e => {
                                        e.stopPropagation();
                                        handleRowClick(v);
                                      }}
                                    >
                                      View Card
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </PaginatedTable>
                    </div>
                  ) : (
                    <div className="empty sm">
                      {mine.length ? "No records match these filters." : `No vaccine records for ${p.name} yet.`}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}

      {/* Modal for detailed record inspection */}
      {det && (
        <Modal title={`${det.vaccine}${doseLabel(det) ? ` · ${doseLabel(det)}` : ""}`} onClose={() => setDet(null)}>
          <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <Badge v={stateOf(det)} />
              <span className="vc-passport-stamp verified">
                Recorded on Card #{cardIdFormatted}
              </span>
            </div>

            <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", margin: 0 }}>
              <div><dt style={{ fontSize: 11.5, fontWeight: 700, color: "var(--mu)" }}>Patient</dt><dd style={{ margin: "2px 0 0", fontWeight: 700, color: "var(--navy)" }}>{p?.name}</dd></div>
              <div><dt style={{ fontSize: 11.5, fontWeight: 700, color: "var(--mu)" }}>Species / Breed</dt><dd style={{ margin: "2px 0 0" }}>{formatSpeciesLabel(p?.species)} • {p?.breed}</dd></div>
              <div><dt style={{ fontSize: 11.5, fontWeight: 700, color: "var(--mu)" }}>Date Administered</dt><dd style={{ margin: "2px 0 0" }}>{det.done ? fmtDate(det.date) : "Not administered"}</dd></div>
              <div><dt style={{ fontSize: 11.5, fontWeight: 700, color: "var(--mu)" }}>Next Booster Due</dt><dd style={{ margin: "2px 0 0", fontWeight: 700, color: det.nextDue ? "#0284c7" : "inherit" }}>{det.nextDue ? `${fmtDate(det.nextDue)}${hasBooster(det) ? ` (${rel(det.nextDue)})` : " · Historical / unapproved schedule"}` : "None scheduled"}</dd></div>
              <div><dt style={{ fontSize: 11.5, fontWeight: 700, color: "var(--mu)" }}>Veterinarian</dt><dd style={{ margin: "2px 0 0" }}>{vetOf(det)}</dd></div>
              <div><dt style={{ fontSize: 11.5, fontWeight: 700, color: "var(--mu)" }}>Vaccine Brand</dt><dd style={{ margin: "2px 0 0" }}>{det.brand || "Not recorded"}</dd></div>
              <div><dt style={{ fontSize: 11.5, fontWeight: 700, color: "var(--mu)" }}>Vial Batch / Lot</dt><dd style={{ margin: "2px 0 0", fontFamily: "monospace" }}>{det.batch || "Not recorded"}</dd></div>
              <div><dt style={{ fontSize: 11.5, fontWeight: 700, color: "var(--mu)" }}>Protocol Type</dt><dd style={{ margin: "2px 0 0" }}>{det.protocolType || "Core Protocol"}</dd></div>
            </dl>

            {det.notes && (
              <div style={{ marginTop: 14, background: "#f8fafc", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: "11.5px", color: "#64748b", fontWeight: 700 }}>Clinical Notes:</span>
                <p style={{ margin: "2px 0 0", fontSize: "13px" }}>{det.notes}</p>
              </div>
            )}
          </div>

          <div className="row end" style={{ marginTop: 16 }}>
            {(() => {
              const detAppt = getApptForRecord(det);
              if (detAppt) {
                return (
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ color: "#15803d", borderColor: "#86efac", background: "#f0fdf4", fontWeight: 700 }}
                    onClick={() => { setDet(null); go("appts"); }}
                  >
                    {detAppt.status} for {fmtDate(detAppt.date)} at {fmt12(detAppt.time)}
                  </button>
                );
              }
              if (hasBooster(det)) {
                return (
                  <button
                    type="button"
                    className="btn gold"
                    onClick={() => { const v = det; setDet(null); book(v); }}
                  >
                    Book visit by time ({fmtDate(det.nextDue)})
                  </button>
                );
              }
              return null;
            })()}
            <button className="btn ghost" onClick={() => setDet(null)}>Close</button>
          </div>
        </Modal>
      )}
    </>
  );
}
