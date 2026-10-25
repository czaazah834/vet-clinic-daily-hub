import DocumentHeader from "../components/DocumentHeader.jsx";
import { VaccineEstimate } from "../components/VaccineBooking.jsx";
import { PaginatedList, PaginatedTable } from "../components/Pagination.jsx";
import { useSubmissionReview } from "../components/SubmissionReview.jsx";
import { confirmedPayment } from "../receptionSaves.js";
import { ownerBill } from "../ownerBilling.js";
import { money, paymentDate, paymentTime } from "../assistantWorkflow.js";
import { useCheckoutClaim } from "../useCheckoutClaim.js";
import { useState, useEffect, useRef } from "react";
import { petName, ownerName, addLog } from "../lib.jsx";
import { api } from "../api.js";
import { Search, Trash2, Receipt, CheckCircle2, Printer, Pill, X } from "lucide-react";

export default function BillingModal({ appt, db, setDb, me, onClose, onPaid }) {
  const pet = db.pets.find(p => p.id === appt.petId) || {};
  const owner = db.owners.find(o => o.id === pet.ownerId) || {};
  const record = (db.records || []).find(r => r.apptId === appt.id) || {};

  const [paymentRecord, setPaymentRecord] = useState(appt);
  const savedBill = ownerBill(paymentRecord);
  const [catalog, setCatalog] = useState([]);
  const [catalogError, setCatalogError] = useState("");
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState(() => {
    if (appt.invoiceItems && Array.isArray(appt.invoiceItems) && appt.invoiceItems.length) {
      return appt.invoiceItems;
    }
    return [];
  });

  const [method, setMethod] = useState(appt.paymentMethod?.trim() || (appt.billingStatus === "Paid" ? "Not recorded" : "Cash"));
  const [discount, setDiscount] = useState(String(appt.discount || 0));
  const [cashTendered, setCashTendered] = useState("");
  const [refNo, setRefNo] = useState(appt.paymentReference || "");
  const [formErr, setFormErr] = useState("");
  const [paid, setPaid] = useState(appt.billingStatus === "Paid");
  const [loading, setLoading] = useState(false);
  const paying = useRef(false);
  const claim = useCheckoutClaim(appt.id, paid, me.role === "assistant");
  const loadedInvoice = useRef(false);
  const prescribed = claim.prescriptionItems || record.prescriptionItems || [];
  useEffect(() => {
    if (!paid && claim.ready && Array.isArray(claim.invoiceItems) && !loadedInvoice.current) {
      setItems(claim.invoiceItems);
      loadedInvoice.current = true;
    }
  }, [paid, claim.ready, claim.invoiceItems]);

  // Load official clinic price catalog from backend
  useEffect(() => {
    api.get("/api/services/prices")
      .then(res => {
        if (res?.catalog) setCatalog(res.catalog);
      })
      .catch(err => setCatalogError(err.message));
  }, [catalogAttempt]);

  const addItem = (item) => {
    setItems(prev => {
      const existing = prev.find(p => p.catalogId === item.id);
      if (existing?.source === 'performed') return prev;
      const limit = item.requiresPrescription ? prescribed.find(p => p.catalogId === item.id)?.quantity || 0 : 1000;
      if (!limit || (existing?.qty || 0) >= limit) return prev;
      return existing ? prev.map(p => p.catalogId === item.id ? {...p, qty:p.qty + 1} : p) : [...prev, {catalogId:item.id,name:item.name,category:item.category,price:item.price,qty:1}];
    });
    setSearch("");
  };

  const removeItem = (idx) => {
    setItems(prev => prev.filter((item, i) => i !== idx || item.source === 'performed'));
  };

  const updateQty = (idx, qty) => {
    setItems(prev => prev.map((item, i) => i === idx && item.source !== 'performed' ? { ...item, qty: Math.max(1, +qty || 1) } : item));
  };

  const subtotal = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const total = Math.max(0, subtotal - (+discount || 0));
  const change = method === "Cash" ? Math.max(0, (+cashTendered || 0) - total) : 0;

  const filteredCatalog = search.trim()
    ? catalog.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.category.toLowerCase().includes(search.toLowerCase()))
    : catalog;

  const review = useSubmissionReview([items,method,discount,cashTendered,refNo,claim.ready,claim.claimToken,db.appts.find(a=>a.id===appt.id),pet,owner]);

  const handlePay = async (ev) => {
    ev.preventDefault();
    setFormErr("");
    if (paying.current || me.role !== "assistant") return;

    if (!items.length || !Number.isFinite(total) || total <= 0) {
      setFormErr("At least one billable procedure or product is required.");
      return;
    }
    if (!Number.isFinite(+discount) || +discount < 0 || (+discount || 0) > subtotal) {
      setFormErr("Discount must be between zero and the billable subtotal.");
      return;
    }
    if (method === "Cash") {
      const tendered = Number(cashTendered);
      if (!cashTendered.trim() || !Number.isFinite(tendered) || tendered < total) {
        setFormErr(`Cash received (₱${tendered.toLocaleString()}) must be equal to or greater than the total amount due (₱${total.toLocaleString()}).`);
        return;
      }
    } else {
      if (!refNo.trim() || refNo.trim().length < 4) {
        setFormErr(`Please enter a valid verified transaction or POS reference code for ${method}.`);
        return;
      }
    }

    if (!claim.ready) { setFormErr("Reclaim this checkout before recording payment. Your invoice entries are preserved."); return; }
    if (!await review.ask({title:"Review payment", confirmLabel:"Confirm payment",
      description:"Confirm the invoice and the payment actually received. Confirming records the payment and issues the saved receipt.",
      fields:[
        ["Patient / owner",`${pet.name} / ${owner.name}`],
        ["Visit",`${appt.date} at ${appt.time}`],
        ["Invoice",items.map(i=>`${i.name} × ${i.qty} — ${money(i.price*i.qty)}`).join("\n")],
        ["Subtotal",money(subtotal)],
        ["Discount",money(+discount)],
        ["Total due",money(total)],
        ["Payment method",method],...(method === "Cash" ? [["Cash received",money(Number(cashTendered))],
        ["Change",money(change)]] : [["Verified reference",refNo.trim()]])]
    })) return;
    paying.current = true;
    setLoading(true);

    const payload = {
      claimToken: claim.claimToken,
      amount: total,
      discount: +discount,
      billingStatus: "Paid",
      paymentMethod: method,
      paymentReference: method !== "Cash" ? refNo.trim() : `CASH-${Date.now().toString().slice(-6)}`,
      cashTendered: method === "Cash" ? Number(cashTendered) : total,
      changeAmount: change,
      invoiceItems: items,
      actorName: me.name,
      actorRole: me.role
    };

    let payment;
    try {
      const response = await api.post(`/api/appointments/${appt.id}/billing`, payload);
      payment = confirmedPayment(response, appt, payload);
    } catch (err) {
      setFormErr(err.message);
      setLoading(false);
      paying.current = false;
      return;
    }

    setDb(p => ({
      ...p,
      appts: p.appts.map(a => a.id === appt.id ? { ...a, ...payment } : a),
      log: addLog(p, me, `Processed billing payment ${money(payment.amount)} via ${payment.paymentMethod} (Ref: ${payment.paymentReference}) for ${pet.name} (${owner.name}). Issued official receipt.`)
    }));

    setPaymentRecord(payment);
    paying.current = false;
    setLoading(false);
    setPaid(true);
    onPaid && onPaid(payment.amount);
  };

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && !loading && onClose()} style={{ zIndex: 1050, display: "grid", placeItems: "center", padding: "16px" }}>
      <div className={`modal ${paid?"print-document receipt-document":""}`} role="dialog" aria-modal="true" aria-labelledby="billing-title" style={{ width: "min(620px, 100%)", maxHeight: "92vh", overflowY: "auto", padding: "22px 26px" }}>
        
        {paid&&<DocumentHeader title="Payment receipt">Visit reference: {appt.id}</DocumentHeader>}
        {review.card}
        {!paid && me.role === "assistant" && !claim.ready && <div role={claim.error ? "alert" : "status"} style={{padding:12,background:"#fff7ed",marginBottom:12}}>
          {claim.error || "Reserving this checkout for you…"}
          {claim.error && <button className="btn ghost sm" onClick={claim.retry}>Retry checkout claim</button>}
        </div>}
        {/* Header */}
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
          <div>
            <h3 id="billing-title" style={{ margin: 0, color: "var(--navy)", fontSize: "1.25rem", display: "flex", alignItems: "center", gap: "8px" }}>
              <Receipt size={22} color="#0284c7" /> Front Desk Checkout &amp; Billing
            </h3>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              Search clinical services, procedures &amp; medication prices from official database
            </span>
          </div>
          <button type="button" className="btn sm ghost" onClick={onClose} disabled={loading} aria-label="Close" style={{ padding: "6px 10px" }}><X size={16} aria-hidden="true" /></button>
        </div>

        {paid ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div className="no-print" style={{ width: 54, height: 54, borderRadius: "50%", background: "#dcfce7", color: "#166534", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
              <CheckCircle2 size={32} />
            </div>
            <h4 className="no-print" style={{ margin: "0 0 6px", fontSize: "19px", color: "var(--navy)" }}>Payment Recorded Successfully!</h4>
            <p style={{ margin: 0, fontSize: "14px", color: "#475569" }}>
              Recorded payment: <b style={{ color: "#166534", fontSize: "18px" }}>{money(savedBill.amount)}</b>. Payment method: <b>{paymentRecord.paymentMethod?.trim() || "Not recorded"}</b>.
            </p>

            <div style={{ margin: "16px 0", padding: "14px", background: "#f8fafc", borderRadius: "12px", border: "1.5px dashed #cbd5e1", fontSize: "13px", textAlign: "left" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <b>Patient:</b> <span>{pet.name} ({pet.species || "Pet"})</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <b>Client / Owner:</b> <span>{owner.name} ({owner.phone || "No phone"})</span>
              </div>
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px", marginTop: "8px" }}>
                <b>Itemized Services &amp; Products:</b>
                {savedBill.items.length === 0 && <p>Itemized charges not recorded.</p>}
                <PaginatedList label="Receipt items" resetKey={appt.id}>{savedBill.items.map((it, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#475569", marginTop: "3px" }}>
                    <span>{it.qty}x {it.name}</span>
                    <b>₱{(it.price * it.qty).toLocaleString()}</b>
                  </div>
                ))}</PaginatedList>
              </div>
              {savedBill.discount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "#b91c1c", marginTop: "6px" }}>
                  <span>Discount / Senior:</span>
                  <b>-{money(savedBill.discount)}</b>
                </div>
              )}
              <div style={{ borderTop: "2px solid #0f172a", paddingTop: "8px", marginTop: "8px", display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                <b>Total Amount Paid:</b>
                <b style={{ color: "#166534" }}>{money(savedBill.amount)}</b>
              </div>
            </div>

            <p>Payment date (Philippine time): {paymentDate(paymentRecord.paidAt) || "Not recorded"} · {paymentTime(paymentRecord.paidAt)}</p>
            {savedBill.mismatch && <p role="status">Saved itemization differs from the recorded payment. The payment amount above is preserved.</p>}
            <div style={{ display: "flex", justifyContent: "center", gap: "10px" }}>
              <button className="btn ghost sm" onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Printer size={15} /> Print Receipt
              </button>
              <button className="btn gold sm" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          me.role !== "assistant" ? <p role="status">This visit is awaiting front desk checkout. Financial records are available for review after payment.</p> : <form onSubmit={handlePay}>
            <fieldset disabled={loading || !claim.ready} style={{border:0,padding:0,margin:0,minWidth:0}}>
            <p><b>Requested purpose:</b> {appt.reason}</p><VaccineEstimate appointment={appt} />
            {/* Patient Context Card */}
            <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "10px", marginBottom: "14px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <b style={{ fontSize: "15px", color: "var(--navy)" }}>{pet.name} ({pet.species})</b>
                <span style={{ fontSize: "12.5px", color: "#64748b" }}>Visit: {appt.date} at {appt.time}</span>
              </div>
              <div style={{ fontSize: "12.5px", color: "#475569" }}>
                Owner: <b>{owner.name}</b> &bull; {owner.phone || "No contact"}
              </div>
            </div>

            {/* Doctor's Assessment & Prescription Instructions */}
            {(record.diagnosis || record.prescription || record.treatment) && (
              <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: "10px", padding: "12px 14px", marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <b style={{ color: "#166534", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Pill size={15} /> Attending Doctor&rsquo;s Clinical Assessment &amp; Prescription
                  </b>
                  <span style={{ fontSize: "11px", color: "#15803d", fontWeight: 700, background: "#dcfce7", padding: "2px 6px", borderRadius: "4px" }}>
                    Doctor Signed Off
                  </span>
                </div>
                {record.diagnosis && (
                  <div style={{ fontSize: "12.5px", color: "#166534", marginBottom: "3px" }}>
                    <b>Diagnosis:</b> {record.diagnosis}
                  </div>
                )}
                {record.treatment && (
                  <div style={{ fontSize: "12px", color: "#334155", marginBottom: "3px" }}>
                    <b>Treatment Rendered:</b> {record.treatment}
                  </div>
                )}
                {record.prescription && (
                  <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: "1px dashed #86efac", fontSize: "12.5px", color: "#14532d" }}>
                    <b>Prescribed Home Care Medications (Dispense &amp; Instruct Owner):</b>
                    <div style={{ whiteSpace: "pre-wrap", background: "#ffffff", padding: "8px 10px", borderRadius: "6px", border: "1px solid #bbf7d0", marginTop: "4px", fontSize: "12px", color: "#0f172a" }}>
                      {record.prescription}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Price Basis & Search Catalog */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "var(--navy)", marginBottom: "4px" }}>
                Add Services &amp; Other Products
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="search"
                  placeholder="Search vaccines, consultation, shampoo, vitamins, medicine or accessories"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px 8px 34px", fontSize: "13px", borderRadius: "8px", border: "1.5px solid #cbd5e1" }}
                />
                <span style={{ position: "absolute", left: "10px", top: "10px", color: "#94a3b8" }}>
                  <Search size={16} />
                </span>
              </div>

              {/* Live search results dropdown */}
              {(catalog.length > 0 || search.trim()) && (
                <div style={{ background: "#fff", border: "1px solid #cbd5e1", borderRadius: "8px", marginTop: "4px", maxHeight: "190px", overflowY: "auto", boxShadow: "0 6px 16px rgba(0,0,0,0.1)", zIndex: 10 }}>
                  {filteredCatalog.length ? (
                    filteredCatalog.map(catItem => (
                      <button
                        key={catItem.id}
                        type="button"
                        disabled={catItem.requiresPrescription && !prescribed.some(p => p.catalogId === catItem.id)}
                        onClick={() => addItem(catItem)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 12px",
                          border: "none",
                          borderBottom: "1px solid #f1f5f9",
                          background: "#fff",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "12.5px"
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "#f0f9ff"}
                        onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                      >
                        <div>
                          <b style={{ color: "var(--navy)" }}>{catItem.name}</b>
                          <small style={{ display: "block", color: "#64748b" }}>{catItem.category} &bull; {catItem.desc}</small>
                        </div>
                        <div style={{ textAlign: "right", marginLeft: "12px" }}>
                          <b style={{ color: "#047857", fontSize: "13px" }}>₱{catItem.price.toLocaleString()}</b>
                          <span style={{ display: "block", fontSize: "11px", color: "#2563eb" }}>{catItem.requiresPrescription && !prescribed.some(p => p.catalogId === catItem.id) ? "Vet prescription required" : "+ Add"}</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div style={{ padding: "10px 12px", fontSize: "12px", color: "#64748b" }}>
                      No matching products or services. Choose an official catalog item.
                    </div>
                  )}
                </div>
              )}
            </div>

            {catalogError && <p role="alert">{catalogError} <button type="button" onClick={() => { setCatalogError(""); setCatalogAttempt(x => x + 1); }}>Retry prices</button></p>}
            <p>Choose services and other products from the clinic catalog. Unit prices are fixed. Veterinarian-confirmed services are included once and retained for checkout.</p>
            {!!prescribed.length && <div style={{padding:12,background:"#eff6ff",borderRadius:8,marginBottom:12}}><b>Veterinarian-prescribed products loaded</b><p>Confirm the actual product form, package size and supply before dispensing. Reduce or remove items that are not dispensed; the signed prescription is retained.</p>{prescribed.map(p => <p key={p.catalogId}><b>{p.name}</b> · {p.quantity} item(s)/package(s)<br />{p.instructions}</p>)}</div>}
            {/* Bill Line Items Table */}
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "10px", overflow: "hidden", marginBottom: "16px" }}>
              <PaginatedTable label="Invoice items" resetKey={appt.id} style={{ width: "100%", fontSize: "12.5px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "8px 10px" }}>Service / Product</th>
                    <th style={{ padding: "8px 10px", width: "70px", textAlign: "center" }}>Qty</th>
                    <th style={{ padding: "8px 10px", width: "110px", textAlign: "right" }}>Price (₱)</th>
                    <th style={{ padding: "8px 10px", width: "100px", textAlign: "right" }}>Subtotal</th>
                    <th style={{ padding: "8px 10px", width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.id || idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px 10px" }}>
                        <input
                          type="text"
                          value={it.name}
                          readOnly aria-label="Fixed catalog value"
                          style={{ width: "100%", fontSize: "12.5px", padding: "4px 6px", border: "1px solid transparent", borderRadius: "4px" }}
                          onFocus={e => e.target.style.borderColor = "#93c5fd"}
                          onBlur={e => e.target.style.borderColor = "transparent"}
                        />
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        <input
                          type="number"
                          min="1"
                          readOnly={it.source === 'performed'}
                          aria-label={it.source === 'performed' ? 'Confirmed service quantity' : 'Quantity'}
                          value={it.qty}
                          onChange={e => updateQty(idx, e.target.value)}
                          style={{ width: "50px", textAlign: "center", padding: "4px", fontSize: "12px", border: "1px solid #cbd5e1", borderRadius: "4px" }}
                        />
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>
                        <input
                          type="number"
                          min="0"
                          value={it.price}
                          readOnly aria-label="Fixed catalog value"
                          style={{ width: "85px", textAlign: "right", padding: "4px", fontSize: "12px", border: "1px solid #cbd5e1", borderRadius: "4px" }}
                        />
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "var(--navy)" }}>
                        ₱{(it.price * it.qty).toLocaleString()}
                      </td>
                      <td style={{ padding: "8px 6px", textAlign: "center" }}>
                        {it.source !== 'performed' && items.length > 0 && (
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", padding: "2px" }}
                            title="Remove item"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </PaginatedTable>

              <div style={{ padding: "8px 12px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: "13px" }}>
                  Subtotal: <b style={{ color: "var(--navy)" }}>₱{subtotal.toLocaleString()}</b>
                </div>
              </div>
            </div>

            {/* Discount & Payment Method */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div className="fld" style={{ margin: 0 }}>
                <label htmlFor="billing-discount" style={{ fontSize: "12px" }}>Discount / Senior (₱)</label>
                <input
                  type="number"
                  min="0"
                  id="billing-discount"
                  step="0.01"
                  value={discount}
                  onChange={e => { setDiscount(e.target.value); setFormErr(""); }}
                  placeholder="0"
                  className={+discount > subtotal ? "bad" : discount > 0 ? "ok" : ""}
                  style={{ padding: "6px 10px", fontSize: "13px" }}
                />
                {+discount > subtotal && <span className="err" style={{ fontSize: "11px" }}>Discount cannot exceed subtotal (₱{subtotal.toLocaleString()}).</span>}
              </div>

              <div className="fld" style={{ margin: 0 }}>
                <label style={{ fontSize: "12px" }}>Payment Method</label>
                <select value={method} onChange={e => { setMethod(e.target.value); setFormErr(""); }} style={{ padding: "6px 10px", fontSize: "13px" }}>
                  <option value="Cash">Cash (Over the counter)</option>
                  <option value="GCash">GCash QR / Mobile</option>
                  <option value="Maya">Maya QR / Wallet</option>
                  <option value="Credit / Debit Card">Credit / Debit Card POS</option>
                </select>
              </div>
            </div>

            {/* Payment Method Details (Cash Tendered or Reference Code) */}
            {method === "Cash" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px", background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div className="fld" style={{ margin: 0 }}>
                  <label htmlFor="billing-cash" style={{ fontSize: "12px", fontWeight: 600 }}>Cash Received (₱) *</label>
                  <input
                    type="number"
                    min="0"
                    id="billing-cash"
                    step="0.01"
                    placeholder="Enter actual cash received"
                    value={cashTendered}
                    onChange={e => { setCashTendered(e.target.value); setFormErr(""); }}
                    className={cashTendered.trim() && (+cashTendered || 0) < total ? "bad" : (+cashTendered || 0) >= total ? "ok" : ""}
                    style={{ padding: "6px 10px", fontSize: "13px", fontWeight: 700 }}
                    required
                  />
                  {cashTendered.trim() && (+cashTendered || 0) < total && (
                    <span className="err" style={{ fontSize: "11px" }}>
                      Cash is short by ₱{(total - (+cashTendered || 0)).toLocaleString()}.
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <span style={{ fontSize: "11.5px", color: "#64748b", fontWeight: 600 }}>Change Due</span>
                  <b style={{ fontSize: "18px", color: change >= 0 && (+cashTendered || 0) >= total ? "#15803d" : "#dc2626" }}>
                    ₱{change.toLocaleString()}
                  </b>
                </div>
              </div>
            ) : (
              <div className="fld" style={{ marginBottom: "16px", background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <label style={{ fontSize: "12px", fontWeight: 600 }}>{method} Reference / Approval No. *</label>
                <input
                  type="text"
                  placeholder="e.g. GCASH-98213894 or POS-4412"
                  maxLength={100}
                  value={refNo}
                  onChange={e => { setRefNo(e.target.value); setFormErr(""); }}
                  className={refNo.trim() && refNo.trim().length < 4 ? "bad" : refNo.trim().length >= 4 ? "ok" : ""}
                  style={{ padding: "6px 10px", fontSize: "13px" }}
                  required
                />
                {refNo.trim() && refNo.trim().length < 4 && (
                  <span className="err" style={{ fontSize: "11px" }}>
                    Reference code must be at least 4 characters.
                  </span>
                )}
              </div>
            )}

            {/* Total Due Banner */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: "10px", marginBottom: "16px" }}>
              <div>
                <span style={{ fontSize: "11px", color: "#166534", fontWeight: 700, textTransform: "uppercase" }}>Total Bill to Settle</span>
                <div style={{ fontSize: "12px", color: "#15803d" }}>Method: {method}</div>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#15803d" }}>
                ₱{total.toLocaleString()}
              </div>
            </div>

            {formErr && (
              <div role="alert" style={{ background: "#fef2f2", border: "1px solid #f87171", color: "#b91c1c", padding: "8px 12px", borderRadius: "8px", fontSize: "12.5px", marginBottom: "14px", fontWeight: 600 }}>
                {formErr}
              </div>
            )}

            {/* Actions */}
            <div className="row end" style={{ gap: "10px" }}>
              <button type="button" className="btn ghost sm" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn gold" disabled={loading || !claim.ready} style={{ fontWeight: 700 }}>
                {loading ? "Processing..." : "Review payment"}
              </button>
            </div>
            </fieldset>
            {loading && <p role="status">Saving payment… Please wait for confirmation.</p>}
          </form>
        )}

      </div>
    </div>
  );
}
