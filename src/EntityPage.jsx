import { useState } from "react";
import { E, can, scope, cellText, Table, FormModal, uid, TODAY, petName, moveAppt, addLog, LABEL } from "./lib.jsx";
import SoapConsultationModal from "./roles/SoapConsultationModal.jsx";
export default function EntityPage({ ent, db, setDb, me, say }) {
  const c = E[ent], [q, setQ] = useState(""), [modal, setModal] = useState(null);
  let list = [...scope(db, me, ent)];
  if (c.sort) list.sort(c.sort);
  if (q) list = list.filter(x => c.cols.some(k => String(cellText(db, x, k)).toLowerCase().includes(q.toLowerCase())));
  const deny = m => { say(m); setModal(null); };
  const save = d => {
    if (!can(ent, me, modal.init ? "u" : "c")) return deny("You don’t have permission to do that");
    if (me.role === "owner" && ent === "appts" && !scope(db, me, "pets").some(p => p.id === d.petId)) return deny("You can only book for your own pets");
    const x = { ...d }; if (ent === "records") x.vetId = d.vetId || me.vetId || "v1";
    if (ent === "appts" && !modal.init) x.status = me.role === "owner" ? "Scheduled" : "Confirmed";
    setDb(p => {
      let l = p[ent];
      if (modal.init) l = l.map(r => r.id === modal.init.id ? { ...r, ...x } : r);
      else { if (ent === "vacc") l = l.map(v => v.petId === x.petId && v.vaccine === x.vaccine ? { ...v, done: true } : v); l = [...l, { id: uid(), ...x }]; }
      return { ...p, [ent]: l, log: addLog(p, me, `${modal.init ? "Updated" : "Added"} ${c.one}${x.petId ? " for " + petName(p, x.petId) : ""}`) };
    });
    say(`${modal.init ? "Updated" : "Added"} ${c.one}`); setModal(null);
  };
  const move = (a, s) => {
    if (s === "WRITE") return setModal({ consult: a });
    moveAppt(setDb, a.id, s, me); say(s === "In consultation" ? "Consultation started" : `${LABEL[s]} done`);
    if (s === "In consultation") setModal({ consult: a });
  };
  const saveConsult = d => {
    const a = modal.consult; if (!can("records", me, "c")) return deny("Only veterinarians can record consultations");
    setDb(p => ({ ...p, records: [...p.records, { id: uid(), ...d, vetId: me.vetId || "v1", apptId: a.id }], appts: p.appts.map(r => r.id === a.id ? { ...r, status: "Completed" } : r), log: addLog(p, me, `Consultation saved for ${petName(p, d.petId)}; visit completed`) }));
    say("Consultation saved. Visit completed."); setModal(null);
  };
  const del = x => {
    if (!can(ent, me, "d")) return deny("You don’t have permission to delete");
    if (ent === "users" && x.id === me.id) return deny("You can’t delete your own account");
    setDb(p => { const n = { ...p };
      if (ent === "owners") { const ps = p.pets.filter(r => r.ownerId === x.id).map(r => r.id); ["appts", "vacc", "records"].forEach(k => n[k] = p[k].filter(r => !ps.includes(r.petId))); n.pets = p.pets.filter(r => r.ownerId !== x.id); n.users = p.users.filter(u => u.ownerId !== x.id); }
      if (ent === "pets") ["appts", "vacc", "records"].forEach(k => n[k] = p[k].filter(r => r.petId !== x.id));
      n[ent] = p[ent].filter(r => r.id !== x.id); n.log = addLog(p, me, `Deleted ${c.one}`); return n; });
    setModal(null); say("Deleted");
  };
  return (<>
    <div className="bar"><input type="search" placeholder={`Search ${c.title.toLowerCase()}…`} value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />{can(ent, me, "c") && <button className="btn" onClick={() => setModal({})}>+ Add {c.one}</button>}</div>
    <Table db={db} ent={ent} list={list} acts me={me} onEdit={x => setModal({ init: x })} onDel={x => setModal({ del: x })} onMove={ent === "appts" ? move : null} />
    {modal && !modal.del && !modal.consult && <FormModal ent={ent} init={modal.init} db={db} me={me} onSave={save} onClose={() => setModal(null)} />}
    {modal && modal.consult && (
      me.role === "vet" ? (
        <SoapConsultationModal
          appt={modal.consult}
          pet={db.pets.find(p => p.id === modal.consult.petId) || { id: modal.consult.petId, name: petName(db, modal.consult.petId) }}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setModal(null)}
          onSaved={() => { say("SOAP Consultation saved. Visit completed."); setModal(null); }}
        />
      ) : (
        <FormModal ent="records" init={{ petId: modal.consult.petId, date: TODAY }} db={db} me={me} onSave={saveConsult} onClose={() => setModal(null)} />
      )
    )}
    {modal && modal.del && <div className="scrim"><div className="modal"><h3>Delete this {c.one}?</h3><p>{ent === "owners" ? "This also removes their pets and all linked records." : ent === "pets" ? "This also removes its appointments, vaccines and consultations." : "This can’t be undone."}</p><div className="row end"><button className="btn ghost" onClick={() => setModal(null)}>Keep it</button><button className="btn danger" onClick={() => del(modal.del)}>Delete</button></div></div></div>}
  </>);
}
