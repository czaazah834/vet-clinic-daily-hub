import { PaginatedList, PaginatedTable } from "../components/Pagination.jsx";
import {useFollowingClinicDay} from "../useClinicDay.js";
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
  ChevronRight,
  Coins
} from "lucide-react";
import { ymd } from "../lib.jsx";
import { today } from "../booking.js";
import { dailyCollections, pendingCheckout, paymentMethod, paymentTime, money } from "../assistantWorkflow.js";
import { ownerBill } from "../ownerBilling.js";
import BillingModal from "./BillingModal.jsx";

export default function DailySalesPage({ db, setDb, me, go, say }) {
  const TODAY = today();
  const [selDate, setSelDate] = useFollowingClinicDay();
  const [showUndated, setShowUndated] = useState(false);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [receiptAppt, setReceiptAppt] = useState(null);

  const collections = dailyCollections(db.appts || [], selDate);
  const pending = pendingCheckout(db.appts || [], selDate);
  const paidAppts = collections.paid, unbilledCompleted = pending.visits;
  const totalRevenue = collections.total;
  const cashTotal = collections.methods.cash, gcashTotal = collections.methods.gcash;
  const digitalTotal = [collections.methods.gcash, collections.methods.card, collections.methods.maya];
  const cardTotal = collections.methods.card, mayaTotal = collections.methods.maya;

  // Filtered paid list
  const filteredPaid = (showUndated ? collections.undated : paidAppts).filter(a => {
    if (methodFilter !== "all" && paymentMethod(a.paymentMethod) !== methodFilter) return false;
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

  if(db.summary && !db.historyComplete && selDate!==TODAY)return <section className="card"><h3>Historical sales</h3><p>Load all saved history above before viewing totals for {selDate}.</p><button className="btn ghost" onClick={()=>setSelDate(TODAY)}>Today's sales</button></section>;

  return (
    <div className="staff-sales">
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
        <div className="sales-date-controls" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => stepDate(-1)}
            style={{ padding: "6px 8px" }}
            title="Previous Day"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="sales-date-field" style={{ display: "flex", alignItems: "center", gap: "6px", background: "#f8fafc", padding: "4px 10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
            <Calendar size={16} color="var(--navy)" />
            <input
              type="date"
              value={selDate}
              aria-label="Report date"
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
            <Printer size={15} /> Print daily report
          </button>
        </div>
      </div>

      <p>Collections use the recorded payment date in Philippine time. Checkout counts refer to visits completed on {selDate}; saved draft charges may change before payment.</p>
      {(collections.missingAmounts > 0 || collections.methods.unrecorded !== 0 || collections.methods.other !== 0) && <p role="status">{collections.missingAmounts} payment(s) without a usable amount, excluded from totals. Other recorded methods: {money(collections.methods.other)}. Method not recorded: {money(collections.methods.unrecorded)}.</p>}
      {collections.undated.length > 0 && <p role="status">{collections.undated.length} payment(s) have no usable payment date and are excluded from daily totals. <button className="btn ghost sm" onClick={() => setShowUndated(v => !v)}>{showUndated ? "Show selected day" : "View undated payments"}</button></p>}
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
            {money(totalRevenue)}
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
            <Coins size={18} color="#166534" />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "#166534" }}>
            {money(cashTotal)}
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
            {paidAppts.filter(a => paymentMethod(a.paymentMethod) === "cash").length} cash receipt(s)
          </div>
        </div>

        {/* Digital / Online Payments (GCash & Card) */}
        <div style={{ background: "#ffffff", padding: "18px 20px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#64748b" }}>
              Digital (GCash / Card / Maya)
            </span>
            <CreditCard size={18} color="#0284c7" />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "#0369a1" }}>
            {money(digitalTotal.some(v => v === null) ? null : Math.round(digitalTotal.reduce((sum,v) => sum + v * 100,0)) / 100)}
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
            GCash: {money(gcashTotal)} &bull; Card: {money(cardTotal)} &bull; Maya: {money(mayaTotal)}
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
            {unbilledCompleted.length > 0 ? `${money(pending.draftTotal)} saved draft charges · ${pending.awaitingInvoice} awaiting invoice` : "No pending checkouts"}
          </div>
        </div>
      </div>

      {/* Amber Banner: If visits are completed by doctor and waiting for front desk checkout */}
      {me.role === "assistant" && unbilledCompleted.length > 0 && (
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
            <PaginatedList label="Awaiting checkout" resetKey={selDate} style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {unbilledCompleted.map(a => {
                const p = (db.pets || []).find(pt => pt.id === a.petId) || {};
                return (
                  <button
                    key={a.id}
                    className="btn sm gold"
                    onClick={() => setReceiptAppt(a)}
                    style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <Receipt size={14} />
                    <span>Bill {p.name || "Patient"}</span>
                    <span>({ownerBill(a).amount === null ? "Awaiting invoice" : `${money(ownerBill(a).amount)} draft`})</span>
                  </button>
                );
              })}
            </PaginatedList>
          </div>
        </div>
      )}

      {/* Transactions Ledger Table */}
      <section className="card" style={{ padding: "0", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", flex: "1 1 320px" }}>
            <h3 style={{ margin: 0, fontSize: "16px", color: "var(--navy)" }}>
              Payment ledger &bull; {showUndated ? "Payment date not recorded" : selDate}
            </h3>

            {/* Method filter */}
            <select
              value={methodFilter}
              aria-label="Payment method filter"
              onChange={e => setMethodFilter(e.target.value)}
              style={{ padding: "5px 10px", fontSize: "12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            >
              <option value="all">All Payment Methods</option>
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="maya">Maya</option>
              <option value="card">Credit / Debit Card</option>
              <option value="unrecorded">Not recorded</option>
              <option value="other">Other recorded methods</option>
            </select>
          </div>

          <div style={{ position: "relative", width: "240px" }}>
            <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input
              type="search" aria-label="Search payments"
              placeholder="Filter by owner, pet, visit reference..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", padding: "6px 10px 6px 32px", fontSize: "12.5px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            />
          </div>
        </div>

        {filteredPaid.length ? (
          <div style={{ overflowX: "auto" }}>
            <PaginatedTable label="Payment ledger" resetKey={[selDate,showUndated,methodFilter,search]} style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#f8fafc", color: "#475569", borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ padding: "12px 16px" }}>Payment time &bull; Visit reference</th>
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
                      <td data-label="Payment time • Visit reference" style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                        <b style={{ color: "var(--navy)" }}>{paymentTime(a.paidAt)}</b>
                        <small style={{ display: "block", color: "#64748b", fontFamily: "monospace", fontSize: "11px" }}>
                          {a.id}
                        </small>
                      </td>

                      {/* Patient & Owner */}
                      <td data-label="Patient • Owner" style={{ padding: "12px 16px" }}>
                        <div style={{ fontWeight: 700, color: "var(--navy)" }}>
                          {pet.name || "Patient"}
                        </div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>
                          Owner: {owner.name || a.ownerName || "Walk-in Client"}
                        </div>
                      </td>

                      {/* Services Rendered */}
                      <td data-label="Services Rendered" style={{ padding: "12px 16px", maxWidth: "260px" }}>
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
                      <td data-label="Payment Method" style={{ padding: "12px 16px" }}>
                        <span style={{
                          padding: "3px 8px",
                          borderRadius: "6px",
                          fontSize: "11.5px",
                          fontWeight: 700,
                          background: (a.paymentMethod || "").toLowerCase().includes("cash") ? "#ecfdf5" : "#eff6ff",
                          color: (a.paymentMethod || "").toLowerCase().includes("cash") ? "#047857" : "#0369a1",
                          border: (a.paymentMethod || "").toLowerCase().includes("cash") ? "1px solid #a7f3d0" : "1px solid #bfdbfe",
                        }}>
                          {a.paymentMethod?.trim() || "Not recorded"}
                        </span>
                      </td>

                      {/* Amount */}
                      <td data-label="Amount Collected" style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <b style={{ fontSize: "14.5px", color: "#0f172a" }}>
                          {money(ownerBill(a).amount)}
                        </b>
                      </td>

                      {/* Action */}
                      <td data-label="Action" style={{ padding: "12px 16px", textAlign: "right" }}>
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
            </PaginatedTable>
          </div>
        ) : (
          <div className="empty sm" style={{ padding: "36px 20px", textAlign: "center" }}>
            {showUndated ? "No payments with an unrecorded date match these filters." : `No settled transactions match these filters on ${selDate}.`}
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
          onPaid={(amount) => {
            setReceiptAppt(null);
            say && say(`Payment of ${money(amount)} settled successfully!`);
          }}
        />
      )}
    </div>
  );
}

