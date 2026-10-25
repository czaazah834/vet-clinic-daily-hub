import {visitFormType,initialVaccineForVisit,visitFormTitle,serviceMatchesVisit,intakeSummary,visitClinicalFields} from '../visitForm.js';
import {ExternalHistorySummary} from '../components/ExternalHistory.jsx';
import {useFormValidation} from '../components/useFormValidation.jsx';
import AdmissionForm from './AdmissionForm.jsx';
import { useClinicRead } from '../useClinicRead.js';
import ClinicDialog from "../components/ClinicDialog.jsx";
import { useSoapDraft } from "../useSoapDraft.js";
import { VaccineEstimate } from "../components/VaccineBooking.jsx";
import { PaginatedList } from "../components/Pagination.jsx";
import {HistoryControls} from "../ClinicHistory.jsx";
import { useSubmissionReview } from "../components/SubmissionReview.jsx";
import { validateSoapFields } from "../soapValidation.js";
import PrescriptionBuilder from "./PrescriptionBuilder.jsx";
import { editablePrescription } from "../prescription.js";
import { boosterDate, VACCINE_SERVICE } from "../clinicalWorkflow.js";
import { useEffect, useRef, useState } from "react";
import { Stethoscope, Activity, AlertTriangle, X, Calendar, Pill } from "lucide-react";
import { uid, addLog, ICON, I } from "../lib.jsx";
import { api } from "../api.js";
import { today, plus } from "../booking.js";
import { intakeVisitSnapshot, sameIntakeVisit } from "../intakeVisit.js";
import { confirmedConsultation, applyConsultationSave } from "../consultationSave.js";

function NoteShortcuts({ field, label, options, value, onChange }) {
  const [search, setSearch] = useState("");
  const [choice, setChoice] = useState("");
  const [added, setAdded] = useState(false);
  const matching = options.filter(option => option.toLowerCase().includes(search.trim().toLowerCase()));
  const included = !!choice && value.split(/\r?\n/).some(line => line.trim().toLowerCase() === choice.toLowerCase());
  const next = value + (value && !value.endsWith("\n") ? "\n" : "") + choice;
  const tooLong = !!choice && next.length > 10000;
  const hintId = `soap-${field}-shortcut-hint`;
  return <div className="soap-note-shortcuts">
    <label className="soap-shortcut-search" htmlFor={`soap-${field}-search`}>Search {field} suggestions
      <input id={`soap-${field}-search`} type="search" value={search} aria-describedby={hintId}
        placeholder={`Search ${field} suggestions`}
        onChange={e => { setSearch(e.target.value); setChoice(""); setAdded(false); }}
        onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} />
    </label>
    <div className="soap-shortcut-controls">
      <label htmlFor={`soap-${field}-shortcut`}>{label} (optional)
        <select id={`soap-${field}-shortcut`} value={choice} aria-describedby={hintId} disabled={!matching.length} onChange={e => { setChoice(e.target.value); setAdded(false); }}>
          <option value="">{matching.length ? "Choose an entry to add" : options.length ? "No matching suggestions" : "No suggestions available"}</option>
          {matching.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <button type="button" className="btn sm ghost" aria-label={`Add ${field} to notes`} disabled={!choice || included || tooLong} onClick={() => { onChange(next); setAdded(true); }}>Add to notes</button>
    </div>
    <p id={hintId} role="status">{included ? (added ? "Added to notes. You can edit the text below or add another entry." : "This entry is already in your notes.") : tooLong ? "This entry would exceed 10,000 characters. Shorten your notes before adding it." : !options.length ? "No suggestions available. Type your own notes below." : !matching.length ? "No matching suggestions. Type your own notes below, or change your search." : `${matching.length} ${matching.length === 1 ? "choice" : "choices"}. Select an entry and Add to notes, or type your own notes below.`}</p>
  </div>;
}

