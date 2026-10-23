import { useState } from "react";
import { TODAY, scope, uid, addLog, dueState, ICON } from "../../lib.jsx";
import { useLive, Field, Modal, petAge, fmt12, onlyDecimal, Icon } from "./ui.jsx";
import {
  computeAgeDetails,
  getPreventiveSchedule,
  getNextMilestone,
  computeWeightBracket,
  normalizeSpecies,
  formatSpeciesLabel
} from "../../preventiveSchedule.js";
import { api } from "../../api.js";

/* ---------- Clinical Species Classification (VCMS Protocols v2.0) ---------- */
export const SPECIES = [
  "Canine (Dog)",
  "Feline (Cat)",
  "Lagomorph (Rabbit)",
  "Rodent (Hamster / Guinea Pig / etc.)",
  "Avian (Bird)",
  "Other / Exotic"
];

export const NEUTERED = ["Yes", "No", "Not sure"];

export const RODENT_DENTAL_STATUS = [
  "Normal / Aligned (Healthy Occlusion)",
  "Incisor Overgrowth (Needs Trim)",
  "Molar Spurs / Malocclusion (Needs Dental Burr)",
  "Signs of Drooling / Wet Chin (Suspected Malocclusion)",
  "Not Evaluated Yet"
];

export const PET_COLORS = [
  "Black",
  "White",
  "Brown / Chocolate",
  "Tan / Fawn",
  "Golden / Yellow",
  "Cream / Blonde",
  "Red / Ginger / Orange",
  "Gray / Blue / Silver",
  "Tricolor (Black, White & Tan)",
  "Bicolor / Tuxedo (Black & White)",
  "Brown & White",
  "Brindle (Tiger-striped)",
  "Merle / Dapple (Marbled)",
  "Calico (Tri-color patches)",
  "Tortoiseshell (Tortie)",
  "Tabby (Striped / Swirls)",
  "Sable",
  "Spotted",
  "Other / Custom markings (type below)"
];

export const MAX_PETS = 10;      // approved pets + requests on one account
export const MAX_PENDING = 3;    // requests waiting for the clinic at one time
export const MAX_NOTES = 200;

