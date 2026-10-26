import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import '../../src/styles.css';
import '../../src/portal-polish.css';
import '../../src/roles/admin-workspace.css';
import '../../src/staff-modern.css';
import '../../src/clinical-admin-workspace.css';
import {BookingCatalogProvider} from '../../src/components/VaccineBooking.jsx';
import {SEED} from '../../src/lib.jsx';
import {emptyClinicState} from '../../src/clinicState.js';
import {today} from '../../src/booking.js';
import OwnerAppts from '../../src/roles/owner/Appts.jsx';
import {PetFormModal} from '../../src/roles/owner/Pets.jsx';
import {prefill} from '../../src/roles/owner/ui.jsx';
import CheckIn from '../../src/roles/CheckInModal.jsx';
import WalkIn from '../../src/roles/InClinicRegistration.jsx';
import Existing from '../../src/roles/ExistingPatientCheckInModal.jsx';
import Billing from '../../src/roles/BillingModal.jsx';
import VisitNotes from '../../src/roles/SoapConsultationModal.jsx';
import Admission from '../../src/roles/AdmissionForm.jsx';
import Medicine from '../../src/roles/AdmissionMedicineForm.jsx';
import Handoff from '../../src/roles/HandoffModal.jsx';
import {vet} from '../../src/roles/Vet.jsx';
import {assistant} from '../../src/roles/Assistant.jsx';
import {StaffModal} from '../../src/roles/Admin.jsx';
import {QuickBookModal} from '../../src/roles/ClinicCalendar.jsx';
import StaffHeader from '../../src/roles/StaffHeader.jsx';
import OwnerHeader from '../../src/roles/owner/Header.jsx';
import OwnerLink from '../../src/roles/OwnerAccountLinkModal.jsx';
import LogCall from '../../src/roles/LogCallModal.jsx';
import Cancellation from '../../src/components/CancellationDialog.jsx';
import Admissions from '../../src/roles/AdmissionsPage.jsx';
import CheckoutInbox from '../../src/roles/CheckoutInbox.jsx';
import PetCard from '../../src/roles/PetCardModal.jsx';
const db={...emptyClinicState(),...structuredClone(SEED),vets:[{id:'v1',name:'Synthetic veterinarian'}]};
const pet=db.pets[0];pet.registrationStatus='Verified';
const owner=db.owners.find(o=>o.id===pet.ownerId);owner.name='Synthetic owner';pet.name='Synthetic patient';
const visit={id:'synthetic-visit',petId:pet.id,date:today(),time:'09:00',service:'checkup',reason:'Routine consultation',status:'Scheduled',vetId:'v1',invoiceItems:[{catalogId:'srv_consult',name:'Consultation',price:400,qty:1}],intakeVitals:{weight:10,temp:38.5,triageLevel:'Routine'}};
db.appts=[visit];db.vacc=[];db.records=[];
const admission={id:'synthetic-admission',apptId:visit.id,petId:pet.id,petName:pet.name,ownerName:owner.name,ownerPhone:'+639170000001',vetName:'Synthetic veterinarian',revision:0,status:'Admitted',visitStatus:'In consultation',reason:'Observation',carePlan:'Synthetic plan',admittedAt:new Date().toISOString(),billingStatus:'Unpaid',consent:{name:'Synthetic owner',method:'In person'}};
const root=createRoot(document.getElementById('fixture'));
const order={id:'synthetic-order',medicine:'Synthetic medicine',dose:'Vet entered dose',route:'Vet entered route',frequency:'Vet entered schedule',catalog_id:'medicine'};
const staff={id:'v1',vetId:'v1',role:'vet',name:'Synthetic veterinarian'},reception={id:'assistant',role:'assistant',name:'Synthetic assistant'},client={id:owner.userId || 'u1',ownerId:owner.id,role:'owner',name:owner.name};
db.accountProfiles={[client.id]:{...owner,id:client.id,role:'owner',email:'synthetic@example.invalid',houseStreet:'Synthetic street',city:'Manila',state:'Metro Manila',country:'Philippines'},[staff.id]:{id:staff.id,name:staff.name,role:'vet',email:'vet@example.invalid',phone:'+639170000001',houseStreet:'Synthetic street',city:'Manila',state:'Metro Manila',country:'Philippines'}};
let key=0,inboxTasks=[],inboxReads=0,handoffWrites=0,handoffGate=null;window.closedWorkflow=false;window.workflowHandoff=null;
const props={db,setDb:()=>{},say:()=>{},onSaved:()=>{},onPaid:()=>{},onCheckedIn:()=>{},onCheckIn:()=>{},onClose:()=>{window.closedWorkflow=true;root.render(null);},go:(page,context)=>{window.workflowHandoff={page,context};}};
window.fetch=async(path,options={})=>{
 const url=String(path);let data={};
 if(url.endsWith('/handoff') && options.method==='POST'){
  handoffWrites++;await new Promise(resolve=>handoffGate=resolve);
  return new Response(JSON.stringify({success:false,error:'Synthetic transfer failure. Please retry.'}),{status:503,headers:{'Content-Type':'application/json'}});
 }
 if(url.includes('/services/prices'))data={catalog:[{id:'srv_consult',name:'Consultation',price:400,category:'Consultation'},{id:'medicine',name:'Synthetic medicine',price:50,category:'Pet medicine',requiresPrescription:true}]};
 else if(url.includes('/clinical/note-options'))data={options:{diagnosis:['Synthetic diagnosis'],treatment:['Synthetic care']}};
 else if(url.includes('/availability'))data={slots:['09:00','10:00']};
 else if(url.includes('/claim'))data={claimToken:'synthetic-local-claim',invoiceItems:visit.invoiceItems,prescriptionItems:[]};
 else if(url==='/api/state')data={...db,consults:[],vaccs:[]};
 else if(url.includes('/api/admin/staff'))data={staff:[],invitations:[]};
 else if(url.includes('/api/admissions/synthetic-admission'))data={admission,updates:[],medicationOrders:[],checkedAt:new Date().toISOString()};
 else if(url.includes('/api/admissions'))data={admissions:[admission],total:1,status:'Active',offset:0,checkedAt:new Date().toISOString(),visits:[visit]};
 else if(url.includes('checkout-inbox')){inboxReads++;data={tasks:inboxTasks};}
 else if(url.endsWith('/vet-card'))data={history:{pet,owner,events:[]},document:{}};
 else if(url.endsWith('/vitals'))data={success:true,measurements:[],page:{hasMore:false}};
 else if(url.includes('reminders'))data={success:true,calls:[],pending:0};
 else if(options.method && options.method!=='GET')throw Error('Fixture blocks writes');
 return new Response(JSON.stringify({success:true,data}),{headers:{'Content-Type':'application/json'}});
};
window.showWorkflow=name=>{
 window.closedWorkflow=false;window.workflowHandoff=null;
 prefill.data=null;
 const active={...visit,status:'In consultation'},complete={...visit,status:'Completed'};
 let node;
 switch(name){
 case 'invite':node=<StaffModal {...props} me={{...reception,role:'admin'}}/>;break;
 case 'quickbook':node=<QuickBookModal {...props} slot={{date:today()}} doctors={[["v1","Synthetic veterinarian"]]} onBook={()=>{}}/>;break;
 case 'account-owner':node=<OwnerHeader {...props} me={client}/>;break;
 case 'account-staff':node=<StaffHeader {...props} me={staff}/>;break;
 case 'owner-link':node=<OwnerLink {...props} owner={owner}/>;break;
 case 'cancel':node=<Cancellation {...props} visit={visit} currentVisit={visit} onSubmit={()=>{}}/>;break;
 case 'log-call':{const recall={id:'recall',petId:pet.id,vaccine:'Anti-rabies',date:'2025-01-01',nextDue:today(),done:true,vetId:'v1'};node=<LogCall {...props} db={{...db,vacc:[recall]}} target={{p:pet,o:owner,v:recall}} me={reception}/>;break;}
 case 'booking':prefill.data={petId:pet.id};node=<OwnerAppts {...props} me={client}/>;break;
 case 'pet':node=<PetFormModal {...props} me={client}/>;break;
 case 'intake':node=<CheckIn {...props} appt={visit} me={reception}/>;break;
 case 'walkin':node=<WalkIn {...props} me={reception}/>;break;
 case 'arrival':node=<Existing {...props} me={reception}/>;break;
 case 'checkout':node=<Billing {...props} appt={complete} me={reception}/>;break;
 case 'notes':node=<VisitNotes {...props} appt={active} pet={pet} me={staff} db={{...db,appts:[active]}}/>;break;
 case 'vaccination':{const a={...active,service:'vaccination',reason:'Vaccination: Anti-rabies'};node=<VisitNotes {...props} appt={a} pet={pet} me={staff} db={{...db,appts:[a]}}/>;break;}
 case 'admit':node=<Admission {...props} mode="create" me={staff} visits={[{...active,petName:pet.name,ownerName:owner.name}]}/>;break;
 case 'consent':node=<Admission {...props} mode="consent" me={reception} admission={admission}/>;break;
 case 'observation':node=<Admission {...props} mode="update" me={reception} admission={admission}/>;break;
 case 'discharge':node=<Admission {...props} mode="discharge" me={staff} admission={admission}/>;break;
 case 'release':node=<Admission {...props} mode="release" me={reception} admission={admission}/>;break;
 case 'medicine':node=<Medicine {...props} action="order" admission={admission}/>;break;
 case 'medicine-event':node=<Medicine {...props} action="medication" admission={admission} order={order}/>;break;
 case 'handoff':node=<Handoff {...props} appt={active} me={staff} db={{...db,appts:[active],vets:[...db.vets,{id:'v2',name:'Receiving veterinarian'}]}}/>;break;
 case 'patient-record':{const a={...complete,invoiceItems:[],amount:600,...window.patientScenario};node=<PetCard {...props} me={reception} petId={pet.id} appt={window.patientDefaultVisit?undefined:a} db={{...db,appts:window.patientDefaultVisit?[a,{...visit,id:'later-arrival',reason:'Later scheduled arrival',time:'11:00'}]:[a]}} onBill={()=>window.openedBill=true}/>;break;}
 case 'checkout-inbox':node=<CheckoutInbox me={reception} onOpen={()=>{window.inboxOpened=(window.inboxOpened||0)+1;return true;}}/>;break;
 case 'admissions-vet':admission.status='Admitted';admission.visitStatus='In consultation';node=<Admissions {...props} me={staff}/>;break;
 case 'admissions-assistant':admission.status='Ready for discharge';admission.visitStatus='Completed';node=<Admissions {...props} me={reception}/>;break;
 case 'vet-target':node=<vet.Dash {...props} db={{...db,appts:[active]}} me={staff} navigation={{apptId:visit.id,action:'notes'}} onNavigationHandled={()=>{}}/>;break;
 case 'checkout-target':node=<assistant.Dash {...props} db={{...db,appts:[complete]}} me={reception} navigation={{apptId:visit.id,action:'checkout'}} onNavigationHandled={()=>{}}/>;break;
 default:throw Error('Unknown fixture');
 }
 const role=['booking','pet','account-owner'].includes(name)?'owner':name==='invite'?'admin':['intake','walkin','arrival','checkout','consent','observation','release','quickbook','owner-link','cancel','log-call','admissions-assistant','checkout-target','patient-record','checkout-inbox'].includes(name)?'assistant':'vet';
 flushSync(()=>root.render(<div key={++key} data-page="fixture" className={`shell th-${role}`}><div className="main"><main id="portal-main" tabIndex={-1} className="content"><BookingCatalogProvider>{node}</BookingCatalogProvider></main></div></div>));
 return name;
};
window.showWorkflow('intake');

