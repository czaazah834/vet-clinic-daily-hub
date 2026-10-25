import { useState, useEffect } from "react";
import {
  Stethoscope,
  ConciergeBell,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Phone,
  Lock,
  Calendar,
  User,
  ShieldCheck,
  MapPin,
  Sparkles
} from "lucide-react";
import { auth, OFFLINE_MSG } from "../authApi.js";
import { pn, tc, pwOk, PW_RULES, pwStrength } from "../validate.js";
import AuthShell, { AuthBrand } from "./AuthShell.jsx";
import "./auth.css";
import "./brand.css";
import "./auth-flow.css";

export default function StaffSetup({ token, onDone, onCancel }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invInfo, setInvInfo] = useState(null);
  const [err, setErr] = useState("");
  
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [touched, setTouched] = useState({});
  const [numWarn, setNumWarn] = useState("");

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    middleInitial: "",
    birthday: "",
    houseStreet: "",
    city: "Caloocan City",
    state: "Metro Manila",
    country: "Philippines",
    zipCode: "1400",
    mobileNumber: "+63 9",
    password: "",
    confirmPassword: ""
  });

  const activeToken = token || (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("invite") : "");

  useEffect(() => {
    if (!activeToken) {
      setErr("Missing staff invitation token. Please check the link from your invitation email.");
      setLoading(false);
      return;
    }

    setErr("");
    setLoading(true);

    auth.staffInviteInfo(activeToken)
      .then(res => {
        setInvInfo(res);
        setErr(""); // Clear any previous error on successful token validation!
        const parts = (res.name || "").trim().split(/\s+/);
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
  }, [activeToken]);

  const touch = (field) => setTouched(p => ({ ...p, [field]: true }));

  // Real-time validations matching create account
  const validateField = (field, val) => {
    const v = String(val || "").trim();
    switch (field) {
      case "firstName":
        if (!v) return "First name is required.";
        if (/\d/.test(val)) return "Numbers are not allowed in names. Please use letters only.";
        if (v.length < 2) return "First name must be at least 2 characters.";
        if (v.length > 50) return "First name cannot exceed 50 characters.";
        return pn(v);
      case "lastName":
        if (!v) return "Last name is required.";
        if (/\d/.test(val)) return "Numbers are not allowed in names. Please use letters only.";
        if (v.length < 2) return "Last name must be at least 2 characters.";
        if (v.length > 50) return "Last name cannot exceed 50 characters.";
        return pn(v);
      case "middleInitial":
        return !v || /^[\p{L}]\.?$/u.test(v) ? "" : "Use 1 letter, optionally followed by a period (e.g. M or M.).";
      case "birthday": {
        if (!v) return "Date of birth is required.";
        const dt = new Date(v + "T00:00:00");
        if (isNaN(dt.getTime())) return "Enter a valid date.";
        const today = new Date();
        if (dt > today) return "Birth date cannot be in the future.";
        const eighteenYearsAgo = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
        if (dt > eighteenYearsAgo) return "Staff members must be at least 18 years old.";
        return "";
      }
      case "houseStreet":
        if (!v) return "House number and street address are required.";
        return v.length >= 3 ? "" : "Street address must be at least 3 characters.";
      case "city":
        return v.length >= 2 ? "" : "City/municipality is required.";
      case "mobileNumber":
        if (!v || v.replace(/\D/g, "").length < 10) return "Enter a valid Philippine mobile number (e.g. +63 917 123 4567).";
        return "";
      case "password":
        return pwOk(val) ? "" : "Password must be at least 12 characters with upper, lower, number and symbol.";
      case "confirmPassword":
        return val === formData.password ? "" : "Passwords do not match.";
      default:
        return "";
    }
  };

  const getFieldError = (field) => (touched[field] ? validateField(field, formData[field]) : "");
  const isFieldValid = (field) => touched[field] && !validateField(field, formData[field]);

  const pwStrengthCount = pwStrength(formData.password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    // Mark all as touched
    const fieldsToValidate = [
      "firstName", "lastName", "birthday", "houseStreet", "city",
      "mobileNumber", "password", "confirmPassword"
    ];
    const newTouched = {};
    fieldsToValidate.forEach(f => { newTouched[f] = true; });
    setTouched(newTouched);

    for (const f of fieldsToValidate) {
      const fieldErr = validateField(f, formData[f]);
      if (fieldErr) {
        setErr(fieldErr);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await auth.staffAcceptInvite({
        token: activeToken,
        firstName: tc(formData.firstName.trim()),
        lastName: tc(formData.lastName.trim()),
        middleInitial: formData.middleInitial ? formData.middleInitial.trim().toUpperCase() : null,
        birthday: formData.birthday,
        houseStreet: tc(formData.houseStreet.trim()),
        city: tc(formData.city.trim()),
        state: tc(formData.state.trim()),
        country: formData.country.trim(),
        zipCode: formData.zipCode.trim(),
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
    <AuthShell title={<>Welcome to your <em>clinic workspace.</em></>} description="Complete your invited account and verify your mobile number to connect with your clinic team.">
      <div className="login-card staff-card">
        <AuthBrand />
        
        {/* Top Stepper Indicator */}
        <div className="staff-steps" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "#eff6ff", color: "#1d4ed8", padding: "4px 12px", borderRadius: "99px", fontSize: "12px", fontWeight: 700 }}>
            <span>1</span>
            <span>Staff Registration</span>
          </div>
          <span style={{ color: "#cbd5e1" }}>➜</span>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "#f1f5f9", color: "#64748b", padding: "4px 12px", borderRadius: "99px", fontSize: "12px", fontWeight: 600 }}>
            <span>2</span>
            <span>SMS OTP Verification</span>
          </div>
          <span style={{ color: "#cbd5e1" }}>➜</span>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "#f1f5f9", color: "#64748b", padding: "4px 12px", borderRadius: "99px", fontSize: "12px", fontWeight: 600 }}>
            <span>3</span>
            <span>Clinic Workspace</span>
          </div>
        </div>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "22px" }}>
          <h2 style={{ margin: "0 0 4px", fontSize: "22px", color: "var(--navy, #0f172a)", fontWeight: 800 }}>
            PawCare Staff Activation
          </h2>
          <p style={{ margin: 0, fontSize: "13.5px", color: "#64748b" }}>
            Complete your clinical profile and set your secure password
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "50px 20px", color: "#64748b" }}>
            <div className="clinic-spinner" style={{ margin: "0 auto 12px", width: "32px", height: "32px", borderWidth: "3px" }} />
            <p style={{ margin: 0, fontWeight: 600 }}>Validating your clinic invitation authorization...</p>
          </div>
        ) : err && !invInfo ? (
          <div style={{ textAlign: "center", padding: "24px" }}>
            <div style={{ color: "#ef4444", marginBottom: "14px", display: "flex", justifyContent: "center" }}>
              <AlertCircle size={52} />
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: "18px", color: "#991b1b", fontWeight: 700 }}>Invitation Not Valid</h3>
            <p style={{ margin: "0 0 24px", color: "#64748b", fontSize: "14px", lineHeight: 1.5 }}>
              {err}
            </p>
            <button className="btn ghost" onClick={onCancel}>Back to PawCare Home</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate onChangeCapture={e=>{if(e.target.name)touch(e.target.name);}}>
            
            {/* Authorized Role Card */}
            <div style={{
              background: isVet ? "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)" : "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
              border: `1.5px solid ${isVet ? "#93c5fd" : "#fcd34d"}`,
              borderRadius: "16px",
              padding: "16px 18px",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "14px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
            }}>
              <div style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: isVet ? "#2563eb" : "#d97706",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}>
                {isVet ? <Stethoscope size={24} /> : <ConciergeBell size={24} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: isVet ? "#1e40af" : "#92400e" }}>
                    Authorized Role: {roleName}
                  </span>
                  <span style={{ background: "#dcfce7", color: "#15803d", border: "1px solid #86efac", padding: "1px 6px", borderRadius: "99px", fontSize: "10.5px", fontWeight: 700 }}>
                    ✓ Pre-Verified Email
                  </span>
                </div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {invInfo?.email}
                </div>
                <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "2px" }}>
                  Only SMS phone verification will be required after setup.
                </div>
              </div>
            </div>

            {err && !err.includes("Missing staff invitation token") && (
              <div role="alert" style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#991b1b",
                borderRadius: "12px",
                padding: "12px 14px",
                fontSize: "13px",
                marginBottom: "18px",
                display: "flex",
                alignItems: "center",
                gap: "10px"
              }}>
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{err}</span>
              </div>
            )}

            {/* Section: Personal Information */}
            <div style={{ marginBottom: "18px" }}>
              <span style={{ fontSize: "11.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#64748b", display: "block", marginBottom: "8px" }}>
                1. Personal Details
              </span>

              {/* Name Grid */}
              <div className="staff-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: "10px", marginBottom: "12px" }}>
                <div className="fld" style={{ margin: 0 }}>
                  <label htmlFor="staff-fn">First Name<i> *</i></label>
                  <input
                    id="staff-fn"
                    type="text"
                    placeholder="First name"
                    name="firstName" value={formData.firstName}
                    className={getFieldError("firstName") ? "bad" : isFieldValid("firstName") ? "ok" : ""}
                    onChange={e => {
                      const raw = e.target.value;
                      if (/\d/.test(raw)) setNumWarn("Numbers not allowed in names."); else setNumWarn("");
                      setFormData({ ...formData, firstName: raw.replace(/[0-9]/g, "") });
                    }}
                    onBlur={() => {
                      touch("firstName");
                      if (formData.firstName.trim()) setFormData(p => ({ ...p, firstName: tc(p.firstName.trim()) }));
                    }}
                    required
                  />
                  {getFieldError("firstName") && <span className="err" style={{ fontSize: "11px" }}>{getFieldError("firstName")}</span>}
                </div>

                <div className="fld" style={{ margin: 0 }}>
                  <label htmlFor="staff-ln">Last Name<i> *</i></label>
                  <input
                    id="staff-ln"
                    type="text"
                    placeholder="Last name"
                    name="lastName" value={formData.lastName}
                    className={getFieldError("lastName") ? "bad" : isFieldValid("lastName") ? "ok" : ""}
                    onChange={e => {
                      const raw = e.target.value;
                      if (/\d/.test(raw)) setNumWarn("Numbers not allowed in names."); else setNumWarn("");
                      setFormData({ ...formData, lastName: raw.replace(/[0-9]/g, "") });
                    }}
                    onBlur={() => {
                      touch("lastName");
                      if (formData.lastName.trim()) setFormData(p => ({ ...p, lastName: tc(p.lastName.trim()) }));
                    }}
                    required
                  />
                  {getFieldError("lastName") && <span className="err" style={{ fontSize: "11px" }}>{getFieldError("lastName")}</span>}
                </div>

                <div className="fld" style={{ margin: 0 }}>
                  <label htmlFor="staff-mi">M.I.</label>
                  <input
                    id="staff-mi"
                    type="text"
                    maxLength={2}
                    placeholder="M."
                    name="middleInitial" value={formData.middleInitial}
                    className={getFieldError("middleInitial") ? "bad" : ""}
                    onChange={e => setFormData({ ...formData, middleInitial: e.target.value.replace(/[0-9]/g, "").toUpperCase() })}
                    onBlur={() => touch("middleInitial")}
                  />
                </div>
              </div>
              {numWarn && <p style={{ fontSize: "11.5px", color: "#dc2626", margin: "-6px 0 8px" }}>{numWarn}</p>}

              {/* Birthday */}
              <div className="fld" style={{ marginBottom: "12px" }}>
                <label htmlFor="staff-bday">Date of Birth (Must be at least 18 years old)<i> *</i></label>
                <input
                  id="staff-bday"
                  type="date"
                  name="birthday" value={formData.birthday}
                  max={new Date(new Date().getFullYear() - 18, new Date().getMonth(), new Date().getDate()).toISOString().slice(0, 10)}
                  className={getFieldError("birthday") ? "bad" : isFieldValid("birthday") ? "ok" : ""}
                  onChange={e => setFormData({ ...formData, birthday: e.target.value })}
                  onBlur={() => touch("birthday")}
                  required
                />
                {getFieldError("birthday") && <span className="err" style={{ fontSize: "11.5px" }}>{getFieldError("birthday")}</span>}
              </div>
            </div>

            {/* Section: Residential Address */}
            <div style={{ marginBottom: "18px" }}>
              <span style={{ fontSize: "11.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#64748b", display: "block", marginBottom: "8px" }}>
                2. Residential Address
              </span>

              <div className="fld" style={{ marginBottom: "10px" }}>
                <label htmlFor="staff-street">House No. &amp; Street<i> *</i></label>
                <input
                  id="staff-street"
                  type="text"
                  placeholder="e.g. 128 Rizal Avenue, Brgy. 45"
                  name="houseStreet" value={formData.houseStreet}
                  className={getFieldError("houseStreet") ? "bad" : isFieldValid("houseStreet") ? "ok" : ""}
                  onChange={e => setFormData({ ...formData, houseStreet: e.target.value })}
                  onBlur={() => {
                    touch("houseStreet");
                    if (formData.houseStreet.trim()) setFormData(p => ({ ...p, houseStreet: tc(p.houseStreet.trim()) }));
                  }}
                  required
                />
                {getFieldError("houseStreet") && <span className="err" style={{ fontSize: "11px" }}>{getFieldError("houseStreet")}</span>}
              </div>

              <div className="staff-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px", gap: "10px" }}>
                <div className="fld" style={{ margin: 0 }}>
                  <label htmlFor="staff-city">City / Municipality<i> *</i></label>
                  <input
                    id="staff-city"
                    type="text"
                    placeholder="e.g. Caloocan City"
                    name="city" value={formData.city}
                    className={getFieldError("city") ? "bad" : isFieldValid("city") ? "ok" : ""}
                    onChange={e => setFormData({ ...formData, city: e.target.value })}
                    onBlur={() => {
                      touch("city");
                      if (formData.city.trim()) setFormData(p => ({ ...p, city: tc(p.city.trim()) }));
                    }}
                    required
                  />
                </div>

                <div className="fld" style={{ margin: 0 }}>
                  <label htmlFor="staff-state">Province / State<i> *</i></label>
                  <input
                    id="staff-state"
                    type="text"
                    placeholder="e.g. Metro Manila"
                    name="state" value={formData.state}
                    onChange={e => setFormData({ ...formData, state: e.target.value })}
                    onBlur={() => { if (formData.state.trim()) setFormData(p => ({ ...p, state: tc(p.state.trim()) })); }}
                    required
                  />
                </div>

                <div className="fld" style={{ margin: 0 }}>
                  <label htmlFor="staff-zip">ZIP Code</label>
                  <input
                    id="staff-zip"
                    type="text"
                    maxLength={10}
                    placeholder="1400"
                    name="zipCode" value={formData.zipCode}
                    onChange={e => setFormData({ ...formData, zipCode: e.target.value.trim() })}
                  />
                </div>
              </div>
            </div>

            {/* Section: Contact & Mobile OTP Verification */}
            <div style={{ marginBottom: "18px" }}>
              <span style={{ fontSize: "11.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#64748b", display: "block", marginBottom: "8px" }}>
                3. Security &amp; SMS OTP Setup
              </span>

              {/* Mobile Number for TextBee SMS OTP */}
              <div className="fld" style={{ marginBottom: "14px" }}>
                <label htmlFor="staff-phone" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Phone size={14} color="#2563eb" />
                  <span>Mobile Number for TextBee SMS OTP<i> *</i></span>
                </label>
                <input
                  id="staff-phone"
                  type="tel"
                  placeholder="+63 917 123 4567"
                  name="mobileNumber" value={formData.mobileNumber}
                  className={getFieldError("mobileNumber") ? "bad" : isFieldValid("mobileNumber") ? "ok" : ""}
                  onChange={e => setFormData({ ...formData, mobileNumber: e.target.value })}
                  onBlur={() => touch("mobileNumber")}
                  required
                />
                {getFieldError("mobileNumber") ? (
                  <span className="err" style={{ fontSize: "11.5px" }}>{getFieldError("mobileNumber")}</span>
                ) : (
                  <span style={{ fontSize: "11px", color: "#64748b", marginTop: "3px", display: "block" }}>
                    A 6-digit SMS verification code will be sent to this number to verify your mobile identity.
                  </span>
                )}
              </div>

              {/* Password */}
              <div className="fld" style={{ marginBottom: "12px" }}>
                <label htmlFor="staff-pw" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Lock size={14} color="#2563eb" />
                  <span>Create Staff Password<i> *</i></span>
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="staff-pw"
                    type={showPw ? "text" : "password"}
                    placeholder="12+ characters with uppercase, lowercase, number, and symbol"
                    name="password" value={formData.password}
                    className={getFieldError("password") ? "bad" : isFieldValid("password") ? "ok" : ""}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    onBlur={() => touch("password")}
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
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Password Quality Indicator */}
                <div style={{ marginTop: "6px", display: "flex", gap: "4px" }}>
                  <div style={{ height: "4px", flex: 1, borderRadius: "2px", background: pwStrengthCount >= 2 ? "#ef4444" : "#e2e8f0" }} />
                  <div style={{ height: "4px", flex: 1, borderRadius: "2px", background: pwStrengthCount >= 3 ? "#f59e0b" : "#e2e8f0" }} />
                  <div style={{ height: "4px", flex: 1, borderRadius: "2px", background: pwStrengthCount >= 4 ? "#3b82f6" : "#e2e8f0" }} />
                  <div style={{ height: "4px", flex: 1, borderRadius: "2px", background: pwStrengthCount >= 5 ? "#10b981" : "#e2e8f0" }} />
                </div>
                
                {/* Rules Checklist */}
                <div className="staff-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 8px", marginTop: "8px", fontSize: "11px", color: "#64748b" }}>
                  {PW_RULES.map(([testFn, label], idx) => {
                    const ok = testFn(formData.password);
                    return (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: "4px", color: ok ? "#15803d" : "#64748b" }}>
                        <span style={{ fontSize: "12px", fontWeight: 700 }}>{ok ? "✓" : "○"}</span>
                        <span>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Confirm Password */}
              <div className="fld" style={{ marginBottom: "16px" }}>
                <label htmlFor="staff-cpw">Confirm Password<i> *</i></label>
                <div style={{ position: "relative" }}>
                  <input
                    id="staff-cpw"
                    type={showConfirmPw ? "text" : "password"}
                    placeholder="Re-enter your password"
                    name="confirmPassword" value={formData.confirmPassword}
                    className={getFieldError("confirmPassword") ? "bad" : isFieldValid("confirmPassword") ? "ok" : ""}
                    onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                    onBlur={() => touch("confirmPassword")}
                    style={{ width: "100%", paddingRight: "40px" }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw(!showConfirmPw)}
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
                    aria-label={showConfirmPw ? "Hide password" : "Show password"}
                  >
                    {showConfirmPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {getFieldError("confirmPassword") && <span className="err" style={{ fontSize: "11px" }}>{getFieldError("confirmPassword")}</span>}
              </div>
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
                padding: "13px",
                fontSize: "15px",
                fontWeight: 700,
                borderRadius: "12px"
              }}
            >
              <ShieldCheck size={18} />
              <span>{submitting ? "Activating Staff Account..." : "Activate Account & Request SMS OTP"}</span>
            </button>

            <div style={{ textAlign: "center", marginTop: "14px" }}>
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
    </AuthShell>
  );
}
