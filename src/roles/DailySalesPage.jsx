import { useState } from "react";
import {
  Receipt,
  DollarSign,
  CreditCard,
  Calendar,
  Search,
  CheckCircle2,
  Clock,
  Printer,
  TrendingUp,
  AlertCircle,
  FileText,
  User,
  PawPrint,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { TODAY, plus, ymd, petName, ownerName } from "../lib.jsx";
import BillingModal from "./BillingModal.jsx";

export default function DailySalesPage({ db, setDb, me, go, say }) {
  const [selDate, setSelDate] = useState(TODAY);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [receiptAppt, setReceiptAppt] = useState(null);

  // Appointments on selected date
  const dayAppts = (db.appts || []).filter(a => a.date === selDate && a.status !== "Cancelled");
  const paidAppts = dayAppts.filter(a => a.billingStatus === "Paid");
  const unbilledCompleted = dayAppts.filter(a => a.status === "Completed" && a.billingStatus !== "Paid");

  const totalRevenue = paidAppts.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
  const unbilledRevenue = unbilledCompleted.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);

  // Method breakdown
  const cashTotal = paidAppts.filter(a => (a.paymentMethod || "Cash").toLowerCase() === "cash").reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
  const gcashTotal = paidAppts.filter(a => (a.paymentMethod || "").toLowerCase().includes("gcash")).reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
  const cardTotal = paidAppts.filter(a => (a.paymentMethod || "").toLowerCase().includes("card") || (a.paymentMethod || "").toLowerCase().includes("maya")).reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);

  // Filtered paid list
  const filteredPaid = paidAppts.filter(a => {
    if (methodFilter !== "all" && (a.paymentMethod || "Cash").toLowerCase() !== methodFilter.toLowerCase()) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const pet = (db.pets || []).find(p => p.id === a.petId) || {};
    const owner = (db.owners || []).find(o => o.id === pet.ownerId) || {};
    return (
      (pet.name && pet.name.toLowerCase().includes(q)) ||
      (owner.name && owner.name.toLowerCase().includes(q)) ||
      (a.reason && a.reason.toLowerCase().includes(q)) ||
      (a.id && a.id.toLowerCase().includes(q)) ||
      (a.paymentMethod && a.paymentMethod.toLowerCase().includes(q))
    );
  });

  const stepDate = (days) => {
    const cur = new Date(selDate + "T00:00:00");
    cur.setDate(cur.getDate() + days);
    setSelDate(ymd(cur));
  };

  const isToday = selDate === TODAY;

  return (
    <div>
      {/* Top Controls Toolbar */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "14px",
        background: "#ffffff",
        padding: "16px 20px",
        borderRadius: "14px",
        border: "1px solid #e2e8f0",
        marginBottom: "18px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
      }}>
        {/* Date Selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => stepDate(-1)}
            style={{ padding: "6px 8px" }}
            title="Previous Day"
          >
            <ChevronLeft size={16} />
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "#f8fafc", padding: "4px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
            <Calendar size={16} color="var(--navy)" />
            <input
              type="date"
              value={selDate}
              onChange={e => setSelDate(e.target.value)}
              style={{ border: "none", background: "transparent", fontWeight: 700, fontSize: "14px", color: "var(--navy)", outline: "none", cursor: "pointer" }}
            />
          </div>

          <button
            type="button"
            className="btn ghost sm"
            onClick={() => stepDate(1)}
            style={{ padding: "6px 8px" }}
            title="Next Day"
          >
            <ChevronRight size={16} />
          </button>

          {!isToday && (
            <button
              type="button"
              className="btn sm gold"
              onClick={() => setSelDate(TODAY)}
              style={{ padding: "5px 12px", fontSize: "12px", fontWeight: 700 }}
            >
              Today
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            className="btn sm ghost"
            onClick={() => window.print()}
            style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, border: "1px solid #cbd5e1" }}
          >
            <Printer size={15} /> 🖨️ Print Daily Z-Reading
          </button>
        </div>
      </div>

      {/* Financial Overview Metrics Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
        gap: "14px",
        marginBottom: "18px"
      }}>
        {/* Gross Sales */}
        <div style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)", color: "#fff", padding: "18px 20px", borderRadius: "14px", boxShadow: "0 4px 12px rgba(30, 58, 138, 0.15)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#93c5fd" }}>
              Total Collections ({isToday ? "Today" : selDate})
            </span>
            <DollarSign size={20} color="#60a5fa" />
          </div>
          <div style={{ fontSize: "28px", fontWeight: 800 }}>
            ₱{totalRevenue.toLocaleString()}
          </div>
          <div style={{ fontSize: "12px", color: "#bfdbfe", marginTop: "4px" }}>
            {paidAppts.length} settled transaction{paidAppts.length === 1 ? "" : "s"}
          </div>
        </div>

        {/* Cash Breakdown */}
        <div style={{ background: "#ffffff", padding: "18px 20px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#64748b" }}>
              Cash Received
            </span>
            <span style={{ fontSize: "18px" }}>💵</span>
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "#166534" }}>
            ₱{cashTotal.toLocaleString()}
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
            {paidAppts.filter(a => (a.paymentMethod || "Cash").toLowerCase() === "cash").length} cash receipt(s)
          </div>
        </div>

        {/* Digital / Online Payments (GCash & Card) */}
        <div style={{ background: "#ffffff", padding: "18px 20px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#64748b" }}>
              Digital (GCash / Card)
            </span>
            <CreditCard size={18} color="#0284c7" />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "#0369a1" }}>
            ₱{(gcashTotal + cardTotal).toLocaleString()}
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
            GCash: ₱{gcashTotal.toLocaleString()} &bull; Card/Maya: ₱{cardTotal.toLocaleString()}
          </div>
        </div>

        {/* Pending Unbilled */}
        <div style={{ background: unbilledCompleted.length > 0 ? "#fffbeb" : "#f8fafc", padding: "18px 20px", borderRadius: "14px", border: unbilledCompleted.length > 0 ? "1.5px solid #fde047" : "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: unbilledCompleted.length > 0 ? "#854d0e" : "#64748b" }}>
              Ready for Checkout
            </span>
            <Clock size={18} color={unbilledCompleted.length > 0 ? "#d97706" : "#94a3b8"} />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: unbilledCompleted.length > 0 ? "#b45309" : "#64748b" }}>
            {unbilledCompleted.length}
          </div>
          <div style={{ fontSize: "12px", color: unbilledCompleted.length > 0 ? "#854d0e" : "#64748b", marginTop: "4px" }}>
            {unbilledCompleted.length > 0 ? `₱${unbilledRevenue.toLocaleString()} pending settlement` : "No pending checkouts"}
          </div>
        </div>
      </div>

      {/* Amber Banner: If visits are completed by doctor and waiting for front desk checkout */}
      {unbilledCompleted.length > 0 && (
        <div style={{ background: "#fefce8", border: "1.5px solid #fde047", borderRadius: "12px", padding: "14px 18px", marginBottom: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ background: "#fef08a", color: "#854d0e", padding: "8px", borderRadius: "8px" }}>
                <AlertCircle size={22} />
              </div>
              <div>
                <b style={{ color: "#854d0e", fontSize: "14px" }}>
                  {unbilledCompleted.length} Completed Visit(s) Waiting for Billing Checkout
                </b>
                <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "#713f12" }}>
                  The attending veterinarian has signed off on these patients. Settle their invoices below to finalize the transaction.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {unbilledCompleted.map(a => {
                const p = (db.pets || []).find(pt => pt.id === a.petId) || {};
                return (
                  <button
                    key={a.id}
                    className="btn sm gold"
                    onClick={() => setReceiptAppt(a)}
                    style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "5px" }}
                  >
                    <span>🧾 Bill {p.name || "Patient"}</span>
                    <span>(₱{a.amount})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Transactions Ledger Table */}
      <section className="card" style={{ padding: "0", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", flex: "1 1 320px" }}>
            <h3 style={{ margin: 0, fontSize: "16px", color: "var(--navy)" }}>
              Daily Sales Ledger &bull; {selDate}
            </h3>

            {/* Method filter */}
            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
              style={{ padding: "5px 10px", fontSize: "12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            >
              <option value="all">All Payment Methods</option>
              <option value="Cash">Cash</option>
              <option value="GCash">GCash</option>
              <option value="Maya">Maya</option>
              <option value="Credit Card">Credit / Debit Card</option>
            </select>
          </div>

          <div style={{ position: "relative", width: "240px" }}>
            <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input
              type="search"
              placeholder="Filter by owner, pet, OR#..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", padding: "6px 10px 6px 32px", fontSize: "12.5px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            />
          </div>
        </div>

        {filteredPaid.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#f8fafc", color: "#475569", borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ padding: "12px 16px" }}>Time &bull; Receipt #</th>
                  <th style={{ padding: "12px 16px" }}>Patient &bull; Owner</th>
                  <th style={{ padding: "12px 16px" }}>Services Rendered</th>
                  <th style={{ padding: "12px 16px" }}>Payment Method</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Amount Collected</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPaid.map(a => {
                  const pet = (db.pets || []).find(p => p.id === a.petId) || {};
                  const owner = (db.owners || []).find(o => o.id === pet.ownerId) || {};
                  const orNumber = `OR-${a.date.replace(/-/g, "")}-${a.id.slice(-4).toUpperCase()}`;

                  return (
                    <tr
                      key={a.id}
                      onClick={() => setReceiptAppt(a)}
                      style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer", transition: "background 0.15s ease" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#f0f9ff")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      title="Click to view full official receipt and print invoice"
                    >
                      {/* Time and OR */}
                      <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                        <b style={{ color: "var(--navy)" }}>{a.time}</b>
                        <small style={{ display: "block", color: "#64748b", fontFamily: "monospace", fontSize: "11px" }}>
                          {orNumber}
                        </small>
                      </td>

                      {/* Patient & Owner */}
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontWeight: 700, color: "var(--navy)" }}>
                          {pet.name || "Patient"}
                        </div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>
                          Owner: {owner.name || a.ownerName || "Walk-in Client"}
                        </div>
                      </td>

                      {/* Services Rendered */}
                      <td style={{ padding: "12px 16px", maxWidth: "260px" }}>
                        <div style={{ fontWeight: 500, color: "#1e293b" }}>
                          {a.reason || "Clinical Consultation / Exam"}
                        </div>
                        {a.invoiceItems && a.invoiceItems.length > 1 && (
                          <small style={{ color: "#64748b" }}>
                            +{a.invoiceItems.length - 1} additional procedure/medication item(s)
                          </small>
                        )}
                      </td>

                      {/* Payment Method */}
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          padding: "3px 8px",
                          borderRadius: "6px",
                          fontSize: "11.5px",
                          fontWeight: 700,
                          background: (a.paymentMethod || "").toLowerCase().includes("cash") ? "#ecfdf5" : "#eff6ff",
                          color: (a.paymentMethod || "").toLowerCase().includes("cash") ? "#047857" : "#0369a1",
                          border: (a.paymentMethod || "").toLowerCase().includes("cash") ? "1px solid #a7f3d0" : "1px solid #bfdbfe",
                        }}>
                          {a.paymentMethod || "Cash"}
                        </span>
                      </td>

                      {/* Amount */}
                      <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <b style={{ fontSize: "14.5px", color: "#0f172a" }}>
                          ₱{(parseFloat(a.amount) || 0).toLocaleString()}
                        </b>
                      </td>

                      {/* Action */}
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn sm ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReceiptAppt(a);
                          }}
                          style={{ padding: "4px 8px", fontSize: "11.5px", fontWeight: 600, color: "var(--navy)", border: "1px solid #cbd5e1" }}
                        >
                          View Receipt
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty sm" style={{ padding: "36px 20px", textAlign: "center" }}>
            No settled transactions recorded on {selDate}.
          </div>
        )}
      </section>

      {/* Full Official Receipt / Checkout Modal */}
      {receiptAppt && (
        <BillingModal
          appt={receiptAppt}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setReceiptAppt(null)}
          onPaid={(paidRecord) => {
            setReceiptAppt(null);
            say && say(`Payment of ₱${paidRecord?.amount?.toLocaleString() || ""} settled successfully!`);
          }}
        />
      )}
    </div>
  );
}

