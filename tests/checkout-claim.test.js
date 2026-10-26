import {test} from 'node:test';
import assert from 'node:assert/strict';
import {confirmedCheckoutClaim, confirmedCheckoutLease} from '../src/checkoutClaim.js';
const now=Date.parse('2026-10-26T01:00:00Z');
const claim=()=>({success:true,claimToken:'opaque token',leaseUntil:new Date(now+300000).toISOString(),invoiceItems:[{catalogId:'consult',name:'Consultation',price:500,qty:1,source:'performed'},{catalogId:'medicine',name:'Medicine used',price:20,qty:2,source:'admission'}],prescriptionItems:[{catalogId:'medicine',quantity:2}],prescription:'Saved vet instructions'});

test('confirms the server lease and retains the exact opaque token, invoice and prescription',()=>{
 const response=claim(),saved=confirmedCheckoutClaim(response,now);
 assert.equal(saved.claimToken,response.claimToken);
 assert.equal(saved.leaseUntil,now+300000);
 assert.equal(saved.invoiceItems,response.invoiceItems);
 assert.equal(saved.prescriptionItems,response.prescriptionItems);
 assert.equal(saved.prescription,response.prescription);
 assert.equal(confirmedCheckoutLease({success:true,leaseUntil:response.leaseUntil},now),now+300000);
 assert.deepEqual(confirmedCheckoutClaim({...response,invoiceItems:[],prescriptionItems:[],prescription:''},now).invoiceItems,[]);
});

test('missing, unsuccessful, invalid and already expired acknowledgements cannot enable checkout',()=>{
 for(const response of [null,{},[],{...claim(),success:undefined},{...claim(),success:false},{...claim(),leaseUntil:undefined},{...claim(),leaseUntil:now+300000},{...claim(),leaseUntil:'not a date'},{...claim(),leaseUntil:new Date(now).toISOString()},{...claim(),leaseUntil:new Date(now-1).toISOString()}]) {
  assert.throws(()=>confirmedCheckoutClaim(response,now),/did not confirm an active checkout/);
  assert.throws(()=>confirmedCheckoutLease(response,now),/did not confirm an active checkout/);
 }
 for(const patch of [{claimToken:undefined},{claimToken:''},{claimToken:' '},{claimToken:123},{invoiceItems:undefined},{invoiceItems:{}},{prescriptionItems:undefined},{prescriptionItems:{}},{prescription:null}]) assert.throws(()=>confirmedCheckoutClaim({...claim(),...patch},now),/did not confirm/);
});

test('incomplete or unusable invoice/prescription rows cannot replace the invoice draft',()=>{
 for(const row of [null,{}, {catalogId:'consult',name:'Consultation',price:'500',qty:1},{catalogId:'consult',name:'Consultation',price:NaN,qty:1},{catalogId:'consult',name:'Consultation',price:Infinity,qty:1},{catalogId:'consult',name:'Consultation',price:-1,qty:1},{catalogId:'consult',name:'Consultation',price:500,qty:0},{catalogId:'consult',name:'Consultation',price:500,qty:1.2},{catalogId:'consult',name:'Consultation',price:500,qty:'1'},{catalogId:'',name:'Consultation',price:500,qty:1}]) assert.throws(()=>confirmedCheckoutClaim({...claim(),invoiceItems:[row]},now),/did not confirm/);
 for(const row of [null,{}, {catalogId:'',quantity:1},{catalogId:'medicine',quantity:'1'},{catalogId:'medicine',quantity:0},{catalogId:'medicine',quantity:1.5}]) assert.throws(()=>confirmedCheckoutClaim({...claim(),prescriptionItems:[row]},now),/did not confirm/);
});
