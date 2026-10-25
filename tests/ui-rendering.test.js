import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Exercise real JSX render paths, including callbacks evaluated during render.
const directory = mkdtempSync(join(tmpdir(), 'pawcare-render-'));
after(() => rmSync(directory, { recursive: true, force: true }));
const bundle = join(directory, 'ui.cjs');
buildSync({
  stdin: {
    contents: `
      export { PaginatedTable, PaginatedList, pageBounds } from './src/components/Pagination.jsx';
      export { createElement } from 'react';
      export { renderToStaticMarkup } from 'react-dom/server';
      export { owner } from './src/roles/Owner.jsx';
      export { admin } from './src/roles/Admin.jsx';
      export { vet } from './src/roles/Vet.jsx';
      export { assistant } from './src/roles/Assistant.jsx';
      export { ProfileBody, PasswordBody } from './src/roles/owner/Profile.jsx';
      export { PetFormModal, PetProfileModal } from './src/roles/owner/Pets.jsx';
      export { DischargeDocument } from './src/roles/AdmissionDischargeSummary.jsx';
      export { default as PetApprovalModal } from './src/roles/PetApprovalModal.jsx';
      export { default as Reports } from './src/roles/ReportsPage.jsx';
      export { default as ErrorBoundary } from './src/ErrorBoundary.jsx';
      export { SEED } from './src/lib.jsx';
      export { VitalEntries, Correction } from './src/roles/VitalsHistory.jsx';
      export { default as CheckInModal } from './src/roles/CheckInModal.jsx';
      export { default as SoapConsultationModal } from './src/roles/SoapConsultationModal.jsx';
      export { emptyClinicState } from './src/clinicState.js';
    `,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
  },
  bundle: true,
  outfile: bundle,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  define: { 'import.meta.env.DEV': 'false' },
  logLevel: 'silent',
});
const ui = createRequire(import.meta.url)(bundle);
const render = (Component, props) => ui.renderToStaticMarkup(ui.createElement(Component, props));
const me = role => ({ id: role === 'vet' ? 'v1' : 'u1', ownerId: 'o1', role, name: 'Sample User', email: 'owner@example.test' });
const populated = () => ({ ...ui.emptyClinicState(), ...structuredClone(ui.SEED), vets: [{ id: 'v1', name: 'Sample Vet' }] });
const props = (role, db) => ({ db, me: me(role), setDb() {}, go() {}, say() {}, onClose() {} });

for (const role of ['owner', 'vet', 'assistant', 'admin']) {
  for (const [state, makeDb] of [['empty', ui.emptyClinicState], ['populated', populated]]) {
    for (const page of ui[role].menu.filter(page => !page.hide)) {
      const Component = page.Page || (page.dash ? ui[role].Dash : page.rep ? ui.Reports : null);
      if (Component) test(`${role} ${page.k} renders with ${state} records`, () => {
        assert.ok(render(Component, props(role, makeDb())).length);
      });
    }
  }
}

test('vaccination cards render administered history without an active booster recall', () => {
  const db = populated();
  db.vacc = [{ id: 'dose', petId: 'p1', vaccine: 'Anti-rabies', done: true, vetId: 'v1', date: '2026-01-01', nextDue: null }];
  const html = render(ui.owner.menu.find(page => page.k === 'vacc').Page, props('owner', db));
  assert.match(html, /Anti-rabies/);
});

for (const role of ['owner', 'vet', 'assistant', 'admin']) {
  test(`${role} profile renders a loaded email address`, () => {
    const db = populated();
    db.accountProfiles = { [me(role).id]: { ...me(role), phone: '09171234567' } };
    assert.match(render(ui.ProfileBody, props(role, db)), /owner@example.test/);
  });
  test(`${role} password settings render`, () => {
    assert.match(render(ui.PasswordBody, props(role, populated())), /Current password/);
  });
}

test('owner pet registration and patient details render', () => {
  const db = populated();
  assert.ok(render(ui.PetFormModal, props('owner', db)).length);
  assert.ok(render(ui.PetProfileModal, { ...props('owner', db), pet: db.pets[0] }).length);
});


