import { useState } from "react";
import { Menu, LogOut } from "lucide-react";
import { Logo, I, ROLES, E, scope, Table } from "./lib.jsx";
import EntityPage from "./EntityPage.jsx";
import StaffHeader from "./roles/StaffHeader.jsx";
import "./staff-modern.css";   // vet + vet assistant refresh, scoped to .th-vet / .th-assistant
function Reports({ db, me }) {
  const [r, setR] = useState({ type: "appts", from: "", to: "" }), c = E[r.type], bad = r.from && r.to && r.from > r.to;
  let list = [...scope(db, me, r.type)]; if (c.sort) list.sort(c.sort);
  if (r.type !== "pets") list = list.filter(x => (!r.from || x.date >= r.from) && (!r.to || x.date <= r.to));
  return (<>
    <div className="bar"><select value={r.type} onChange={e => setR({ type: e.target.value, from: "", to: "" })} aria-label="Report type">{["appts", "vacc", "records", "pets"].map(k => <option key={k} value={k}>{E[k].title}</option>)}</select>
      {r.type !== "pets" && <><input type="date" value={r.from} onChange={e => setR({ ...r, from: e.target.value })} aria-label="From" /><input type="date" value={r.to} onChange={e => setR({ ...r, to: e.target.value })} aria-label="To" /></>}
      <button className="btn ghost" onClick={() => window.print()}>Print</button></div>
    {bad ? <p className="err">The “From” date must be on or before the “To” date.</p> : <><p><b>{list.length}</b> record(s)</p><Table db={db} ent={r.type} list={list} me={me} /></>}
  </>);
}
export default function Portal({ cfg, me, db, setDb, onLogout }) {
  // Per-account last screen is preserved across reloads; a different user cannot inherit it.
  const pageKey = `pawcare_page_${me.id}`;
  const [page, setPage] = useState(() => {
    try {
      const previous = sessionStorage.getItem(pageKey);
      return cfg.menu.some(m => m.k === previous && !m.hide) ? previous : cfg.menu[0].k;
    } catch (_) { return cfg.menu[0].k; }
  }), [open, setOpen] = useState(false), [toast, setToast] = useState("");
  const say = m => { setToast(m); setTimeout(() => setToast(""), 2200); };
  const cur = cfg.menu.find(m => m.k === page) || cfg.menu[0], go = k => { setPage(k); try { sessionStorage.setItem(pageKey, k); } catch (_) {} setOpen(false); }, Dash = cfg.Dash;
  return (
    <div className={`shell th-${me.role}`}>
      <aside className={open ? "side open" : "side"}>
        <div className="brand"><Logo /><div><b>PawCare</b><small>{cfg.portal}</small></div></div>
        <nav aria-label="Main">{cfg.menu.filter(m => !m.hide).map(m => <button key={m.k} className={m.k === page ? "on" : ""} onClick={() => go(m.k)}><I e={m.i} size={19} />{m.l}</button>)}</nav>
        <div className="sidefoot"><div className="me"><span className="av">{String(me.name || "U").replace(/^Dr\.?\s+/i, "")[0]}</span><div><b>{me.name}</b><small>{ROLES[me.role][0]}</small></div></div><button className="btn gold sm wide" onClick={onLogout}><LogOut size={15} aria-hidden="true" />Log out</button></div>
      </aside>
      {open && <div className="veil" onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="top"><button className="burger" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}><Menu size={20} aria-hidden="true" /></button><div><h1>{cur.l}</h1><p>{cur.sub}</p></div>{cfg.Header ? <cfg.Header db={db} setDb={setDb} me={me} go={go} say={say} onLogout={onLogout} /> : <StaffHeader db={db} setDb={setDb} me={me} say={say} onLogout={onLogout} />}</header>
        <main className="content">
          {cur.Page ? <cur.Page db={db} setDb={setDb} me={me} go={go} say={say} /> : cur.dash ? <Dash db={db} setDb={setDb} me={me} go={go} say={say} /> : cur.rep ? <Reports db={db} me={me} /> : <EntityPage key={cur.k} ent={cur.ent} db={db} setDb={setDb} me={me} say={say} />}
        </main>
      </div>
      {me.role === "owner" && (
        <nav className="ow-tabbar" aria-label="Main">
          {cfg.menu.filter(m => !m.hide).map(m => <button key={m.k} className={m.k === page ? "on" : ""} aria-current={m.k === page ? "page" : undefined} onClick={() => go(m.k)}><I e={m.i} size={21} /><span>{m.s || m.l}</span></button>)}
        </nav>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
