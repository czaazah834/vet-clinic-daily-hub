import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validWalkInBirth,walkInBirthWindow,savedWalkInRegistration} from '../src/walkInRegistration.js';
test('birth dates use the clinic window and reject normalized impossible dates',()=>{
 const window=walkInBirthWindow();
 assert.equal(validWalkInBirth(window.yesterday),true);assert.equal(validWalkInBirth(window.today),false);
 assert.equal(validWalkInBirth('2025-02-30'),false);assert.equal(validWalkInBirth(''),false);
 assert.equal(validWalkInBirth('1900-01-01'),false);
});
test('saved walk-in vaccine rows use application field names without certifying imported history',()=>{
 const result=savedWalkInRegistration({success:true,owner:{id:'owner'},pet:{id:'pet',vaccinationCardId:'SERVER-CARD'},appointment:{id:'visit',status:'Scheduled'},vaccs:[{id:'dose',pet_id:'pet',card_id:'SERVER-CARD',vaccine:'External rabies history',done:true,date:'2026-10-20',next_due:null}]});
 assert.equal(result.vacc[0].petId,'pet');assert.equal(result.vacc[0].cardId,'SERVER-CARD');assert.equal(result.vacc[0].vetId,'');assert.equal(result.vacc[0].nextDue,null);
 assert.equal(result.pet.vaccinationCardId,'SERVER-CARD');assert.equal(result.appointment.status,'Scheduled');
});
test('incomplete server response cannot produce fallback people, patients or cards',()=>{
 for(const data of [null,{}, {success:true,owner:{id:'owner'},pet:{id:'pet'}}]) assert.throws(()=>savedWalkInRegistration(data),/did not confirm/);
});
