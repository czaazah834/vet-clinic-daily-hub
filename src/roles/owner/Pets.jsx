import { useState } from "react";
import { TODAY, scope, uid, addLog, dueState } from "../../lib.jsx";
import { useLive, Field, Modal, petAge, fmt12, onlyDecimal, Icon } from "./ui.jsx";

/* ---------- validation rules for the Add-pet form ---------- */
/* Rules for the "Add my pet" form. Plain JS with no React, so the same file can move to the Node server later. */
export const SPECIES = ["Dog", "Cat", "Rabbit", "Bird", "Other"];
export const NEUTERED = ["Yes", "No", "Not sure"];
export const MAX_PETS = 10;      // approved pets + requests on one account
export const MAX_PENDING = 3;    // requests waiting for the clinic at one time
export const MAX_NOTES = 200;

export const BREEDS_BY_SPECIES = {
  Dog: [
    "Aspin (Philippine Native Dog)",
    "Shih Tzu",
    "Pomeranian",
    "Golden Retriever",
    "Labrador Retriever",
    "Siberian Husky",
    "Poodle (Toy / Standard)",
    "French Bulldog",
    "German Shepherd",
    "Beagle",
    "Pug",
    "Chihuahua",
    "Pembroke Welsh Corgi",
    "Rottweiler",
    "Chow Chow",
    "Doberman Pinscher",
    "Belgian Malinois",
    "Yorkshire Terrier",
    "Boxer",
    "Dachshund",
    "Alaskan Malamute",
    "Samoyed",
    "Maltese",
    "Jack Russell Terrier",
    "Other / Mixed (type your own)"
  ],
  Cat: [
    "Puspin (Philippine Domestic Short Hair)",
    "Persian",
    "Siamese",
    "British Shorthair",
    "Maine Coon",
    "Bengal",
    "Ragdoll",
    "Scottish Fold",
    "Russian Blue",
    "Sphynx",
    "American Shorthair",
    "Abyssinian",
    "Birman",
    "Himalayan",
    "Other / Mixed (type your own)"
  ],
  Rabbit: [
    "Netherland Dwarf",
    "Holland Lop",
    "Mini Rex",
    "Lionhead",
    "Flemish Giant",
    "Angora",
    "Dutch Rabbit",
    "Mini Lop",
    "English Spot",
    "Other / Mixed (type your own)"
  ],
  Bird: [
    "Parakeet / Budgerigar (Budgie)",
    "Cockatiel",
    "Lovebird (Agapornis)",
    "African Grey Parrot",
    "Canary",
    "Zebra Finch",
    "Green-cheeked Conure",
    "Sun Conure",
    "Cockatoo",
    "Macaw",
    "Monk Parakeet (Quaker)",
    "Ringneck Parakeet",
    "Dove / Pigeon",
    "Other (type your own)"
  ],
  Other: [
    "Hamster (Syrian / Dwarf)",
    "Guinea Pig",
    "Ferret",
    "Hedgehog",
    "Sugar Glider",
    "Red-eared Slider Turtle",
    "Other (type your own)"
  ]
};

export const GUIDANCE_BY_SPECIES = {
  Dog: "🐶 Dog Health Guidance: Core puppy vaccinations (5-in-1 / DHPP) start at 6–8 weeks, with Rabies at 3+ months. Monthly preventative deworming and tick/flea prevention are recommended.",
  Cat: "🐱 Cat Health Guidance: Feline 4-in-1 (FVRCP) starts at 8 weeks, with Rabies at 3+ months. Annual check-ups and preventative parasite care are strongly advised.",
  Rabbit: "🐰 Rabbit Care Guidance: Fresh high-fiber grass hay (Timothy/Orchard) should make up 80%+ of daily food. Regular dental checks and preventative care keep rabbits healthy.",
  Bird: "🦜 Avian Care Guidance: Birds require clean, well-ventilated air away from aerosols and non-stick cookware fumes. Annual wellness exams help detect hidden issues.",
  Other: "🐾 Companion Pet Guidance: Exotic and small pets thrive with species-tailored nutrition and regular preventative check-ups."
};

const getYesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};
export const YESTERDAY = getYesterday();

const LETTER = /[A-Za-zÀ-ÿ]/;
const NAME_RE = /^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .'\-]*$/;
const DECIMAL = /^(\d{1,3}(\.\d{1,2})?|\.\d{1,2})$/;

