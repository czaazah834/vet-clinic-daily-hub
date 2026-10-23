import { useState } from "react";
import { plus } from "../../lib.jsx";
import { vNote, vWeight, vAllergy, MAX_ALLERGIES, MAX_NOTE } from "../../validate.js";
import { auth, OFFLINE_MSG } from "../../authApi.js";
import { useLive, Field, onlyDecimal, ymdLocal, addNote, Icon } from "./ui.jsx";

/* ================= suggestion lists (edit these to change what owners see) ================= *//* Common allergy suggestions, grouped, per kind of animal. Plain JS, no database, works offline.
   These only speed up typing. They are not a diagnosis: owners can still type anything, and the vet confirms.
   To add or remove a suggestion, edit the lists below. */
const FOOD_DOG = ["Chicken", "Beef", "Pork", "Lamb", "Fish", "Egg", "Dairy", "Wheat", "Corn", "Soy"];
const FOOD_CAT = ["Chicken", "Beef", "Fish", "Lamb", "Egg", "Dairy", "Wheat"];

const ALLERGY_LISTS = {
  Dog: [
    { g: "Food", items: FOOD_DOG },
    { g: "Environment", items: ["Pollen", "Grass", "Dust mites", "Dust", "Mold", "Flea bites"] },
    { g: "Medicine", items: ["Penicillin", "Sulfa drugs", "Anti-inflammatory drugs", "Vaccine reaction"] },
    { g: "Contact and other", items: ["Shampoo", "Insect stings", "Cleaning products"] },
  ],
  Cat: [
    { g: "Food", items: FOOD_CAT },
    { g: "Environment", items: ["Pollen", "Dust mites", "Dust", "Mold", "Flea bites", "Litter dust", "Scented products"] },
    { g: "Medicine", items: ["Penicillin", "Sulfa drugs", "Vaccine reaction"] },
    { g: "Contact and other", items: ["Shampoo", "Insect stings", "Cleaning products"] },
  ],
  Other: [   // rabbits, birds and everything else: shorter, general list
    { g: "Environment", items: ["Pollen", "Dust", "Mold", "Hay dust", "Bedding", "Aerosol sprays", "Cigarette smoke"] },
    { g: "Medicine", items: ["Medicine reaction", "Vaccine reaction"] },
    { g: "Contact and other", items: ["Insect stings", "Cleaning products"] },
  ],
};

const allergyGroups = species => ALLERGY_LISTS[species] || ALLERGY_LISTS.Other;

/* Ready-made care notes, grouped, per kind of animal. Tapping a tag adds or removes the sentence in the note box.
   Edit the lists to change what owners see. Keep each sentence short and ending with a full stop. */
const GENERAL = [
  { g: "Fears and stress", items: ["Afraid of loud noises.", "Nervous around other animals.", "Easily stressed in the car.", "Afraid of strangers."] },
  { g: "Handling", items: ["May bite when scared.", "Please move slowly and stay calm.", "Does not like being touched on the paws."] },
  { g: "Health and routine", items: ["Picky eater.", "Has a sensitive stomach.", "Takes daily medicine.", "Gets motion sickness."] },
];
const NOTE_LISTS = {
  Dog: [
    { g: "Fears and stress", items: ["Afraid of loud noises.", "Nervous around other dogs.", "Easily stressed in the car.", "Afraid of strangers."] },
    { g: "Handling", items: ["May bite when scared.", "Needs a muzzle at the clinic.", "Does not like being touched on the paws.", "Pulls hard on the leash."] },
    { g: "Health and routine", items: ["Picky eater.", "Has a sensitive stomach.", "Takes daily medicine.", "Gets motion sickness."] },
  ],
  Cat: [
    { g: "Fears and stress", items: ["Afraid of loud noises.", "Nervous around other animals.", "Hides when scared.", "Stressed by the carrier."] },
    { g: "Handling", items: ["May scratch or bite when scared.", "Please move slowly and stay calm.", "Needs to be wrapped in a towel."] },
    { g: "Health and routine", items: ["Picky eater.", "Has a sensitive stomach.", "Takes daily medicine."] },
  ],
};
const noteGroups = species => NOTE_LISTS[species] || GENERAL;

