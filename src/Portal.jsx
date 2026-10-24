import {ClinicHistory,HistoryControls} from "./ClinicHistory.jsx";
import {subscribeClinicDate,clinicDateSnapshot} from "./clinicDate.js";
import { useState, useEffect, useSyncExternalStore } from "react";
import { Menu, LogOut } from "lucide-react";
import { Logo, I, ROLES, E, scope, Table } from "./lib.jsx";
import EntityPage from "./EntityPage.jsx";
import { auth } from "./authApi.js";
import { accountProfile, saveAccountProfile } from "./accountProfile.js";
import { Avatar } from "./roles/owner/ui.jsx";
import StaffHeader from "./roles/StaffHeader.jsx";
import ReportsPage from "./roles/ReportsPage.jsx";
import "./staff-modern.css";   // vet + vet assistant refresh, scoped to .th-vet / .th-assistant

function Reports({ db, me }) {
  return <ReportsPage db={db} me={me} />;
}
export default function Portal(props) {
  return <ClinicHistory key={`${props.me.id}:${props.me.role}`} db={props.db} me={props.me}>{db=><PortalBody {...props} db={db}/>}</ClinicHistory>;
}
function PortalBody({ cfg, me, db, setDb, onLogout, dataLoading = false, dataError = "", refreshing = false, onRetry }) {
  useSyncExternalStore(subscribeClinicDate,clinicDateSnapshot,clinicDateSnapshot);
  const account = accountProfile(db, me);
  useEffect(() => {
    let active = true;
    auth.profile().then(({ profile }) => {
      if (active && profile) setDb(d => ({ ...saveAccountProfile(d, me.id, profile), accountProfileErrors: { ...d.accountProfileErrors, [me.id]: null } }));
    }).catch(error => {
      if (active) setDb(d => ({ ...d, accountProfileErrors: { ...d.accountProfileErrors, [me.id]: error.message } }));
    });
    return () => { active = false; };
  }, [me.id, setDb]);
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
        <div className="sidefoot"><div className="me"><Avatar src={account.photo} fallback={String(account.name || "U").replace(/^Dr\.?\s+/i, "")[0]} size={46} /><div><b>{me.name}</b><small>{ROLES[me.role][0]}</small></div></div><button className="btn gold sm wide" onClick={onLogout}><LogOut size={15} aria-hidden="true" />Log out</button></div>
      </aside>
      {open && <div className="veil" onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="top"><button className="burger" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}><Menu size={20} aria-hidden="true" /></button><div><h1>{cur.l}</h1><p>{cur.sub}</p></div>{cfg.Header ? <cfg.Header db={db} setDb={setDb} me={me} go={go} say={say} onLogout={onLogout} /> : <StaffHeader db={db} setDb={setDb} me={me} say={say} onLogout={onLogout} />}</header>
        <main className="content" aria-busy={dataLoading && refreshing}>
          {dataError && <section className="clinic-data-error" role="alert">
            <p>{dataLoading ? "Clinic records could not load." : "Records may be out of date. Changes still require a successful server save."} {dataError}</p>
            <button className="btn sm" disabled={refreshing} onClick={onRetry}>{refreshing ? "Retrying…" : "Retry loading records"}</button>
          </section>}
          {!dataLoading && <HistoryControls auto={!cur.dash && !["users","prices","audit","pet-requests"].includes(page)} />}
          {dataLoading ? (!dataError && <section className="clinic-loading" role="status"><span className="clinic-spinner" aria-hidden="true" />Loading clinic records…</section>) : cur.Page ? <cur.Page db={db} setDb={setDb} me={me} go={go} say={say} /> : cur.dash ? <Dash db={db} setDb={setDb} me={me} go={go} say={say} /> : cur.rep ? <Reports db={db} me={me} /> : <EntityPage key={cur.k} ent={cur.ent} db={db} setDb={setDb} me={me} say={say} />}
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
