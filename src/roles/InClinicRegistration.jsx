import { useState } from "react";
import { uid, TODAY, plus, addLog } from "../lib.jsx";
import { api } from "../api.js";
import { formatSpeciesLabel, computeAgeDetails, normalizeSpecies } from "../preventiveSchedule.js";
import {
  SPECIES,
  BREEDS_BY_SPECIES,
  PET_COLORS,
  RODENT_DENTAL_STATUS,
  NEUTERED,
  petText
} from "./owner/Pets.jsx";
import { useLive, Field, onlyDigitsPlus, onlyDecimal, petAge } from "./owner/ui.jsx";
import { User, PawPrint, QrCode, CheckCircle2, ArrowRight } from "lucide-react";

const getYesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};
const YESTERDAY = getYesterday();

const yearsBefore = (n) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
};
const OLDEST = yearsBefore(40);

const NAME_RE = /^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .'\-]*$/;
const LETTER_RE = /[A-Za-zÀ-ÿ]/;
const PH_MOBILE_RE = /^(09|\+639)\d{9}$/;
const DECIMAL_RE = /^(\d{1,3}(\.\d{1,2})?|\.\d{1,2})$/;

function validateWalkIn(v) {
  const e = {};

  // 1. Owner Name
  const oName = (v.ownerName || "").trim();
  if (!oName) e.ownerName = "Enter owner's full name";
  else if (oName.length < 2) e.ownerName = "Use at least 2 characters";
  else if (oName.length > 60) e.ownerName = "Keep name under 60 characters";
  else if (!/^[A-Za-zÀ-ÿ.'\- ]+$/.test(oName)) e.ownerName = "Letters, spaces, . ' - only";

  // 2. Mobile Phone (required, valid Philippine format)
  const rawPh = (v.phone || "").trim().replace(/[\s-]/g, "");
  if (!rawPh) e.phone = "Enter owner's mobile number";
  else if (!PH_MOBILE_RE.test(rawPh)) e.phone = "Use valid PH mobile: 09XXXXXXXXX or +639XXXXXXXXX";

  // 3. Email (optional, validated if present)
  const em = (v.email || "").trim();
  if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) e.email = "Enter a valid email address";

  // 4. Address (optional)
  const addr = (v.address || "").trim();
  if (addr && addr.length > 150) e.address = "Keep address under 150 characters";

  // 5. Pet Name
  const pName = (v.petName || "").trim();
  if (!pName) e.petName = "Enter pet's name";
  else if (pName.length < 2) e.petName = "Use at least 2 characters";
  else if (pName.length > 30) e.petName = "Keep name under 30 characters";
  else if (!NAME_RE.test(pName)) e.petName = "Start with a letter or number. Use letters, numbers and . ' - only";
  else if (!LETTER_RE.test(pName)) e.petName = "The name needs at least one letter";

  // 6. Species
  if (!v.species) e.species = "Select animal species classification";

  // 7. Other species details
  if (v.species && v.species.includes("Other")) {
    const o = (v.otherSpecies || "").trim();
    if (!o) e.otherSpecies = "Specify what kind of animal";
    else if (o.length < 2) e.otherSpecies = "Use at least 2 characters";
    else if (o.length > 30) e.otherSpecies = "Keep it under 30 characters";
    else if (!LETTER_RE.test(o)) e.otherSpecies = "Use words, not only numbers or symbols";
  }

  // 8. Breed
  const br = (v.breed || "").trim();
  if (br.length > 50) e.breed = "Keep breed under 50 characters";

  // 9. Sex
  if (!v.sex) e.sex = "Choose male or female";
  else if (!["Male", "Female"].includes(v.sex)) e.sex = "Pick one from the list";

  // 10. Birth date (Must be yesterday or earlier; never in the future)
  if (!v.birth) e.birth = "Enter the birth date (yesterday or earlier)";
  else if (isNaN(new Date(v.birth + "T00:00:00"))) e.birth = "Enter a valid birth date";
  else if (v.birth >= TODAY) e.birth = "Birth date cannot be today or in the future. Please select yesterday or earlier";
  else if (v.birth < OLDEST) e.birth = "That date is too far back. Check the year";

  // 11. Weight
  const wt = String(v.weight ?? "").trim();
  if (!wt) e.weight = "Enter patient weight in kg";
  else if (!DECIMAL_RE.test(wt)) e.weight = "Use numbers only, for example 5.5";
  else if (+wt < 0.05) e.weight = "Weight must be at least 0.05 kg";
  else if (+wt > 120) e.weight = "Weight cannot exceed 120 kg";

  // 12. Neutered
  if (!v.neutered) e.neutered = "Choose spayed/neutered status";

  // 13. Rodent Dental Occlusion
  if (v.species && v.species.includes("Rodent")) {
    if (!v.dentalOcclusion) e.dentalOcclusion = "Please select occlusion status";
  }

  // 14. Notes
  const notes = (v.notes || "").trim();
  if (notes.length > 200) e.notes = "Keep notes under 200 characters";

  // 15. Queue Reason
  if (v.addToQueue) {
    const r = (v.reason || "").trim();
    if (!r) e.reason = "Enter a reason for today's visit";
    else if (r.length < 3) e.reason = "Use at least 3 characters";
  }

  return e;
}

export default function InClinicRegistration({ db, setDb, me, onClose, onRegistered }) {
  const f = useLive(
    {
      // Owner details
      ownerName: "",
      phone: "",
      email: "",
      address: "",
      // Pet details
      petName: "",
      species: "Canine (Dog)",
      otherSpecies: "",
      breed: "Shih Tzu",
      customBreed: "",
      sex: "Male",
      birth: "2023-01-15",
      weight: "5.0",
      neutered: "No",
      color: "Brown / Chocolate",
      customColor: "",
      dentalOcclusion: "Normal / Aligned (Healthy Occlusion)",
      notes: "",
      // Queue / appointment option
      addToQueue: true,
      reason: "Walk-in Consultation & Routine Exam",
    },
    validateWalkIn
  );

  const { v } = f;
  const [loading, setLoading] = useState(false);
  const [successData, setSuccessData] = useState(null);

  const availableBreeds = BREEDS_BY_SPECIES[v.species] || [];
  const canonicalSpecies = normalizeSpecies(v.species);
  const showCustomBreed = v.species.includes("Other") || (v.breed && v.breed.startsWith("Other"));
  const showCustomColor = v.color && v.color.startsWith("Other");

  // Only calculate age when birth date is filled and has no validation error
  const petCalculatedAge = v.birth && !f.errs.birth ? petAge(v.birth) : "";
  const ageDetails = v.birth && !f.errs.birth ? computeAgeDetails(v.birth) : null;

  const handleSpeciesChange = (newSpecies) => {
    const breeds = BREEDS_BY_SPECIES[newSpecies] || [];
    f.patch({
      species: newSpecies,
      breed: breeds[0] || "Mixed Breed",
      customBreed: "",
      dentalOcclusion: newSpecies.includes("Rodent") ? "Normal / Aligned (Healthy Occlusion)" : ""
    });
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    f.submit();
    if (!f.valid) return;
    setLoading(true);

    const finalBreed = showCustomBreed && v.customBreed.trim() ? v.customBreed.trim() : v.breed;
    const finalColor = showCustomColor && v.customColor.trim() ? v.customColor.trim() : v.color;

    const payload = {
      ownerName: v.ownerName.trim(),
      phone: v.phone.trim(),
      email: v.email.trim() || `walkin_${Date.now()}@pawcare.ph`,
      address: v.address.trim() || "Caloocan City, Metro Manila",
      petName: v.petName.trim(),
      species: canonicalSpecies,
      speciesOther: v.species.includes("Other") ? v.otherSpecies.trim() : "",
      breed: finalBreed,
      sex: v.sex,
      birth: v.birth,
      weight: parseFloat(v.weight) || 5.0,
      color: finalColor,
      neutered: v.neutered,
      dentalOcclusion: canonicalSpecies === "Rodent" ? v.dentalOcclusion : "",
      notes: v.notes.trim(),
      addToQueue: v.addToQueue,
      reason: v.reason.trim(),
      actorName: me?.name || "Vet Assistant",
      actorRole: me?.role || "assistant"
    };

    let backendResult = null;
    try {
      backendResult = await api.post("/api/walk-in", payload);
    } catch (err) {
      console.warn("Backend walk-in registration fallback:", err);
    }

    const owner = backendResult?.owner || {
      id: "o_" + uid(),
      name: payload.ownerName,
      phone: payload.phone,
      email: payload.email,
      address: payload.address
    };

    const pet = backendResult?.pet || {
      id: "p_" + uid(),
      ownerId: owner.id,
      name: payload.petName,
      species: payload.species,
      breed: payload.breed,
      sex: payload.sex,
      birth: payload.birth,
      weight: payload.weight,
      color: payload.color,
      neutered: payload.neutered,
      vaccinationCardId: `VACC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      notes: payload.notes
    };

    const newVaccs = backendResult?.vaccs || [];
    const newAppt = backendResult?.appointment || (v.addToQueue ? {
      id: "a_" + uid(),
      petId: pet.id,
      vetId: "v1",
      date: TODAY,
      time: new Date().toLocaleTimeString("en-PH", { hour12: false, hour: "2-digit", minute: "2-digit" }),
      reason: payload.reason,
      status: "Checked-in",
      billingStatus: "Unbilled",
      amount: 600
    } : null);

    setDb(p => ({
      ...p,
      owners: [...(p.owners || []).filter(o => o.id !== owner.id), owner],
      pets: [...(p.pets || []).filter(pt => pt.id !== pet.id), pet],
      vacc: [...newVaccs, ...(p.vacc || [])],
      vaccs: [...newVaccs, ...(p.vaccs || [])],
      appts: newAppt ? [...(p.appts || []).filter(a => a.id !== newAppt.id), newAppt] : (p.appts || []),
      log: addLog(p, me, `Registered walk-in customer ${owner.name} and pet ${pet.name} (${pet.species}). Issued Digital Card #${pet.vaccinationCardId}.${newAppt ? " Patient checked into today's queue." : ""}`)
    }));

    setLoading(false);
    setSuccessData({ owner, pet, appt: newAppt });
    onRegistered && onRegistered(pet, owner);
  };

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()} style={{ zIndex: 1050, display: "grid", placeItems: "center", padding: "16px" }}>
      <div className="modal" style={{ width: "min(680px, 100%)", maxHeight: "94vh", overflowY: "auto", padding: "24px 28px" }}>
        
        {/* Modal Title */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid #f1f5f9", paddingBottom: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "24px" }}>📋</span>
            <div>
              <h3 style={{ margin: 0, color: "var(--navy)", fontSize: "1.3rem" }}>
                Walk-In Registration (Client &amp; Patient)
              </h3>
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                Front desk express intake with live validation and instant Digital Vaccination Card generation
              </span>
            </div>
          </div>
          <button type="button" className="btn sm ghost" onClick={onClose} style={{ fontSize: "16px", padding: "2px 8px" }}>✕</button>
        </div>

        {successData ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#dcfce7", color: "#166534", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
              <CheckCircle2 size={34} />
            </div>
            <h4 style={{ margin: "0 0 4px", fontSize: "19px", color: "var(--navy)" }}>
              {successData.pet.name} &amp; {successData.owner.name} Successfully Registered!
            </h4>
            <p style={{ margin: "0 0 16px", fontSize: "13.5px", color: "#475569" }}>
              Official Digital Vaccination Card <b style={{ color: "var(--navy)" }}>#{successData.pet.vaccinationCardId}</b> has been issued.
              {successData.appt && " Patient has been added to Today's Arrival Queue in Checked-in status!"}
            </p>

            {/* Walk-in Customer Digital Access Pass */}
            <div style={{ background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)", border: "1.5px solid #93c5fd", borderRadius: "14px", padding: "16px", marginBottom: "20px", textAlign: "left" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <b style={{ color: "#1e40af", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <QrCode size={18} /> Walk-in Pet Owner Portal Access Card
                </b>
                <span style={{ fontSize: "11px", background: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: "99px", fontWeight: 700 }}>
                  Instant Mobile Claim
                </span>
              </div>
              <p style={{ margin: "0 0 10px", fontSize: "12.5px", color: "#334155" }}>
                How walk-in customers access the system: Advise owner <b>{successData.owner.name}</b> to open their Pet Portal anytime on their phone using their contact number (<b>{successData.owner.phone}</b>) or email (<b>{successData.owner.email}</b>).
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#fff", padding: "8px 12px", borderRadius: "8px", border: "1px dashed #93c5fd" }}>
                <span style={{ fontSize: "18px" }}>📱</span>
                <span style={{ fontSize: "12px", color: "#1e3a8a", wordBreak: "break-all" }}>
                  Official Access Link: <b>{typeof window !== "undefined" ? window.location.origin : ""}/?phone={encodeURIComponent(successData.owner.phone)}</b>
                </span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
              <button className="btn sm ghost" onClick={() => window.print()}>🖨️ Print Access Slip</button>
              <button className="btn sm gold" onClick={onClose}>Done &amp; View in Queue</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {/* Section 1: Pet Owner Information */}
            <div style={{ background: "#f8fafc", padding: "14px 16px", borderRadius: "12px", marginBottom: "16px", border: "1px solid #e2e8f0" }}>
              <b style={{ display: "block", color: "var(--navy)", fontSize: "13.5px", marginBottom: "10px" }}>
                👤 1. Owner &amp; Client Contact Details
              </b>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <Field
                  id="ownerName"
                  label="Owner Full Name"
                  req
                  value={v.ownerName}
                  filter={petText}
                  filterMsg="Letters, spaces, . ' - only"
                  maxLen={60}
                  onChange={x => f.set("ownerName", x)}
                  onBlur={() => f.blur("ownerName")}
                  error={f.show("ownerName")}
                  valid={f.ok("ownerName")}
                  hint="e.g. Maria Santos"
                />

                <Field
                  id="phone"
                  label="Mobile Number"
                  req
                  type="tel"
                  value={v.phone}
                  filter={onlyDigitsPlus}
                  filterMsg="Numbers and + only"
                  maxLen={13}
                  onChange={x => f.set("phone", x)}
                  onBlur={() => f.blur("phone")}
                  error={f.show("phone")}
                  valid={f.ok("phone")}
                  hint="09XXXXXXXXX or +639XXXXXXXXX"
                />

                <Field
                  id="email"
                  label="Email (Optional)"
                  type="email"
                  value={v.email}
                  onChange={x => f.set("email", x)}
                  onBlur={() => f.blur("email")}
                  error={f.show("email")}
                  valid={f.ok("email")}
                  hint="Used for portal access & receipts"
                />

                <Field
                  id="address"
                  label="City / Address"
                  value={v.address}
                  filter={petText}
                  maxLen={150}
                  onChange={x => f.set("address", x)}
                  onBlur={() => f.blur("address")}
                  error={f.show("address")}
                  valid={f.ok("address")}
                  hint="e.g. Caloocan City"
                />
              </div>
            </div>

            {/* Section 2: Pet Clinical Registration */}
            <div style={{ background: "#f8fafc", padding: "14px 16px", borderRadius: "12px", marginBottom: "16px", border: "1px solid #e2e8f0" }}>
              <b style={{ display: "block", color: "var(--navy)", fontSize: "13.5px", marginBottom: "10px" }}>
                🐾 2. Patient Clinical Details (Species &amp; Life Stage)
              </b>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <Field
                  id="petName"
                  label="Pet Name"
                  req
                  value={v.petName}
                  filter={petText}
                  filterMsg="Letters, numbers and . ' - only"
                  maxLen={30}
                  onChange={x => f.set("petName", x)}
                  onBlur={() => f.blur("petName")}
                  error={f.show("petName")}
                  valid={f.ok("petName")}
                  hint="e.g. Toby, Bella, Mochi"
                />

                <Field
                  id="species"
                  label="Species Classification"
                  req
                  type="select"
                  value={v.species}
                  onChange={handleSpeciesChange}
                  onBlur={() => f.blur("species")}
                  options={SPECIES.map(s => [s, s])}
                  error={f.show("species")}
                  valid={f.ok("species")}
                  hint="VCMS Protocols v2.0"
                />

                {v.species.includes("Other") && (
                  <div style={{ gridColumn: "span 2" }}>
                    <Field
                      id="otherSpecies"
                      label="What kind of animal?"
                      req
                      value={v.otherSpecies}
                      filter={petText}
                      maxLen={30}
                      onChange={x => f.set("otherSpecies", x)}
                      onBlur={() => f.blur("otherSpecies")}
                      error={f.show("otherSpecies")}
                      valid={f.ok("otherSpecies")}
                      hint="e.g. Hedgehog, Sugar Glider, Bearded Dragon"
                    />
                  </div>
                )}

                {availableBreeds.length > 0 ? (
                  <Field
                    id="breed"
                    label={`${formatSpeciesLabel(v.species)} Breed`}
                    type="select"
                    value={v.breed}
                    onChange={x => f.set("breed", x)}
                    onBlur={() => f.blur("breed")}
                    options={availableBreeds.map(b => [b, b])}
                    error={f.show("breed")}
                    valid={f.ok("breed")}
                    hint="Select breed or Other/Mixed"
                  />
                ) : (
                  <Field
                    id="breed-text"
                    label="Breed"
                    value={v.breed}
                    filter={petText}
                    maxLen={50}
                    onChange={x => f.set("breed", x)}
                    onBlur={() => f.blur("breed")}
                    error={f.show("breed")}
                    valid={f.ok("breed")}
                    hint="e.g. Mixed / Domestic"
                  />
                )}

                {showCustomBreed && (
                  <Field
                    id="customBreed"
                    label="Specific Breed / Mix Details"
                    value={v.customBreed}
                    filter={petText}
                    maxLen={50}
                    onChange={x => f.set("customBreed", x)}
                    onBlur={() => f.blur("customBreed")}
                    error={f.show("customBreed")}
                    valid={f.ok("customBreed")}
                    hint="Type custom breed name"
                  />
                )}

                <Field
                  id="sex"
                  label="Sex"
                  req
                  type="select"
                  value={v.sex}
                  onChange={x => f.set("sex", x)}
                  onBlur={() => f.blur("sex")}
                  options={[["Male", "Male"], ["Female", "Female"]]}
                  error={f.show("sex")}
                  valid={f.ok("sex")}
                />

                <div>
                  <Field
                    id="birth"
                    label="Birth Date"
                    req
                    type="date"
                    maxDate={YESTERDAY}
                    min={OLDEST}
                    value={v.birth}
                    onChange={x => f.set("birth", x)}
                    onBlur={() => f.blur("birth")}
                    error={f.show("birth")}
                    valid={f.ok("birth")}
                    hint="Yesterday or earlier"
                  />
                  {ageDetails && (
                    <div style={{ fontSize: "11px", color: "#1e3a8a", background: "#eff6ff", border: "1px solid #bfdbfe", padding: "4px 8px", borderRadius: "6px", marginTop: "4px", fontWeight: 700 }}>
                      🐾 Calculated Age: {petCalculatedAge} ({ageDetails.lifeStageLabel})
                    </div>
                  )}
                </div>

                <Field
                  id="weight"
                  label="Weight (kg)"
                  req
                  value={v.weight}
                  filter={onlyDecimal}
                  filterMsg="Numbers only, with one decimal point"
                  inputMode="decimal"
                  onChange={x => f.set("weight", x)}
                  onBlur={() => f.blur("weight")}
                  error={f.show("weight")}
                  valid={f.ok("weight")}
                  hint="e.g. 5.5"
                />

                <Field
                  id="neutered"
                  label="Spayed or Neutered?"
                  req
                  type="select"
                  value={v.neutered}
                  onChange={x => f.set("neutered", x)}
                  onBlur={() => f.blur("neutered")}
                  options={NEUTERED.map(s => [s, s])}
                  error={f.show("neutered")}
                  valid={f.ok("neutered")}
                />

                <Field
                  id="color"
                  label="Color / Coat Pattern"
                  type="select"
                  value={v.color}
                  onChange={x => f.set("color", x)}
                  onBlur={() => f.blur("color")}
                  options={PET_COLORS.map(c => [c, c])}
                  error={f.show("color")}
                  valid={f.ok("color")}
                />

                {showCustomColor && (
                  <Field
                    id="customColor"
                    label="Specific Color / Markings"
                    value={v.customColor}
                    filter={petText}
                    maxLen={40}
                    onChange={x => f.set("customColor", x)}
                    onBlur={() => f.blur("customColor")}
                    error={f.show("customColor")}
                    valid={f.ok("customColor")}
                    hint="Describe unique markings"
                  />
                )}

                {canonicalSpecies === "Rodent" && (
                  <div style={{ gridColumn: "span 2" }}>
                    <Field
                      id="dentalOcclusion"
                      label="Dental / Occlusion Status (Rodent Protocol)"
                      req
                      type="select"
                      value={v.dentalOcclusion}
                      onChange={x => f.set("dentalOcclusion", x)}
                      onBlur={() => f.blur("dentalOcclusion")}
                      options={RODENT_DENTAL_STATUS.map(s => [s, s])}
                      error={f.show("dentalOcclusion")}
                      valid={f.ok("dentalOcclusion")}
                    />
                  </div>
                )}

                <div style={{ gridColumn: "span 2" }}>
                  <Field
                    id="notes"
                    label="Clinical Notes (Optional)"
                    type="textarea"
                    rows={2}
                    max={200}
                    value={v.notes}
                    filter={petText}
                    onChange={x => f.set("notes", x)}
                    onBlur={() => f.blur("notes")}
                    error={f.show("notes")}
                    valid={f.ok("notes")}
                    hint="Allergies, temperament, or previous treatments"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Add to Doctor Arrival Queue */}
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "12px 16px", borderRadius: "10px", marginBottom: "16px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 700, color: "var(--navy)", fontSize: "13px" }}>
                <input
                  type="checkbox"
                  checked={v.addToQueue}
                  onChange={e => f.set("addToQueue", e.target.checked)}
                />
                Add directly to Today&rsquo;s Arrival Queue (Status: Checked-in)
              </label>

              {v.addToQueue && (
                <div style={{ marginTop: "10px" }}>
                  <Field
                    id="reason"
                    label="Arrival / Visit Reason"
                    req
                    value={v.reason}
                    filter={petText}
                    maxLen={100}
                    onChange={x => f.set("reason", x)}
                    onBlur={() => f.blur("reason")}
                    error={f.show("reason")}
                    valid={f.ok("reason")}
                    hint="e.g. Walk-in Consultation & Routine Exam, Vaccination Booster"
                  />
                </div>
              )}
            </div>

            {f.submitted && !f.valid && (
              <p className="err" role="alert" style={{ marginBottom: "12px" }}>
                Please check the form. There {f.count === 1 ? "is 1 required field or correction" : `are ${f.count} required fields or corrections`} above.
              </p>
            )}

            {/* Actions */}
            <div className="row end" style={{ gap: "10px" }}>
              <button type="button" className="btn ghost sm" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn gold" disabled={loading} style={{ fontWeight: 700 }}>
                {loading ? "Registering & Issuing Card..." : "✓ Register & Issue Vaccination Card"}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