export default function SoapConsultationModal({ appt, pet, db, setDb, me, onClose, onSaved }) {
  const TODAY=today();
  const formType=visitFormType(appt), consultation=formType==='consultation', preventive=['vaccination','deworming'].includes(formType);
  const formTitle=visitFormTitle(formType);
  const inFlight=useRef(false),consultationId=useRef(uid()),vaccinationId=useRef("v"+uid());
  const [tab, setTab] = useState("soap"); // 'soap' | 'emr'
  const owner = db.owners.find(o => o.id === pet.ownerId) || {};
  const followUpRequest = db.records.find(r => r.id === appt?.followUpId);
  const prevRecords = db.records.filter(r => r.petId === pet.id).sort((a, b) => b.date.localeCompare(a.date));
  const prevVaccs = db.vacc.filter(v => v.petId === pet.id).sort((a, b) => b.date.localeCompare(a.date));

  // Saved intake remains in the exam summary; a new measurement is entered explicitly.
  const iv = appt?.intakeVitals;
  const triageRemark = iv?.triageLevel && iv.triageLevel !== "Routine" ? ` [TRIAGE: ${iv.triageLevel.toUpperCase()}]` : "";

  const initialForm = {
    date: TODAY,backdateReason:"",
    symptoms: appt?.reason ? `Chief Complaint: ${appt.reason}${triageRemark}` : "",
    objective: "",
    diagnosis: "",
    treatment: "",
    prescription: "",
    weight: "",
    // Vaccine administration
    giveVaccine: false,
    vaccine: initialVaccineForVisit(appt),
    doseNo: "",
    doseOf: "",
    intervalDays: "",
    scheduleApproved: false,
    brand: "",
    batch: "",
    manufacturer:"",serialNumber:"",microchipNumber:"",microchipDate:"",
    vaccineNotes: "",
    // Clinical Follow-up Scheduling
    scheduleFollowUp: false,
    careStatus: "Follow-up required",
    followUpDays: "7",
    followUpDate: plus(7),
    followUpReason: `Clinical Follow-up & Post-treatment Re-check for ${pet.name}`,
  };
  const draftState = useSoapDraft({userId:me.id, appt, petId:pet.id, initialForm,
    consultationId:consultationId.current, vaccinationId:vaccinationId.current, expectedVisit:intakeVisitSnapshot(appt)});
  const {form:storedForm, prescriptionItems, performedServices, expectedVisit} = draftState.draft;
  const f={...storedForm,giveVaccine:preventive && storedForm.giveVaccine,scheduleFollowUp:consultation && storedForm.scheduleFollowUp,
    vaccine:formType==='deworming' ? 'Deworming' : storedForm.vaccine==='Deworming' ? '' : storedForm.vaccine};
  const clinicalForm=visitClinicalFields(f,appt);
  consultationId.current = draftState.draft.consultationId;
  vaccinationId.current = draftState.draft.vaccinationId;
  const setF = value => draftState.setPart('form', value);
  const setPrescriptionItems = value => draftState.setPart('prescriptionItems', value);
  const setPerformedServices = value => draftState.setPart('performedServices', value);
  const current=(db.appts || []).find(a=>a.id===expectedVisit?.id);
  const stale=!current || !sameIntakeVisit(current,expectedVisit) || current.petId!==pet.id || !db.pets.some(p=>p.id===pet.id) || ![me.id,me.vetId].filter(Boolean).includes(current.vetId) || current.status!=="In consultation";

  const [admissionOpen,setAdmissionOpen] = useState(false);
  const [savedAdmission,setSavedAdmission] = useState(null);
  const eligibility = useClinicRead('/api/admissions/eligible',5000);
  const eligibleVisit = eligibility.data?.visits.find(visit=>visit.id===expectedVisit.id);
  const admissionStatus = current?.admissionStatus || savedAdmission?.status || null;
  const admissionSaved = row => {
    setSavedAdmission(row);setAdmissionOpen(false);eligibility.load();
    setDb(previous=>({...previous,appts:previous.appts.map(visit=>visit.id===expectedVisit.id && sameIntakeVisit(visit,expectedVisit) ? {...visit,admissionStatus:row.status} : visit)}));
  };
  const [closing, setClosing] = useState(false);
  const requestClose = () => { if (!inFlight.current) { if (draftState.dirty || draftState.error) setClosing(true); else onClose(); } };
  const [noteOptions, setNoteOptions] = useState({diagnosis:[], treatment:[]});
  const [optionsError, setOptionsError] = useState('');
  const [optionsAttempt, retryOptions] = useState(0);
  useEffect(() => {
    let active = true;
    api.get('/api/clinical/note-options').then(r => { if (active) { setNoteOptions(r.options); setOptionsError(''); } })
      .catch(e => { if (active) setOptionsError(e.message); });
    return () => { active = false; };
  }, [optionsAttempt]);
  const [serviceCatalog, setServiceCatalog] = useState([]);
  const [catalogError, setCatalogError] = useState('');
  const [catalogAttempt, retryCatalog] = useState(0);
  useEffect(() => {
    let active = true;
    api.get('/api/services/prices').then(r => { if (active) { setServiceCatalog(r.catalog.filter(p => p.id.startsWith('srv_') && !p.requiresPrescription)); setCatalogError(''); } }).catch(e => { if (active) setCatalogError(e.message); });
    return () => { active = false; };
  }, [catalogAttempt]);
  const relevantServices=serviceCatalog.filter(p=>serviceMatchesVisit(p,formType));
  const selectedServices=preventive ? [] : performedServices.filter(id=>relevantServices.some(p=>p.id===id));
  const [actionErrors,setActionErrors] = useState({});
  const validation = useFormValidation(validateSoapFields(clinicalForm,TODAY,pet.birth,appt?.date));
  const errs = {...actionErrors,...validation.errors};
  const touch = validation.touch;
  const set = (k,v) => {
    validation.touch(k);
    if(k==='giveVaccine' && !v) for(const field of ['vaccine','doseNo','doseOf','intervalDays','scheduleApproved','brand','batch']) validation.changed(field);
    if(k==='scheduleFollowUp' && !v) for(const field of ['careStatus','followUpDate','followUpReason']) validation.changed(field);
    setF({...f,[k]:v,...(["date","vaccine","intervalDays","brand","batch","doseNo","doseOf"].includes(k) ? {scheduleApproved:false} : {})});
    if(k==='prescription')setActionErrors(previous=>({...previous,prescription:''}));
  };
  const handleFollowUpDaysChange = days => {
    validation.changed('followUpDate');
    setF(previous=>({...previous,followUpDays:String(days),followUpDate:plus(days)}));
  };

  const [loading, setLoading] = useState(false);

  const review = useSubmissionReview([f,prescriptionItems,performedServices,current,pet,stale,serviceCatalog,catalogError,admissionStatus]);

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (inFlight.current) return;
    if (stale) {setActionErrors(p=>({...p,save:"This visit has changed or is not in consultation. Refresh clinic records and reopen it. Your notes remain here for reference."}));return;}
    if (!validation.validate(ev)) return;
    const e = {};
    if (!serviceCatalog.length || catalogError) e.save = "Load the official service catalog before finalizing.";
    let selectedItems;
    try {
      selectedItems = (consultation ? prescriptionItems : []).map(item => {
        const p=editablePrescription(item);
        if (!Number.isInteger(p.quantity) || p.quantity < 1 || p.quantity > 1000 || !p.instructions.trim()) throw new Error('Complete the directions and quantity for each selected product.');
        return p;
      });
    } catch (err) { e.prescription = err.message; }

    if (Object.keys(e).length) {
      setActionErrors(e);
      return;
    }

    const consultId = consultationId.current;
    const effectiveVetId = me.vetId || me.id;

    const newRecord = {
      id: consultId,
      petId: pet.id,
      vetId: effectiveVetId,
      apptId: appt ? appt.id : null,
      date: f.date,backdateReason:f.date<TODAY ? (f.backdateReason || "").trim() : "",
      symptoms: clinicalForm.symptoms.trim(),
      objective: clinicalForm.objective.trim(),
      diagnosis: clinicalForm.diagnosis.trim(),
      treatment: clinicalForm.treatment.trim(),
      prescription: clinicalForm.prescription.trim(),
      prescriptionItems: selectedItems,
      performedServices:selectedServices,
      careStatus: f.scheduleFollowUp ? f.careStatus : "Routine care",
      followUpDate: f.scheduleFollowUp ? f.followUpDate : null,
      followUpReason: f.scheduleFollowUp ? f.followUpReason.trim() : "",
    };

    let newVacc = null;
    if (f.giveVaccine) {
      const boosterDue = boosterDate(f.date, f.intervalDays);
      newVacc = {
        id: vaccinationId.current,
        petId: pet.id,
        vaccine: f.vaccine,
        brand: f.brand.trim(),
        batch: f.batch.trim(),
        manufacturer:(f.manufacturer || "").trim(),serialNumber:(f.serialNumber || "").trim(),
        date: f.date,
        nextDue: boosterDue,
        doseNo: Number(f.doseNo),
        doseOf: Number(f.doseOf),
        intervalDays: Number(f.intervalDays),
        scheduleApproved: f.scheduleApproved,
        notes: f.vaccineNotes.trim(),
        done: true
      };
    }

    // Finalize the linked clinical data together, or leave the form open on failure.
    const followUpNote = f.scheduleFollowUp
      ? `\nFollow-up requested for ${f.followUpDate}: ${f.followUpReason.trim()}. Reception to confirm scheduling.` : "";
    newRecord.treatment += followUpNote;
    const request={...newRecord,...(f.weight?{weight:Number(f.weight)}:{}),vaccination:newVacc,...(preventive && (f.microchipNumber || f.microchipDate)?{microchip:{number:f.microchipNumber.trim(),date:f.microchipDate || null}}:{}),expectedVisit};
    if (!await review.ask({title:`Review and finalize ${formTitle.toLowerCase()}`,confirmLabel:"Finalize visit",
      description:admissionStatus === 'Admitted' ? "This saves the SOAP consultation. The pet remains admitted for ongoing care. Approve discharge in Admitted Pets before reception can finalize payment and release." : "This saves the clinical record for the owner and completes this visit. Reception handles checkout; any admitted stay still requires veterinarian discharge approval.",
      fields:[
        ["Patient / owner",`${pet.name} / ${owner.name}`],
        ["Veterinarian",me.name],
        [consultation ? "Consultation date" : "Care date",newRecord.date],
        ...(newRecord.backdateReason ? [["Historical date explanation",newRecord.backdateReason]] : []),
        [consultation ? "Subjective" : "Visit reason",newRecord.symptoms],
        ["Objective",newRecord.objective],
        [consultation ? "Assessment" : "Suitability assessment",newRecord.diagnosis],
        [consultation ? "Plan" : "Care / after-care instructions",newRecord.treatment],
        ...(consultation ? [["Admission",admissionStatus || "No admission recorded for this visit"]] : []),
        ["New measured weight",f.weight ? `${f.weight} kg` : "No new measurement; saved intake retained"],
        ...(consultation ? [["Prescription notes",newRecord.prescription],
        ["Prescribed products",selectedItems.map(p=>`${p.name} × ${p.quantity} — ${p.instructions}`).join("\n") || "None selected"]] : []),
        ["Performed services",serviceCatalog.filter(p=>selectedServices.includes(p.id) || (f.giveVaccine && p.id === VACCINE_SERVICE[f.vaccine])).map(p=>`${p.name} — ₱${p.price.toLocaleString()}`).join("\n") || "None selected"],
        ...(preventive && f.microchipNumber ? [["Microchip",`${f.microchipNumber} · ${f.microchipDate || 'Date not recorded'}`]] : []),
        ...(preventive ? [[formType==='deworming' ? "Deworming administration" : "Vaccine administration",newVacc ? `${newVacc.vaccine} — ${newVacc.brand}\nManufacturer: ${newVacc.manufacturer || 'Not recorded'} · Serial: ${newVacc.serialNumber || 'Not recorded'}\nBatch: ${newVacc.batch} · Dose ${newVacc.doseNo} of ${newVacc.doseOf}\nApproved booster due: ${newVacc.nextDue}\n${newVacc.notes}` : "No administration recorded"]] : []),
        ...(consultation ? [["Care status",newRecord.careStatus],
        ["Follow-up",newRecord.followUpDate ? `${newRecord.followUpDate}: ${newRecord.followUpReason}` : "No follow-up requested"]] : [])]
    })) return;
    inFlight.current=true;
    setLoading(true);
    let saved;
    try {
      saved=confirmedConsultation(await api.post("/api/consultations",request),request);
    } catch (err) {
      setActionErrors(p=>({...p,save:err.message}));
      inFlight.current=false;setLoading(false);return;
    }
    setDb(previous=>{
      const next=applyConsultationSave(previous,saved,expectedVisit);
      return next===previous?previous:{...next,log:addLog(previous,me,`Finalized consultation ${saved.record.id} for visit ${saved.record.apptId}`)};
    });
    draftState.clear();
    setLoading(false);
    onSaved && onSaved(saved.record,{admissionStatus});
  };

  return (
    <ClinicDialog labelledBy="soap-title" onClose={requestClose}>
      <div className="modal clinical-soap" style={{ width: "min(760px, 100%)", maxHeight: "94vh" }}>
        <HistoryControls auto />
        {review.card}<ExternalHistorySummary patient={pet} />
        {admissionOpen && <AdmissionForm mode="create" me={me}
          visits={[{...expectedVisit,petName:pet.name,ownerName:owner.name}]}
          consultationContext={{petName:pet.name,ownerName:owner.name,diagnosis:f.diagnosis,treatment:f.treatment}}
          onClose={()=>setAdmissionOpen(false)} onSaved={admissionSaved} />}
        {closing && <ClinicDialog labelledBy="soap-close-title" onClose={() => setClosing(false)}>
          <div className="modal" style={{width:'min(540px,100%)'}}>
            <h3 id="soap-close-title">Leave unfinished consultation?</h3>
            <p>Your notes have not been finalized. Keep a draft to resume this visit on this browser, or discard your edits.</p>
            {draftState.error && <p role="alert" className="err">{draftState.error}</p>}
            <div className="row end" style={{gap:10,flexWrap:'wrap'}}>
              <button type="button" className="btn ghost" data-dialog-autofocus onClick={() => setClosing(false)}>Keep editing</button>
              <button type="button" className="btn" onClick={() => { if (draftState.persist()) onClose(); }}>Keep draft and close</button>
              <button type="button" className="btn danger" onClick={() => { if (draftState.clear()) onClose(); }}>Discard edits</button>
            </div>
          </div>
        </ClinicDialog>}
        {draftState.error ? <p role="alert" className="err">{draftState.error}</p> : draftState.dirty && <p role="status" className="ow-note">{draftState.recovered ? 'Recovered unfinished consultation. Review all details before finalizing.' : draftState.saved ? 'Draft saved on this browser.' : 'Saving draft…'} Drafts stay on this browser until finalized or discarded and are not part of the medical record.</p>}
        <style>{`.clinical-soap input[type=checkbox]{width:auto;flex:0 0 auto}.clinical-soap .service-check{display:flex;align-items:flex-start;gap:8px;margin-bottom:8px}.clinical-soap .tabs{flex-wrap:wrap}.clinical-soap .tabs button{white-space:normal;max-width:100%;min-width:0}`}</style>
        {followUpRequest && <div className="ow-note info"><b>Linked {followUpRequest.careStatus}</b><p>Target: {followUpRequest.followUpDate} · {followUpRequest.followUpReason}</p></div>}
        {(appt?.handoffs || []).length > 0 && <section className="ow-note info" aria-label="Veterinarian handoff instructions" style={{overflowWrap:'anywhere'}}>
          <b>Care handoff history</b>
          {appt.handoffs.map((h,i)=><div key={i}><p><b>{h.from} → {h.to}</b> · {new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(new Date(h.at))}</p><p style={{whiteSpace:'pre-wrap'}}>{h.note}</p></div>)}
        </section>}
        <section className="ow-note info" aria-label="Visit purpose"><b>Reason for this visit: {appt.reason || "Not recorded"}</b><p>Assess the pet for this requested care. Record findings and care for this visit. Confirm administration or services only when actually performed.</p></section>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px", marginBottom: "14px" }}>
          <div>
            <h3 id="soap-title" style={{ margin: "0 0 4px", fontSize: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "var(--navy)" }}><I e={pet.species || "paw"} size={22} /></span>
              <span>{formTitle} &amp; EMR: <b>{pet.name}</b></span>
            </h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              <b>Owner:</b> {owner.name} ({owner.phone}) &bull; <b>Breed:</b> {pet.breed || pet.species} &bull; <b>Sex:</b> {pet.sex}
            </p>
          </div>
          <button type="button" className="btn ghost sm" aria-label="Close consultation" disabled={loading} onClick={requestClose}><X size={16} /></button>
        </div>

        <p className="ow-note"><b>Requested visit:</b> {appt.reason}</p><VaccineEstimate appointment={appt} />
        {/* Allergy Alert Banner if any */}
        {(pet.allergies && pet.allergies.length > 0) ? (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "10px 14px", borderRadius: "10px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertTriangle size={20} color="#dc2626" />
            <div>
              <b style={{ color: "#991b1b", fontSize: "13.5px" }}>CLINICAL ALLERGY ALERT:</b>
              <span style={{ color: "#b91c1c", fontSize: "13px", marginLeft: "6px" }}>{pet.allergies.join(", ")}</span>
            </div>
          </div>
        ) : null}

        {/* Tab switch */}
        <div className="tabs" style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <button
            type="button"
            className={`btn sm ${tab === "soap" ? "gold" : "ghost"}`}
            onClick={() => setTab("soap")}
          >
            {consultation ? "SOAP Clinical Notes" : formTitle}
          </button>
          <button
            type="button"
            className={`btn sm ${tab === "emr" ? "gold" : "ghost"}`}
            onClick={() => setTab("emr")}
          >
            Digital EMR History ({prevRecords.length} Consultations, {prevVaccs.length} Vaccines)
          </button>
        </div>

        {tab === "emr" ? (
          <div style={{ maxHeight: "55vh", overflowY: "auto", paddingRight: "4px" }}>
            <h4 style={{ margin: "0 0 10px", fontSize: "15px", color: "var(--navy)" }}>Past Consultation History</h4>
            {prevRecords.length ? (
              <PaginatedList label="Previous consultations" resetKey={pet.id} style={{ display: "grid", gap: "12px", marginBottom: "20px" }}>
                {prevRecords.map(r => (
                  <div key={r.id} className="card" style={{ padding: "14px", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <b style={{ color: "var(--navy)", fontSize: "14px" }}>{r.diagnosis}</b>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>{r.date}</span>
                    </div>
                    {r.symptoms && <p style={{ margin: "0 0 4px", fontSize: "12.5px" }}><b>Subjective:</b> {r.symptoms}</p>}
                    {r.objective && <p style={{ margin: "0 0 4px", fontSize: "12.5px" }}><b>Objective:</b> {r.objective}</p>}
                    <p style={{ margin: "0 0 4px", fontSize: "12.5px" }}><b>Plan / Treatment:</b> {r.treatment}</p>
                    {r.prescription && <p style={{ margin: "0 0 4px", fontSize: "12.5px", color: "#1d4ed8" }}><b>Prescription:</b> {r.prescription}</p>}
                  </div>
                ))}
              </PaginatedList>
            ) : (
              <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "20px" }}>No past consultation records on file.</p>
            )}

            <h4 style={{ margin: "0 0 10px", fontSize: "15px", color: "var(--navy)" }}>Vaccination History</h4>
            {prevVaccs.length ? (
              <PaginatedList label="Previous vaccines" resetKey={pet.id} style={{ display: "grid", gap: "8px" }}>
                {prevVaccs.map(v => (
                  <div key={v.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px" }}>
                    <span><b>{v.vaccine}</b> {v.brand ? `(${v.brand})` : ""}</span>
                    <span>Administered: {v.date} &bull; Next Booster: <b>{v.nextDue || "—"}</b></span>
                  </div>
                ))}
              </PaginatedList>
            ) : (
              <p style={{ color: "#64748b", fontSize: "13px" }}>No vaccinations logged.</p>
            )}
          </div>
        ) : (
          <form {...validation.formProps} onSubmit={handleSubmit}>
            <fieldset disabled={loading} style={{border:0,padding:0,margin:0,minWidth:0}}>
            {iv && (
              <div style={{
                background: iv.tempAnalysis?.status === "high-fever" || iv.tempAnalysis?.status === "hypothermia" || iv.triageLevel === "Emergency"
                  ? "#fef2f2"
                  : "#f0fdf4",
                border: "1px solid " + (iv.triageLevel === "Emergency" ? "#fca5a5" : "#bbf7d0"),
                borderRadius: "10px",
                padding: "10px 14px",
                marginBottom: "14px",
                fontSize: "13px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <b style={{ color: "var(--navy)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Activity size={16} /> Front Desk Intake Vitals
                  </b>
                  {iv.triageLevel && (
                    <span style={{
                      fontWeight: 700,
                      fontSize: "11px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: iv.triageLevel === "Emergency" ? "#fee2e2" : iv.triageLevel === "Priority" ? "#fef3c7" : "#e2e8f0",
                      color: iv.triageLevel === "Emergency" ? "#991b1b" : iv.triageLevel === "Priority" ? "#92400e" : "#334155"
                    }}>
                      Triage: {iv.triageLevel.toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", color: "#334155" }}>
                  <span><b>Temperature:</b> {iv.temp}°C ({iv.tempAnalysis?.label || "Assessment not recorded"})</span>
                  <span><b>Weight:</b> {iv.weight} kg ({iv.weightAnalysis?.label || "Assessment not recorded"})</span>
                  {iv.weightAnalysis?.trend && <span><b>Change:</b> {iv.weightAnalysis.trend}</span>}
                  {iv.recordedAt && <span style={{ color: "#64748b" }}>Logged at: {iv.recordedAt}</span>}
                </div>
                {iv.triageNotes && (
                  <div style={{ marginTop: "4px", fontSize: "12px", color: "#475569" }}>
                    <b>Assistant Notes:</b> &ldquo;{iv.triageNotes}&rdquo;
                  </div>
                )}
              </div>
            )}

            <div className="soap-fields" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "12px" }}>
              {consultation && <div className="fld full" style={{ gridColumn: "1/-1" }}>
                <label>
                  <b>S - Subjective (Chief Complaint &amp; History)</b><i> *</i>
                  <textarea
                    rows={2}
                    aria-invalid={!!errs.symptoms}
                    aria-describedby={errs.symptoms ? "soap-symptoms-error" : undefined}
                    name="symptoms" value={f.symptoms}
                    className={errs.symptoms ? "bad" : f.symptoms.trim() ? "ok" : ""}
                    onChange={e => set("symptoms", e.target.value)}
                    onBlur={() => touch("symptoms")}
                    placeholder="Patient symptoms, onset, behavioral observations, owner complaint..."
                  />
                </label>
                {errs.symptoms && <span id="soap-symptoms-error" className="err" role="alert">{errs.symptoms}</span>}
              </div>}

              <div className="fld full" style={{ gridColumn: "1/-1" }}>
                <label>
                  <b>{consultation ? 'O - Objective (Physical Exam & Vitals)' : 'Examination notes'}</b>
                  <p className="soap-saved-vitals" aria-label="Saved intake measurements">{intakeSummary(iv)}</p>
                  <span>Additional examination findings (optional)</span>
                  <textarea
                    rows={2}
                    aria-invalid={!!errs.objective}
                    aria-describedby={errs.objective ? "soap-objective-error" : undefined}
                    name="objective" value={f.objective}
                    className={errs.objective ? "bad" : f.objective.trim() ? "ok" : ""}
                    onChange={e => set("objective", e.target.value)}
                    onBlur={() => touch("objective")}
                    placeholder="Add examination findings, heart rate, hydration, mucous membranes, lymph nodes…"
                  />
                </label>
                {errs.objective && <span id="soap-objective-error" className="err" role="alert">{errs.objective}</span>}
              </div>

              <div className="fld">
                <label htmlFor="soap-weight">New measured weight (kg, optional)</label>
                <input
                  id="soap-weight"
                  type="number"
                  min="0" max="120"
                  aria-invalid={!!errs.weight}
                  aria-describedby={errs.weight ? "soap-weight-error" : undefined}
                  step="0.01"
                  name="weight" value={f.weight}
                  onChange={e => set("weight", e.target.value)}
                  placeholder="Leave blank to keep saved intake"
                />
                {errs.weight && <span id="soap-weight-error" className="err" role="alert">{errs.weight}</span>}
              </div>

              <div className="fld">
                <label htmlFor="soap-date">{consultation ? "Consultation Date" : "Care Date"}</label>
                <input
                  id="soap-date"
                  type="date"
                  min={appt?.date || pet.birth}
                  max={TODAY}
                  aria-invalid={!!errs.date}
                  aria-describedby={errs.date ? "soap-date-error" : undefined}
                  name="date" value={f.date}
                  onChange={e => set("date", e.target.value)}
                />
                {errs.date && <span id="soap-date-error" className="err" role="alert">{errs.date}</span>}
                <p className="ow-hint">Today in Manila is {TODAY}. Historical dates are for care actually provided during this linked visit and require an explanation.</p>
                {f.date<TODAY && <label>Reason for historical consultation date *<input {...validation.field("backdateReason")} maxLength={500} value={f.backdateReason || ""} onChange={e=>set("backdateReason",e.target.value)} />{validation.feedback("backdateReason")}</label>}
              </div>

              <div className="fld full" style={{ gridColumn: "1/-1" }}>
                <label htmlFor="soap-diagnosis"><b>{consultation ? 'A - Assessment (Diagnosis)' : formType==='grooming' ? 'Condition / suitability for grooming' : 'Suitability assessment / reason for deferral'}</b><i> *</i></label>
                {optionsError && <p role="alert">Choices could not load. You can still type your notes. <button type="button" onClick={() => retryOptions(n => n + 1)}>Retry choices</button></p>}
                {consultation && <NoteShortcuts field="diagnosis" label="Diagnosis suggestions" options={noteOptions.diagnosis} value={f.diagnosis} onChange={value => set("diagnosis", value)} />}
                <p id="soap-diagnosis-hint" className="soap-note-label">{consultation ? 'Record the diagnosis or differential diagnoses supported by your findings. Review any suggested text for this patient.' : 'Record whether this patient is suitable for the requested care, or explain why it is deferred.'}</p>
                  <textarea
                    id="soap-diagnosis"
                    rows={2}
                    aria-invalid={!!errs.diagnosis}
                    aria-describedby={`soap-diagnosis-hint${errs.diagnosis ? " soap-diagnosis-error" : ""}`}
                    name="diagnosis" value={f.diagnosis}
                    onChange={e => set("diagnosis", e.target.value)}
                    onBlur={() => touch("diagnosis")}
                    placeholder={consultation ? "Clinical diagnosis, differential diagnosis, condition assessment..." : "Your findings and suitability decision for this patient…"}
                    className={errs.diagnosis ? "bad" : f.diagnosis.trim() ? "ok" : ""}
                  />
                {errs.diagnosis && <span id="soap-diagnosis-error" className="err" role="alert">{errs.diagnosis}</span>}
              </div>

              <div className="fld full" style={{ gridColumn: "1/-1" }}>
                <label htmlFor="soap-treatment"><b>{consultation ? 'P - Plan (Treatment & In-Clinic Procedures)' : 'Care provided / after-care instructions'}</b><i> *</i></label>
                {consultation && <NoteShortcuts field="treatment" label="Treatment suggestions" options={noteOptions.treatment} value={f.treatment} onChange={value => set("treatment", value)} />}
                <p id="soap-treatment-hint" className="soap-note-label">Enter your treatment plan and patient-specific instructions here. Review and edit any added text for this patient.</p>
                  <textarea
                    id="soap-treatment"
                    rows={2}
                    aria-invalid={!!errs.treatment}
                    aria-describedby={`soap-treatment-hint${errs.treatment ? " soap-treatment-error" : ""}`}
                    name="treatment" value={f.treatment}
                    onChange={e => set("treatment", e.target.value)}
                    onBlur={() => touch("treatment")}
                    placeholder={consultation ? "Procedures performed, fluids administered, wound treatment, instructions..." : "Care actually provided, home monitoring instructions, or next steps if care was deferred…"}
                    className={errs.treatment ? "bad" : f.treatment.trim() ? "ok" : ""}
                  />
                {consultation && <p className="soap-note-hint">Choose treatment for this patient. Custom notes stay with this visit. Confirm services performed below.</p>}
                {errs.treatment && <span id="soap-treatment-error" className="err" role="alert">{errs.treatment}</span>}
              </div>
              {consultation && <section className="consultation-admission" aria-labelledby="soap-admission-title" style={{gridColumn:'1/-1'}}>
                <div className="consultation-admission-heading"><div><h4 id="soap-admission-title">Admission · care at the clinic</h4>
                  <p>Admit {pet.name} only if your assessment shows a need for clinic treatment or monitoring. A diagnosis or vaccination visit does not automatically require admission.</p></div>
                  {admissionStatus && <span className="admission-status">{admissionStatus}</span>}
                </div>
                {admissionStatus ? <>
                  <p role="status">{admissionStatus === 'Admitted' ? `${pet.name} is admitted. Finalize these SOAP notes when ready; daily care continues in Admitted Pets.` : `This visit has a saved stay: ${admissionStatus}. View its care history in Admitted Pets.`}</p>
                  {savedAdmission && <p><b>Admission reason: </b>{savedAdmission.reason}</p>}
                </> : <>
                  <p>Enter a clinic-only reason and monitoring plan, then review the message the owner will see. This saves the admission while keeping these SOAP notes open.</p>
                  {eligibility.error ? <p className="err" role="alert">Admission availability could not load. <button type="button" className="btn sm ghost" onClick={()=>eligibility.load()}>Retry admission check</button></p>
                    : !eligibility.data ? <p role="status">Checking admission availability…</p>
                    : !eligibleVisit && <p>This visit is unavailable for a new admission. The pet may already have an active stay, or the visit may be at checkout. Check Admitted Pets or refresh clinic records.</p>}
                  <button type="button" className="btn gold" disabled={loading || stale || !!eligibility.error || !eligibleVisit} onClick={()=>setAdmissionOpen(true)}>Admit {pet.name}</button>
                </>}
                <small>Admission → daily care → vet discharge approval → payment → confirmed release.</small>
              </section>}

              {!preventive && <fieldset style={{gridColumn:"1/-1"}}><legend>Confirm services performed</legend>
                <p>Select only services actually performed. Each selection is added to billing once at the fixed clinic price. The choices below match the reason for this visit.</p>
                {catalogError ? <p role="alert">{catalogError} <button type="button" onClick={() => retryCatalog(n => n + 1)}>Retry prices</button></p> : !serviceCatalog.length ? <p>Loading services…</p> : relevantServices.map(p => {
                  return <label key={p.id} className="service-check"><input type="checkbox" checked={selectedServices.includes(p.id)} onChange={e => {const checked=e.target.checked;setPerformedServices(prev => checked ? [...prev,p.id] : prev.filter(id => id !== p.id));}} /> {p.name} · ₱{p.price.toLocaleString()}</label>;
                })}
              </fieldset>}
              {consultation && <div style={{gridColumn: "1/-1"}}><PrescriptionBuilder items={prescriptionItems} onChange={items=>{setPrescriptionItems(items);setActionErrors(previous=>({...previous,prescription:''}));}} notes={f.prescription} onNotes={v => set("prescription", v)} error={errs.prescription} /></div>}

              {/* Administration is shown only for preventive visits. */}
              {preventive && <div style={{ gridColumn: "1/-1", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "14px", borderRadius: "12px", marginTop: "4px" }}>
                <label style={{ display: "flex", gap: "10px", alignItems: "center", cursor: "pointer", fontWeight: "700", color: "#166534" }}>
                  <input
                    type="checkbox"
                    name="giveVaccine" checked={f.giveVaccine}
                    onChange={e => set("giveVaccine", e.target.checked)}
                  />
                  <span>{formType==='deworming' ? 'Record deworming given and approve the next schedule' : 'Record vaccine given and approve the next booster schedule'}</span>
                </label>

                {f.giveVaccine && (
                  <div className="soap-fields" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "10px", marginTop: "12px" }}>
                    <div className="fld">
                      <label htmlFor="soap-vaccine">{formType==='deworming' ? 'Treatment' : 'Vaccine Type'}<i> *</i></label>
                      <select id="soap-vaccine" aria-invalid={!!errs.vaccine} aria-describedby="soap-vaccine-error" name="vaccine" value={f.vaccine} onChange={e => set("vaccine", e.target.value)}>
                        <option value="">Choose the administered vaccine</option>
                        {(formType==='deworming' ? [['Deworming','Deworming']] : [['Anti-rabies','Anti-rabies'],['5-in-1','5-in-1 DHPP'],['6-in-1','6-in-1'],['8-in-1','8-in-1'],['Kennel cough','Kennel cough'],['Feline 4-in-1','Feline 4-in-1'],['Feline Leukemia (FeLV)','Feline Leukemia (FeLV)'],['Other','Other']]).map(([value,label])=><option key={value} value={value}>{label}</option>)}
                      </select>
                      {errs.vaccine && <span id="soap-vaccine-error" className="err" aria-live="polite">{errs.vaccine}</span>}
                    </div>

                    <div className="fld">
                      <label htmlFor="booster-interval">Vet-selected interval (days)<i> *</i></label>
                      <input id="booster-interval" aria-invalid={!!errs.intervalDays} aria-describedby="soap-interval-error" type="number" min="1" max="3650" step="1" name="intervalDays" value={f.intervalDays} onChange={e => set("intervalDays", e.target.value)} />
                      {errs.intervalDays && <span id="soap-interval-error" className="err" aria-live="polite">{errs.intervalDays}</span>}
                      <label htmlFor="booster-due">{formType==='deworming' ? 'Next treatment due date' : 'Calculated Booster Due Date'}</label>
                      <input
                        type="date"
                        id="booster-due"
                        value={boosterDate(f.date, f.intervalDays)}
                        readOnly
                        style={{ background: "#f8fafc", fontWeight: "600", color: "#15803d" }}
                      />
                    </div>

                    <label>Dose number in current series<input type="number" min="1" max="20" step="1" aria-invalid={!!errs.doseNo} aria-describedby="soap-doseNo-error" name="doseNo" value={f.doseNo} onChange={e => set("doseNo", e.target.value)} />{errs.doseNo && <span id="soap-doseNo-error" className="err" aria-live="polite">{errs.doseNo}</span>}</label>
                    <label>Total planned doses in series<input type="number" min="1" max="20" step="1" aria-invalid={!!errs.doseOf} aria-describedby="soap-doseOf-error" name="doseOf" value={f.doseOf} onChange={e => set("doseOf", e.target.value)} />{errs.doseOf && <span id="soap-doseOf-error" className="err" aria-live="polite">{errs.doseOf}</span>}</label>
                    <div style={{gridColumn:"1/-1"}}>
                      <p>Administration: {f.date} · Birth date: {pet.birth || 'Not recorded'}. Review prior doses in Digital EMR History before selecting the interval.</p>
                      <label className="service-check"><input type="checkbox" aria-invalid={!!errs.scheduleApproved} aria-describedby="soap-scheduleApproved-error" name="scheduleApproved" checked={f.scheduleApproved} onChange={e => set("scheduleApproved", e.target.checked)} /> I approve this interval for the patient's species, age, prior doses and the administered product.</label>
                      {!VACCINE_SERVICE[f.vaccine] && <p>No fixed catalog price is configured for this vaccine. Its administration is recorded without an automatic vaccine charge.</p>}
                      {errs.scheduleApproved && <p id="soap-scheduleApproved-error" className="err" aria-live="polite">{errs.scheduleApproved}</p>}
                    </div>
                    <div className="fld">
                      <label htmlFor="soap-brand">{formType==='deworming' ? 'Product brand' : 'Vaccine Brand'}</label>
                      <input
                        type="text"
                        placeholder="e.g. Defensor 3, Vanguard"
                        id="soap-brand" aria-invalid={!!errs.brand} aria-describedby="soap-brand-error" name="brand" value={f.brand}
                        onChange={e => set("brand", e.target.value)}
                      />
                      {errs.brand && <span id="soap-brand-error" className="err" aria-live="polite">{errs.brand}</span>}
                    </div>

                    <div className="fld">
                      <label htmlFor="soap-batch">Batch / Lot Number</label>
                      <input
                        type="text"
                        placeholder="e.g. LOT-2026-X8"
                        id="soap-batch" aria-invalid={!!errs.batch} aria-describedby="soap-batch-error" name="batch" value={f.batch}
                        onChange={e => set("batch", e.target.value)}
                      />
                      {errs.batch && <span id="soap-batch-error" className="err" aria-live="polite">{errs.batch}</span>}
                    </div>
                    {formType==='vaccination' && [['manufacturer','Manufacturer (optional)'],['serialNumber','Serial number (optional)']].map(([key,label])=><div className="fld" key={key}><label htmlFor={`soap-${key}`}>{label}</label><input id={`soap-${key}`} name={key} value={f[key] || ''} onChange={e=>set(key,e.target.value)} maxLength={100} aria-invalid={!!errs[key]} aria-describedby={`soap-${key}-error`}/>{errs[key] && <span id={`soap-${key}-error`} className="err" aria-live="polite">{errs[key]}</span>}</div>)}
                  </div>
                )}
                <details style={{marginTop:12}}><summary>Microchip identification (if applicable)</summary><div className="two">
                  {[['microchipNumber','Microchip number','text'],['microchipDate','Implantation / scan date','date']].map(([key,label,type])=><div className="fld" key={key}><label htmlFor={`soap-${key}`}>{label}</label><input id={`soap-${key}`} name={key} type={type} max={type==='date'?TODAY:undefined} maxLength={type==='text'?50:undefined} value={f[key] || ''} onChange={e=>set(key,e.target.value)} aria-invalid={!!errs[key]} aria-describedby={`soap-${key}-error`}/>{errs[key] && <span id={`soap-${key}-error`} className="err" aria-live="polite">{errs[key]}</span>}</div>)}
                </div></details>
                <p>{f.giveVaccine ? relevantServices.find(p=>p.id===VACCINE_SERVICE[f.vaccine]) ? `Service total: ₱${relevantServices.find(p=>p.id===VACCINE_SERVICE[f.vaccine]).price.toLocaleString()} · Added to billing once on finalization.` : 'No fixed catalog price is configured for this administration.' : 'No administration charge is recorded unless you confirm it was given.'}</p>
                {catalogError && <p role="alert">{catalogError} <button type="button" onClick={()=>retryCatalog(n=>n+1)}>Retry prices</button></p>}
              </div>}

              {/* Follow-up Appointment Scheduler */}
              {consultation && <div style={{ gridColumn: "1/-1", background: "#f8fafc", border: "1px solid #cbd5e1", padding: "14px", borderRadius: "12px", marginTop: "4px" }}>
                <label style={{ display: "flex", gap: "10px", alignItems: "center", cursor: "pointer", fontWeight: "700", color: "#1e3a8a" }}>
                  <input
                    type="checkbox"
                    name="scheduleFollowUp" checked={f.scheduleFollowUp}
                    onChange={e => set("scheduleFollowUp", e.target.checked)}
                  />
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Calendar size={16} /> Request Clinical Follow-up / Re-check Visit
                  </span>
                </label>

                {f.scheduleFollowUp && (
                  <div style={{ marginTop: "12px" }}>
                    <label>Care status <select aria-describedby="soap-careStatus-error" aria-invalid={!!errs.careStatus} name="careStatus" value={f.careStatus} onChange={e => set("careStatus", e.target.value)}><option>Follow-up required</option><option>Recheck required</option></select></label>
                    {errs.careStatus && <p id="soap-careStatus-error" className="err" role="alert">{errs.careStatus}</p>}
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
                      {[
                        { label: "In 3 Days", days: 3 },
                        { label: "In 7 Days (1 Wk)", days: 7 },
                        { label: "In 14 Days (2 Wks)", days: 14 },
                        { label: "In 1 Month (30 Days)", days: 30 },
                      ].map(preset => (
                        <button
                          key={preset.days}
                          type="button"
                          className={`btn sm ${f.followUpDays === String(preset.days) ? "primary" : "ghost"}`}
                          style={{ fontSize: "12px", padding: "4px 10px" }}
                          onClick={() => handleFollowUpDaysChange(preset.days)}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    <div className="soap-fields" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr)", gap: "10px" }}>
                      <div className="fld">
                        <label htmlFor="soap-followUpDate">Target Follow-up Date<i> *</i></label>
                        <input
                          type="date"
                          id="soap-followUpDate" aria-invalid={!!errs.followUpDate} aria-describedby="soap-followUpDate-error" name="followUpDate" value={f.followUpDate}
                          min={TODAY}
                          onChange={e => set("followUpDate", e.target.value)}
                        />
                        {errs.followUpDate && <p id="soap-followUpDate-error" className="err" role="alert">{errs.followUpDate}</p>}
                      </div>
                      <div className="fld">
                        <label htmlFor="soap-followUpReason">Follow-up Reason / Clinical Instructions</label>
                        <input
                          type="text"
                          maxLength={2000} id="soap-followUpReason" aria-invalid={!!errs.followUpReason} aria-describedby="soap-followUpReason-error" name="followUpReason" value={f.followUpReason}
                          onChange={e => set("followUpReason", e.target.value)}
                          placeholder="e.g. Suture removal, wound check, ear cytology re-eval..."
                        />
                        {errs.followUpReason && <p id="soap-followUpReason-error" className="err" role="alert">{errs.followUpReason}</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>}
            </div>

            {stale && <p className="err" role="alert">This visit has changed or is not in consultation. Refresh clinic records and reopen it. Your notes remain here for reference.</p>}
            {errs.save && <p className="err" role="alert">{errs.save}</p>}
            <div className="row end" style={{ marginTop: "20px", gap: "10px" }}>
              <button type="button" className="btn ghost" onClick={requestClose} disabled={loading}>Cancel</button>
              <button type="submit" className="btn gold" disabled={loading || stale || !serviceCatalog.length || !!catalogError} style={{ fontWeight: 700 }}>
                {loading ? "Saving to EMR & Database..." : (consultation ? "Review and finalize SOAP" : "Review and finalize visit")}
              </button>
            </div>
            </fieldset>
          </form>
        )}
      </div>
    </ClinicDialog>
  );
}
