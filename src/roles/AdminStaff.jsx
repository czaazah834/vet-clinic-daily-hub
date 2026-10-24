import { useRef, useState } from 'react';
import { useClinicRead } from '../useClinicRead.js';
import { api } from '../api.js';
import {
  Shield,
  UserCheck,
  UserX,
  Lock,
  Unlock,
  Mail,
  Phone,
  Search,
  RefreshCw,
  Plus,
  Stethoscope,
  ConciergeBell,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  User
} from 'lucide-react';

export function useAdminStaff() {
  return useClinicRead('/api/admin/staff', 15000);
}

export default function AdminStaff({ onInvite }) {
  const { data, error, loading, load } = useAdminStaff();
  const [filter, setFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const busy = useRef(false);

  const choose = (person, action) => {
    setTarget({ ...person, action });
    setReason('');
    setSaveError('');
    setNotice('');
  };

  const save = async (e) => {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const path = target.action === 'revoke'
        ? `/api/admin/invitations/${encodeURIComponent(target.id)}/revoke`
        : `/api/admin/staff/${encodeURIComponent(target.id)}/access`;
      const result = await api.post(path, { action: target.action, revision: target.revision, reason: reason.trim() });
      if (result?.success !== true) {
        throw Error("The server did not confirm this access change. Refresh staff to check its current status.");
      }
      setNotice(target.action === 'revoke' ? 'Invitation successfully revoked.' : `${target.name}: ${target.action} saved. Existing sessions were terminated; staff member must re-authenticate.`);
      setTarget(null);
      await load();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const staff = (data?.staff || []).filter(u => {
    const matchesQuery = `${u.name} ${u.email} ${u.role} ${u.vetId || ''}`.toLowerCase().includes(filter.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesQuery && matchesRole;
  });

  const invitations = data?.invitations || [];

  return (
    <>
      {/* Top Banner & Management Actions */}
      <section className="card" style={{ padding: "26px", marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
              color: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}>
              <Shield size={24} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "20px", color: "var(--navy, #0f172a)", fontWeight: 800 }}>
                Staff Access &amp; Role Management
              </h2>
              <p style={{ margin: "3px 0 0", fontSize: "13px", color: "#64748b" }}>
                Authorize veterinarians and assistants, monitor 2-factor SMS status, and govern session security.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn gold"
              onClick={onInvite}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 700 }}
            >
              <Plus size={16} />
              <span>Invite Staff Member</span>
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={loading}
              onClick={() => load()}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <RefreshCw size={14} className={loading ? "spin" : ""} />
              <span>{loading ? "Refreshing..." : "Refresh Staff"}</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", background: "#f8fafc", padding: "12px 16px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
          <div style={{ position: "relative", flex: "1 1 240px" }}>
            <Search size={15} color="#94a3b8" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="search"
              aria-label="Search staff"
              placeholder="Search by name, email, or doctor ID..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{ width: "100%", paddingLeft: "34px", fontSize: "13px" }}
            />
          </div>

          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Role:</span>
            {['all', 'vet', 'assistant'].map(r => (
              <button
                key={r}
                type="button"
                className={`btn sm ${roleFilter === r ? 'gold' : 'ghost'}`}
                onClick={() => setRoleFilter(r)}
                style={{ fontSize: "11.5px", padding: "4px 10px", borderRadius: "99px" }}
              >
                {r === 'all' ? 'All Staff' : r === 'vet' ? 'Veterinarians' : 'Assistants'}
              </button>
            ))}
          </div>
        </div>

        {notice && (
          <div role="status" style={{ background: "#f0fdf4", border: "1px solid #86efac", color: "#15803d", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", marginTop: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
            <CheckCircle2 size={16} />
            <span>{notice}</span>
          </div>
        )}

        {error && (
          <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", marginTop: "14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>{error} {data && '(Showing cached staff records)'}</span>
            <button className="btn ghost sm" onClick={() => load()}>Retry</button>
          </div>
        )}

        {/* Staff Directory Cards Grid */}
        <div style={{ marginTop: "20px" }}>
          {!data && loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "14px" }}>
              {[1, 2].map(k => (
                <div key={k} className="card" style={{ padding: "20px", minHeight: "160px", background: "#f8fafc", border: "1.5px dashed #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
                  <span style={{ fontSize: "13px" }}>Loading staff accounts…</span>
                </div>
              ))}
            </div>
          ) : data && !staff.length ? (
            <div className="empty sm" style={{ padding: "32px 16px" }}>
              <p style={{ margin: 0, fontWeight: 600, color: "#64748b" }}>
                {filter.trim() ? "No staff accounts match your search filter." : "No staff accounts found. Click '+ Invite Staff Member' to get started."}
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "14px" }}>
              {staff.map(u => {
                const isVet = u.role === 'vet';
                const initials = (u.name || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <article
                    key={u.id}
                    style={{
                      background: "#ffffff",
                      border: `1.5px solid ${!u.active ? "#cbd5e1" : u.locked ? "#fca5a5" : "#e2e8f0"}`,
                      borderRadius: "16px",
                      padding: "18px",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <div>
                      {/* Top Row: Avatar & Status */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{
                            width: "42px",
                            height: "42px",
                            borderRadius: "12px",
                            background: isVet ? "#eff6ff" : "#fffbeb",
                            color: isVet ? "#2563eb" : "#d97706",
                            border: `1px solid ${isVet ? "#bfdbfe" : "#fde68a"}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 800,
                            fontSize: "15px"
                          }}>
                            {initials}
                          </div>
                          <div>
                            <h3 style={{ margin: 0, fontSize: "15.5px", color: "var(--navy, #0f172a)", fontWeight: 700 }}>
                              {u.name}
                            </h3>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                              <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                fontSize: "11px",
                                fontWeight: 700,
                                color: isVet ? "#1d4ed8" : "#b45309"
                              }}>
                                {isVet ? <Stethoscope size={11} /> : <ConciergeBell size={11} />}
                                <span>{isVet ? 'Veterinarian' : 'Vet Assistant'}</span>
                              </span>
                              {u.vetId && (
                                <span style={{ fontSize: "10.5px", background: "#f1f5f9", color: "#475569", padding: "1px 5px", borderRadius: "4px", fontFamily: "monospace" }}>
                                  {u.vetId}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Status Pills */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                          <span style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "99px",
                            background: !u.active ? "#f1f5f9" : u.locked ? "#fef2f2" : "#ecfdf5",
                            color: !u.active ? "#64748b" : u.locked ? "#dc2626" : "#059669",
                            border: `1px solid ${!u.active ? "#cbd5e1" : u.locked ? "#fecaca" : "#a7f3d0"}`
                          }}>
                            {!u.active ? "○ Inactive" : u.locked ? "🔒 Locked" : "● Active"}
                          </span>
                        </div>
                      </div>

                      {/* Contact Info */}
                      <div style={{ fontSize: "12px", color: "#64748b", margin: "10px 0 12px", display: "grid", gap: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <Mail size={13} color="#94a3b8" />
                          <span style={{ color: "#334155" }}>{u.email}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <Phone size={13} color={u.mobileVerified ? "#16a34a" : "#d97706"} />
                          <span style={{ color: u.mobileVerified ? "#15803d" : "#b45309", fontWeight: 600 }}>
                            {u.mobileVerified ? "✓ Mobile OTP Verified" : "⏳ Pending SMS 2FA"}
                          </span>
                        </div>
                      </div>

                      {u.reason && (
                        <div style={{ background: "#f8fafc", padding: "6px 10px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "11px", color: "#475569", marginBottom: "12px" }}>
                          <b>Last access note:</b> {u.reason}
                        </div>
                      )}
                    </div>

                    {/* Actions Row */}
                    <div style={{ display: "flex", gap: "8px", paddingTop: "12px", borderTop: "1px solid #f1f5f9", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className={`btn sm ${u.active ? 'ghost' : 'gold'}`}
                        style={{ fontSize: "12px", padding: "4px 10px", flex: 1 }}
                        onClick={() => choose(u, u.active ? 'deactivate' : 'reactivate')}
                      >
                        {u.active ? <UserX size={13} style={{ marginRight: 4 }} /> : <UserCheck size={13} style={{ marginRight: 4 }} />}
                        <span>{u.active ? 'Deactivate' : 'Reactivate'}</span>
                      </button>

                      {u.active && u.locked && (
                        <button
                          type="button"
                          className="btn sm"
                          style={{ fontSize: "12px", padding: "4px 10px", background: "#fef2f2", color: "#dc2626", borderColor: "#fecaca" }}
                          onClick={() => choose(u, 'unlock')}
                        >
                          <Unlock size={13} style={{ marginRight: 4 }} />
                          <span>Unlock Account</span>
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Recent Staff Invitations Section */}
      <section className="card" style={{ padding: "26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "17px", color: "var(--navy, #0f172a)", fontWeight: 700 }}>
              Staff Invitation Dispatches
            </h3>
            <p style={{ margin: 0, fontSize: "12.5px", color: "#64748b" }}>
              Secure invitation links expire after 7 days. Revoking immediately voids the token.
            </p>
          </div>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>
            {invitations.length} Total Dispatched
          </span>
        </div>

        {!data && loading ? (
          <div className="empty sm" style={{ padding: "24px 16px", color: "#94a3b8" }}>
            <p style={{ margin: 0 }}>Loading invitation records…</p>
          </div>
        ) : data && !invitations.length ? (
          <div className="empty sm" style={{ padding: "24px 16px" }}>
            <p style={{ margin: 0, color: "#64748b" }}>No staff invitations created yet.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "14px" }}>
            <table className="tbl" style={{ margin: 0, fontSize: "12.5px" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ padding: "10px 14px" }}>Staff Member</th>
                  <th style={{ padding: "10px 14px" }}>Role</th>
                  <th style={{ padding: "10px 14px" }}>Status</th>
                  <th style={{ padding: "10px 14px" }}>Link Expiration</th>
                  <th style={{ padding: "10px 14px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map(i => {
                  const isPending = i.status === 'Pending';
                  const isAccepted = i.status === 'Accepted';
                  return (
                    <tr key={i.id}>
                      <td style={{ padding: "10px 14px" }}>
                        <b style={{ color: "#0f172a" }}>{i.name}</b>
                        <div style={{ fontSize: "11.5px", color: "#64748b" }}>{i.email}</div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          background: i.role === 'vet' ? "#eff6ff" : "#fffbeb",
                          color: i.role === 'vet' ? "#1d4ed8" : "#b45309",
                          border: `1px solid ${i.role === 'vet' ? "#bfdbfe" : "#fde68a"}`,
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontWeight: 700
                        }}>
                          {i.role === 'vet' ? 'Veterinarian' : 'Vet Assistant'}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "99px",
                          background: isPending ? "#fef3c7" : isAccepted ? "#dcfce7" : "#f1f5f9",
                          color: isPending ? "#b45309" : isAccepted ? "#15803d" : "#64748b",
                          border: `1px solid ${isPending ? "#fde68a" : isAccepted ? "#86efac" : "#cbd5e1"}`
                        }}>
                          {i.status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", color: "#64748b", whiteSpace: "nowrap" }}>
                        {new Date(i.expiresAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        {isPending ? (
                          <button
                            type="button"
                            className="btn ghost sm"
                            style={{ color: "#dc2626", borderColor: "#fecaca" }}
                            onClick={() => choose(i, 'revoke')}
                          >
                            Revoke Link
                          </button>
                        ) : (
                          <span style={{ fontSize: "11.5px", color: "#94a3b8" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Access Action Modal Dialog */}
      {target && (
        <div className="scrim" onMouseDown={e => e.target === e.currentTarget && !saving && setTarget(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="access-title" style={{ width: "min(540px, 100%)", borderRadius: "18px", padding: "26px" }}>
            <h3 id="access-title" style={{ margin: "0 0 6px", fontSize: "18px", color: "var(--navy, #0f172a)", fontWeight: 700 }}>
              {target.action[0].toUpperCase() + target.action.slice(1)}: {target.name}
            </h3>
            
            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
              {target.action === 'deactivate'
                ? 'This staff member will immediately lose clinic portal access. A veterinarian must hand off active consultation queues first. Reception must reassign upcoming visits.'
                : target.action === 'reactivate'
                ? 'Portal access will be restored; existing password and 2FA credentials remain intact. The staff member can sign in again.'
                : target.action === 'unlock'
                ? 'Clears security lock counters and requires a fresh login. Verification requirements still apply.'
                : 'This invitation activation link will immediately expire and cannot be redeemed.'}
            </p>

            <form onSubmit={save}>
              <div className="fld" style={{ marginBottom: "16px" }}>
                <label htmlFor="access-reason" style={{ fontWeight: 600, fontSize: "12.5px" }}>
                  Administrative Reason<i> *</i>
                </label>
                <textarea
                  id="access-reason"
                  aria-label="Access change reason"
                  required
                  maxLength={300}
                  rows={3}
                  placeholder="Enter the official reason for this access change (e.g. Leave of absence, staff departure, identity re-verified)..."
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  disabled={saving}
                  style={{ width: "100%", fontSize: "13px" }}
                />
                <span style={{ fontSize: "11px", color: "#64748b", marginTop: "3px", display: "block" }}>
                  Recorded in the immutable system audit trail for compliance.
                </span>
              </div>

              {saveError && (
                <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "8px", padding: "8px 12px", fontSize: "12.5px", marginBottom: "14px" }}>
                  {saveError}
                </div>
              )}

              <div className="row end" style={{ gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={saving}
                  onClick={() => setTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={target.action === 'deactivate' || target.action === 'revoke' ? 'btn danger' : 'btn gold'}
                  disabled={saving || !reason.trim()}
                >
                  {saving ? 'Saving...' : `Confirm ${target.action[0].toUpperCase() + target.action.slice(1)}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export function AdminAudit() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const { data, error, loading, load } = useClinicRead('/api/admin/audit?search=');

  const loadHistory = (cursor = null, term = query) => load(
    `/api/admin/audit?search=${encodeURIComponent(term)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    (old, result) => ({
      ...result,
      entries: cursor ? [...(old?.entries || []), ...result.entries] : result.entries,
      searchTerm: term
    })
  );

  const filteredEntries = (data?.entries || []).filter(l => {
    if (roleFilter === 'all') return true;
    const r = (l.role || l.user_role || '').toLowerCase();
    return r === roleFilter.toLowerCase();
  });

  const getRoleBadge = (role) => {
    const r = (role || '').toLowerCase();
    if (r === 'admin') return { label: 'Admin', bg: '#f3e8ff', color: '#7e22ce', border: '#d8b4fe' };
    if (r === 'vet') return { label: 'Veterinarian', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
    if (r === 'assistant') return { label: 'Vet Assistant', bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
    if (r === 'owner') return { label: 'Pet Owner', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
    return { label: role || 'System', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
  };

  return (
    <section className="card" style={{ padding: "26px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "44px",
            height: "44px",
            borderRadius: "12px",
            background: "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)",
            color: "#334155",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}>
            <FileText size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "20px", color: "var(--navy, #0f172a)", fontWeight: 800 }}>
              System Compliance &amp; Security Audit Trail
            </h2>
            <p style={{ margin: "3px 0 0", fontSize: "13px", color: "#64748b" }}>
              Tamper-evident chronological log of all administrative authorizations, clinical queues, and account actions.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn ghost sm"
          disabled={loading}
          onClick={() => loadHistory()}
          style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
        >
          <RefreshCw size={13} className={loading ? "spin" : ""} />
          <span>{loading ? "Syncing..." : "Refresh Trail"}</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ background: "#f8fafc", padding: "14px 18px", borderRadius: "14px", border: "1px solid #e2e8f0", marginBottom: "18px" }}>
        <form
          onSubmit={e => {
            e.preventDefault();
            if (loading) return;
            setQuery(search);
            loadHistory(null, search);
          }}
          style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "10px" }}
        >
          <div style={{ position: "relative", flex: "1 1 280px" }}>
            <Search size={15} color="#94a3b8" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="search"
              aria-label="Search audit history"
              maxLength={100}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search action keyword, actor name, or doctor ID..."
              style={{ width: "100%", paddingLeft: "34px", fontSize: "13px" }}
            />
          </div>
          <button className="btn gold" disabled={loading} style={{ whiteSpace: "nowrap", fontWeight: 600 }}>
            Search History
          </button>
          {query && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => { setSearch(''); setQuery(''); loadHistory(null, ''); }}
              style={{ whiteSpace: "nowrap" }}
            >
              Clear
            </button>
          )}
        </form>

        {/* Quick Role Filters */}
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", fontSize: "12px" }}>
          <span style={{ color: "#64748b", fontWeight: 600 }}>Actor Filter:</span>
          {[
            ['all', 'All Actors'],
            ['admin', 'Administrators'],
            ['vet', 'Veterinarians'],
            ['assistant', 'Vet Assistants'],
            ['owner', 'Pet Owners']
          ].map(([val, label]) => (
            <button
              key={val}
              type="button"
              className={`btn sm ${roleFilter === val ? 'gold' : 'ghost'}`}
              onClick={() => setRoleFilter(val)}
              style={{ fontSize: "11.5px", padding: "3px 10px", borderRadius: "99px" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", marginBottom: "14px" }}>
          {error} {data && '(Showing cached entries)'}
        </div>
      )}

      {/* Audit Entries List */}
      <div style={{ border: "1px solid #e2e8f0", borderRadius: "14px", overflow: "hidden" }}>
        {data && !filteredEntries.length ? (
          <div className="empty sm" style={{ padding: "32px 16px" }}>
            <p style={{ margin: 0, color: "#64748b", fontWeight: 600 }}>
              {query || roleFilter !== 'all' ? "No audit trail entries match your search criteria." : "No audit trail records saved yet."}
            </p>
          </div>
        ) : (
          <div style={{ display: "grid" }}>
            {filteredEntries.map((l, idx) => {
              const roleMeta = getRoleBadge(l.role || l.user_role);
              const dateStr = l.at || l.created_at;
              const formattedDate = dateStr
                ? new Date(dateStr).toLocaleDateString("en-PH", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                  })
                : "—";

              return (
                <div
                  key={l.id || idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "14px 18px",
                    borderBottom: idx < filteredEntries.length - 1 ? "1px solid #f1f5f9" : "none",
                    background: idx % 2 === 0 ? "#ffffff" : "#fbfcfd",
                    flexWrap: "wrap",
                    gap: "10px"
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "13.5px" }}>
                      {l.action || l.msg}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "12px", color: "#475569", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <User size={12} color="#64748b" />
                        <span><b>{l.actor || l.user_name || "System"}</b></span>
                      </span>
                      <span style={{
                        fontSize: "10.5px",
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: "4px",
                        background: roleMeta.bg,
                        color: roleMeta.color,
                        border: `1px solid ${roleMeta.border}`
                      }}>
                        {roleMeta.label}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>
                    <Clock size={12} />
                    <span>{formattedDate}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "16px", color: "#64748b", fontSize: "13px" }}>
          <span className="clinic-spinner" style={{ display: "inline-block", marginRight: "8px", verticalAlign: "middle" }} />
          Loading audit trail records...
        </div>
      )}

      {data?.nextCursor && query === (data.searchTerm || '') && (
        <div style={{ textAlign: "center", marginTop: "16px" }}>
          <button
            type="button"
            className="btn ghost sm"
            disabled={loading}
            onClick={() => loadHistory(data.nextCursor)}
            style={{ fontWeight: 600 }}
          >
            Load Older Audit Trail Entries
          </button>
        </div>
      )}
    </section>
  );
}
