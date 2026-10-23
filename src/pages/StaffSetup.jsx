import { useState, useEffect } from "react";
import {
  Stethoscope,
  ConciergeBell,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Phone,
  Lock,
  Calendar,
  User,
  ShieldCheck,
  Send
} from "lucide-react";
import { auth, OFFLINE_MSG } from "../authApi.js";
import { vPassword } from "../validate.js";
import { Logo } from "../lib.jsx";

export default function StaffSetup({ token, onDone, onCancel }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invInfo, setInvInfo] = useState(null);
  const [err, setErr] = useState("");
  
  const [showPw, setShowPw] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    birthday: "1992-05-15",
    mobileNumber: "+63 9",
    password: "",
    confirmPassword: ""
  });

  useEffect(() => {
    if (!token) {
      setErr("Missing staff invitation token.");
      setLoading(false);
      return;
    }

    auth.staffInviteInfo(token)
      .then(res => {
        setInvInfo(res);
        const parts = (res.name || "").split(" ");
        setFormData(p => ({
          ...p,
          firstName: parts[0] || "",
          lastName: parts.slice(1).join(" ") || ""
        }));
        setLoading(false);
      })
      .catch(err => {
        setErr(err.message || "Invitation link is invalid or has expired. Please contact the Clinic Administrator.");
        setLoading(false);
      });
  }, [token]);

  const pwCheck = vPassword(formData.password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    if (!formData.firstName.trim()) return setErr("First name is required.");
    if (!formData.lastName.trim()) return setErr("Last name is required.");
    if (!formData.birthday) return setErr("Birthday is required.");
    if (!formData.mobileNumber.trim() || formData.mobileNumber.trim().length < 10) {
      return setErr("A valid mobile number is required to receive your TextBee SMS OTP code.");
    }

    if (!pwCheck.ok) {
      return setErr(pwCheck.msg || "Password does not meet security requirements.");
    }

    if (formData.password !== formData.confirmPassword) {
      return setErr("Passwords do not match.");
    }

    setSubmitting(true);
    try {
      const res = await auth.staffAcceptInvite({
        token,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        birthday: formData.birthday,
        mobileNumber: formData.mobileNumber.trim(),
        password: formData.password
      });

      if (res.status === "ok") {
        onDone(res);
      } else {
        setErr(res.error || "Failed to set up account.");
      }
    } catch (x) {
      setErr(x.message || "Failed to connect to the clinic server.");
    } finally {
      setSubmitting(false);
    }
  };

  const isVet = invInfo?.role === "vet";
  const roleName = isVet ? "Veterinarian" : "Vet Assistant";

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "radial-gradient(ellipse at top, #f0fdf4 0%, #f8fafc 100%)",
      padding: "24px",
      fontFamily: "Poppins, sans-serif"
    }}>
      <div style={{
        background: "#ffffff",
        borderRadius: "20px",
        boxShadow: "0 20px 40px -15px rgba(0,0,0,0.08), 0 0 1px 1px rgba(0,0,0,0.05)",
        maxWidth: "520px",
        width: "100%",
        padding: "36px",
        border: "1px solid #e2e8f0"
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ display: "inline-flex", marginBottom: "12px" }}>
            <Logo size={52} />
          </div>
          <h2 style={{ margin: "0 0 6px", fontSize: "22px", color: "var(--navy, #0f172a)", fontWeight: 700 }}>
            PawCare Staff Activation
          </h2>
          <p style={{ margin: 0, fontSize: "14px", color: "#64748b" }}>
            Clinic Administrator Authorized Registration
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
            <div style={{ fontSize: "24px", marginBottom: "8px" }}>⏳</div>
            Validating staff invitation token...
          </div>
        ) : err && !invInfo ? (
          <div style={{ textAlign: "center", padding: "20px" }}>
            <div style={{ color: "#ef4444", marginBottom: "12px", display: "flex", justifyContent: "center" }}>
              <AlertCircle size={48} />
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: "18px", color: "#991b1b" }}>Invalid Invitation</h3>
            <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "14px", lineHeight: 1.5 }}>
              {err}
            </p>
            <button className="btn ghost" onClick={onCancel}>Back to Home</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {/* Role Badge Card */}
            <div style={{
              background: isVet ? "#eff6ff" : "#fef3c7",
              border: `1px solid ${isVet ? "#bfdbfe" : "#fde68a"}`,
              borderRadius: "14px",
              padding: "14px 18px",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "12px"
            }}>
              <div style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: isVet ? "#2563eb" : "#d97706",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}>
                {isVet ? <Stethoscope size={22} /> : <ConciergeBell size={22} />}
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: isVet ? "#1e40af" : "#92400e" }}>
                  Designated Staff Role
                </span>
                <div style={{ fontSize: "15px", fontWeight: 700, color: isVet ? "#1e3a8a" : "#78350f" }}>
                  {roleName}
                </div>
                <div style={{ fontSize: "12px", color: isVet ? "#3b82f6" : "#b45309" }}>
                  {invInfo?.email}
                </div>
              </div>
            </div>

            {err && (
              <div style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#991b1b",
                borderRadius: "10px",
                padding: "10px 14px",
                fontSize: "13px",
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{err}</span>
              </div>
            )}

            {/* Name Fields */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
              <div className="fld" style={{ margin: 0 }}>
                <label style={{ fontSize: "12px", fontWeight: 600 }}>First Name<i> *</i></label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="First name"
                  required
                />
              </div>
              <div className="fld" style={{ margin: 0 }}>
                <label style={{ fontSize: "12px", fontWeight: 600 }}>Last Name<i> *</i></label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Last name"
                  required
                />
              </div>
            </div>

            {/* Birthday */}
            <div className="fld" style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600 }}>Date of Birth<i> *</i></label>
              <input
                type="date"
                value={formData.birthday}
                onChange={e => setFormData({ ...formData, birthday: e.target.value })}
                required
              />
            </div>

            {/* Mobile Number for TextBee */}
            <div className="fld" style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                <Phone size={14} color="#2563eb" />
                <span>Mobile Number for TextBee SMS OTP<i> *</i></span>
              </label>
              <input
                type="tel"
                value={formData.mobileNumber}
                onChange={e => setFormData({ ...formData, mobileNumber: e.target.value })}
                placeholder="+63 917 123 4567"
                required
              />
              <span style={{ fontSize: "11px", color: "#64748b", marginTop: "3px", display: "block" }}>
                📲 A 6-digit verification code will be sent to this phone number via TextBee.
              </span>
            </div>

            {/* Password */}
            <div className="fld" style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                <Lock size={14} color="#2563eb" />
                <span>Create Staff Password<i> *</i></span>
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  placeholder="At least 12 characters with symbol & number"
                  style={{ width: "100%", paddingRight: "40px" }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#94a3b8"
                  }}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Password Quality Indicator */}
              <div style={{ marginTop: "6px", display: "flex", gap: "4px" }}>
                <div style={{ height: "4px", flex: 1, borderRadius: "2px", background: pwCheck.pct >= 25 ? "#ef4444" : "#e2e8f0" }} />
                <div style={{ height: "4px", flex: 1, borderRadius: "2px", background: pwCheck.pct >= 50 ? "#f59e0b" : "#e2e8f0" }} />
                <div style={{ height: "4px", flex: 1, borderRadius: "2px", background: pwCheck.pct >= 75 ? "#3b82f6" : "#e2e8f0" }} />
                <div style={{ height: "4px", flex: 1, borderRadius: "2px", background: pwCheck.pct >= 100 ? "#10b981" : "#e2e8f0" }} />
              </div>
              <span style={{ fontSize: "11px", color: pwCheck.ok ? "#10b981" : "#64748b", marginTop: "4px", display: "block" }}>
                {pwCheck.ok ? "✓ Strong password ready" : (pwCheck.msg || "Use 12+ chars with uppercase, lowercase, number, and symbol")}
              </span>
            </div>

            {/* Confirm Password */}
            <div className="fld" style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600 }}>Confirm Password<i> *</i></label>
              <input
                type={showPw ? "text" : "password"}
                value={formData.confirmPassword}
                onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="Re-enter your password"
                required
              />
            </div>

            {/* Submit Action */}
            <button
              type="submit"
              className="btn gold wide"
              disabled={submitting}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "12px",
                fontSize: "15px",
                fontWeight: 700
              }}
            >
              {submitting ? "Creating Staff Account..." : "Activate Account & Send OTP Code"}
            </button>

            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <button
                type="button"
                className="btn ghost sm"
                onClick={onCancel}
                style={{ fontSize: "12px", color: "#64748b" }}
              >
                Cancel and return to home
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