/* ================= allergy dropdown ================= */
/* Typing guard: drops characters that don't belong, same rule the old field used. */
const guard = s => s.replace(/[^A-Za-zÀ-ÿ0-9 .,'\-\/()]/g, "").replace(/^\s+/, "").replace(/\s{2,}/g, " ").slice(0, 40);

/* Searchable list of common allergies for this kind of animal. Pick one to add it, or type your own and press Enter.
   onAdd(text) saves it (server call in MedProfile) and returns true when it worked. */
function AllergyPicker({ pet, existing, max, busy, onAdd }) {
  const [text, setText] = useState(""), [open, setOpen] = useState(false), [hi, setHi] = useState(0);
  const full = existing.length >= max, t = text.trim().toLowerCase(), have = existing.map(a => a.toLowerCase());
  const groups = allergyGroups(pet.species).map(g => ({ g: g.g, items: g.items.filter(i => !have.includes(i.toLowerCase()) && i.toLowerCase().includes(t)) })).filter(g => g.items.length);
  const flat = groups.flatMap(g => g.items);
  const err = text.trim() ? vAllergy(text, existing) : "";            // rules for text the owner typed
  const typedKnown = flat.some(i => i.toLowerCase() === t) || have.includes(t);
  const custom = text.trim() && !typedKnown && !err ? text.trim() : "";
  const rows = custom ? [...flat, custom] : flat;

  const pick = async v => {
    if (!v || busy || full) return;
    if (await onAdd(v)) { setText(""); setHi(0); setOpen(false); }
  };
  const key = e => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === "Escape") setOpen(false);
    else if (e.key === "Enter") { e.preventDefault(); if (open && rows[hi]) pick(rows[hi]); else if (custom) pick(custom); }
  };
  let n = -1;
  return (
    <div className="ap">
      <label htmlFor="ap-in" className="ap-l">Add an allergy</label>
      <div className="ap-box">
        <Icon n="search" size={16} />
        <input id="ap-in" role="combobox" aria-expanded={open && rows.length > 0} aria-controls="ap-list" aria-autocomplete="list" aria-invalid={!!err} aria-activedescendant={open && rows[hi] ? `ap-o${hi}` : undefined}
          value={text} autoComplete="off" maxLength={40} disabled={busy || full}
          placeholder={full ? `Limit of ${max} allergies reached` : "Search the list or type your own"}
          onChange={e => { setText(guard(e.target.value)); setHi(0); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={key} />
      {open && rows.length > 0 && <ul id="ap-list" role="listbox" className="ap-list" aria-label={`Common allergies for ${pet.species || "pets"}`} onMouseDown={e => e.preventDefault()}>
        {groups.map(g => [
          <li key={g.g} role="presentation" className="ap-gh">{g.g}</li>,
          ...g.items.map(i => { const k = ++n; return <li key={g.g + i} id={`ap-o${k}`} role="option" aria-selected={k === hi} className={`ap-o${k === hi ? " on" : ""}`} onMouseEnter={() => setHi(k)} onClick={() => pick(i)}>{i}</li>; }),
        ])}
        {custom && (() => { const k = ++n; return <li key="custom" id={`ap-o${k}`} role="option" aria-selected={k === hi} className={`ap-o ap-new${k === hi ? " on" : ""}`} onMouseEnter={() => setHi(k)} onClick={() => pick(custom)}><Icon n="plus" size={14} /> Add “{custom}”</li>; })()}
      </ul>}
      </div>
      <span className={err ? "err" : "ow-hint"} aria-live="polite">{err || (full ? "Remove one to add another" : `Pick one to add it. Not listed? Type it and press Enter. Suggestions only, the vet confirms allergies.`)}</span>
    </div>
  );
}

/* ================= care-note tags ================= */
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (text, s) => text.toLowerCase().includes(s.toLowerCase());
const drop = (text, s) => text.replace(new RegExp(esc(s), "i"), "").replace(/\s{2,}/g, " ").trim();

/* Tap a tag to add its sentence to the note, tap again to take it out. Tags already in the note show as selected. */
function NoteTags({ species, value, onChange, max }) {
  const toggle = s => {
    if (has(value, s)) return onChange(drop(value, s));
    const next = addNote(value, s, max);
    if (next !== value.trim()) onChange(next);   // addNote leaves the text alone when it would pass the limit
  };
  return (
    <div className="cn" aria-label="Quick notes">
      <p className="ow-hint cn-h">Tap to add or remove. You can still type your own.</p>
      {noteGroups(species).map(g => <div className="cn-g" key={g.g}>
        <small>{g.g}</small>
        <div className="cn-r">{g.items.map(s => { const on = has(value, s), full = !on && (value.trim().length + s.length + 2 > max); return (
          <button type="button" key={s} className={`cn-t${on ? " on" : ""}`} aria-pressed={on} disabled={full} title={full ? "Not enough room left in the note" : ""} onClick={() => toggle(s)}>{on && <Icon n="check" size={13} />}{s.replace(/\.$/, "")}</button>
        ); })}</div>
      </div>)}
    </div>
  );
}

/* ================= weight entry ================= */
const LB = 2.20462, r2 = x => +x.toFixed(2), today = () => plus(0);
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return ymdLocal(d); };
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);

