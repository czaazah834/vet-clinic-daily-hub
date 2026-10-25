import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visitFormType,initialVaccineForVisit,serviceMatchesVisit,visitClinicalFields} from '../src/visitForm.js';
import {validateSoapFields} from '../src/soapValidation.js';
import {clinicalCharges} from '../server/clinicalCharges.js';
import {editablePrescription} from '../src/prescription.js';
import {consentErrors} from '../src/admissionCare.js';
import {diagnosisSuggestions} from '../src/diagnosisSuggestions.js';

test('explicit visit service controls the form; legacy vaccine and deworming reasons remain supported',()=>{
  for(const [visit,type] of [[{service:'vaccination',reason:'Vaccination: Anti-rabies'},'vaccination'],[{service:'checkup',reason:'Concern after vaccine'},'consultation'],[{reason:'Rabies Booster Shot'},'vaccination'],[{reason:'Deworming'},'deworming'],[{service:'vaccination',reason:'Deworming'},'deworming'],[{service:'grooming'},'grooming'],[{service:'surgery'},'consultation']]) assert.equal(visitFormType(visit),type);
});
test('visible service choices exclude unrelated vaccine, grooming and consultation charges',()=>{
  const services=['srv_consult','srv_rabies','srv_dhpp','srv_fvrcp','srv_deworm','srv_groom','srv_cbc'].map(id=>({id}));
  const selected=type=>services.filter(s=>serviceMatchesVisit(s,type)).map(s=>s.id);
  assert.deepEqual(selected('vaccination'),['srv_rabies','srv_dhpp','srv_fvrcp']);
  assert.deepEqual(selected('deworming'),['srv_deworm']);
  assert.deepEqual(selected('grooming'),['srv_groom']);
  assert.deepEqual(selected('consultation'),['srv_consult','srv_cbc']);
});
const form={date:'2026-10-25',symptoms:'Old draft SOAP',objective:'Hydration assessed by vet.',diagnosis:'Suitable for requested care after examination.',treatment:'Home monitoring instructions reviewed.',prescription:'Hidden prescription',weight:'',giveVaccine:false,scheduleFollowUp:true};
const appointment={service:'vaccination',reason:'Vaccination: Anti-rabies',intakeVitals:{weight:10.25,temp:38.5}};
test('preventive care preserves the clinical history format without requiring SOAP entries or hidden follow-up fields',()=>{
  const fields=visitClinicalFields({...form,symptoms:'',objective:''},appointment);
  assert.deepEqual(validateSoapFields(fields,'2026-10-25'),{});
  assert.match(fields.symptoms,/Vaccination: Anti-rabies/);
  assert.match(fields.objective,/10.25 kg/);
  assert.equal(fields.prescription,'');assert.equal(fields.scheduleFollowUp,false);
  assert.equal(fields.giveVaccine,false,'booking alone never records administration');
  assert.equal(clinicalCharges([],null).length,0,'deferral does not add a vaccine charge');
  const saved=visitClinicalFields({...fields,objective:fields.objective+'\nObserved findings.'},appointment);
  assert.equal((saved.objective.match(/10.25 kg/g)||[]).length,1,'legacy summary is not duplicated');
});
test('consultation ignores vaccine selection recovered from old drafts but retains clinical notes and follow-up',()=>{
  const fields=visitClinicalFields({...form,giveVaccine:true},{...appointment,service:'checkup'});
  assert.equal(fields.giveVaccine,false);assert.equal(fields.scheduleFollowUp,true);
  assert.equal(fields.symptoms,form.symptoms);assert.equal(fields.prescription,form.prescription);
});
test('older prescription calculations become manual directions and quantities without losing the calculated supply',()=>{
  const item={quantity:1,instructions:'',dose:{amount:1,unit:'tablet',route:'by mouth',timesPerDay:2,days:7,unitsPerItem:10}};
  const manual=editablePrescription(item);
  assert.equal(manual.quantity,2);assert.match(manual.instructions,/7 day/);assert.equal(manual.dose,null);
  assert.equal(editablePrescription({...item,dose:{amount:''}}).dose,null);
  assert.equal(editablePrescription({...manual,quantity:3}).quantity,3);
});
test('owner consent uses the existing owner contact; an alternate is optional and must be complete if entered',()=>{
  const consent={consentConfirmed:true,consentName:'Synthetic Owner',consentMethod:'In person'};
  assert.ok(Object.values(consentErrors(consent)).every(value=>!value));
  assert.ok(consentErrors({...consent,emergencyName:'Alternate'}).emergencyPhone);
  assert.ok(consentErrors({...consent,alternateContact:true}).emergencyName);
  assert.ok(Object.values(consentErrors({...consent,emergencyName:'Alternate',emergencyPhone:'+639170000001',emergencyRelationship:'Family'})).every(value=>!value));
});
test('expanded veterinary defaults include diverse conditions with no duplicate suggestions',()=>{
  assert.ok(diagnosisSuggestions.length>40);
  assert.equal(new Set(diagnosisSuggestions.map(s=>s.toLowerCase())).size,diagnosisSuggestions.length);
  assert.ok(diagnosisSuggestions.includes('Diabetes mellitus'));
});

test('vaccine form starts with the requested vaccine, and unknown requests require explicit selection',()=>{
 for(const [reason,vaccine] of [['Vaccination: Feline 4-in-1','Feline 4-in-1'],['Vaccination: 5-in-1','5-in-1'],['Vaccination: Bordetella','Kennel cough'],['Vaccination: Anti-rabies','Anti-rabies'],['Vaccination: Ask the veterinarian which vaccine is needed','']])assert.equal(initialVaccineForVisit({service:'vaccination',reason}),vaccine);
 assert.equal(initialVaccineForVisit({service:'deworming',reason:'Routine deworming'}),'Deworming');
});
