import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerBill } from '../src/ownerBilling.js';
const visit={id:'visit1',status:'Scheduled',billingStatus:'Unpaid',amount:600,invoiceItems:[]};
const lines=[{name:'Consultation',price:500,qty:1},{name:'Prescribed product',price:125.35,qty:2}];

test('booking defaults and unfinished checkout are never presented as actual debt',()=>{
 assert.equal(ownerBill(visit).amount,null);assert.equal(ownerBill(visit).status,'No bill yet');
 assert.equal(ownerBill({...visit,status:'Cancelled'}).amount,null);
 const finished=ownerBill({...visit,status:'Completed'});
 assert.equal(finished.status,'Awaiting checkout');assert.equal(finished.amount,null);
});
test('draft charges use saved lines and discount in cents, independent of booking amount',()=>{
 const draft=ownerBill({...visit,status:'Completed',invoiceItems:lines,discount:25.7});
 assert.equal(draft.subtotal,750.7);assert.equal(draft.amount,725);assert.equal(draft.discount,25.7);assert.equal(draft.paid,false);
 assert.equal(draft.status,'Awaiting checkout');
 const small=ownerBill({...visit,invoiceItems:[{name:'Historical small amount',price:0.1,qty:3}],discount:0.2});
 assert.equal(small.amount,0.1);
});
test('paid history preserves the recorded amount and old custom lines without current catalog pricing',()=>{
 const source={...visit,billingStatus:'Paid',amount:725,discount:25.7,invoiceItems:lines};
 const before=structuredClone(source);const bill=ownerBill(source);
 assert.equal(bill.amount,725);assert.deepEqual(bill.items,lines);assert.equal(bill.mismatch,false);assert.deepEqual(source,before);
 const legacy=ownerBill({...source,amount:450,invoiceItems:[{name:'Historical custom charge',price:450,qty:1}],discount:0});
 assert.equal(legacy.amount,450);assert.equal(legacy.items[0].price,450);
});
test('legacy payments without itemization retain paid amount and do not invent a breakdown',()=>{
 const bill=ownerBill({...visit,billingStatus:'Paid',amount:450});
 assert.equal(bill.amount,450);assert.equal(bill.subtotal,null);assert.deepEqual(bill.items,[]);assert.equal(bill.mismatch,false);
});
test('invalid data never turns into a fabricated total, while a saved payment remains authoritative',()=>{
 for(const invoiceItems of [[{name:'Bad',price:NaN,qty:1}],[{name:'Bad',price:10,qty:-1}],[{name:'Bad',price:0.001,qty:1}],[{name:'Too large',price:10000000,qty:Number.MAX_SAFE_INTEGER}]]){
  assert.equal(ownerBill({...visit,invoiceItems}).amount,null);
  assert.equal(ownerBill({...visit,invoiceItems,billingStatus:'Paid',amount:50}).amount,50);
 }
 for(const amount of [null,undefined,NaN,-1,'600'])assert.equal(ownerBill({...visit,billingStatus:'Paid',amount}).amount,null);
 assert.equal(ownerBill({...visit,invoiceItems:lines,discount:9999}).amount,null);
});
test('inconsistent historical itemization is flagged without replacing the recorded payment',()=>{
 const bill=ownerBill({...visit,billingStatus:'Paid',amount:700,invoiceItems:lines});
 assert.equal(bill.amount,700);assert.equal(bill.subtotal,750.7);assert.equal(bill.mismatch,true);
});
