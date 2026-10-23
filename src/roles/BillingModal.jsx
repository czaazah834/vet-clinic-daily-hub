import { useState } from "react";
import { petName, ownerName, addLog } from "../lib.jsx";

export default function BillingModal({ appt, db, setDb, me, onClose, onPaid }) {
  const pet = db.pets.find(p => p.id === appt.petId) || {};
  const owner = db.owners.find(o => o.id === pet.ownerId) || {};
  const record = db.records.find(r => r.apptId === appt.id) || {};

  const [fee, setFee] = useState(appt.amount || 650);
  const [method, setMethod] = useState("Cash");
  const [discount, setDiscount] = useState("0");
  const [paid, setPaid] = useState(false);

  const total = Math.max(0, +fee - (+discount || 0));

  const handlePay = (ev) => {
    ev.preventDefault();
    setDb(p => ({
      ...p,
      appts: p.appts.map(a => a.id === appt.id ? { ...a, billingStatus: "Paid", amount: total, paidAt: new Date().toLocaleTimeString(), paymentMethod: method } : a),
      log: addLog(p, me, `Front desk billing processed: ₱${total} (${method}) for visit of ${pet.name} (${owner.name}). Status: Paid.`),
    }));
    setPaid(true);
    onPaid && onPaid(total);
  };

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: "min(540px, 100%)" }}>
        <h3>Front Desk Checkout &amp; Billing</h3>

        {paid ? (
          <div className="auth-ok" style={{ textAlign: "center", padding: "16px 0" }}>
            <span style={{ fontSize: "44px" }}>🧾</span>
            <h4 style={{ margin: "10px 0 6px", fontSize: "18px", color: "var(--navy)" }}>Payment Recorded Successfully!</h4>
            <p style={{ margin: 0, fontSize: "14px", color: "#475569" }}>
              Receipt generated for <b>₱{total.toLocaleString()}</b> paid via <b>{method}</b>.
            </p>
            <div style={{ margin: "16px 0", padding: "12px", background: "#f8fafc", borderRadius: "10px", border: "1px dashed #cbd5e1", fontSize: "13px" }}>
              <p style={{ margin: "0 0 4px" }}><b>Patient:</b> {pet.name} &bull; <b>Owner:</b> {owner.name}</p>
              <p style={{ margin: "0 0 4px" }}><b>Diagnosis:</b> {record.diagnosis || appt.reason}</p>
              <p style={{ margin: 0 }}><b>Cashier:</b> {me.name} ({me.role})</p>
            </div>
            <div className="row end" style={{ justifyContent: "center", gap: "10px" }}>
              <button className="btn ghost" onClick={() => window.print()}>Print Receipt</button>
              <button className="btn gold" onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handlePay}>
            <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "10px", marginBottom: "14px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <b style={{ fontSize: "15px", color: "var(--navy)" }}>{pet.name} ({pet.species})</b>
                <span style={{ fontSize: "13px", color: "#64748b" }}>Date: {appt.date}</span>
              </div>
              <p style={{ margin: "0 0 4px", fontSize: "13px" }}><b>Owner:</b> {owner.name} &bull; {owner.phone}</p>
              <p style={{ margin: 0, fontSize: "13px" }}><b>Reason / Diagnosis:</b> {record.diagnosis || appt.reason}</p>
            </div>

            <div className="fld">
              <label>Service &amp; Consultation Charge (₱)</label>
              <input
                type="number"
                min="0"
                value={fee}
                onChange={e => setFee(+e.target.value)}
              />
            </div>

            <div className="fld">
              <label>Discount / Senior Citizen / Promo (₱)</label>
              <input
                type="number"
                min="0"
                value={discount}
                onChange={e => setDiscount(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="fld">
              <label>Payment Method</label>
              <select value={method} onChange={e => setMethod(e.target.value)}>
                <option value="Cash">Cash</option>
                <option value="GCash">GCash</option>
                <option value="Maya">Maya</option>
                <option value="Credit / Debit Card">Credit / Debit Card</option>
              </select>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#f1f5f9", borderRadius: "10px", margin: "16px 0", fontSize: "16px" }}>
              <b>Total Due:</b>
              <b style={{ fontSize: "20px", color: "#166534" }}>₱{total.toLocaleString()}</b>
            </div>

            <div className="row end" style={{ gap: "10px" }}>
              <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn gold">Process Payment &amp; Mark Paid</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

