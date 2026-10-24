import React, { useState } from "react";
import {
  Phone,
  Mail,
  Send,
  CheckCircle2,
  Clock,
  User,
  PawPrint,
  X,
  MessageSquare,
  AlertCircle
} from "lucide-react";
import { Badge, dueState, addLog } from "../lib.jsx";

export default function LogCallModal({ target, onClose, onLogged, me, setDb, say }) {
  if (!target) return null;
  const { v, p, o } = target;

  const [callNotes, setCallNotes] = useState("");
  const [sendSms, setSendSms] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const hasPhone = !!(o.phone || o.mobile);
  const hasEmail = !!o.email;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErr("");

    try {
      const res = await fetch("/api/reminders/log-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: o.id || p.ownerId,
          petId: p.id || v.petId,
          vaccine: v.vaccine,
          dueDate: v.nextDue,
          ownerName: o.name,
          ownerPhone: o.phone || o.mobile,
          ownerEmail: o.email,
          petName: p.name,
          staffName: me?.name || "Vet Assistant",
          staffRole: me?.role || "assistant",
          callNotes: callNotes.trim(),
          sendEmail: sendEmail && hasEmail,
          sendSmsMsg: sendSms && hasPhone
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to log reminder call.");
      }

      // Add to local clinic activity log
      if (setDb) {
        setDb(prev => {
          const channels = [
            sendEmail && hasEmail ? `Email (${o.email})` : null,
            sendSms && hasPhone ? `SMS (${o.phone || o.mobile})` : null
          ].filter(Boolean).join(" & ");

          const logMsg = `Vet Assistant ${me?.name || "Staff"} logged reminder call for ${o.name || "Owner"} (${p.name || "Pet"} - ${v.vaccine} due ${v.nextDue}). Alerts sent: ${channels || "Phone call only"}.${callNotes ? ` Note: "${callNotes.trim()}"` : ""}`;
          return {
            ...prev,
            log: addLog(prev, me, logMsg)
          };
        });
      }

      if (say) {
        say(data.message || `✓ Call logged! Sent reminders to ${o.name || "owner"}.`);
      }

      if (onLogged) onLogged();
      onClose();
    } catch (err) {
      console.error("Log call error:", err);
      setErr(err.message || "Failed to record reminder call.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "24px",
          width: "100%",
          maxWidth: "520px",
          boxShadow: "0 25px 60px rgba(15, 23, 42, 0.3)",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
          animation: "scaleUp 0.2s ease-out"
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
            padding: "20px 24px",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                background: "rgba(255, 226, 138, 0.25)",
                display: "grid",
                placeItems: "center",
                color: "#ffe28a"
              }}
            >
              <Phone size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#ffffff" }}>
                Log Reminder Call
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#dbeafe" }}>
                Record call notes and dispatch reminders to both phone and email.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: "rgba(255, 255, 255, 0.15)",
              border: "none",
              color: "#ffffff",
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              transition: "background 0.15s"
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} style={{ padding: "22px 24px" }}>
          {/* Patient & Due Details Card */}
          <div
            style={{
              background: "#f8fafc",
              border: "1.5px solid #e2e8f0",
              borderRadius: "16px",
              padding: "14px 16px",
              marginBottom: "18px"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "18px" }}>🐾</span>
                <div>
                  <b style={{ color: "#002B49", fontSize: "15px" }}>{p.name || "Patient"}</b>
                  <span style={{ color: "#64748b", fontSize: "12px", marginLeft: "6px" }}>
                    ({p.species || "Pet"})
                  </span>
                </div>
              </div>
              <Badge v={dueState(v.nextDue)} />
            </div>

            <div style={{ fontSize: "13px", color: "#334155", display: "grid", gap: "4px" }}>
              <div>
                <span style={{ color: "#64748b" }}>Owner:</span> <b>{o.name || "Client"}</b>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>Booster Due:</span>{" "}
                <b style={{ color: "#1e3a8a" }}>{v.vaccine}</b> on <b>{v.nextDue}</b>
              </div>
            </div>
          </div>

          {/* Channels Selection */}
          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "#1e3a8a", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "8px" }}>
              Dispatch Reminders To:
            </label>
            <div style={{ display: "grid", gap: "8px" }}>
              {/* Phone Channel */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: sendSms && hasPhone ? "1.5px solid #3b82f6" : "1.5px solid #e2e8f0",
                  background: sendSms && hasPhone ? "#eff6ff" : "#f8fafc",
                  cursor: hasPhone ? "pointer" : "not-allowed",
                  transition: "all 0.15s"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input
                    type="checkbox"
                    checked={sendSms && hasPhone}
                    disabled={!hasPhone}
                    onChange={(e) => setSendSms(e.target.checked)}
                    style={{ accentColor: "#2563eb", width: "16px", height: "16px" }}
                  />
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Phone size={14} color="#2563eb" /> Send SMS Alert
                    </span>
                    <small style={{ color: hasPhone ? "#475569" : "#94a3b8", fontSize: "11.5px" }}>
                      {hasPhone ? o.phone || o.mobile : "No phone number on file"}
                    </small>
                  </div>
                </div>
                {hasPhone && <span style={{ fontSize: "11px", fontWeight: 700, color: "#2563eb", background: "#dbeafe", padding: "2px 8px", borderRadius: "99px" }}>SMS</span>}
              </label>

              {/* Email Channel */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: sendEmail && hasEmail ? "1.5px solid #3b82f6" : "1.5px solid #e2e8f0",
                  background: sendEmail && hasEmail ? "#eff6ff" : "#f8fafc",
                  cursor: hasEmail ? "pointer" : "not-allowed",
                  transition: "all 0.15s"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input
                    type="checkbox"
                    checked={sendEmail && hasEmail}
                    disabled={!hasEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                    style={{ accentColor: "#2563eb", width: "16px", height: "16px" }}
                  />
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Mail size={14} color="#2563eb" /> Send Email Reminder
                    </span>
                    <small style={{ color: hasEmail ? "#475569" : "#94a3b8", fontSize: "11.5px" }}>
                      {hasEmail ? o.email : "No email address on file"}
                    </small>
                  </div>
                </div>
                {hasEmail && <span style={{ fontSize: "11px", fontWeight: 700, color: "#059669", background: "#d1fae5", padding: "2px 8px", borderRadius: "99px" }}>EMAIL</span>}
              </label>
            </div>
          </div>

          {/* Call Notes */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "#1e3a8a", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "6px" }}>
              Call Notes & Conversation (Optional):
            </label>
            <textarea
              rows={2}
              value={callNotes}
              onChange={(e) => setCallNotes(e.target.value)}
              placeholder="e.g. Spoke with Maria, owner scheduled to bring Bantay this Saturday morning for rabies booster."
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "12px",
                border: "1.5px solid #dbe4f7",
                background: "#f8fafc",
                fontSize: "13px",
                fontFamily: "inherit",
                color: "#0f172a",
                boxSizing: "border-box",
                outline: "none",
                resize: "vertical"
              }}
            />
          </div>

          {err && (
            <div style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", padding: "10px 14px", borderRadius: "10px", fontSize: "12.5px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <AlertCircle size={16} /> {err}
            </div>
          )}

          {/* Modal Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button
              type="button"
              className="btn ghost sm"
              onClick={onClose}
              disabled={submitting}
              style={{ padding: "10px 18px", borderRadius: "12px" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn gold sm"
              disabled={submitting}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 22px",
                borderRadius: "12px",
                fontWeight: 700
              }}
            >
              <Send size={15} />
              {submitting ? "Logging & Sending..." : "Log Call & Send Alerts"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