const tick=()=>new Promise(r=>setTimeout(r,60));
const assert=(v,message)=>{if(!v)throw Error(message);};
const button=(text,scope=document)=>[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
function edit(selector,value){
 const input=document.querySelector(selector);assert(input,`Missing control ${selector}`);
 const prototype=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:input instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
 flushSync(()=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,value);input.dispatchEvent(new Event(input instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});
 return input;
}
window.checkWorkflowForms=async()=>{
 const names=['booking','pet','intake','walkin','arrival','checkout','notes','vaccination','admit','consent','observation','discharge','release','medicine','medicine-event','handoff','invite','quickbook','owner-link','cancel','log-call'];
 const layout=[];
 for(const name of names){
  window.showWorkflow(name);await tick();
  const dialog=document.querySelector('dialog[open]');assert(dialog,`Missing ${name} dialog`);
  const panel=dialog.querySelector('.modal,.admission-form') || dialog;
  assert(panel.scrollWidth<=panel.clientWidth+2,`${name} dialog overflows horizontally`);
  assert(panel.getBoundingClientRect().width<=innerWidth+2,`${name} dialog exceeds viewport`);
  assert(document.documentElement.scrollWidth<=innerWidth+2,`${name} page overflows horizontally`);
  layout.push(name);
 }
 for(const name of ['account-owner','account-staff'])for(const kind of ['profile','password']){
  window.showWorkflow(name);await tick();
  document.querySelector('[aria-label="Account menu"]').click();await tick();
  [...document.querySelectorAll('[role=menuitem]')].find(b=>b.textContent.toLowerCase().includes(kind)).click();await tick();
  const dialog=document.querySelector('dialog[open]'),panel=dialog.querySelector('.modal');
  assert(panel.scrollWidth<=panel.clientWidth+2,`${name} ${kind} overflows`);layout.push(`${name}-${kind}`);
  const control=edit(kind==='password'?'#pcur':'#pphone',kind==='password'?'Synthetic edit':'09179998888');await tick();
  dialog.dispatchEvent(new Event('cancel',{cancelable:true}));await tick();
  const review=document.querySelector('dialog.submission-review');assert(review,`${name} ${kind} must protect unsaved entries`);
  button('Back to edit',review).click();await tick();assert(control.value!=='',`${name} ${kind} must retain values`);
 }
 const cases=[['booking','#notes','Changed booking note'],['pet','#pn','Changed patient'],['intake','input[name=weight]','11.5'],['walkin','#petName','Changed patient'],['arrival','#exw-reason','Changed reason'],['checkout','input[name=cashTendered]','1000'],['invite','#staff-invite-name','Changed staff name'],['quickbook','textarea[name=otherReason]','Changed reason'],['owner-link','input[name=email]','synthetic@example.invalid']];
 const guarded=[];
 for(const [name,selector,value] of cases){
  window.showWorkflow(name);await tick();
  // Quick booking uses a reason choice; pick Other to reveal its free-text field.
  if(name==='quickbook') {const choice=document.querySelector('select[name=reasonChoice]');if(choice)edit('select[name=reasonChoice]','Other');await tick();}
  const control=edit(selector,value);await tick();
  document.querySelector('dialog.clinic-dialog').dispatchEvent(new Event('cancel',{cancelable:true}));await tick();
  let review=document.querySelector('dialog.submission-review');assert(review,`${name} must ask before discarding`);
  button('Back to edit',review).click();await tick();assert(control.value===value,`${name} must retain edited values`);
  document.querySelector('dialog.clinic-dialog').dispatchEvent(new Event('cancel',{cancelable:true}));await tick();
  review=document.querySelector('dialog.submission-review');button('Discard changes',review).click();await tick();
  assert(!document.querySelector('dialog[open]'),`${name} must close after explicit discard`);guarded.push(name);
 }
 window.showWorkflow('intake');await tick();
 document.querySelector('dialog form').requestSubmit();await tick();
 assert(document.querySelector('input[name=weight]').getAttribute('aria-invalid')==='true','Missing measured weight must show inline');
 edit('input[name=weight]','10.5');await tick();assert(document.querySelector('input[name=weight]').getAttribute('aria-invalid')==='false','Corrected measured weight must clear inline feedback');
 window.showWorkflow('admissions-vet');await tick();button('Open care record').click();await tick();button('Finish visit notes').click();await tick();
 assert(window.workflowHandoff?.context?.apptId===visit.id && window.workflowHandoff.context.action==='notes','Admission must hand off the exact visit for notes');
 window.showWorkflow('vet-target');await tick();assert(document.querySelector('dialog')?.textContent.includes(pet.name),'Vet handoff must open the assigned patient record');
 window.showWorkflow('admissions-assistant');await tick();button('Open care record').click();await tick();button('Open this visit’s checkout').click();await tick();
 assert(window.workflowHandoff?.context?.apptId===visit.id && window.workflowHandoff.context.action==='checkout','Discharge must hand off the exact visit for checkout');
 window.showWorkflow('checkout-target');await tick();assert(document.querySelector('dialog')?.textContent.includes(pet.name),'Reception handoff must open the correct patient checkout');
 const result={layout:layout.length,guarded:guarded.length,inlineValidation:true,exactVisitHandoffs:true,viewport:[innerWidth,innerHeight]};
 document.getElementById('results').textContent='PASS: '+JSON.stringify(result);return result;
};

// Targeted regression for the next reception/patient-record fixes. Writes stay intercepted.
window.checkNextWorkflowFixes=async()=>{
 const until=async(fn)=>{for(let i=0;i<150;i++){if(fn())return;await tick();}throw Error('Timed out waiting for workflow state');};
 window.showWorkflow('handoff');await tick();
 const form=document.querySelector('dialog.clinic-dialog form');form.requestSubmit();await tick();
 const vetControl=document.getElementById('handoff-vet'),noteControl=document.getElementById('handoff-note');
 assert(vetControl.getAttribute('aria-invalid')==='true' && noteControl.getAttribute('aria-invalid')==='true','Empty transfer must show both field errors');
 assert(document.activeElement===vetControl,'Empty transfer must focus the receiving veterinarian');
 edit('#handoff-vet','v2');edit('#handoff-note','Monitor breathing and continue the saved care plan.');await tick();
 assert(vetControl.getAttribute('aria-invalid')==='false' && noteControl.getAttribute('aria-invalid')==='false','Correcting transfer fields must clear feedback');
 document.querySelector('dialog.clinic-dialog').dispatchEvent(new Event('cancel',{cancelable:true}));await tick();
 let review=document.querySelector('dialog.submission-review');assert(review?.textContent.includes('Discard unsaved changes'),'Transfer must guard unsaved instructions');
 button('Back to edit',review).click();await tick();
 assert(noteControl.value.includes('Monitor breathing'),'Back to edit must retain instructions');
 form.requestSubmit();await tick();review=document.querySelector('dialog.submission-review');
 assert(review?.textContent.includes('Receiving veterinarian'),'Transfer review must name the selected recipient');
 const before=handoffWrites;button('Confirm care transfer',review).click();await until(()=>handoffWrites===before+1);
 document.querySelector('dialog.clinic-dialog').dispatchEvent(new Event('cancel',{cancelable:true}));await tick();
 assert(!window.closedWorkflow && !document.querySelector('dialog.submission-review'),'Transfer must stay open while saving');
 handoffGate();await until(()=>document.body.textContent.includes('Synthetic transfer failure'));
 assert(noteControl.value.includes('Monitor breathing') && vetControl.value==='v2','Failed transfer must retain both entries');
 assert(handoffWrites===before+1,'Failed transfer must not retry automatically');
 document.querySelector('dialog.clinic-dialog').dispatchEvent(new Event('cancel',{cancelable:true}));await tick();
 button('Discard changes',document.querySelector('dialog.submission-review')).click();await tick();assert(window.closedWorkflow,'Explicit discard must close transfer');
 const scenarios=[
  [{},'Awaiting checkout',false,null],
  [{invoiceItems:[{name:'Saved care',price:125,qty:2}],discount:50},'Draft ₱200.00',true,null],
  [{admissionStatus:'Admitted',invoiceItems:[{name:'Saved care',price:125,qty:2}]},'Awaiting discharge approval',false,false],
  [{admissionStatus:'Ready for discharge'},'Awaiting checkout',false,true],
  [{billingStatus:'Paid',amount:0},'Paid · ₱0.00',false,true],
  [{billingStatus:'Paid',amount:null},'Paid · Amount not recorded',false,true]
 ];
 for(const [scenario,label,hasDraft,checkout] of scenarios){
  window.patientScenario=scenario;window.patientDefaultVisit=false;window.showWorkflow('patient-record');await tick();button('Clinical history').click();await tick();
  const panel=document.querySelector('dialog .modal'),text=panel.textContent;
  assert(text.includes(label),`Patient record must show ${label}`);
  assert(!text.includes('₱600'),'Patient record must not turn booking defaults into charges');
  if(!hasDraft)assert(!text.includes('Draft ₱'),'Patient record must not invent a draft amount');
  if(checkout!==null)assert(!!button(scenario.billingStatus==='Paid'?'View Paid Receipt':'Settle Bill / Checkout')===checkout,'Checkout action must honor saved payment and admission hold');
  assert(panel.scrollWidth<=panel.clientWidth+2,'Patient clinical record must fit narrow screens');
 }
 window.patientScenario={};window.patientDefaultVisit=true;window.showWorkflow('patient-record');await tick();button('Clinical history').click();await tick();
 assert(document.body.textContent.includes('Later scheduled arrival') && !button('Settle Bill / Checkout'),'Default patient record must select active arrival before earlier completion');
 // Model a native cancellation/rejection dialog with no .scrim or aria-modal attribute.
 window.inboxOpened=0;inboxTasks=[];inboxReads=0;window.showWorkflow('checkout-inbox');await until(()=>inboxReads>=1);await tick();
 const dialog=document.createElement('dialog');dialog.className='submission-review';dialog.textContent='Rejection instructions in progress';document.body.append(dialog);dialog.showModal();
 const reads=inboxReads;inboxTasks=[{appointmentId:'queued-checkout',petName:pet.name,ownerName:owner.name,date:today(),time:'09:00',status:'pending'}];
 try{await until(()=>inboxReads>reads);await tick();assert(window.inboxOpened===0,'New checkout must wait while a native rejection dialog is open');}
 finally{dialog.close();dialog.remove();}
 await until(()=>window.inboxOpened===1);
 await tick();assert(window.inboxOpened===1,'Waiting checkout must open once after the dialog closes');
 const result={handoffInlineAndFocus:true,handoffDiscardAndFailureRetention:true,inFlightCloseBlocked:true,patientBillingCases:scenarios.length,activeArrivalPreferred:true,checkoutWaitsForNativeDialog:true,viewport:[innerWidth,innerHeight]};
 document.getElementById('results').textContent='PASS: '+JSON.stringify(result);return result;
};