test('production recovery explains the next action without exposing exception details', () => {
  const boundary = new ui.ErrorBoundary({ inline: true });
  boundary.state = { hasError: true, error: new Error("Cannot access 'mine' before initialization") };
  const html = ui.renderToStaticMarkup(boundary.render());
  assert.match(html, /Try again/);
  assert.match(html, /Back to dashboard/);
  assert.doesNotMatch(html, /before initialization|Developer details/);
});


test('page recovery can return to the dashboard without reloading the workspace', () => {
  let navigated = false, retried = false;
  const boundary = new ui.ErrorBoundary({ inline: true, onReset: () => { navigated = true; } });
  boundary.retry = () => { retried = true; };
  boundary.goHome();
  assert.equal(navigated, true);
  assert.equal(retried, true);
});

test('root recovery only resets the remembered screen and preserves stored data', () => {
  const oldStorage = globalThis.sessionStorage, oldWindow = globalThis.window;
  const store = new Map([
    ['pawcare_last_session_user', JSON.stringify({ id: 'owner' })],
    ['pawcare_page_owner', 'vacc'], ['pawcare_token', 'synthetic-session'],
    ['unrelated-setting', 'preserve'],
  ]);
  let location;
  globalThis.sessionStorage = { getItem: key => store.get(key), removeItem: key => store.delete(key) };
  globalThis.window = { location: { assign: value => { location = value; } } };
  try {
    new ui.ErrorBoundary({}).goHome();
    assert.equal(location, '/');
    assert.equal(store.has('pawcare_page_owner'), false);
    assert.equal(store.get('pawcare_token'), 'synthetic-session');
    assert.equal(store.get('unrelated-setting'), 'preserve');
  } finally {
    if (oldStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = oldStorage;
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});


test('owner dashboard explains a booked vaccine with no booster due date', () => {
  const db = populated();
  db.vacc = [];
  db.appts = [{ id: 'vaccine-visit', petId: 'p1', ownerId: 'o1', service: 'vaccination', reason: 'Vaccination – Anti-rabies', date: '2099-01-05', time: '10:00', status: 'Scheduled' }];
  const html = render(ui.owner.Dash, props('owner', db));
  assert.match(html, /Anti-rabies/);
  assert.match(html, /Visit: 2099-01-05/);
  assert.match(html, /Booster date not recorded/);
});

test('front desk surfaces a future booking before its arrival date', () => {
  const db = populated();
  db.appts = [{id:'future-approval',petId:'p1',vetId:'v1',date:'2099-01-05',time:'10:00',status:'Pending Approval',reason:'Future vaccination request',notes:'Please call before the visit.'}];
  const html = render(ui.assistant.Dash, props('assistant', db));
  assert.match(html, /Pending Appointment Requests/);
  assert.match(html, /Visit requests \(1\)/);
  assert.match(html, /Future vaccination request/);
  assert.match(html, /2099-01-05/);
  assert.match(html, /10:00 AM/);
  assert.match(html, /Sample Vet/);
  assert.match(html, /Please call before the visit/);
  assert.match(html, /Approve visit/);
});


test('assistant masterlist uses certified latest-dose recalls without implying coverage', () => {
  const db = populated();
  db.vacc = [{ id: 'old-dose', petId: db.pets[0].id, vaccine: 'Anti-rabies', done: true, vetId: 'v1', date: '2020-01-01', nextDue: '2021-01-01' }];
  const Component = ui.assistant.menu.find(page => page.k === 'clients-patients').Page;
  assert.match(render(Component, props('assistant', db)), /1 Overdue/);
  db.vacc.push({ id: 'latest-dose', petId: db.pets[0].id, vaccine: 'Anti-rabies', done: true, vetId: 'v1', date: '2026-01-01', nextDue: null });
  const html = render(Component, props('assistant', db));
  assert.doesNotMatch(html, /1 Overdue|Up to date/);
  assert.match(html, /No active recall/);
});


test('data tables show ten rows while keeping the complete filtered record for print', () => {
  const rows = Array.from({length:23}, (_,i) => ui.createElement('tr',{key:i},ui.createElement('td',{},`Patient ${i+1}`)));
  const html = render(ui.PaginatedTable,{label:'Patients',children:[ui.createElement('thead',{key:'head'},ui.createElement('tr',{},ui.createElement('th',{},'Patient'))),ui.createElement('tbody',{key:'body'},rows),ui.createElement('tfoot',{key:'total'},ui.createElement('tr',{},ui.createElement('td',{},'Total: 23')))]});
  assert.equal((html.match(/class="pagination-hidden-row"/g)||[]).length,13);
  assert.match(html,/Patient 23/);
  assert.match(html,/Total: 23/);
  assert.match(html,/1–10/);
  assert.match(html,/Patients pagination/);
  assert.match(html,/Go to page 3/);
});
test('pagination clamps invalid or removed pages and represents empty results honestly', () => {
  assert.deepEqual(ui.pageBounds(0,99),{page:1,pages:1,start:0,end:0,total:0});
  assert.deepEqual(ui.pageBounds(23,3),{page:3,pages:3,start:20,end:23,total:23});
  assert.equal(ui.pageBounds(10,2).page,1);
  assert.equal(ui.pageBounds(23,-1).page,1);
  assert.equal(ui.pageBounds(23,Infinity).page,3);
});

test('discharge print document distinguishes prescribed medicine, clinic use, unpaid and released records',()=>{
  const data={admission:{id:'stay',petName:'Patient',vetName:'Vet',status:'Ready for discharge',admittedAt:'2026-10-25T00:00:00Z',dischargeApprovedAt:'2026-10-25T01:00:00Z',dischargeInstructions:'Home care saved'},ownerName:'Owner',consultation:{diagnosis:'Vaccination suitability assessment',treatment:'Care saved',prescription:'Home directions saved',prescriptionItems:[{name:'Home medicine',quantity:2,unit:'packages',instructions:'Vet directions'}]},appointment:{id:'visit',status:'Completed',billingStatus:'Unbilled',invoiceItems:[{name:'Clinic medicine',source:'admission',price:100,qty:1}]},generatedAt:'2026-10-25T01:00:00Z'};
  const pending=render(ui.DischargeDocument,{data});
  for(const text of ['Release to owner has not yet been confirmed','Awaiting checkout','Draft total','Home directions saved','Vet directions','Home care saved','Clinic medicine (clinic use)','print-document'])assert.ok(pending.includes(text),text);
  const paid=render(ui.DischargeDocument,{data:{...data,admission:{...data.admission,status:'Discharged',dischargedAt:'2026-10-25T02:00:00Z'},appointment:{...data.appointment,billingStatus:'Paid',amount:90,discount:10,paymentMethod:'Cash',cashTendered:100,changeAmount:10,paidAt:'2026-10-25T01:30:00Z'}}});
  for(const text of ['Paid amount','90.00','Cash received','Change recorded'])assert.ok(paid.includes(text),text);
  assert.ok(!paid.includes('Release to owner has not yet been confirmed'));
});

test('pending appointment queue presents linked registration and visit for one combined approval',()=>{
 const db=populated();
 db.pets[0]={...db.pets[0],registrationStatus:'Pending'};
 db.petRequests=[{id:'review',petId:db.pets[0].id,ownerId:db.pets[0].ownerId,name:'Pending Luna',species:'Feline',breed:'Puspin',sex:'Female',birth:'2025-01-01',weight:4.25,neutered:'Not sure',notes:'Owner registration notes',status:'Pending',revision:2}];
 db.appts=[{id:'pending-visit',petId:db.pets[0].id,vetId:'v1',date:'2099-01-05',time:'10:00',status:'Pending Approval',reason:'Requested examination'}];
 const html=render(ui.assistant.Dash,props('assistant',db));
 for(const text of ['Pending Appointment Requests','Requested examination','Pet registration details','Owner-reported weight:','4.25','Owner registration notes','Approve appointment &amp; registration']) assert.ok(html.includes(text),text);
});

test('registration review of a booked pending patient uses the combined approval action',()=>{
 const db=populated();const request={id:'review',petId:db.pets[0].id,ownerId:db.pets[0].ownerId,name:'Luna',species:'Feline',sex:'Female',birth:'2025-01-01',weight:4.25,neutered:'Not sure',status:'Pending',revision:0};
 db.petRequests=[request];db.appts=[{id:'linked',petId:request.petId,vetId:'v1',date:'2099-01-05',time:'10:00',reason:'Linked requested examination',status:'Pending Approval'}];
 const html=render(ui.PetApprovalModal,{...props('assistant',db),request});
 assert.match(html,/Requested visit/);assert.match(html,/Linked requested examination/);assert.match(html,/Approve appointment &amp; registration/);assert.doesNotMatch(html,/>Approve pet and issue vaccination card</);
});


test('vitals render clinical measurements, registration reports, original entries and linked corrections',()=>{
 const original={id:'original',petId:'p1',visitId:'visit',kind:'temp',value:39,unit:'°C',date:'2026-10-25',measuredAt:'2026-10-25T01:00:00Z',recordedAt:'2026-10-25T01:00:01Z',staffName:'Synthetic vet',staffRole:'vet',origin:'clinic',source:'intake',supersededBy:'correction'};
 const entries=[original,{...original,id:'correction',value:38.5,supersededBy:null,correctsId:'original',correctionReason:'Transcription error'}, {...original,id:'report',kind:'weight',value:10,unit:'kg',origin:'registration'}, {...original,id:'note',kind:'observation',value:null,unit:null,notes:'Bedside observation',source:'admission'}];
 const html=render(ui.VitalEntries,{entries,canCorrect:true});
 for(const text of ['Temperature: 39','Temperature: 38.5','Synthetic vet','visit','Correction of original','Corrected by correction','original retained','Transcription error','not a clinic measurement','Bedside observation'])assert.ok(html.includes(text),text);
 assert.equal((html.match(/Correct entry/g)||[]).length,1);
 assert.doesNotMatch(render(ui.VitalEntries,{entries,canCorrect:false}),/Correct entry/);
});
test('correction fields have immediate accessible inline validation and numeric bounds',()=>{
 const html=render(ui.Correction,{entry:{kind:'temp',value:38.5,unit:'°C'},onCancel(){},onSaved(){}});
 assert.match(html,/name="value"/);assert.match(html,/name="reason"/);assert.match(html,/min="33"/);assert.match(html,/max="45"/);assert.match(html,/maxLength="500"/);assert.match(html,/aria-live="polite"/);assert.match(html,/aria-describedby=/);assert.match(html,/original entry stays/);
});
test('vet intake remains available during consultation and registration weight is not a clinical baseline',()=>{
 const db=populated(),pet={...db.pets[0],weight:90,weightOrigin:'registration',weights:[{kg:90,origin:'registration'}]};db.pets[0]=pet;
 const appt={...db.appts.find(a=>a.petId===pet.id),status:'In consultation'};db.appts=[appt];
 const html=render(ui.CheckInModal,{...props('vet',db),appt});
 assert.match(html,/Measured weight/);assert.match(html,/Measured temperature/);assert.match(html,/earlier measurements/i);assert.doesNotMatch(html,/Last clinic measurement/);
});
test('SOAP displays saved intake but starts the new-measurement field empty',()=>{
 const db=populated(),pet=db.pets[0],appt={...db.appts.find(a=>a.petId===pet.id),status:'In consultation',intakeVitals:{weight:10.25,temp:38.5}};db.appts=[appt];
 const html=render(ui.SoapConsultationModal,{...props('vet',db),pet,appt});
 assert.match(html,/New measured weight/);assert.match(html,/10.25 kg/);assert.match(html,/<input[^>]*id="soap-weight"[^>]*value=""/);
});