/* Typing guard for free text: drops characters that don't belong. */
export const petText = s => s.replace(/[^A-Za-zÀ-ÿ0-9 .,'\-\/()]/g, "").replace(/^\s+/, "").replace(/\s{2,}/g, " ");

const yearsBefore = (n) => { const d = new Date(TODAY + "T00:00:00"); d.setFullYear(d.getFullYear() - n); return d.toISOString().slice(0, 10); };
export const OLDEST = yearsBefore(40);

/* v = form values, taken = lower-case names this owner already has (pets and requests). Returns { field: message }. */
export function validatePet(v, taken = []) {
  const e = {}, name = v.name.trim();
  if (!name) e.name = "Enter your pet’s name";
  else if (name.length < 2) e.name = "Use at least 2 characters";
  else if (name.length > 30) e.name = "Keep the name under 30 characters";
  else if (!NAME_RE.test(name)) e.name = "Start with a letter or number. Use letters, numbers and . ' - only";
  else if (!LETTER.test(name)) e.name = "The name needs at least one letter";
  else if (taken.includes(name.toLowerCase())) e.name = `You already have a pet named ${name}`;

  if (!v.species) e.species = "Choose the kind of animal";
  else if (!SPECIES.includes(v.species)) e.species = "Pick one from the list";
  else if (v.species === "Other") {
    const o = v.other.trim();
    if (!o) e.other = "Tell us what kind of animal it is";
    else if (o.length < 3) e.other = "Use at least 3 characters";
    else if (o.length > 30) e.other = "Keep it under 30 characters";
    else if (!LETTER.test(o)) e.other = "Use words, not only numbers or symbols";
  }

  const br = v.breed.trim();
  if (br.length > 50) e.breed = "Keep the breed under 50 characters";
  else if (br && !LETTER.test(br)) e.breed = "Use words, not only numbers or symbols";

  if (!v.sex) e.sex = "Choose male or female";
  else if (!["Male", "Female"].includes(v.sex)) e.sex = "Pick one from the list";

  if (!v.birth) e.birth = "Enter the birth date (yesterday or earlier)";
  else if (isNaN(new Date(v.birth + "T00:00:00"))) e.birth = "Enter a valid date";
  else if (v.birth >= TODAY) e.birth = "Birth date cannot be today or in the future. Please select yesterday or earlier";
  else if (v.birth < OLDEST) e.birth = "That date is too far back. Check the year";

  if (v.weight === "") e.weight = "Enter your pet’s weight in kg";
  else if (!DECIMAL.test(v.weight)) e.weight = "Use numbers only, for example 4.5";
  else if (+v.weight < 0.05) e.weight = "Weight must be at least 0.05 kg";
  else if (+v.weight > 120) e.weight = "Weight can’t be more than 120 kg";

  if (!v.neutered) e.neutered = "Choose one";
  else if (!NEUTERED.includes(v.neutered)) e.neutered = "Pick one from the list";

  const c = v.color.trim();
  if (c.length > 40) e.color = "Keep it under 40 characters";
  else if (c && !LETTER.test(c)) e.color = "Use words, not only numbers or symbols";

  const n = v.notes.trim();
  if (n.length > MAX_NOTES) e.notes = `Keep notes under ${MAX_NOTES} characters`;
  else if (n && !LETTER.test(n)) e.notes = "Write a few words, not only numbers or symbols";
  return e;
}


/* Requests an owner sends to the clinic for a new pet. They live in db.petRequests until the front desk reviews them.
   No database yet: this is the same in-memory db the other owner pages use. */
export const myRequests = (db, me) => (db.petRequests || []).filter(r => r.ownerId === me.ownerId);

/* Returns a sentence when the owner can't add another pet right now, or "" when they can. */
export const addBlock = (db, me) => {
  const have = scope(db, me, "pets").length, reqs = myRequests(db, me);
  if (have + reqs.length >= MAX_PETS) return `One account can hold up to ${MAX_PETS} pets`;
  if (reqs.filter(r => r.status === "Pending").length >= MAX_PENDING) return `${MAX_PENDING} requests are already waiting for the clinic. Wait for a reply before adding more`;
  return "";
};
const kind = p => (p.species === "Other" && p.speciesOther) ? p.speciesOther : p.species;

/* ---------- Add / edit a pet request ---------- */
export function PetFormModal({ db, setDb, me, say, editing, onClose }) {
  const e0 = editing || {};
  const taken = [...scope(db, me, "pets"), ...myRequests(db, me).filter(r => !editing || r.id !== editing.id)].map(p => p.name.trim().toLowerCase());
  const f = useLive({ name: e0.name || "", species: e0.species || "", other: e0.speciesOther || "", breed: e0.breed || "", sex: e0.sex || "", birth: e0.birth || "", weight: e0.weight != null ? String(e0.weight) : "", neutered: e0.neutered || "", color: e0.color || "", notes: e0.notes || "" }, v => validatePet(v, taken));
  const { v } = f, [top, setTop] = useState("");

  const initialSpeciesBreeds = BREEDS_BY_SPECIES[e0.species] || [];
  const isCustomInitial = e0.breed && !initialSpeciesBreeds.includes(e0.breed);
  const [breedChoice, setBreedChoice] = useState(isCustomInitial ? "Other / Mixed (type your own)" : (e0.breed || ""));
  const [customBreed, setCustomBreed] = useState(isCustomInitial ? e0.breed : "");

  const handleSpeciesChange = newSpecies => {
    f.set("species", newSpecies);
    setBreedChoice("");
    setCustomBreed("");
    f.set("breed", "");
  };

  const handleBreedChoiceChange = choice => {
    setBreedChoice(choice);
    if (choice === "Other / Mixed (type your own)" || choice === "Other (type your own)") {
      f.set("breed", customBreed || "");
    } else {
      f.set("breed", choice);
    }
  };

  const handleCustomBreedChange = text => {
    setCustomBreed(text);
    f.set("breed", text);
  };

  const submit = ev => {
    ev.preventDefault(); setTop(""); f.submit();
    if (!f.valid) return;
    if (editing) {
      const cur = (db.petRequests || []).find(r => r.id === editing.id && r.ownerId === me.ownerId);
      if (!cur) { say("This request is no longer available"); return onClose(); }
    } else { const m = addBlock(db, me); if (m) return setTop(m); }
    const data = { name: v.name.trim(), species: v.species, speciesOther: v.species === "Other" ? v.other.trim() : "", breed: v.breed.trim(), sex: v.sex, birth: v.birth, weight: +v.weight, neutered: v.neutered, color: v.color.trim(), notes: v.notes.trim() };
    setDb(p => ({
      ...p,
      petRequests: editing
        ? (p.petRequests || []).map(r => r.id === editing.id ? { ...r, ...data, status: "Pending", declineReason: "" } : r)
        : [...(p.petRequests || []), { id: uid(), ownerId: me.ownerId, requestedAt: TODAY, status: "Pending", declineReason: "", ...data }],
      log: addLog(p, me, `Owner ${editing ? "updated" : "sent"} a pet request for ${data.name}`),
    }));
    say(editing ? "Request updated and sent again" : `${data.name} was sent to the clinic for review`); onClose();
  };

  const availableBreeds = BREEDS_BY_SPECIES[v.species] || [];
  const showCustomBreedField = v.species === "Other" || breedChoice.startsWith("Other");
  const petCalculatedAge = v.birth && !f.errs.birth ? petAge(v.birth) : "";
  const isOlderThanSixMonths = v.birth && !f.errs.birth && petCalculatedAge && !petCalculatedAge.includes("mo") && !petCalculatedAge.includes("under");

  return (
    <Modal title={editing ? "Edit pet request" : "Add my pet"} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="ow-note info">The clinic front desk checks every new pet before it appears on your account. You will see its status on the My Pets page.</p>

        {v.species && GUIDANCE_BY_SPECIES[v.species] && (
          <div className="ow-note" style={{ background: "#eff6ff", borderColor: "#93c5fd", color: "#1e3a8a", fontSize: "0.85rem", lineHeight: 1.45, marginBottom: 14 }}>
            {GUIDANCE_BY_SPECIES[v.species]}
          </div>
        )}

        <div className="op-2">
          <Field id="pn" label="Pet name" req value={v.name} filter={petText} filterMsg="Letters, numbers and . ' - only" maxLen={30} onChange={x => f.set("name", x)} onBlur={() => f.blur("name")} error={f.show("name")} valid={f.ok("name")} />
          <Field id="ps" label="Kind of animal" req type="select" value={v.species} onChange={handleSpeciesChange} onBlur={() => f.blur("species")} options={SPECIES.map(s => [s, s])} error={f.show("species")} valid={f.ok("species")} />
          {v.species === "Other" && <div className="full"><Field id="po" label="What kind of animal?" req value={v.other} filter={petText} filterMsg="Letters, numbers and basic punctuation only" maxLen={30} onChange={x => f.set("other", x)} onBlur={() => f.blur("other")} error={f.show("other")} valid={f.ok("other")} hint="For example hamster, guinea pig, turtle" /></div>}

          {v.species && availableBreeds.length > 0 ? (
            <Field id="pb-sel" label={`${v.species} breed`} req={false} type="select" value={breedChoice} onChange={handleBreedChoiceChange} options={availableBreeds.map(b => [b, b])} error={f.show("breed")} valid={f.ok("breed")} hint="Select breed or choose Other/Mixed" />
          ) : null}

          {(showCustomBreedField || !availableBreeds.length) && (
            <Field id="pb" label="Specific breed / mix details (optional)" value={v.breed} filter={petText} filterMsg="Letters, numbers and basic punctuation only" maxLen={50} onChange={handleCustomBreedChange} onBlur={() => f.blur("breed")} error={f.show("breed")} valid={f.ok("breed")} hint="For example Beagle-Poodle mix, Domestic, or leave blank" />
          )}

          <Field id="px" label="Sex" req type="select" value={v.sex} onChange={x => f.set("sex", x)} onBlur={() => f.blur("sex")} options={[["Male", "Male"], ["Female", "Female"]]} error={f.show("sex")} valid={f.ok("sex")} />

          <div>
            <Field id="pd" label="Birth date (yesterday or earlier)" req type="date" min={OLDEST} maxDate={YESTERDAY} value={v.birth} onChange={x => f.set("birth", x)} onBlur={() => f.blur("birth")} error={f.show("birth")} valid={f.ok("birth")} hint="Birth date cannot be today or in the future" />
            {petCalculatedAge && (
              <div style={{ marginTop: -8, marginBottom: 10, fontSize: "0.85rem", color: "#0b3a5b", fontWeight: 600 }}>
                🐾 Calculated Age: {petCalculatedAge}
              </div>
            )}
          </div>

          <Field id="pw" label="Weight (kg)" req value={v.weight} filter={onlyDecimal} filterMsg="Numbers only, with one decimal point" inputMode="decimal" onChange={x => f.set("weight", x)} onBlur={() => f.blur("weight")} error={f.show("weight")} valid={f.ok("weight")} hint="For example 4.5" />

          <div>
            <Field id="pt" label="Spayed or neutered?" req type="select" value={v.neutered} onChange={x => f.set("neutered", x)} onBlur={() => f.blur("neutered")} options={NEUTERED.map(s => [s, s])} error={f.show("neutered")} valid={f.ok("neutered")} />
            {isOlderThanSixMonths && v.neutered === "No" && (
              <div style={{ marginTop: -8, marginBottom: 10, fontSize: "0.8rem", color: "#b45309", lineHeight: 1.3 }}>
                💡 Tip: At {petCalculatedAge}, spaying/neutering is strongly recommended for reproductive health and behavior.
              </div>
            )}
          </div>

          <Field id="pc" label="Color or markings (optional)" value={v.color} filter={petText} filterMsg="Letters, numbers and basic punctuation only" maxLen={40} onChange={x => f.set("color", x)} onBlur={() => f.blur("color")} error={f.show("color")} valid={f.ok("color")} hint="For example brown with a white chest" />
          <div className="full"><Field id="pm" label="Anything the clinic should know (optional)" type="textarea" rows={2} max={200} value={v.notes} onChange={x => f.set("notes", x)} onBlur={() => f.blur("notes")} error={f.show("notes")} valid={f.ok("notes")} hint="Health problems, behavior or past treatments" /></div>
        </div>
        {top && <p className="err" role="alert">{top}</p>}
        {f.submitted && !f.valid && <p className="err" role="alert">Please fix {f.count} field{f.count > 1 ? "s" : ""} above.</p>}
        <div className="row end"><button type="button" className="btn ghost" onClick={onClose}>Close</button><button className="btn">{editing ? "Save and resend" : "Send to clinic"}</button></div>
      </form>
    </Modal>
  );
}

/* ---------- Requests waiting for (or declined by) the clinic ---------- */
export function RequestList({ db, setDb, me, say, onEdit }) {
  const [ask, setAsk] = useState("");
  const list = myRequests(db, me);
  if (!list.length) return null;
  const withdraw = r => {
    if (ask !== r.id) return setAsk(r.id);
    setDb(p => ({ ...p, petRequests: (p.petRequests || []).filter(x => !(x.id === r.id && x.ownerId === me.ownerId)), log: addLog(p, me, `Owner withdrew the pet request for ${r.name}`) }));
    setAsk(""); say("Request removed");
  };
  return (
    <section className="op-reqs" aria-label="Pet requests">
      <h3>Pet requests</h3>
      {list.map(r => {
        const no = r.status === "Declined";
        return (
          <div className="op-req" key={r.id}>
            <span className={`op-ico${no ? " no" : ""}`}><Icon n={no ? "alert" : "clock"} size={20} /></span>
            <div className="op-reqb">
              <b>{r.name}</b> <small>{kind(r)}{r.breed ? ` · ${r.breed}` : ""} · {r.sex} · {r.weight} kg</small>
              <span className={`op-chip ${no ? "no" : "wait"}`}>{no ? "Declined by the clinic" : "Waiting for the clinic to review"}</span>
              {no && r.declineReason && <small className="op-why">Reason: {r.declineReason}</small>}
              {no && <small className="op-why">Fix the details and send it again, or remove it.</small>}
            </div>
            <div className="op-acts">
              <button className="btn ghost sm" onClick={() => onEdit(r)}><Icon n="edit" size={14} /> {no ? "Fix and resend" : "Edit"}</button>
              <button className="btn danger sm" onClick={() => withdraw(r)} onBlur={() => setAsk("")}>{ask === r.id ? "Confirm remove" : "Remove"}</button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

/* ---------- Full profile of an approved pet ---------- */
export function PetProfileModal({ pet: p, db, me, onClose, onVacc, onBook }) {
  const V = scope(db, me, "vacc").filter(v => v.petId === p.id), A = scope(db, me, "appts").filter(a => a.petId === p.id);
  const over = V.filter(v => !v.done && v.nextDue && dueState(v.nextDue) === "Overdue").length;
  const soon = V.filter(v => !v.done && v.nextDue && dueState(v.nextDue) === "Due soon").length;
  const next = A.filter(a => ["Scheduled", "Confirmed", "Checked-in"].includes(a.status) && a.date >= TODAY).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  const rows = [["Kind", kind(p)], ["Digital Card ID", p.vaccinationCardId], ["Breed", p.breed], ["Sex", p.sex], ["Age", p.birth ? petAge(p.birth) : ""], ["Birth date", p.birth], ["Weight", p.weight != null ? `${p.weight} kg` : ""], ["Spayed or neutered", p.neutered], ["Color", p.color]].filter(([, x]) => x);
  return (
    <Modal title={p.name} onClose={onClose}>
      <dl className="op-dl">{rows.map(([k, x]) => <div key={k}><dt>{k}</dt><dd>{x}</dd></div>)}</dl>
      {(p.allergies || []).length > 0 && <div className="op-sec"><h4>Allergies</h4><ul className="ow-tags">{p.allergies.map(a => <li className="ow-tag" key={a}>{a}</li>)}</ul></div>}
      {p.notes && <div className="op-sec"><h4>Care notes</h4><p>{p.notes}</p></div>}
      <div className="op-sec">
        <h4>Health at a glance</h4>
        <p className="op-line"><Icon n="syringe" size={16} /> {V.length ? <>{V.length} vaccine record{V.length > 1 ? "s" : ""}{over ? <span className="op-chip no">{over} overdue</span> : soon ? <span className="op-chip wait">{soon} due soon</span> : <span className="op-chip ok">Up to date</span>}</> : "No vaccine records yet"}</p>
        <p className="op-line"><Icon n="calendar" size={16} /> {next ? `Next visit: ${next.date} at ${fmt12(next.time)} (${next.status})` : "No visit booked"}</p>
      </div>
      <p className="ow-hint">Need to change the name, breed or birth date? Ask the clinic front desk, they keep the official record.</p>
      <div className="row end"><button className="btn ghost" onClick={onVacc}>Vaccination card</button><button className="btn" onClick={onBook}>Book a visit</button></div>
    </Modal>
  );
}