import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import '../../src/styles.css';
import '../../src/portal-polish.css';
import '../../src/roles/admin-workspace.css';
import '../../src/staff-modern.css';
import '../../src/clinical-admin-workspace.css';
import {useCheckoutClaim} from '../../src/useCheckoutClaim.js';
import Billing from '../../src/roles/BillingModal.jsx';
import {BookingCatalogProvider} from '../../src/components/VaccineBooking.jsx';
import {emptyClinicState} from '../../src/clinicState.js';
const root=createRoot(document.getElementById('fixture'));
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
const until=async fn=>{for(let i=0;i<150;i++){if(fn())return;await tick();}throw Error('Timed out waiting for checkout workflow');};
const assert=(value,message)=>{if(!value)throw Error(message);};
const button=(text,scope=document)=>[...scope.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
const review=()=>document.querySelector('dialog.submission-review');
const count=action=>window.claimRequests.filter(r=>r.action===action).length;
const invoice=[{catalogId:'srv_consult',name:'Synthetic consultation',category:'Consultation',price:500,qty:1}];
const visit={id:'synthetic-checkout',petId:'synthetic-pet',status:'Completed',billingStatus:'Unpaid',date:'2026-10-26',time:'09:00',reason:'Routine consultation',invoiceItems:invoice};
const db={...emptyClinicState(),pets:[{id:visit.petId,name:'Synthetic patient',ownerId:'synthetic-owner',species:'Canine'}],owners:[{id:'synthetic-owner',name:'Synthetic owner'}],appts:[visit]};
const assistant={id:'synthetic-assistant',name:'Synthetic assistant',role:'assistant'};
let key=0,claimGate,renewGate;
function Harness({id,paid=false,enabled=true}){const claim=useCheckoutClaim(id,paid,enabled);window.currentClaim=claim;return <section><h2>Reservation fixture</h2><output>{JSON.stringify({ready:claim.ready,checking:claim.checking,error:claim.error,token:claim.claimToken,invoice:claim.invoiceItems})}</output><button onClick={claim.retry}>Retry harness</button></section>;}
function Bill({role='assistant',paid=false}){const [state,setState]=React.useState(db);return <Billing appt={{...visit,billingStatus:paid?'Paid':'Unpaid'}} db={state} setDb={setState} me={{...assistant,role}} onClose={()=>{window.billClosed=true;root.render(null);}} onPaid={()=>window.paidCount++}/>;}
window.showClaim=(id='visit-a',paid=false,enabled=true)=>flushSync(()=>root.render(<Harness key="claim-harness" id={id} paid={paid} enabled={enabled}/>));
window.showClaimBill=(role='assistant',paid=false)=>flushSync(()=>root.render(<div key={++key} data-page="fixture" className={`shell th-${role}`}><div className="main"><main className="content"><BookingCatalogProvider><Bill role={role} paid={paid}/></BookingCatalogProvider></main></div></div>));
function edit(selector,value){const control=document.querySelector(selector);assert(control,`Missing ${selector}`);const proto=control instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;flushSync(()=>{Object.getOwnPropertyDescriptor(proto,'value').set.call(control,value);control.dispatchEvent(new Event(control instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});}
function reset(){window.claimRequests=[];window.claimReply='saved';window.renewReply='saved';window.deferClaim=false;window.deferRenew=false;window.nextInvoice=invoice;window.paidCount=0;claimGate=null;renewGate=null;}
window.fetch=async(path,options={})=>{
 const url=String(path),json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 const match=url.match(/^\/api\/checkout-inbox\/([^/]+)\/(claim|renew|release)$/);
 if(match){
  const [,id,action]=match,request={id,action,body:JSON.parse(options.body)};window.claimRequests.push(request);
  if(action==='release')return json({success:true});
  if(action==='claim' && window.deferClaim)await new Promise(resolve=>claimGate=resolve);
  if(action==='renew' && window.deferRenew)await new Promise(resolve=>renewGate=resolve);
  const reply=action==='claim'?window.claimReply:window.renewReply;
  if(reply==='fail')return json({error:'Synthetic reservation connection failure'},503);
  if(reply==='conflict')return json({error:'Synthetic reservation expired or owned by another session'},409);
  if(reply==='missing')return json({});
  const leaseUntil=new Date(Date.now()+(reply==='expired'?-1:300000)).toISOString();
  return json(action==='renew'?{success:true,leaseUntil}:{success:true,claimToken:`token-${id}-${count('claim')}`,leaseUntil,invoiceItems:reply==='bad-invoice'?null:window.nextInvoice,prescriptionItems:[],prescription:''});
 }
 if(url==='/api/services/prices')return json({catalog:[{id:'srv_consult',name:'Synthetic consultation',category:'Consultation',price:500}]});
 if(url===`/api/appointments/${visit.id}/billing`){const submitted=JSON.parse(options.body);window.claimRequests.push({action:'payment',body:submitted});return json({success:true,appointment:{...visit,...submitted,paidAt:new Date().toISOString()}});}
 if(options.method && options.method!=='GET')throw Error('Fixture blocks other mutations');
 return json({});
};
reset();
window.checkCheckoutClaims=async()=>{
 const originalNow=Date.now,originalInterval=window.setInterval,originalClearInterval=window.clearInterval,originalTimeout=window.setTimeout;
 const intervals=new Map();let clock=originalNow(),expiryCallback;
 Date.now=()=>clock;
 window.setInterval=(fn,delay,...args)=>{const id=originalInterval(fn,delay,...args);if(delay===60000)intervals.set(id,fn);return id;};
 window.clearInterval=id=>{intervals.delete(id);originalClearInterval(id);};
 window.setTimeout=(fn,delay,...args)=>{if(delay>=10000)expiryCallback=fn;return originalTimeout(fn,delay,...args);};
 const background=()=>[...intervals.values()].forEach(fn=>fn());
 try{
  flushSync(()=>root.render(null));await tick();
  reset();window.claimReply='missing';window.showClaim();await until(()=>window.currentClaim.error);
  assert(!window.currentClaim.ready && !window.currentClaim.isActive() && !window.currentClaim.claimToken,'Missing claim acknowledgement cannot enable payment');
  window.claimReply='bad-invoice';window.currentClaim.retry();await until(()=>count('release')===1 && !window.currentClaim.checking);
  assert(!window.currentClaim.ready && window.claimRequests.find(r=>r.action==='release').body.claimToken==='token-visit-a-2','Malformed committed claim releases its exact token');
  window.claimReply='expired';window.currentClaim.retry();await until(()=>count('release')===2 && !window.currentClaim.checking);
  assert(!window.currentClaim.isActive(),'Expired acknowledgement rejected and released');
  window.claimReply='saved';window.deferClaim=true;window.currentClaim.retry();await until(()=>claimGate);
  const requests=count('claim');window.currentClaim.retry();window.dispatchEvent(new Event('focus'));background();await tick();assert(count('claim')===requests && count('renew')===0,'Initial claim and manual retries share one request lock');
  window.deferClaim=false;claimGate();await until(()=>window.currentClaim.ready);
  assert(window.currentClaim.isActive() && window.currentClaim.invoiceItems[0].price===500,'Only a confirmed claim enables checkout');

  window.deferRenew=true;window.dispatchEvent(new Event('focus'));await until(()=>renewGate);const renewals=count('renew');
  background();window.currentClaim.retry();document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));await tick();
  assert(count('renew')===renewals && window.currentClaim.checking,'Focus, visible tab, interval and manual retry serialize renewals');
  window.renewReply='missing';window.deferRenew=false;renewGate();await until(()=>!window.currentClaim.checking);
  assert(!window.currentClaim.ready && !window.currentClaim.isActive() && window.currentClaim.error,'Missing renewal acknowledgement disables payment');
  window.renewReply='saved';window.currentClaim.retry();await until(()=>window.currentClaim.ready);
  clock+=300001;expiryCallback();await until(()=>!window.currentClaim.ready);assert(window.currentClaim.error.includes('expired'),'Expiry timer explains how to recover');
  assert(!window.currentClaim.isActive(),'Synchronous lease check detects expiry even if browser timers are throttled');
  const claimsBefore=count('claim');window.renewReply='conflict';background();await until(()=>!window.currentClaim.checking && !window.currentClaim.claimToken);
  assert(count('claim')===claimsBefore,'Background conflict does not automatically acquire another reservation');
  window.currentClaim.retry();await until(()=>window.currentClaim.ready);assert(count('claim')===claimsBefore+1,'Explicit retry reacquires after lost ownership');
  const oldToken=window.currentClaim.claimToken;window.deferRenew=true;window.renewReply='fail';window.dispatchEvent(new Event('focus'));await until(()=>renewGate);
  window.showClaim('visit-b');await until(()=>window.currentClaim.ready && window.currentClaim.claimToken.includes('visit-b'));
  const newToken=window.currentClaim.claimToken;renewGate();await tick();window.deferRenew=false;
  assert(window.currentClaim.ready && window.currentClaim.claimToken===newToken && window.claimRequests.some(r=>r.action==='release' && r.id==='visit-a' && r.body.claimToken===oldToken),'Old renewal cannot overwrite new appointment and old reservation is released');
  window.showClaim('visit-b',true);await tick();assert(!window.currentClaim.ready && !window.currentClaim.claimToken,'Paid transition clears stale claim state');
  assert(!window.claimRequests.some(r=>r.action==='release' && r.body.claimToken===newToken),'Confirmed payment does not release its completed reservation');
  const beforeDisabled=count('claim');window.showClaim('visit-b',false,false);await tick();assert(count('claim')===beforeDisabled && !window.currentClaim.ready,'Disabled role does not claim or retain checkout readiness');
  window.showClaim('visit-c');await until(()=>window.currentClaim.ready);const disabledToken=window.currentClaim.claimToken;window.showClaim('visit-c',false,false);await tick();assert(window.claimRequests.some(r=>r.action==='release' && r.body.claimToken===disabledToken),'Role change releases unpaid reservation');
  window.deferClaim=true;window.showClaim('visit-late');await until(()=>claimGate);flushSync(()=>root.render(null));window.deferClaim=false;claimGate();await until(()=>window.claimRequests.some(r=>r.action==='release' && r.id==='visit-late'));
  assert(!intervals.size,'Unmount removes renewal intervals');

  reset();window.showClaimBill();await until(()=>button('Review payment') && !button('Review payment').disabled);
  edit('input[name="qty-0"]','2');edit('input[name=discount]','50');edit('input[name=cashTendered]','2000');
  window.renewReply='fail';window.dispatchEvent(new Event('focus'));await until(()=>button('Retry checkout claim'));
  assert(button('Review payment').disabled && document.querySelector('input[name="qty-0"]').value==='2' && document.querySelector('input[name=cashTendered]').value==='2000','Reservation failure disables payment and retains invoice/cash draft');
  window.renewReply='conflict';window.nextInvoice=[{...invoice[0],qty:99}];button('Retry checkout claim').click();await until(()=>!button('Review payment').disabled);
  assert(document.querySelector('input[name="qty-0"]').value==='2' && document.querySelector('input[name=discount]').value==='50','Reacquiring preserves entered invoice and discount');
  document.querySelector('form').requestSubmit();await until(()=>review());clock+=300001;
  button('Confirm payment',review()).click();await until(()=>document.body.textContent.includes('no longer active. Retry checkout'));
  assert(count('payment')===0 && document.querySelector('input[name=cashTendered]').value==='2000','Post-review synchronous lease check prevents payment without clearing cash');
  window.renewReply='saved';window.dispatchEvent(new Event('focus'));await until(()=>!button('Review payment').disabled);
  document.querySelector('form').requestSubmit();await until(()=>review());clock+=300001;expiryCallback();await until(()=>button('Confirm payment',review()).disabled);
  assert(review().textContent.includes('changed while you were reviewing'),'Visible expiry invalidates an open payment review');button('Back to edit',review()).click();await tick();
  window.dispatchEvent(new Event('focus'));await until(()=>!button('Review payment').disabled);
  edit('select','Maya');edit('input[name=refNo]','SYNTHETIC-REFERENCE');window.renewReply='missing';window.dispatchEvent(new Event('focus'));await until(()=>button('Retry checkout claim'));
  assert(document.querySelector('input[name=refNo]').value==='SYNTHETIC-REFERENCE','Unconfirmed renewal preserves electronic payment reference');
  window.renewReply='saved';button('Retry checkout claim').click();await until(()=>!button('Review payment').disabled);
  document.querySelector('form').requestSubmit();await until(()=>review());button('Confirm payment',review()).click();await until(()=>window.paidCount===1);
  assert(count('payment')===1 && window.claimRequests.find(r=>r.action==='payment').body.claimToken && document.body.textContent.includes('Payment Recorded Successfully'),'Confirmed retry can record one acknowledged payment');
  const releases=count('release');flushSync(()=>root.render(null));await tick();assert(count('release')===releases,'Paid invoice cleanup does not release completed task');
  const claims=count('claim');window.showClaimBill('vet');await tick();assert(count('claim')===claims && !button('Review payment'),'Veterinarian cannot claim or pay');
  window.showClaimBill('assistant',true);await tick();assert(count('claim')===claims,'Saved receipt does not acquire reservation');
  window.showClaimBill();await until(()=>button('Review payment') && !button('Review payment').disabled);
  const dialog=document.querySelector('dialog.clinic-dialog'),panel=dialog.querySelector('.modal');
  assert(panel.scrollWidth<=panel.clientWidth+2 && document.documentElement.scrollWidth<=innerWidth+2,'Checkout fits current viewport');
  const result={acknowledgements:true,serializedRenewals:true,expiryAndReview:true,lateCleanup:true,appointmentAndRoleIsolation:true,invoiceRetention:true,confirmedPayment:true,viewport:[innerWidth,innerHeight]};
  document.getElementById('results').textContent='PASS: '+JSON.stringify(result);return result;
 }finally{Date.now=originalNow;window.setInterval=originalInterval;window.clearInterval=originalClearInterval;window.setTimeout=originalTimeout;}
};
