import { useRef, useState } from "react";
import { addLog } from "../lib.jsx";
import { walkInBirthWindow, validWalkInBirth, savedWalkInRegistration } from "../walkInRegistration.js";
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
import { CheckCircle2, ClipboardList, Printer, X } from "lucide-react";

const NAME_RE = /^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .'\-]*$/;
const LETTER_RE = /[A-Za-zÀ-ÿ]/;
const PH_MOBILE_RE = /^(09|\+639)\d{9}$/;
const DECIMAL_RE = /^(\d{1,3}(\.\d{1,2})?|\.\d{1,2})$/;

function validateWalkIn(v) {
  const {today:TODAY,oldest:OLDEST} = walkInBirthWindow();
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
  else if (!validWalkInBirth(v.birth)) e.birth = "Enter a valid birth date";
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

export default function InClinicRegistration({ db, setDb, me, onClose, onRegistered, existingOwner }) {
  const {yesterday:YESTERDAY,oldest:OLDEST} = walkInBirthWindow();
  const inFlight = useRef(false);
  const f = useLive(
    {
      // Owner details
      ownerName: existingOwner?.name || "",
      phone: existingOwner?.phone || "",
      email: existingOwner?.email || "",
      address: existingOwner?.address || "",
      // Pet details
      petName: "",
      species: "",
      otherSpecies: "",
      breed: "",
      customBreed: "",
      sex: "",
      birth: "",
      weight: "",
      neutered: "Not sure",
      color: "",
      customColor: "",
      dentalOcclusion: "Not Evaluated Yet",
      notes: "",
      // Queue / appointment option
      addToQueue: true,
      reason: "Walk-in Consultation & Routine Exam",
    },
    validateWalkIn
  );

  const { v } = f;
  const [vetId, setVetId] = useState(db.vets?.[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [successData, setSuccessData] = useState(null);

  // Clinical service needed today & prior history guide states
  const [serviceCategory, setServiceCategory] = useState("consultation");
  const [specificVaccine, setSpecificVaccine] = useState("DHPP (5-in-1 Core Vaccine)");
  const [hasExternalHistory, setHasExternalHistory] = useState(false);
  const [priorVaccines, setPriorVaccines] = useState([]);
  const [externalClinicNotes, setExternalClinicNotes] = useState("");

  const availableBreeds = BREEDS_BY_SPECIES[v.species] || [];
  const canonicalSpecies = normalizeSpecies(v.species);
  const showCustomBreed = v.species.includes("Other") || (v.breed && v.breed.startsWith("Other"));
  const showCustomColor = v.color && v.color.startsWith("Other");

  // Only calculate age when birth date is filled and has no validation error
  const petCalculatedAge = v.birth && !f.errs.birth ? petAge(v.birth) : "";
  const ageDetails = v.birth && !f.errs.birth ? computeAgeDetails(v.birth) : null;

  const handleSpeciesChange = (newSpecies) => {
    f.patch({
      species: newSpecies,
      breed: "",
      customBreed: "",
      dentalOcclusion: newSpecies.includes("Rodent") ? "Not Evaluated Yet" : ""
    });
    const norm = normalizeSpecies(newSpecies);
    if (norm === "Feline") {
      setSpecificVaccine("FVRCP (4-in-1 Feline Core)");
    } else {
      setSpecificVaccine("DHPP (5-in-1 Core Vaccine)");
    }
  };

  const handleServiceChange = (cat) => {
    setServiceCategory(cat);
    if (cat === "consultation") {
      f.set("reason", "Walk-in Consultation & Routine Exam");
    } else if (cat === "vaccination") {
      f.set("reason", `Vaccination: ${specificVaccine}`);
    } else if (cat === "deworming") {
      f.set("reason", "Routine Deworming (Parasiticide)");
    } else if (cat === "flea_tick") {
      f.set("reason", "Monthly Flea & Tick Prevention Chewable");
    } else if (cat === "grooming") {
      f.set("reason", "Grooming & Sanitary Care");
    } else if (cat === "emergency") {
      f.set("reason", "Urgent / Emergency Clinical Triage");
    }
  };

  const handleVaccineChange = (vac) => {
    setSpecificVaccine(vac);
    if (serviceCategory === "vaccination") {
      f.set("reason", `Vaccination: ${vac}`);
    }
  };

  const togglePriorVaccine = (vacName) => {
    setPriorVaccines(prev => 
      prev.includes(vacName) ? prev.filter(x => x !== vacName) : [...prev, vacName]
    );
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (inFlight.current) return;
    setSaveError("");
    f.submit();
    if (!f.valid) return;
    if (v.addToQueue && !vetId) { setSaveError("Choose a veterinarian before adding today’s arrival."); return; }
    inFlight.current = true;
    setLoading(true);

    const finalBreed = showCustomBreed && v.customBreed.trim() ? v.customBreed.trim() : v.breed;
    const finalColor = showCustomColor && v.customColor.trim() ? v.customColor.trim() : v.color;

    const payload = {
      ownerName: v.ownerName.trim(),
      phone: v.phone.trim(),
      email: v.email.trim(),
      address: v.address.trim(),
      petName: v.petName.trim(),
      species: canonicalSpecies,
      speciesOther: v.species.includes("Other") ? v.otherSpecies.trim() : "",
      breed: finalBreed,
      sex: v.sex,
      birth: v.birth,
      weight: Number(v.weight),
      color: finalColor,
      neutered: v.neutered,
      dentalOcclusion: canonicalSpecies === "Rodent" ? v.dentalOcclusion : "",
      notes: v.notes.trim(),
      addToQueue: v.addToQueue,
      vetId,
      reason: v.reason.trim(),
      actorName: me?.name || "Vet Assistant",
      actorRole: me?.role || "assistant",
      ownerId: existingOwner?.id || "",
      serviceCategory,
      specificVaccine,
      priorVaccines: hasExternalHistory ? priorVaccines : [],
      externalClinicNotes: hasExternalHistory ? externalClinicNotes.trim() : ""
    };

    let backendResult = null;
    try {
      backendResult = savedWalkInRegistration(await api.post("/api/walk-in", payload));
    } catch (err) {
      setSaveError(err.message);
      inFlight.current = false;
      setLoading(false);
      return;
    }

    const {owner,pet,vacc:newVaccs,appointment:newAppt} = backendResult;

    setDb(p => ({
      ...p,
      owners: [...(p.owners || []).filter(o => o.id !== owner.id), owner],
      pets: [...(p.pets || []).filter(pt => pt.id !== pet.id), pet],
      vacc: [...newVaccs, ...(p.vacc || [])],
      vaccs: [...newVaccs, ...(p.vaccs || [])],
      appts: newAppt ? [...(p.appts || []).filter(a => a.id !== newAppt.id), newAppt] : (p.appts || []),
      log: addLog(p, me, `Registered walk-in customer ${owner.name} and pet ${pet.name} (${pet.species}). Issued Digital Card #${pet.vaccinationCardId}.${newAppt ? " Arrival created; intake vitals required." : ""}`)
    }));

    inFlight.current = false;
    setLoading(false);
    setSuccessData({ owner, pet, appt: newAppt });
    onRegistered && onRegistered(pet, owner, newAppt);
  };

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()} style={{ zIndex: 1050, display: "grid", placeItems: "center", padding: "16px" }}>
      <div className="modal" style={{ width: "min(680px, 100%)", maxHeight: "94vh", overflowY: "auto", padding: "24px 28px" }}>
        
        {/* Modal Title */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid #f1f5f9", paddingBottom: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <ClipboardList size={24} color="var(--navy)" />
            <div>
              <h3 style={{ margin: 0, color: "var(--navy)", fontSize: "1.3rem" }}>
                {existingOwner ? `Add New Pet for ${existingOwner.name}` : "Walk-In Registration (Client & Patient)"}
              </h3>
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                {existingOwner ? "Add and link a new animal patient to this verified client account" : "Front desk express intake with live validation and instant Digital Vaccination Card generation"}
              </span>
            </div>
          </div>
          <button type="button" className="btn sm ghost" onClick={onClose} aria-label="Close" style={{ padding: "6px 10px" }}><X size={16} aria-hidden="true" /></button>
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
              {successData.appt && " Arrival created. Record current vitals to complete check-in."}
            </p>

            <section className="ow-note" style={{textAlign:"left",marginBottom:20}}>
              <h4>Owner registration summary</h4>
              <p>{successData.owner.name} · Phone: {successData.owner.phone || "Not recorded"} · Email: {successData.owner.email || "Not recorded"}</p>
              <p>This slip does not provide sign-in access. Owners with a verified account should sign in normally. If this pet does not appear, ask the clinic to check the owner record.</p>
            </section>

            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "12px" }}>
              <button className="btn sm ghost" onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Printer size={15} /> Print registration slip
              </button>
              <button className="btn sm gold" onClick={onClose}>{successData.appt ? "Done · Continue to intake" : "Done"}</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {/* Section 1: Pet Owner Information */}
            {existingOwner ? (
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "14px 16px", borderRadius: "12px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Registered Client &amp; Household
                  </div>
                  <b style={{ fontSize: "16px", color: "var(--navy)" }}>{existingOwner.name}</b>
                  <div style={{ fontSize: "12.5px", color: "#475569", marginTop: "3px" }}>
                    <span>Phone: {existingOwner.phone || "No phone"}</span> &bull; <span>Email: {existingOwner.email || "No email"}</span>
                    {existingOwner.address && <span> &bull; Address: {existingOwner.address}</span>}
                  </div>
                </div>
                <span style={{ background: "#dbeafe", color: "#1e40af", padding: "5px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 700 }}>
                  Existing Client
                </span>
              </div>
            ) : (
              <div style={{ background: "#f8fafc", padding: "14px 16px", borderRadius: "12px", marginBottom: "16px", border: "1px solid #e2e8f0" }}>
                <b style={{ display: "block", color: "var(--navy)", fontSize: "13.5px", marginBottom: "10px" }}>
                  1. Owner &amp; Client Contact Details
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
                    hint="Optional contact email"
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
            )}

            {/* Section 2: Pet Clinical Registration */}
            <div style={{ background: "#f8fafc", padding: "14px 16px", borderRadius: "12px", marginBottom: "16px", border: "1px solid #e2e8f0" }}>
              <b style={{ display: "block", color: "var(--navy)", fontSize: "13.5px", marginBottom: "10px" }}>
                2. Patient Clinical Details (Species &amp; Life Stage)
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
                  hint="Choose the patient’s species"
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
                      Calculated Age: {petCalculatedAge} ({ageDetails.lifeStageLabel})
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

            {/* Section 3: Today's Clinical Purpose & Arrival Queue */}
            <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", padding: "14px 16px", borderRadius: "12px", marginBottom: "16px" }}>
              <b style={{ display: "block", color: "var(--navy)", fontSize: "13.5px", marginBottom: "8px" }}>
                3. Today&rsquo;s Visit Purpose &amp; Queue Admission
              </b>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 700, color: "var(--navy)", fontSize: "13px", marginBottom: "12px" }}>
                <input
                  type="checkbox"
                  checked={v.addToQueue}
                  onChange={e => f.set("addToQueue", e.target.checked)}
                />
                Create today’s arrival and continue to vitals
              </label>

              {v.addToQueue && (
                <div style={{ display: "grid", gap: "10px" }}>
                  <label>Attending veterinarian
                    <select value={vetId} onChange={e => setVetId(e.target.value)} required>
                      <option value="">Choose a veterinarian</option>
                      {(db.vets || []).map(vet => <option key={vet.id} value={vet.id}>{vet.name}</option>)}
                    </select>
                  </label>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#1e3a8a", marginBottom: "4px" }}>
                      What does the patient need today? *
                    </label>
                    <select
                      value={serviceCategory}
                      onChange={e => handleServiceChange(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", fontSize: "13px", borderRadius: "8px", border: "1.5px solid #93c5fd", fontWeight: 600, background: "#fff" }}
                    >
                      <option value="consultation">General Consultation &amp; Routine Check-up</option>
                      <option value="vaccination">Vaccination / Immunization Booster</option>
                      <option value="deworming">Routine Deworming (Parasiticide)</option>
                      <option value="flea_tick">Flea, Tick &amp; Heartworm Prevention</option>
                      <option value="grooming">Grooming &amp; Sanitary Care</option>
                      <option value="emergency">Urgent / Emergency Clinical Triage</option>
                    </select>
                  </div>

                  {serviceCategory === "vaccination" && (
                    <div style={{ background: "#fff", padding: "10px 12px", borderRadius: "8px", border: "1.5px solid #60a5fa" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#1e40af", marginBottom: "4px" }}>
                        Select Specific Vaccine Needed Today: *
                      </label>
                      <select
                        value={specificVaccine}
                        onChange={e => handleVaccineChange(e.target.value)}
                        style={{ width: "100%", padding: "7px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid #93c5fd", fontWeight: 600 }}
                      >
                        {canonicalSpecies === "Canine" ? (
                          <>
                            <option value="DHPP (5-in-1 Core Vaccine)">DHPP (5-in-1 Core Vaccine - Standard)</option>
                            <option value="Anti-Rabies (RA 9482 Compliance)">Anti-Rabies (Mandatory Core RA 9482)</option>
                            <option value="6-in-1 Core Combination">6-in-1 Core Combination Vaccine</option>
                            <option value="Bordetella (Kennel Cough Prophylaxis)">Bordetella (Kennel Cough Prophylaxis)</option>
                            <option value="Puppy DHPP Dose 1">Puppy Foundation DHPP Dose 1</option>
                            <option value="Puppy DHPP Dose 2">Puppy Foundation DHPP Dose 2</option>
                            <option value="Puppy DHPP Dose 3">Puppy Foundation DHPP Dose 3</option>
                            <option value="Annual 5-in-1 Core Booster">Annual 5-in-1 Adult Core Booster</option>
                          </>
                        ) : canonicalSpecies === "Feline" ? (
                          <>
                            <option value="FVRCP (4-in-1 Feline Core)">FVRCP (4-in-1 Feline Core)</option>
                            <option value="Anti-Rabies (1-Year Feline Core)">Anti-Rabies (1-Year Feline Core)</option>
                            <option value="Feline Leukemia (FeLV)">Feline Leukemia (FeLV)</option>
                            <option value="FVRCP Dose 1">FVRCP Dose 1 (Kitten Foundation)</option>
                            <option value="FVRCP Dose 2">FVRCP Dose 2 (Kitten Foundation)</option>
                            <option value="FVRCP Annual Booster">FVRCP Annual Adult Booster</option>
                          </>
                        ) : (
                          <>
                            <option value="Routine Preventive Care">Species-Specific Routine Preventive</option>
                            <option value="General Health Consultation">General Health Consultation &amp; Care</option>
                          </>
                        )}
                      </select>
                      <small style={{ color: "#0369a1", display: "block", marginTop: "4px", fontSize: "11.5px" }}>
                        This will be set as today&rsquo;s clinical visit reason for the veterinarian to examine and administer.
                      </small>
                    </div>
                  )}

                  <Field
                    id="reason"
                    label="Arrival Reason for Queue &amp; Doctor Notes"
                    req
                    value={v.reason}
                    filter={petText}
                    maxLen={100}
                    onChange={x => f.set("reason", x)}
                    onBlur={() => f.blur("reason")}
                    error={f.show("reason")}
                    valid={f.ok("reason")}
                    hint="Auto-filled from service selection; feel free to customize"
                  />
                </div>
              )}
            </div>

            {/* Section 4: Prior Vaccines from Other Vets (Clinical Guide & Schedule Calibrator) */}
            <div style={{ background: "#fefce8", border: "1.5px solid #fde047", padding: "14px 16px", borderRadius: "12px", marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                <div>
                  <b style={{ color: "#854d0e", fontSize: "13.5px", display: "flex", alignItems: "center", gap: "6px" }}>
                    4. Prior Vaccinations from Previous Vet Clinics (Reference Guide)
                  </b>
                  <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#713f12" }}>
                    Since records from external clinics are not automatically transferred, record past shots here as a clinical guide to calibrate the upcoming schedule.
                  </p>
                </div>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 700, color: "#854d0e", fontSize: "13px", marginTop: "8px" }}>
                <input
                  type="checkbox"
                  checked={hasExternalHistory}
                  onChange={e => {
                    setHasExternalHistory(e.target.checked);
                    if (!e.target.checked) setPriorVaccines([]);
                  }}
                />
                This pet received prior vaccinations or deworming at another clinic
              </label>

              {hasExternalHistory && (
                <div style={{ marginTop: "12px", background: "#fff", padding: "12px", borderRadius: "10px", border: "1px solid #fef08a" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#854d0e", marginBottom: "8px" }}>
                    Select vaccines already given by previous veterinarians:
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                    {(canonicalSpecies === "Canine" ? [
                      "Puppy Dose 1 (5-in-1)",
                      "Puppy Dose 2 (5-in-1)",
                      "Puppy Dose 3 (5-in-1)",
                      "Completed Puppyhood Series (Adult)",
                      "Anti-Rabies Vaccine",
                      "Kennel Cough (Bordetella)",
                      "Prior Deworming",
                      "Prior Flea & Tick Preventative"
                    ] : canonicalSpecies === "Feline" ? [
                      "FVRCP 4-in-1 Dose 1",
                      "FVRCP 4-in-1 Dose 2",
                      "Anti-Rabies Vaccine",
                      "Prior Deworming",
                      "Prior Flea & Tick Preventative"
                    ] : [
                      "Prior Parasite Clearance",
                      "Prior Prophylactic Injection"
                    ]).map(item => {
                      const isChecked = priorVaccines.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => togglePriorVaccine(item)}
                          style={{
                            padding: "5px 10px",
                            fontSize: "12px",
                            borderRadius: "6px",
                            border: isChecked ? "1.5px solid #d97706" : "1px solid #cbd5e1",
                            background: isChecked ? "#fef3c7" : "#f8fafc",
                            color: isChecked ? "#92400e" : "#334155",
                            fontWeight: isChecked ? 700 : 500,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            transition: "all 0.15s ease"
                          }}
                        >
                          <span>{isChecked ? "Selected" : "+"}</span>
                          <span>{item}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: "8px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                      Previous Clinic Name &amp; External Notes (Optional):
                    </label>
                    <input
                      type="text"
                      value={externalClinicNotes}
                      onChange={e => setExternalClinicNotes(e.target.value)}
                      placeholder="e.g. Previous vet clinic name, date of last rabies, booklet presented..."
                      style={{ width: "100%", padding: "7px 10px", fontSize: "12.5px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                    />
                  </div>

                  <div style={{ marginTop: "10px", padding: "8px 10px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px", fontSize: "11.5px", color: "#166534" }}>
                    <b>Smart Pre-Scheduling Active:</b> Selected previous shots will be saved with an &ldquo;External Clinic (Guide)&rdquo; badge on Page 2 of the Digital Card. Suggested protocols still require veterinarian review; these entries do not certify doses or approve booster dates.
                  </div>
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
              {saveError && <p className="err" role="alert">{saveError}</p>}
              <button type="submit" className="btn gold" disabled={loading} style={{ fontWeight: 700 }}>
                {loading ? "Registering & Issuing Card..." : "Register & Issue Vaccination Card"}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
