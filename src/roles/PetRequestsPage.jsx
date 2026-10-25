import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ICON, I } from "../lib.jsx";
import PetApprovalModal from "./PetApprovalModal.jsx";

export default function PetRequestsPage({ db, setDb, me, say }) {
  const [filter, setFilter] = useState("Pending"); // 'All' | 'Pending' | 'Approved' | 'Declined'
  const [search, setSearch] = useState("");
  const [activeReq, setActiveReq] = useState(null);

  const reqs = db.petRequests || [];
  const pendingCount = reqs.filter(r => r.status === "Pending").length;

  const filtered = reqs.filter(r => {
    if (filter !== "All" && r.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const owner = db.owners.find(o => o.id === r.ownerId) || {};
      const str = `${r.name} ${r.species} ${r.breed} ${owner.name} ${owner.phone}`.toLowerCase();
      if (!str.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="staff-requests" style={{ padding: "0 0 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "22px", color: "var(--navy)" }}>
            Online Pet Registrations &amp; Digital Card Issuance
          </h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: "13.5px" }}>
            Owners register pets via the online portal. Approve registrations to automatically generate their official digital vaccination card and suggested protocols for veterinarian review.
          </p>
        </div>
      </div>

      {/* Filter and search bar */}
      <div className="card" style={{ padding: "14px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", flexWrap:"wrap", gap: "8px" }}>
            {["Pending", "Approved", "Declined", "All"].map(status => {
              const count = status === "All" ? reqs.length : reqs.filter(x => x.status === status).length;
              return (
                <button
                  key={status}
                  type="button"
                  className={`btn sm ${filter === status ? "gold" : "ghost"}`}
                  aria-pressed={filter === status}
                  onClick={() => setFilter(status)}
                >
                  {status} ({count})
                </button>
              );
            })}
          </div>

          <div style={{ minWidth: "220px" }}>
            <input
              type="search" aria-label="Search pet registrations"
              placeholder="Search pet, breed, owner..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: "6px 12px", width: "100%", fontSize: "13px" }}
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="card">
        {filtered.length ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {filtered.map(r => {
              const owner = db.owners.find(o => o.id === r.ownerId) || {};
              const isPending = r.status === "Pending";
              const isApproved = r.status === "Approved";
              const isDeclined = r.status === "Declined";

              return (
                <div
                  key={r.id}
                  onClick={() => setActiveReq(r)}
                  style={{
                    padding: "14px 16px",
                    borderRadius: "10px",
                    border: "1px solid " + (isPending ? "#86efac" : "#e2e8f0"),
                    background: isPending ? "#f0fdf4" : "#fff",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                  title={isPending ? "Review registration" : "View the recorded decision"}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <span style={{ fontSize: "28px", color: "var(--navy)" }}><I e={r.species || "paw"} size={28} /></span>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <b style={{ fontSize: "16px", color: "var(--navy)" }}>{r.name}</b>
                        <span style={{ fontSize: "12px", background: "#f1f5f9", padding: "2px 8px", borderRadius: "6px", color: "#334155" }}>
                          {r.species} &bull; {r.breed || "Mixed"} &bull; {r.sex}
                        </span>
                        <span
                          style={{
                            fontSize: "11.5px",
                            padding: "2px 8px",
                            borderRadius: "99px",
                            fontWeight: 700,
                            background: isPending ? "#fef3c7" : isApproved ? "#dcfce7" : "#fee2e2",
                            color: isPending ? "#92400e" : isApproved ? "#15803d" : "#991b1b",
                            border: `1px solid ${isPending ? "#fde047" : isApproved ? "#86efac" : "#fca5a5"}`
                          }}
                        >
                          {r.status}
                        </span>
                        {r.cardId && (
                          <span style={{ fontSize: "11.5px", background: "#e0f2fe", color: "#0369a1", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>
                            Card #{r.cardId}
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: "13px", color: "#475569", marginTop: "4px" }}>
                        <b>Owner:</b> {owner.name} ({owner.phone || "No phone"}) &bull; <b>Birth:</b> {r.birth} &bull; <b>Weight:</b> {r.weight} kg
                      </div>

                      {r.notes && (
                        <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px", fontStyle: "italic" }}>
                          Notes: &ldquo;{r.notes}&rdquo;
                        </div>
                      )}

                      {isDeclined && r.declineReason && (
                        <div style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px", fontWeight: 600 }}>
                          Declined reason: {r.declineReason}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    {isPending ? (
                      <button
                        className="btn gold sm"
                        onClick={() => setActiveReq(r)}
                        style={{ display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        <CheckCircle2 size={16} aria-hidden="true" />
                        <b>Review and issue card</b>
                      </button>
                    ) : isApproved ? (
                      <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: 600 }}>
                        Approved ({r.approvedAt || "date not recorded"})
                      </span>
                    ) : (
                      <button
                        className="btn ghost sm"
                        onClick={() => setActiveReq(r)}
                        title="View the recorded decision and correction instructions"
                      >
                        View decline details
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty sm">
            No pet registration requests found matching current filter.
          </div>
        )}
      </div>

      {activeReq && (
        <PetApprovalModal
          request={activeReq}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setActiveReq(null)}
          onProcessed={(action, newPet, cardId) => {
            setActiveReq(null);
            if (action === "approved") {
              say(`Pet approved! Digital Vaccination Card #${cardId} automatically created.`);
            } else {
              say("Pet registration request declined.");
            }
          }}
        />
      )}
    </div>
  );
}

