import { useState, useSyncExternalStore } from "react";
import { outbox } from "../devOutbox.js";
import "./auth.css";

/* Shows the emails and SMS the mock server "sent", because there is no mail or SMS service yet.
   Click "Open link" to do what clicking the link in a real email would do.
   Hidden when empty, so once api.js is replaced by a real server this panel simply never appears. */
export default function DevInbox({ onOpen }) {
  const items = useSyncExternalStore(outbox.subscribe, outbox.get), [open, setOpen] = useState(true);
  if (!items.length) return null;
  return (
    <aside className="devbox" aria-label="Development inbox">
      <header>
        <b>Dev inbox ({items.length})</b>
        <span><button type="button" onClick={() => setOpen(o => !o)}>{open ? "Hide" : "Show"}</button><button type="button" onClick={outbox.clear}>Clear</button></span>
      </header>
      {open && <>
        <p className="devnote">No email or SMS service is connected yet, so messages appear here.</p>
        <ul>{[...items].reverse().map(m => (
          <li key={m.id}>
            <small>{m.kind === "sms" ? "SMS to" : "Email to"} {m.to || "(no address)"} · {new Date(m.at).toLocaleTimeString()}</small>
            <b>{m.subject}</b>
            <pre>{m.body}</pre>
            {m.link && <button type="button" className="btn gold sm" onClick={() => onOpen(m.link)}>{m.link.label || "Open link"}</button>}
          </li>
        ))}</ul>
      </>}
    </aside>
  );
}
