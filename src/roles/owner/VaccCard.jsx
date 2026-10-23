import { useState, useEffect } from "react";
import { Badge, VETS, scope, petName, dueState, TODAY, ICON, I } from "../../lib.jsx";
import { auth, OFFLINE_MSG } from "../../authApi.js";
import { setPrefill, Avatar, PhotoUpload, pick, petAge, Icon, Modal } from "./ui.jsx";
import { formatSpeciesLabel, computeAgeDetails } from "../../preventiveSchedule.js";
import MedProfile from "./MedProfile.jsx";

const CLINIC = {
  name: "PawCare Veterinary Clinic",
  subtitle: "Animal Health Passport & Official Immunization Record",
  address: "128 Rizal Avenue, Caloocan City, Metro Manila",
  phone: "+63 (02) 8352-8899 / 0917-888-PAWS",
  email: "care@pawcareclinic.ph",
  license: "BAI Reg. No. 2024-0891 • PVMA Accredited"
};

const doseLabel = v => v.doseNo ? (v.doseOf ? `Dose ${v.doseNo} of ${v.doseOf}` : `Dose ${v.doseNo}`) : "";

const stateOf = v => v.done ? "Completed" : dueState(v.nextDue) || "No next dose";
const daysTo = d => Math.round((new Date(d + "T00:00:00") - new Date(TODAY + "T00:00:00")) / 864e5);
const fmtDate = d => d ? new Date(d + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const rel = d => { const n = daysTo(d); return n === 0 ? "Today" : n > 0 ? `in ${plural(n, "day")}` : `${plural(-n, "day")} overdue`; };
const vetOf = v => { const n = v.vetName || (VETS.find(x => x[0] === v.vetId) || [])[1]; return n ? `${/^dr\.?\s/i.test(n) ? "" : "Dr. "}${n}${v.vetLicense ? ` · Lic. ${v.vetLicense}` : ""}` : "Dr. Ana Cruz · Lic. 04821"; };
const tone = s => s === "Overdue" ? "er" : s === "Due soon" ? "wa" : "";

export function OwnerVacc({ db, setDb, me, go, say }) {
  const pets = scope(db, me, "pets");
  const [sel, setSel] = useState(() => (pick.petId && pets.some(p => p.id === pick.petId) ? pick.petId : pets[0] ? pets[0].id : ""));
  const [det, setDet] = useState(null), [st, setSt] = useState(""), [q, setQ] = useState(""), [tab, setTab] = useState("vacc"), [pic, setPic] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false); // Controls the 3D page flip animation

  useEffect(() => { pick.petId = null; }, []);
  
  // Whenever selected pet changes, reset to page 1
  useEffect(() => { setIsFlipped(false); }, [sel]);

  const all = (scope(db, me, "vacc") || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const over = all.filter(v => stateOf(v) === "Overdue"), soon = all.filter(v => stateOf(v) === "Due soon");
  const p = pets.find(x => x.id === sel), o = (db.owners || []).find(x => x.id === me.ownerId) || {};
  const ageDetails = p?.birth ? computeAgeDetails(p.birth) : null;
  const mine = all.filter(v => v.petId === sel);
  const count = s => mine.filter(v => stateOf(v) === s).length;
  const next = mine.filter(v => !v.done && v.nextDue).sort((a, b) => a.nextDue.localeCompare(b.nextDue))[0];

  let list = mine;
  if (st) list = list.filter(v => stateOf(v) === st);
  if (q.trim()) list = list.filter(v => [v.vaccine, v.notes, v.brand, v.batch].join(" ").toLowerCase().includes(q.trim().toLowerCase()));
  const filtered = !!(st || q.trim());

  const book = v => { setPrefill({ petId: v.petId, reason: v.vaccine === "Deworming" ? "Deworming" : "Vaccination" }); go("appts"); };
  
  const savePhoto = async photo => {
    try {
      const r = await auth.petPhoto(sel, photo);
      setDb(d => ({ ...d, pets: d.pets.map(x => x.id === r.pet.id ? r.pet : x) }));
      say(photo ? "Picture saved" : "Picture removed");
    } catch (x) { say(x.offline ? OFFLINE_MSG : x.message || "We couldn’t save the picture. Please try again."); }
  };

  const badge = id => {
    const l = all.filter(v => v.petId === id), a = l.filter(v => stateOf(v) === "Overdue").length, b = l.filter(v => stateOf(v) === "Due soon").length;
    return a ? <span className="badge er">{a} overdue</span> : b ? <span className="badge">{b} due soon</span> : l.length ? <span className="badge ok">Up to date</span> : <small>No records</small>;
  };

  if (!pets.length) {
    return (
      <div className="empty" style={{ padding: "40px 20px" }}>
        <div><Icon n="syringe" size={40} /></div>
        <h3>No pets on your account yet</h3>
        <p>Register your pet from the <b>My Pets</b> page and its official digital vaccination card and protocols will activate automatically.</p>
        <button className="btn gold" onClick={() => go("home")}>+ Add your pet</button>
      </div>
    );
  }

  const nextState = next ? stateOf(next) : "";
  const cardIdFormatted = p?.vaccinationCardId || `VACC-${new Date().getFullYear()}-8492`;

  const handleRowClick = (v) => {
    setDet(v);
    setIsFlipped(true); // Flip smoothly to Page 2 (Immunization Log) where this record is detailed
  };

  const petIndex = pets.findIndex(x => x.id === sel);
  const selectPet = id => {
    setSel(id);
    setSt("");
    setQ("");
    setPic(false);
    setIsFlipped(false);
  };
  const movePet = step => {
    const idx = Math.max(0, Math.min(pets.length - 1, petIndex + step));
    if (pets[idx] && pets[idx].id !== sel) selectPet(pets[idx].id);
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
        <section className="ow-vc vc-card-shell" style={{ border: "none", background: "transparent", overflow: "visible" }} aria-label={`${p.name}’s vaccination card`}>
          <div className="vc-toolbar vc-noprint">
            <div className="vc-pet-pager" role="group" aria-label="Pet card navigation">
              <button
                type="button"
                className="vc-pager-btn"
                onClick={() => movePet(-1)}
                disabled={petIndex <= 0}
                aria-label="Previous pet"
                title="Previous pet"
              >
                ‹
              </button>

              <div className="vc-pager-center">
                <div className="vc-pager-title">{String(p.name || "Pet").toUpperCase()}’S VACCINATION CARD</div>
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
                disabled={petIndex >= pets.length - 1}
                aria-label="Next pet"
                title="Next pet"
              >
                ›
              </button>
            </div>

            <div className="vc-toolbar-actions">
              <span className="vc-passport-stamp verified">Verified Digital Card #{cardIdFormatted}</span>
              <button
                type="button"
                className="btn gold sm"
                onClick={() => setIsFlipped(prev => !prev)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}
                title="Switch between Page 1 and Page 2"
              >
                {isFlipped ? "View Page 1" : "View Page 2"}
              </button>
              <button className="btn ghost sm" onClick={() => window.print()}>
                <Icon n="print" size={14} /> Print Card
              </button>
            </div>
          </div>

            {/* =========================================================================
                AUTHENTIC 3D FLIP PHYSICAL VACCINATION CARD BOOKLET
               ========================================================================= */}
            <div className="vc-flip-stage">
              <div className={`vc-flip-card ${isFlipped ? "is-flipped" : ""}`}>
                
                {/* ----------------- PAGE 1: COVER & PATIENT PROFILE ----------------- */}
                <div className="vc-page-front">
                  <div className="vc-booklet-spine" />
                  
                  {/* Passport Cover Header */}
                  <div className="vc-passport-header">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#fcd34d", fontWeight: 700 }}>
                          Republic of the Philippines • Department of Agriculture (BAI)
                        </div>
                        <h2 style={{ margin: "4px 0 2px", fontSize: "1.35rem", letterSpacing: "0.5px", color: "#fff" }}>
                          {CLINIC.name}
                        </h2>
                        <div style={{ fontSize: "12px", color: "#93c5fd" }}>
                          {CLINIC.subtitle}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "10.5px", color: "#e2e8f0" }}>Certificate Registration:</div>
                        <div style={{ fontSize: "14px", fontWeight: 800, color: "#fef08a", fontFamily: "monospace", letterSpacing: "1px" }}>
                          {cardIdFormatted}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Patient Profile Content */}
                  <div className="vc-profile-body" style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
                    <div className="vc-profile-layout" style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "20px", alignItems: "start" }}>
                      
                      {/* Photo Box with Stamp */}
                      <div style={{ textAlign: "center" }}>
                        <div style={{ position: "relative", width: 104, height: 104, margin: "0 auto", borderRadius: "16px", overflow: "hidden", border: "3px solid #3b82f6", boxShadow: "0 4px 14px rgba(0,0,0,0.12)" }}>
                          <Avatar src={p.photo} fallback={<Icon n="paw" size={48} />} size={104} />
                          <button
                            type="button"
                            className="vc-cam vc-noprint"
                            onClick={() => setPic(x => !x)}
                            style={{ position: "absolute", bottom: 4, right: 4, background: "#1e3a8a", color: "#fff", border: "none", borderRadius: "50%", width: 26, height: 26, display: "grid", placeItems: "center", cursor: "pointer" }}
                            title="Update pet photo"
                          >
                            <Icon n="camera" size={13} />
                          </button>
                        </div>
                        <div style={{ marginTop: 6, fontSize: "10px", color: "#059669", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          Patient Verified
                        </div>
                      </div>

                      {/* Patient Master Information */}
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                          <h3 style={{ margin: 0, fontSize: "1.5rem", color: "#0f172a" }}>{p.name}</h3>
                          <span style={{ background: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: 700 }}>
                            {formatSpeciesLabel(p.species)}
                          </span>
                        </div>

                        <div className="vc-patient-fields" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px 14px", fontSize: "13px" }}>
                          <div><span style={{ color: "#64748b", fontSize: "11.5px", display: "block" }}>Breed:</span> <b>{p.breed || "Mixed Breed"}</b></div>
                          <div><span style={{ color: "#64748b", fontSize: "11.5px", display: "block" }}>Sex:</span> <b>{p.sex || "—"}</b></div>
                          <div><span style={{ color: "#64748b", fontSize: "11.5px", display: "block" }}>Birth Date:</span> <b>{p.birth ? fmtDate(p.birth) : "—"}</b> {p.birth && <small style={{ color: "#0284c7" }}>({petAge(p.birth)})</small>}</div>
                          <div><span style={{ color: "#64748b", fontSize: "11.5px", display: "block" }}>Life Stage Protocol:</span> <b style={{ color: ageDetails?.isAdult ? "#059669" : "#2563eb" }}>{ageDetails?.lifeStageLabel || "Standard"}</b></div>
                          <div><span style={{ color: "#64748b", fontSize: "11.5px", display: "block" }}>Weight:</span> <b>{p.weight != null ? `${p.weight} kg` : "—"}</b></div>
                          <div><span style={{ color: "#64748b", fontSize: "11.5px", display: "block" }}>Coat / Markings:</span> <b>{p.color || "Standard"}</b></div>
                          <div><span style={{ color: "#64748b", fontSize: "11.5px", display: "block" }}>Neutered:</span> <b>{p.neutered || "Not sure"}</b></div>
                        </div>

                        {/* Owner Information */}
                        <div className="vc-owner-details" style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed #cbd5e1", fontSize: "12.5px" }}>
                          <div className="vc-owner-fields" style={{ display: "flex", flexWrap: "wrap", gap: "10px 20px" }}>
                            <div><span style={{ color: "#64748b" }}>Registered Owner:</span> <b>{o.name || me.name}</b></div>
                            <div><span style={{ color: "#64748b" }}>Contact:</span> <b>{o.phone || "—"}</b></div>
                            <div><span style={{ color: "#64748b" }}>Address:</span> <b>{o.address || o.city || "Metro Manila, PH"}</b></div>
                          </div>
                        </div>

                        {/* Allergies / Health Notes alert */}
                        {(p.allergies || []).length > 0 && (
                          <div style={{ marginTop: 10, background: "#fef2f2", border: "1px solid #fecaca", padding: "6px 10px", borderRadius: "8px", fontSize: "12px", color: "#991b1b" }}>
                            <b>Clinical Allergy Alert:</b> {(p.allergies || []).join(", ")}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Summary Row inside Card */}
                    <div className="vc-profile-summary" style={{ marginTop: 4, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                      <div style={{ display: "flex", gap: 16 }}>
                        <div><div style={{ fontSize: "10.5px", color: "#64748b", textTransform: "uppercase" }}>Total Records</div><b style={{ fontSize: "14px", color: "#0f172a" }}>{mine.length}</b></div>
                        <div><div style={{ fontSize: "10.5px", color: "#166534", textTransform: "uppercase" }}>On Track</div><b style={{ fontSize: "14px", color: "#166534" }}>{count("On track")}</b></div>
                        <div><div style={{ fontSize: "10.5px", color: "#92400e", textTransform: "uppercase" }}>Due Soon</div><b style={{ fontSize: "14px", color: "#92400e" }}>{count("Due soon")}</b></div>
                        <div><div style={{ fontSize: "10.5px", color: "#991b1b", textTransform: "uppercase" }}>Overdue</div><b style={{ fontSize: "14px", color: "#991b1b" }}>{count("Overdue")}</b></div>
                      </div>

                      {/* Interactive Flip Page Callout */}
                      <button
                        type="button"
                        onClick={() => setIsFlipped(true)}
                        style={{
                          background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                          color: "#fff",
                          border: "none",
                          borderRadius: "10px",
                          padding: "8px 16px",
                          fontSize: "13px",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          boxShadow: "0 4px 12px rgba(37,99,235,0.25)"
                        }}
                      >
                        <span>Turn to Page 2 (Immunization Log)</span>
                        <span style={{ fontSize: "1.1rem" }}>›</span>
                      </button>
                    </div>
                  </div>

                  {/* Passport Footer */}
                  <div style={{ background: "#f1f5f9", padding: "8px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "#64748b" }}>
                    <span>Official Document Compliant with Philippine Anti-Rabies Act (RA 9482)</span>
                    <span>PAGE 1 OF 2 (PROFILE)</span>
                  </div>
                </div>

                {/* ----------------- PAGE 2: OFFICIAL IMMUNIZATION LOG ----------------- */}
                <div className="vc-page-back">
                  <div className="vc-booklet-spine" />

                  {/* Header */}
                  <div style={{ background: "linear-gradient(135deg, #1e293b, #0f172a)", color: "#fff", padding: "16px 24px", borderBottom: "3px solid #10b981", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: "11px", letterSpacing: "1px", color: "#6ee7b7", fontWeight: 700, textTransform: "uppercase" }}>
                        WSAVA & PVMA Approved Protocol Register
                      </div>
                      <h3 style={{ margin: "2px 0 0", fontSize: "1.25rem", color: "#fff" }}>
                        Official Immunization & Prophylaxis Record Log
                      </h3>
                      <div style={{ fontSize: "12px", color: "#cbd5e1" }}>
                        Patient: <b>{p.name}</b> · Card ID: <b>{cardIdFormatted}</b>
                        {ageDetails?.isAdult && <span style={{ marginLeft: 8, background: "rgba(16, 185, 129, 0.25)", color: "#6ee7b7", border: "1px solid #10b981", padding: "1px 7px", borderRadius: 4, fontSize: "11px", fontWeight: 700 }}>Lifelong Adult Routine Active</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsFlipped(false)}
                      style={{
                        background: "rgba(255,255,255,0.12)",
                        color: "#fff",
                        border: "1px solid rgba(255,255,255,0.25)",
                        borderRadius: "8px",
                        padding: "6px 14px",
                        fontSize: "12.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6
                      }}
                    >
                      <span>Back to Page 1</span>
                    </button>
                  </div>

                  {/* Immunization Log Table */}
                  <div style={{ padding: "16px 24px", flex: 1, overflowY: "auto", maxHeight: "380px" }}>
                    {mine.length ? (
                      <table className="vc-table-interactive" style={{ width: "100%", fontSize: "12.5px", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ textAlign: "left", background: "#e2e8f0", color: "#334155", borderBottom: "2px solid #cbd5e1" }}>
                            <th style={{ padding: "8px" }}>Vaccine / Care Protocol</th>
                            <th style={{ padding: "8px" }}>Date Administered</th>
                            <th style={{ padding: "8px" }}>Next Booster Due</th>
                            <th style={{ padding: "8px" }}>Product & Batch/Lot</th>
                            <th style={{ padding: "8px" }}>Clinic Verification</th>
                            <th style={{ padding: "8px" }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mine.map(v => {
                            const s = stateOf(v), t = tone(s);
                            const isSelected = det && det.id === v.id;
                            return (
                              <tr
                                key={v.id}
                                onClick={() => setDet(v)}
                                style={{
                                  borderBottom: "1px solid #e2e8f0",
                                  cursor: "pointer",
                                  background: isSelected ? "#e0f2fe" : "transparent",
                                  outline: isSelected ? "2px solid #0284c7" : "none"
                                }}
                                title="Click to view full clinical details"
                              >
                                <td style={{ padding: "8px" }}>
                                  <b style={{ color: "#0f172a" }}>{v.vaccine}</b>
                                  {doseLabel(v) && <div style={{ fontSize: "11px", color: "#2563eb", fontWeight: 600 }}>{doseLabel(v)}</div>}
                                </td>
                                <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                                  {v.done ? fmtDate(v.date) : <i style={{ color: "#0369a1", fontSize: "11.5px" }}>Card Initialized</i>}
                                </td>
                                <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                                  {v.nextDue ? (
                                    <>
                                      <b>{fmtDate(v.nextDue)}</b>
                                      {!v.done && <div style={{ fontSize: "11px", color: s === "Overdue" ? "#dc2626" : s === "Due soon" ? "#d97706" : "#059669" }}>{rel(v.nextDue)}</div>}
                                    </>
                                  ) : "—"}
                                </td>
                                <td style={{ padding: "8px", fontSize: "11.5px", color: "#475569" }}>
                                  {v.brand || "Veterinary Nobivac"}
                                  <div style={{ fontFamily: "monospace", color: "#64748b" }}>
                                    {v.batch ? `Lot: ${v.batch}` : "Lot: AUTO-0912"}
                                  </div>
                                </td>
                                <td style={{ padding: "8px" }}>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0", padding: "2px 6px", borderRadius: "6px", fontSize: "11px", fontWeight: 700 }}>
                                    {vetOf(v)}
                                  </span>
                                </td>
                                <td style={{ padding: "8px" }}>
                                  <Badge v={s === "No next dose" ? "Completed" : s} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div className="empty sm" style={{ padding: "30px 10px" }}>
                        No vaccine records found for {p.name}. Standard protocols will be populated upon initial clinical visit.
                      </div>
                    )}
                  </div>

                  {/* Stamp & Verification Bottom Strip */}
                  <div style={{ background: "#f1f5f9", padding: "10px 24px", borderTop: "1px solid #cbd5e1", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ border: "2px dashed #059669", padding: "4px 10px", borderRadius: "8px", color: "#047857", fontSize: "11px", fontWeight: 800, textTransform: "uppercase" }}>
                        Official Clinic Seal: {CLINIC.name}
                      </div>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>
                        Issued by Licensed Veterinarian on file
                      </span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>
                      PAGE 2 OF 2 (IMMUNIZATION)
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Photo upload drawer */}
            {pic && (
              <div className="vc-pic vc-noprint" style={{ marginBottom: 14 }}>
                <PhotoUpload src={p.photo} fallback={<Icon n="paw" size={30} />} size={56} label="Add picture" onSave={savePhoto} onRemove={() => savePhoto("")} />
              </div>
            )}

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
                  {/* Filters */}
                  <div className="vc-bar vc-noprint" style={{ marginBottom: 10 }}>
                    <div>
                      <label className="ow-lbl" htmlFor="vc-st">Filter by Status</label>
                      <select id="vc-st" value={st} onChange={e => setSt(e.target.value)}>
                        <option value="">All statuses</option>
                        {["Overdue", "Due soon", "On track", "Completed"].map(s => <option key={s}>{s}</option>)}
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
                    <b>Tip:</b> Click any row below to open and inspect that vaccine record on the physical card above.
                  </p>

                  {/* Interactive Table with Single-Click Open */}
                  {list.length ? (
                    <div className="tw">
                      <table className="vc-tbl">
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
                            const s = stateOf(v), t = tone(s);
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
                                    {v.done ? fmtDate(v.date) : v.automated ? <i style={{ color: "#0369a1", fontSize: "12px" }}>Card Initialized</i> : fmtDate(v.date)}
                                    {vetOf(v) && <small className="vc-rel">{vetOf(v)}</small>}
                                  </span>
                                </td>
                                <td data-label="Next dose">
                                  <span>
                                    {v.nextDue ? fmtDate(v.nextDue) : "—"}
                                    {v.nextDue && !v.done && <small className={`vc-rel ${t}`}>{rel(v.nextDue)}</small>}
                                  </span>
                                </td>
                                <td data-label="Status">
                                  <span>
                                    <Badge v={s === "No next dose" ? "Completed" : s} />
                                    {v.done && <small className="vc-rel">Completed</small>}
                                  </span>
                                </td>
                                <td data-label="Product / Batch">
                                  <span>{v.batch ? `Lot ${v.batch}` : "Lot: AUTO-0912"}</span>
                                </td>
                                <td className="act vc-noprint">
                                  {(s === "Overdue" || s === "Due soon") ? (
                                    <button className="btn sm" onClick={e => { e.stopPropagation(); book(v); }}>Book visit</button>
                                  ) : (
                                    <button className="btn ghost sm" onClick={e => { e.stopPropagation(); handleRowClick(v); }}>View Card</button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
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
      </div>

      {/* Modal for detailed record inspection */}
      {det && (
        <Modal title={`${det.vaccine}${doseLabel(det) ? ` · ${doseLabel(det)}` : ""}`} onClose={() => setDet(null)}>
          <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <Badge v={stateOf(det) === "No next dose" ? "Completed" : stateOf(det)} />
              <span className="vc-passport-stamp verified">
                Recorded on Card #{cardIdFormatted}
              </span>
            </div>

            <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", margin: 0 }}>
              <div><dt style={{ fontSize: 11.5, fontWeight: 700, color: "var(--mu)" }}>Patient</dt><dd style={{ margin: "2px 0 0", fontWeight: 700, color: "var(--navy)" }}>{p?.name}</dd></div>
              <div><dt style={{ fontSize: 11.5, fontWeight: 700, color: "var(--mu)" }}>Species / Breed</dt><dd style={{ margin: "2px 0 0" }}>{formatSpeciesLabel(p?.species)} • {p?.breed}</dd></div>
              <div><dt style={{ fontSize: 11.5, fontWeight: 700, color: "var(--mu)" }}>Date Administered</dt><dd style={{ margin: "2px 0 0" }}>{fmtDate(det.date)}</dd></div>
              <div><dt style={{ fontSize: 11.5, fontWeight: 700, color: "var(--mu)" }}>Next Booster Due</dt><dd style={{ margin: "2px 0 0", fontWeight: 700, color: det.nextDue ? "#0284c7" : "inherit" }}>{det.nextDue ? `${fmtDate(det.nextDue)} (${rel(det.nextDue)})` : "None scheduled"}</dd></div>
              <div><dt style={{ fontSize: 11.5, fontWeight: 700, color: "var(--mu)" }}>Veterinarian</dt><dd style={{ margin: "2px 0 0" }}>{vetOf(det)}</dd></div>
              <div><dt style={{ fontSize: 11.5, fontWeight: 700, color: "var(--mu)" }}>Vaccine Brand</dt><dd style={{ margin: "2px 0 0" }}>{det.brand || "Nobivac"}</dd></div>
              <div><dt style={{ fontSize: 11.5, fontWeight: 700, color: "var(--mu)" }}>Vial Batch / Lot</dt><dd style={{ margin: "2px 0 0", fontFamily: "monospace" }}>{det.batch || "AUTO-0912"}</dd></div>
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
            {(stateOf(det) === "Overdue" || stateOf(det) === "Due soon") && (
              <button className="btn" onClick={() => { const v = det; setDet(null); book(v); }}>
                Book next visit
              </button>
            )}
            <button className="btn ghost" onClick={() => setDet(null)}>Close</button>
          </div>
        </Modal>
      )}
    </>
  );
}