/* Add-a-weight form that does the thinking for the owner:
   - the date starts on today, with Today / Yesterday buttons
   - the weight starts from the last one: nudge it with + / - or tap "Same as last"
   - typed in pounds? switch to lb and it converts to kg for you
   - it says how much the weight changed and warns about big jumps or a likely pounds slip
   The parent remounts this form (key) after a save, so it always starts fresh. onSave({ date, kg }) returns true when saved. */
function WeightEntry({ p, weights, busy, onSave }) {
  const f = useLive({ date: today(), kg: "" }, v => vWeight(v, { today: today(), birth: p.birth, existing: weights }));
  const [unit, setUnit] = useState("kg"), [lb, setLb] = useState("");
  const kg = f.v.kg !== "" && !isNaN(+f.v.kg) ? +f.v.kg : null;
  const prev = weights.filter(w => !f.v.date || w.date < f.v.date).pop() || null;   // the entry just before the chosen date
  const shown = unit === "kg" ? f.v.kg : lb;
  const setShown = s => {
    if (unit === "kg") return f.set("kg", s);
    setLb(s); f.set("kg", s === "" || isNaN(+s) ? "" : String(r2(+s / LB)));
  };
  const toUnit = x => unit === "kg" ? x : r2(x * LB);
  const nudge = d => {
    const start = shown !== "" && !isNaN(+shown) ? +shown : toUnit(prev ? prev.kg : p.weight || 0);
    setShown(String(Math.min(999, Math.max(unit === "kg" ? 0.1 : 0.2, r2(start + d)))));
  };
  const switchTo = u => {
    if (u === unit) return;
    if (u === "lb") setLb(kg === null ? "" : String(r2(kg * LB)));
    setUnit(u);
  };
  const adj = unit === "kg" ? [-0.5, -0.1, 0.1, 0.5] : [-1, -0.2, 0.2, 1];

  /* guidance under the fields */
  let note = null;
  if (kg !== null && prev && !f.errs.kg) {
    const diff = r2(kg - prev.kg), pct = Math.abs(diff) / prev.kg * 100, ratio = kg / prev.kg, days = daysBetween(prev.date, f.v.date);
    if (unit === "kg" && ratio > 1.9 && ratio < 2.6) note = { tone: "warn", text: <>That is about double the last weight. Did you type pounds? <button type="button" className="ow-link" onClick={() => { setLb(String(r2(kg))); setUnit("lb"); f.set("kg", String(r2(kg / LB))); }}>Treat it as lb</button></> };
    else if (pct >= 10) note = { tone: "warn", text: `${diff > 0 ? "Up" : "Down"} ${Math.abs(diff)} kg (${r2(pct)}%) in ${days} day${days === 1 ? "" : "s"}. That is a big change. Check the number, and tell the vet if it is correct.` };
    else note = { tone: "info", text: diff === 0 ? `Same as ${prev.date} (${prev.kg} kg).` : `${diff > 0 ? "Up" : "Down"} ${Math.abs(diff)} kg since ${prev.date}.` };
  }
  const submit = async e => {
    e.preventDefault(); f.submit();
    if (!f.valid || busy) return;
    await onSave({ date: f.v.date, kg: f.v.kg });
  };
  return (
    <form onSubmit={submit} noValidate className="we">
      <div className="we-grid">
        <div>
          <Field id="mp-wd" label="Date weighed" req type="date" value={f.v.date} maxDate={today()} min={p.birth || undefined} onChange={x => f.set("date", x)} onBlur={() => f.blur("date")} error={f.show("date")} valid={f.ok("date")} />
          <div className="we-chips">{[["Today", today()], ["Yesterday", yesterday()]].map(([l, d]) => <button type="button" key={l} className={`we-c${f.v.date === d ? " on" : ""}`} aria-pressed={f.v.date === d} onClick={() => f.set("date", d)}>{l}</button>)}</div>
        </div>
        <div>
          <Field id="mp-wk" label={`Weight (${unit})`} req value={shown} filter={onlyDecimal} filterMsg="Numbers only, with one decimal point" inputMode="decimal" onChange={setShown} onBlur={() => f.blur("kg")} error={f.show("kg")} valid={f.ok("kg")} hint={unit === "lb" && kg !== null ? `That is ${r2(kg)} kg` : "For example 14.5"} />
          <div className="we-chips" role="group" aria-label="Adjust the weight">
            {adj.map(d => <button type="button" key={d} className="we-c" onClick={() => nudge(d)}>{d > 0 ? "+" : "−"}{Math.abs(d)}</button>)}
            {prev && <button type="button" className="we-c" onClick={() => setShown(String(toUnit(prev.kg)))}>Same as last</button>}
            <span className="we-seg" role="group" aria-label="Unit">{["kg", "lb"].map(u => <button type="button" key={u} className={unit === u ? "on" : ""} aria-pressed={unit === u} onClick={() => switchTo(u)}>{u}</button>)}</span>
          </div>
        </div>
      </div>
      {note && <p className={`we-note ${note.tone}`} role="status">{note.text}</p>}
      <div className="row end"><button className="btn sm" disabled={busy}>Add weight</button></div>
    </form>
  );
}