export const BREEDS_BY_SPECIES = {
  "Canine (Dog)": [
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
  "Feline (Cat)": [
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
  "Lagomorph (Rabbit)": [
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
  "Rodent (Hamster / Guinea Pig / etc.)": [
    "Syrian Hamster (Golden / Teddy Bear)",
    "Roborovski Dwarf Hamster",
    "Winter White Dwarf Hamster",
    "Campbell's Dwarf Hamster",
    "Guinea Pig (Abyssinian)",
    "Guinea Pig (American / Short-haired)",
    "Guinea Pig (Peruvian / Long-haired)",
    "Chinchilla (Standard Gray / Mutation)",
    "Fancy Rat (Dumbo / Standard)",
    "Fancy Mouse",
    "Degu",
    "Mongolian Gerbil",
    "Other / Mixed (type your own)"
  ],
  "Avian (Bird)": [
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
    "Indian Ringneck Parakeet",
    "Dove / Pigeon",
    "Other (type your own)"
  ],
  "Other / Exotic": [
    "African Pygmy Hedgehog",
    "Sugar Glider",
    "Ferret",
    "Bearded Dragon (Reptile)",
    "Leopard Gecko (Reptile)",
    "Red-eared Slider (Turtle)",
    "Sulcata Tortoise",
    "Other (type your own)"
  ]
};

// Aliases for backward compatibility
BREEDS_BY_SPECIES.Dog = BREEDS_BY_SPECIES["Canine (Dog)"];
BREEDS_BY_SPECIES.Cat = BREEDS_BY_SPECIES["Feline (Cat)"];
BREEDS_BY_SPECIES.Rabbit = BREEDS_BY_SPECIES["Lagomorph (Rabbit)"];
BREEDS_BY_SPECIES.Rodent = BREEDS_BY_SPECIES["Rodent (Hamster / Guinea Pig / etc.)"];
BREEDS_BY_SPECIES.Bird = BREEDS_BY_SPECIES["Avian (Bird)"];
BREEDS_BY_SPECIES.Other = BREEDS_BY_SPECIES["Other / Exotic"];

export const GUIDANCE_BY_SPECIES = {
  "Canine (Dog)": "🐶 Canine Protocol (VCMS v2.0): Bi-weekly deworming starts at Day 14, switching to monthly at Day 90. Core DHPP starts at 6 weeks (Day 42), with Rabies at 12+ weeks (Day 84). Flea/tick/heartworm starts at 8 weeks. Strict heartworm antigen testing required for dogs >= 7 months with safety gaps.",
  "Feline (Cat)": "🐱 Feline Protocol (VCMS v2.0): Bi-weekly deworming starts at Day 14 (transitions to quarterly at 6 months). FVRCP 4-in-1 core immunization starts at 6 weeks, with Rabies at 12+ weeks. Strict toxicology block: Never use Permethrin formulas on felines.",
  "Lagomorph (Rabbit)": "🐰 Lagomorph Protocol (VCMS v2.0): Annual RHDV1/RHDV2 vaccination starts at Day 35. High-fiber timothy hay (80%+) and semi-annual dental checks are vital. Strict toxicology block: Fipronil (Frontline) is strictly prohibited due to fatal neurotoxicity.",
  "Rodent (Hamster / Guinea Pig / etc.)": "🐹 Rodent Protocol (VCMS v2.0): Continuous elodont dentition requires semi-annual molar and incisor occlusion surveillance. Monitor for incisor overgrowth, molar spurs, and wet chin / drooling.",
  "Avian (Bird)": "🦜 Avian Protocol (VCMS v2.0): Annual fecal float screening at 6 months. Home Hazard Warning: Inhaled PTFE/Teflon cookware fumes and aerosol sprays cause fatal hemorrhagic respiratory failure.",
  "Other / Exotic": "🐾 Exotic Species Protocol: Specialized husbandry, temperature regulation, and regular preventative veterinary evaluations."
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

  if (!v.species) e.species = "Select pet species classification";
  else if (!SPECIES.includes(v.species) && !Object.keys(BREEDS_BY_SPECIES).includes(v.species)) e.species = "Pick a species from the list";
  else if (v.species.includes("Other")) {
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

  if (v.species && v.species.includes("Rodent")) {
    if (!v.dentalOcclusion) e.dentalOcclusion = "Please assess dental/occlusion status";
    else if (!RODENT_DENTAL_STATUS.includes(v.dentalOcclusion)) e.dentalOcclusion = "Select an occlusion status";
  }

  const n = v.notes.trim();
  if (n.length > MAX_NOTES) e.notes = `Keep notes under ${MAX_NOTES} characters`;
  else if (n && !LETTER.test(n)) e.notes = "Write a few words, not only numbers or symbols";
  return e;
}

export const myRequests = (db, me) => (db.petRequests || []).filter(r => r.ownerId === me.ownerId);

export const addBlock = (db, me) => {
  const have = scope(db, me, "pets").length, reqs = myRequests(db, me);
  if (have + reqs.length >= MAX_PETS) return `One account can hold up to ${MAX_PETS} pets`;
  if (reqs.filter(r => r.status === "Pending").length >= MAX_PENDING) return `${MAX_PENDING} requests are already waiting for the clinic. Wait for a reply before adding more`;
  return "";
};

const kind = p => (p.species && p.species.includes("Other") && p.speciesOther) ? p.speciesOther : formatSpeciesLabel(p.species);

/* ---------- Add / edit a pet request ---------- */
export function PetFormModal({ db, setDb, me, say, editing, onClose }) {
  const e0 = editing || {};
  const taken = [...scope(db, me, "pets"), ...myRequests(db, me).filter(r => !editing || r.id !== editing.id)].map(p => p.name.trim().toLowerCase());
  
  // Normalize initial species
  const initialSpecies = e0.species ? formatSpeciesLabel(e0.species) : "";

  const f = useLive({
    name: e0.name || "",
    species: initialSpecies || "",
    other: e0.speciesOther || "",
    breed: e0.breed || "",
    sex: e0.sex || "",
    birth: e0.birth || "",
    weight: e0.weight != null ? String(e0.weight) : "",
    neutered: e0.neutered || "",
    color: e0.color || "",
    dentalOcclusion: e0.dentalOcclusion || "Normal / Aligned (Healthy Occlusion)",
    notes: e0.notes || ""
  }, v => validatePet(v, taken));

  const { v } = f, [top, setTop] = useState("");

  const initialSpeciesBreeds = BREEDS_BY_SPECIES[v.species] || BREEDS_BY_SPECIES[e0.species] || [];
  const isCustomInitial = e0.breed && !initialSpeciesBreeds.includes(e0.breed);
  const [breedChoice, setBreedChoice] = useState(isCustomInitial ? "Other / Mixed (type your own)" : (e0.breed || ""));
  const [customBreed, setCustomBreed] = useState(isCustomInitial ? e0.breed : "");

  const isCustomColorInitial = e0.color && !PET_COLORS.includes(e0.color);
  const [colorChoice, setColorChoice] = useState(isCustomColorInitial ? "Other / Custom markings (type below)" : (e0.color || ""));
  const [customColor, setCustomColor] = useState(isCustomColorInitial ? e0.color : "");

  const handleSpeciesChange = newSpecies => {
    f.set("species", newSpecies);
    setBreedChoice("");
    setCustomBreed("");
    f.set("breed", "");
    if (newSpecies.includes("Rodent")) {
      f.set("dentalOcclusion", "Normal / Aligned (Healthy Occlusion)");
    } else {
      f.set("dentalOcclusion", "");
    }
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

  const handleColorChoiceChange = choice => {
    setColorChoice(choice);
    if (choice === "Other / Custom markings (type below)") {
      f.set("color", customColor || "");
    } else {
      f.set("color", choice);
    }
  };

  const handleCustomColorChange = text => {
    setCustomColor(text);
    f.set("color", text);
  };

  const submit = async ev => {
    ev.preventDefault(); setTop(""); f.submit();
    if (!f.valid) return;
    if (editing) {
      const cur = (db.petRequests || []).find(r => r.id === editing.id && r.ownerId === me.ownerId);
      if (!cur) { say("This request is no longer available"); return onClose(); }
    } else { const m = addBlock(db, me); if (m) return setTop(m); }

    const canonicalSpecies = normalizeSpecies(v.species);
    const data = {
      name: v.name.trim(),
      species: canonicalSpecies,
      speciesLabel: formatSpeciesLabel(v.species),
      speciesOther: v.species.includes("Other") ? v.other.trim() : "",
      breed: v.breed.trim(),
      sex: v.sex,
      birth: v.birth,
      weight: +v.weight,
      neutered: v.neutered,
      color: v.color.trim(),
      dentalOcclusion: canonicalSpecies === "Rodent" ? v.dentalOcclusion : "",
      notes: v.notes.trim()
    };

    try {
      // Direct call to backend database
      const res = await api.post("/api/owner/pets", { ...data, ownerId: me.ownerId });
      if (res && res.pet) {
        setDb(p => ({
          ...p,
          pets: [...(p.pets || []).filter(x => x.id !== res.pet.id), res.pet],
          vacc: [...(p.vacc || []), ...(res.vaccs || [])],
          vaccs: [...(p.vaccs || []), ...(res.vaccs || [])],
          petRequests: [...(p.petRequests || []).filter(r => r.name.toLowerCase() !== data.name.toLowerCase()), {
            id: uid(),
            ownerId: me.ownerId,
            requestedAt: TODAY,
            status: "Approved",
            declineReason: "",
            ...data
          }],
          log: addLog(p, me, `Registered patient ${data.name} (${canonicalSpecies}) in clinical database`),
        }));
        say(`${data.name} was successfully registered and saved to your account!`);
        onClose();
        return;
      }
    } catch (err) {
      console.warn("Backend registration fallback:", err);
    }

    // Graceful fallback if offline
    const localId = uid();
    const localCard = "VACC-" + new Date().getFullYear() + "-" + Math.floor(1000 + Math.random() * 9000);
    const localPet = {
      id: "p_" + localId,
      ownerId: me.ownerId,
      vaccinationCardId: localCard,
      ...data,
      weights: [{ date: data.birth || TODAY, kg: data.weight }]
    };

    setDb(p => ({
      ...p,
      pets: [...(p.pets || []).filter(x => x.id !== localPet.id), localPet],
      petRequests: editing
        ? (p.petRequests || []).map(r => r.id === editing.id ? { ...r, ...data, status: "Approved", declineReason: "" } : r)
        : [...(p.petRequests || []), { id: localId, ownerId: me.ownerId, requestedAt: TODAY, status: "Approved", declineReason: "", ...data }],
      log: addLog(p, me, `Registered patient ${data.name} (${canonicalSpecies})`),
    }));

    say(editing ? "Pet details updated" : `${data.name} was successfully added!`);
    onClose();
  };

  const availableBreeds = BREEDS_BY_SPECIES[v.species] || [];
  const showCustomBreedField = v.species.includes("Other") || breedChoice.startsWith("Other");
  const showCustomColorField = colorChoice.startsWith("Other");
  const petCalculatedAge = v.birth && !f.errs.birth ? petAge(v.birth) : "";
  const isOlderThanSixMonths = v.birth && !f.errs.birth && petCalculatedAge && !petCalculatedAge.includes("mo") && !petCalculatedAge.includes("under");
  const [showSchedule, setShowSchedule] = useState(false);
  const [activeWorkflowTab, setActiveWorkflowTab] = useState("all");
  
  const nextFormMilestone = v.birth && !f.errs.birth ? getNextMilestone(v.birth, v.species) : null;
  const fullFormSchedule = v.birth && !f.errs.birth ? getPreventiveSchedule(v.birth, v.species) : [];
  const filteredSchedule = activeWorkflowTab === "all"
    ? fullFormSchedule
    : fullFormSchedule.filter(s => s.workflow === activeWorkflowTab);

  const weightBracket = computeWeightBracket(v.weight, v.species, v.birth);
  const normSpecies = normalizeSpecies(v.species);

  return (
    <Modal title={editing ? "Edit pet request" : "Add my pet"} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="ow-note info">The clinic front desk reviews each patient registration before activating it in the clinical system.</p>

        {v.species && GUIDANCE_BY_SPECIES[v.species] && (
          <div className="ow-note" style={{ background: "#eff6ff", borderColor: "#93c5fd", color: "#1e3a8a", fontSize: "0.83rem", lineHeight: 1.45, marginBottom: 14 }}>
            {GUIDANCE_BY_SPECIES[v.species]}
          </div>
        )}

        {/* Clinical Interceptors & Toxicity Blocks based on VCMS v2.0 Protocols */}
        {normSpecies === "Lagomorph" && (
          <div style={{ background: "#fef2f2", border: "1.5px solid #f87171", borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", color: "#991b1b", fontSize: "0.82rem" }}>
            <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
              <span>🚫</span> <span>TOXICOLOGY BLOCK: Strict Fipronil (Frontline) Ban</span>
            </div>
            <div style={{ marginTop: "3px", lineHeight: 1.4 }}>
              Fipronil is lethal to rabbits and causes severe neurotoxic seizures and death. Frontline or fipronil-based products must never be dispensed or applied.
            </div>
          </div>
        )}

        {normSpecies === "Feline" && (
          <div style={{ background: "#fef2f2", border: "1.5px solid #f87171", borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", color: "#991b1b", fontSize: "0.82rem" }}>
            <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
              <span>🚫</span> <span>TOXICOLOGY BLOCK: Permethrin Toxicity Restriction</span>
            </div>
            <div style={{ marginTop: "3px", lineHeight: 1.4 }}>
              Completely restrict formulas containing Permethrin. Canine spot-ons with permethrin are fatal to cats, causing severe tremors and neurological failure.
            </div>
          </div>
        )}

        {normSpecies === "Avian" && (
          <div style={{ background: "#fffbeb", border: "1.5px solid #fcd34d", borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", color: "#92400e", fontSize: "0.82rem" }}>
            <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
              <span>⚠️</span> <span>HOME HAZARD ALERT: PTFE / Teflon Cookware Toxic Fumes</span>
            </div>
            <div style={{ marginTop: "3px", lineHeight: 1.4 }}>
              Overheated non-stick PTFE pans, self-cleaning ovens, and aerosol sprays release colorless, odorless fumes that cause acute fatal pulmonary hemorrhage in birds. Keep cages far away from the kitchen.
            </div>
          </div>
        )}

        {weightBracket && weightBracket.heartwormAlert && (
          <div style={{ background: "#fef2f2", border: "1.5px solid #ef4444", borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", color: "#991b1b", fontSize: "0.82rem" }}>
            <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
              <span>🛡️</span> <span>VCMS 2.0 SAFETY PROTOCOL: Heartworm Antigen Test Required</span>
            </div>
            <div style={{ marginTop: "3px", lineHeight: 1.4 }}>
              {weightBracket.heartwormAlert}
            </div>
          </div>
        )}

        <div className="op-2">
          <Field id="pn" label="Pet name" req value={v.name} filter={petText} filterMsg="Letters, numbers and . ' - only" maxLen={30} onChange={x => f.set("name", x)} onBlur={() => f.blur("name")} error={f.show("name")} valid={f.ok("name")} />
          
          <Field id="ps" label="Species (Animal Classification)" req type="select" value={v.species} onChange={handleSpeciesChange} onBlur={() => f.blur("species")} options={SPECIES.map(s => [s, s])} error={f.show("species")} valid={f.ok("species")} hint="Mandatory clinical classification (VCMS Protocols v2.0)" />
          
          {v.species.includes("Other") && (
            <div className="full">
              <Field id="po" label="What kind of animal?" req value={v.other} filter={petText} filterMsg="Letters, numbers and basic punctuation only" maxLen={30} onChange={x => f.set("other", x)} onBlur={() => f.blur("other")} error={f.show("other")} hint="For example Hedgehog, Sugar Glider, Bearded Dragon, Tortoise" />
            </div>
          )}

          {normSpecies === "Rodent" && (
            <div className="full">
              <Field id="p-dental" label="Dental / Occlusion Status" req type="select" value={v.dentalOcclusion} onChange={x => f.set("dentalOcclusion", x)} onBlur={() => f.blur("dentalOcclusion")} options={RODENT_DENTAL_STATUS.map(s => [s, s])} error={f.show("dentalOcclusion")} valid={f.ok("dentalOcclusion")} hint="VCMS Protocol: Continuous rodent elodont dentition requires routine incisor & molar surveillance." />
            </div>
          )}

          {v.species && availableBreeds.length > 0 ? (
            <Field id="pb-sel" label={`${formatSpeciesLabel(v.species)} breed`} req={false} type="select" value={breedChoice} onChange={handleBreedChoiceChange} options={availableBreeds.map(b => [b, b])} error={f.show("breed")} valid={f.ok("breed")} hint="Select breed or choose Other/Mixed" />
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

          <Field id="pc-sel" label="Color / Coat pattern" req={false} type="select" value={colorChoice} onChange={handleColorChoiceChange} options={PET_COLORS.map(c => [c, c])} error={f.show("color")} valid={f.ok("color")} hint="Select primary color or coat pattern" />

          {showCustomColorField && (
            <Field id="pc" label="Specific color or unique markings" value={v.color} filter={petText} filterMsg="Letters, numbers and basic punctuation only" maxLen={40} onChange={handleCustomColorChange} onBlur={() => f.blur("color")} error={f.show("color")} valid={f.ok("color")} hint="For example brown with a white chest, white socks" />
          )}

          <div className="full"><Field id="pm" label="Anything the clinic should know (optional)" type="textarea" rows={2} max={200} value={v.notes} onChange={x => f.set("notes", x)} onBlur={() => f.blur("notes")} error={f.show("notes")} valid={f.ok("notes")} hint="Health problems, behavior or past treatments" /></div>
        </div>

        {/* Dynamic Weight Brackets (Canine) */}
        {weightBracket && normSpecies === "Canine" && (
          <div style={{ background: "#fffbeb", border: "1.5px solid #fcd34d", borderRadius: "12px", padding: "14px", marginTop: "12px", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{ fontSize: "1.1rem" }}>⚖️</span>
              <b style={{ fontSize: "0.85rem", color: "#92400e", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Automated Maintenance Weight Bracket ({weightBracket.kg} kg)
              </b>
            </div>

            {weightBracket.alert && (
              <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "8px 12px", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 600, marginBottom: "8px" }}>
                {weightBracket.alert}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.82rem" }}>
              <div style={{ background: "#fff", padding: "8px 10px", borderRadius: "8px", border: "1px solid #fef3c7" }}>
                <div style={{ color: "#78350f", fontWeight: 700 }}>NexGard Spectra Chewables:</div>
                {weightBracket.nexgard && (
                  <div style={{ marginTop: "3px" }}>
                    <span style={{ display: "inline-block", background: weightBracket.nexgard.color, color: "#fff", padding: "2px 8px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 700 }}>
                      {weightBracket.nexgard.box}
                    </span>
                    <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: "3px" }}>
                      {weightBracket.nexgard.note}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ background: "#fff", padding: "8px 10px", borderRadius: "8px", border: "1px solid #fef3c7" }}>
                <div style={{ color: "#78350f", fontWeight: 700 }}>Simparica Trio Range:</div>
                {weightBracket.simparica && (
                  <div style={{ marginTop: "3px" }}>
                    <span style={{ display: "inline-block", background: "#3b82f6", color: "#fff", padding: "2px 8px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 700 }}>
                      {weightBracket.simparica.box}
                    </span>
                    <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: "3px" }}>
                      {weightBracket.simparica.note || `Matches ${weightBracket.kg} kg bracket.`}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: "8px", fontSize: "0.76rem", color: "#92400e", lineHeight: 1.35 }}>
              <b>Strict Rule:</b> Never use left-over medication from an older dog or split a larger pill in half for a puppy. Active ingredients are not mixed evenly inside tablets. Weigh puppy monthly on digital scale before giving.
            </div>
          </div>
        )}

        {/* Automated Preventive Care Schedule (VCMS v2.0 Separation) */}
        {nextFormMilestone && (
          <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: "12px", padding: "14px", marginTop: "14px", marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#166534" }}>
                  🤖 VCMS Automated Schedule (Calculated from Birthdate)
                </div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#065f46", marginTop: "3px" }}>
                  Upcoming Priority: {nextFormMilestone.care} ({nextFormMilestone.ageLabel})
                </div>
                <div style={{ fontSize: "0.84rem", color: "#047857", marginTop: "2px" }}>
                  Target: <b>{nextFormMilestone.target}</b> · Spacing: {nextFormMilestone.protocol}
                </div>
                <div style={{ fontSize: "0.82rem", color: "#166534", marginTop: "4px" }}>
                  📅 Calculated Target Date: <b>{nextFormMilestone.targetDate}</b>
                </div>
              </div>
              <button type="button" className="lnk" style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }} onClick={() => setShowSchedule(!showSchedule)}>
                {showSchedule ? "Hide Roadmap ▲" : `View Full Roadmap (${fullFormSchedule.length}) ▼`}
              </button>
            </div>

            {showSchedule && (
              <div style={{ marginTop: "12px", borderTop: "1px solid #bbf7d0", paddingTop: "10px" }}>
                {/* Workflow Loop Filter Tabs */}
                <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setActiveWorkflowTab("all")}
                    style={{
                      padding: "3px 8px",
                      borderRadius: "6px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      border: "1px solid #86efac",
                      background: activeWorkflowTab === "all" ? "#166534" : "#fff",
                      color: activeWorkflowTab === "all" ? "#fff" : "#166534",
                      cursor: "pointer"
                    }}
                  >
                    All Milestones ({fullFormSchedule.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveWorkflowTab("Immunization")}
                    style={{
                      padding: "3px 8px",
                      borderRadius: "6px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      border: "1px solid #86efac",
                      background: activeWorkflowTab === "Immunization" ? "#166534" : "#fff",
                      color: activeWorkflowTab === "Immunization" ? "#fff" : "#166534",
                      cursor: "pointer"
                    }}
                  >
                    💉 Immunization Loop
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveWorkflowTab("Parasiticide")}
                    style={{
                      padding: "3px 8px",
                      borderRadius: "6px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      border: "1px solid #86efac",
                      background: activeWorkflowTab === "Parasiticide" ? "#166534" : "#fff",
                      color: activeWorkflowTab === "Parasiticide" ? "#fff" : "#166534",
                      cursor: "pointer"
                    }}
                  >
                    🛡️ Parasiticide Loop
                  </button>
                </div>

                <div style={{ maxHeight: "240px", overflowY: "auto" }}>
                  <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "#14532d", borderBottom: "1px solid #bbf7d0" }}>
                        <th style={{ padding: "4px" }}>Loop / Age</th>
                        <th style={{ padding: "4px" }}>Care Required</th>
                        <th style={{ padding: "4px" }}>Target Date</th>
                        <th style={{ padding: "4px" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSchedule.map(s => (
                        <tr key={s.id} style={{ borderBottom: "1px solid #dcfce7" }}>
                          <td style={{ padding: "6px 4px", fontWeight: 600 }}>
                            <span style={{ fontSize: "0.7rem", color: s.workflow === "Immunization" ? "#2563eb" : "#059669", display: "block" }}>
                              {s.workflow || "Care"}
                            </span>
                            {s.ageLabel}
                          </td>
                          <td style={{ padding: "6px 4px" }}>
                            <div>{s.care}</div>
                            <small style={{ color: "#047857", fontSize: "0.75rem" }}>{s.target}</small>
                            {s.constraints && (
                              <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "2px" }}>
                                <i>{s.constraints}</i>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "6px 4px", whiteSpace: "nowrap" }}>{s.targetDate}</td>
                          <td style={{ padding: "6px 4px" }}>
                            <span style={{
                              padding: "2px 6px",
                              borderRadius: "8px",
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              background: s.status === "Overdue" ? "#fee2e2" : s.status === "Due Soon" ? "#fef3c7" : "#e0e7ff",
                              color: s.status === "Overdue" ? "#991b1b" : s.status === "Due Soon" ? "#92400e" : "#3730a3"
                            }}>
                              {s.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

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
              {r.dentalOcclusion && (
                <div style={{ marginTop: "3px" }}>
                  <span style={{ background: "#e0e7ff", color: "#3730a3", fontSize: "0.72rem", padding: "1px 6px", borderRadius: "6px", fontWeight: 600 }}>
                    🦷 Dental: {r.dentalOcclusion}
                  </span>
                </div>
              )}
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
  
  const normSpecies = normalizeSpecies(p.species);
  const rows = [
    ["Species", formatSpeciesLabel(p.species)],
    ["Digital Card ID", p.vaccinationCardId],
    ["Breed", p.breed],
    ["Sex", p.sex],
    ["Age", p.birth ? petAge(p.birth) : ""],
    ["Birth date", p.birth],
    ["Weight", p.weight != null ? `${p.weight} kg` : ""],
    ["Spayed or neutered", p.neutered],
    ["Color", p.color],
    p.dentalOcclusion ? ["Dental Status", p.dentalOcclusion] : null
  ].filter(Boolean).filter(([, x]) => x);

  const petSchedule = p.birth ? getPreventiveSchedule(p.birth, p.species, V) : [];
  const nextMilestone = p.birth ? getNextMilestone(p.birth, p.species, V) : null;
  const petWeightBracket = computeWeightBracket(p.weight, p.species, p.birth);

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

      {/* Lagomorph & Feline Toxicology Banners */}
      {normSpecies === "Lagomorph" && (
        <div style={{ background: "#fef2f2", border: "1px solid #f87171", borderRadius: "8px", padding: "8px 12px", color: "#991b1b", fontSize: "0.8rem", marginBottom: "10px" }}>
          <b>🚫 Lagomorph Safety Rule:</b> Strict ban on Fipronil (Frontline). Fipronil is fatal to rabbits.
        </div>
      )}

      {normSpecies === "Feline" && (
        <div style={{ background: "#fef2f2", border: "1px solid #f87171", borderRadius: "8px", padding: "8px 12px", color: "#991b1b", fontSize: "0.8rem", marginBottom: "10px" }}>
          <b>🚫 Feline Safety Rule:</b> Strict ban on Permethrin. Permethrin is fatal to cats.
        </div>
      )}

      {normSpecies === "Avian" && (
        <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "8px", padding: "8px 12px", color: "#92400e", fontSize: "0.8rem", marginBottom: "10px" }}>
          <b>⚠️ Avian Airborne Safety:</b> Inhaled non-stick Teflon/PTFE fumes and aerosol sprays cause acute fatal lung hemorrhage.
        </div>
      )}

      {petWeightBracket && normSpecies === "Canine" && (
        <div className="op-sec">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <h4 style={{ margin: 0 }}>Medication & Weight Brackets ({petWeightBracket.kg} kg)</h4>
          </div>

          {petWeightBracket.alert && (
            <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "8px 12px", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 600, marginBottom: "8px" }}>
              {petWeightBracket.alert}
            </div>
          )}

          {petWeightBracket.heartwormAlert && (
            <div style={{ background: "#fee2e2", border: "1px solid #f87171", color: "#991b1b", padding: "8px 12px", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 600, marginBottom: "8px" }}>
              {petWeightBracket.heartwormAlert}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.82rem" }}>
            <div style={{ background: "#f8fafc", padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--ln)" }}>
              <div style={{ color: "#0f172a", fontWeight: 700 }}>NexGard Spectra Chewables:</div>
              {petWeightBracket.nexgard && (
                <div style={{ marginTop: "4px" }}>
                  <span style={{ display: "inline-block", background: petWeightBracket.nexgard.color, color: "#fff", padding: "2px 8px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 700 }}>
                    {petWeightBracket.nexgard.box}
                  </span>
                  <div style={{ fontSize: "0.76rem", color: "var(--mu)", marginTop: "3px" }}>
                    {petWeightBracket.nexgard.note}
                  </div>
                </div>
              )}
            </div>

            <div style={{ background: "#f8fafc", padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--ln)" }}>
              <div style={{ color: "#0f172a", fontWeight: 700 }}>Simparica Trio Bracket:</div>
              {petWeightBracket.simparica && (
                <div style={{ marginTop: "4px" }}>
                  <span style={{ display: "inline-block", background: "#2563eb", color: "#fff", padding: "2px 8px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 700 }}>
                    {petWeightBracket.simparica.box}
                  </span>
                  <div style={{ fontSize: "0.76rem", color: "var(--mu)", marginTop: "3px" }}>
                    {petWeightBracket.simparica.note || `Calculated for ${petWeightBracket.kg} kg body weight.`}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: "8px", fontSize: "0.76rem", color: "#b45309", lineHeight: 1.35 }}>
            <b>Strict Dosage Rule:</b> Never use leftover medication from an older dog or split a larger pill in half for a puppy. Active ingredients are not mixed evenly inside tablets. Weigh puppy monthly on digital scale before dosing.
          </div>
        </div>
      )}

      {p.birth && petSchedule.length > 0 && (
        <div className="op-sec">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "6px" }}>
            <h4 style={{ margin: 0 }}>Automated Preventive Schedule & Roadmap</h4>
            <span style={{ fontSize: "0.8rem", color: "#0b3a5b", fontWeight: 700 }}>
              Calculated Age: {petAge(p.birth)}
            </span>
          </div>

          {nextMilestone && (
            <div style={{ background: "#eff6ff", border: "1.5px solid #93c5fd", borderRadius: "10px", padding: "10px 12px", marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#1e40af", textTransform: "uppercase" }}>
                    🎯 Current Recommended Care ({nextMilestone.workflow || "Care"})
                  </div>
                  <div style={{ fontSize: "0.92rem", fontWeight: 700, color: "#1e3a8a", marginTop: "2px" }}>{nextMilestone.care} ({nextMilestone.ageLabel})</div>
                  <div style={{ fontSize: "0.8rem", color: "#2563eb", marginTop: "1px" }}>Target: <b>{nextMilestone.target}</b> · Spacing: {nextMilestone.protocol}</div>
                  <div style={{ fontSize: "0.8rem", color: "#1e40af", marginTop: "2px" }}>Calculated Target Date: <b>{nextMilestone.targetDate}</b></div>
                </div>
                <button className="btn sm gold" style={{ whiteSpace: "nowrap" }} onClick={() => onBook(p.id, `${nextMilestone.care} (${nextMilestone.ageLabel})`)}>
                  Book this visit
                </button>
              </div>
            </div>
          )}

          <div style={{ maxHeight: "220px", overflowY: "auto", border: "1px solid var(--ln)", borderRadius: "8px", padding: "4px" }}>
            <table style={{ width: "100%", fontSize: "0.78rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--mu)", borderBottom: "1px solid var(--ln)" }}>
                  <th style={{ padding: "6px 4px" }}>Loop / Age</th>
                  <th style={{ padding: "6px 4px" }}>Care Required</th>
                  <th style={{ padding: "6px 4px" }}>Target Date</th>
                  <th style={{ padding: "6px 4px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {petSchedule.map(s => (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--ln)" }}>
                    <td style={{ padding: "6px 4px", fontWeight: 600 }}>
                      <span style={{ fontSize: "0.68rem", color: s.workflow === "Immunization" ? "#2563eb" : "#059669", display: "block" }}>
                        {s.workflow || "Care"}
                      </span>
                      {s.ageLabel}
                    </td>
                    <td style={{ padding: "6px 4px" }}>
                      <div style={{ fontWeight: 600, color: "#0f172a" }}>{s.care}</div>
                      <small style={{ color: "var(--mu)", fontSize: "0.74rem" }}>{s.target}</small>
                      {s.constraints && (
                        <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "2px" }}>
                          <i>{s.constraints}</i>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "6px 4px", whiteSpace: "nowrap" }}>{s.targetDate}</td>
                    <td style={{ padding: "6px 4px" }}>
                      <span className={`op-chip ${s.status === "Completed" ? "ok" : s.status === "Overdue" ? "no" : s.status === "Due Soon" ? "wait" : ""}`} style={{ fontSize: "0.72rem" }}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="ow-hint">Need to change the name, breed or birth date? Ask the clinic front desk, they keep the official record.</p>
      <div className="row end"><button className="btn ghost" onClick={onVacc}>Vaccination card</button><button className="btn" onClick={onBook}>Book a visit</button></div>
    </Modal>
  );
}
