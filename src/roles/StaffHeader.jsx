import { useState, useEffect, useRef } from "react";
import { User, KeyRound, LogOut } from "lucide-react";
import { ROLES } from "../lib.jsx";
import { Avatar, Modal } from "./owner/ui.jsx";
import { ProfileBody, PasswordBody } from "./owner/Profile.jsx";

export default function StaffHeader({ db, setDb, me, say, onLogout }) {
  const [open, setOpen] = useState(false);
  const [dlg, setDlg] = useState(null); // 'profile' | 'password'
  const ref = useRef();

  useEffect(() => {
    if (!open) return;
    const down = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const key = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const to = (t) => {
    setOpen(false);
    setDlg(t);
  };

  const roleLabel = (ROLES[me.role] && ROLES[me.role][0]) || me.role;
  const userInitial = (me.name || me.firstName || "U")[0].toUpperCase();

  return (
    <div className="ow-hd" ref={ref} style={{ position: "relative", marginLeft: "auto" }}>
      <button
        type="button"
        className="ow-hdbtn"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Staff account menu"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: "#fff",
          border: "1px solid #cbd5e1",
          borderRadius: "99px",
          padding: "4px 14px 4px 5px",
          cursor: "pointer",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "#1e3a8a",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
            fontSize: "14px",
            flexShrink: 0,
          }}
        >
          {userInitial}
        </div>
        <span className="t" style={{ textAlign: "left", lineHeight: 1.2 }}>
          <b style={{ display: "block", fontSize: "13.5px", color: "var(--navy)" }}>{me.name}</b>
          <small style={{ color: "#64748b", fontSize: "11px", fontWeight: 600 }}>{roleLabel}</small>
        </span>
        <span aria-hidden="true" style={{ fontSize: "10px", color: "#64748b", marginLeft: "2px" }}>
          ▾
        </span>
      </button>

      {open && (
        <div
          className="ow-menu"
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "14px",
            boxShadow: "0 10px 25px rgba(15, 23, 42, 0.15)",
            minWidth: "200px",
            padding: "6px",
            zIndex: 100,
          }}
        >
          <div style={{ padding: "8px 12px 6px", borderBottom: "1px solid #f1f5f9", marginBottom: "4px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--navy)" }}>{me.name}</div>
            <div style={{ fontSize: "11.5px", color: "#64748b" }}>{me.email || me.username}</div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => to("profile")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
              textAlign: "left",
              padding: "9px 12px",
              background: "none",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "13.5px",
              color: "#1e293b",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <User size={15} color="#475569" />
            <span>My Profile</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => to("password")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
              textAlign: "left",
              padding: "9px 12px",
              background: "none",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "13.5px",
              color: "#1e293b",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <KeyRound size={15} color="#475569" />
            <span>Change Password</span>
          </button>
          <hr style={{ border: 0, borderTop: "1px solid #e2e8f0", margin: "4px 0" }} />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout && onLogout();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
              textAlign: "left",
              padding: "9px 12px",
              background: "none",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "13.5px",
              color: "#dc2626",
              fontWeight: 600,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#fef2f2")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <LogOut size={15} color="#dc2626" />
            <span>Log out</span>
          </button>
        </div>
      )}

      {dlg && (
        <Modal title={dlg === "profile" ? "My Profile" : "Change Password"} onClose={() => setDlg(null)}>
          {dlg === "profile" ? (
            <ProfileBody db={db} setDb={setDb} me={me} say={say} />
          ) : (
            <PasswordBody db={db} setDb={setDb} me={me} say={say} />
          )}
          <div className="row end" style={{ marginTop: "14px" }}>
            <button type="button" className="btn ghost sm" onClick={() => setDlg(null)}>
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