/* ================= medical profile page ================= */
const byDate = a => [...a].sort((x, y) => x.date.localeCompare(y.date));

/* Owner-editable medical profile for one pet: allergies, weight history, care notes.
   Live checks come from validate.js; every save goes to the server, which checks the pet is yours and re-validates.
   Weight entries added by the clinic are locked; owners can only remove their own entries. */
export default function MedProfile({ p, setDb, say }) {
  const weights = byDate(p.weights || []), allergies = p.allergies || [];
  const [n, setN] = useState(0), [busy, setBusy] = useState(false), [top, setTop] = useState("");   // n bumps to reset the small add-forms

  /* One place for every save: call the server, show what it returns, report problems in words. */
  const run = async (call, msg) => {
    setTop(""); setBusy(true);
    try { const r = await call(); setDb(d => ({ ...d, pets: d.pets.map(x => x.id === r.pet.id ? r.pet : x) })); say(msg); setBusy(false); return true; }
    catch (x) { setTop(x.offline ? OFFLINE_MSG : x.message || "Something went wrong. Please try again."); setBusy(false); return false; }
  };

  /* ---- allergies ---- */
  const addAllergy = t => run(() => auth.petAllergy(p.id, { add: t }), `${t} added to ${p.name}’s allergies`);
  const dropAllergy = t => run(() => auth.petAllergy(p.id, { remove: t }), `${t} removed`);

  /* ---- weight ---- */
  const addWeight = async d => { const ok = await run(() => auth.petWeight(p.id, d), `${+d.kg} kg saved`); if (ok) setN(n + 1); return ok; };   // n remounts the form so it starts fresh
  const dropWeight = w => run(() => auth.petWeight(p.id, { remove: w.date }), "Weight entry removed");

  /* ---- notes ---- */
  const fn = useLive({ t: p.notes || "" }, v => { const m = vNote(v.t); return m ? { t: m } : {}; });
  const dirty = fn.v.t.trim() !== (p.notes || "");
  const saveNote = e => { e.preventDefault(); fn.submit(); if (!fn.valid || !dirty || busy) return; run(() => auth.petNotes(p.id, fn.v.t.trim()), "Notes saved"); };

  /* ---- weight chart ---- */
  const W = 300, H = 90, pad = 14, kgs = weights.map(w => w.kg), lo = Math.min(...kgs), hi = Math.max(...kgs), span = hi - lo || 1;
  const pts = weights.map((w, i) => [weights.length === 1 ? W / 2 : pad + i * (W - 2 * pad) / (weights.length - 1), H - pad - ((w.kg - lo) / span) * (H - 2 * pad)]);

  return (
    <div className="ow-mp">
      {top && <p className="err" role="alert">{top}</p>}
      <section aria-labelledby="mp-al">
        <h4 id="mp-al">Allergies</h4><p>Anything {p.name} reacts to: food, medicine, bites or the environment.</p>
        {allergies.length ? <ul className="ow-tags">{allergies.map(a => <li className="ow-tag" key={a}>{a}<button type="button" disabled={busy} onClick={() => dropAllergy(a)} aria-label={`Remove ${a}`}>×</button></li>)}</ul> : <p className="ow-none">No known allergies listed.</p>}
        <AllergyPicker pet={p} existing={allergies} max={MAX_ALLERGIES} busy={busy} onAdd={addAllergy} />
      </section>

      <section aria-labelledby="mp-wt">
        <h4 id="mp-wt">Weight history</h4><p>Current weight: <b>{p.weight} kg</b>. Weights from the clinic can’t be changed, but you can add your own.</p>
        {weights.length > 0 && <svg className="ow-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weight trend for ${p.name}, from ${weights[0].kg} kg to ${weights[weights.length - 1].kg} kg`}>
          {pts.length > 1 && <polyline points={pts.map(q => q.join(",")).join(" ")} fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinejoin="round" />}
          {pts.map((q, i) => <g key={i}><circle cx={q[0]} cy={q[1]} r="3.5" fill="var(--blue)" /><text x={q[0]} y={q[1] - 7} textAnchor="middle">{weights[i].kg}</text></g>)}
        </svg>}
        {weights.length ? <div className="tw"><table><thead><tr><th>Date</th><th>Weight</th><th>Change</th><th>Added by</th><th /></tr></thead><tbody>{weights.map((w, i) => ({ w, prev: weights[i - 1] })).reverse().map(({ w, prev }) => {
          const diff = prev ? +(w.kg - prev.kg).toFixed(2) : null;
          return <tr key={w.date}><td>{w.date}</td><td>{w.kg} kg</td><td>{diff === null ? "—" : diff === 0 ? "No change" : <span className={diff > 0 ? "ow-up" : "ow-dn"}>{diff > 0 ? "+" : ""}{diff} kg</span>}</td><td>{w.by === "owner" ? "You" : "Clinic"}</td><td className="act">{w.by === "owner" && <button type="button" className="btn danger sm" disabled={busy} onClick={() => dropWeight(w)} aria-label={`Remove weight from ${w.date}`}>Remove</button>}</td></tr>;
        })}</tbody></table></div> : <p className="ow-none">No weights recorded yet.</p>}
        <WeightEntry key={`w${n}`} p={p} weights={weights} busy={busy} onSave={addWeight} />
      </section>

      <section aria-labelledby="mp-nt">
        <h4 id="mp-nt">Care notes</h4><p>Things the vet and staff should know, like fears or handling tips.</p>
        <form onSubmit={saveNote} noValidate>
          <Field id="mp-n" label={`Notes about ${p.name}`} type="textarea" rows={3} max={MAX_NOTE} value={fn.v.t} onChange={x => fn.set("t", x)} onBlur={() => fn.blur("t")} error={fn.show("t")} valid={fn.ok("t")} hint="Example: afraid of loud noises" />
          <NoteTags species={p.species} value={fn.v.t} max={MAX_NOTE} onChange={x => fn.set("t", x)} />
          <div className="row end">{dirty && <button type="button" className="btn ghost" disabled={busy} onClick={() => fn.quiet({ t: p.notes || "" })}>Discard changes</button>}<button className="btn" disabled={!dirty || busy}>{busy ? "Saving…" : dirty ? "Save notes" : "No changes yet"}</button></div>
        </form>
      </section>
    </div>
  );
}