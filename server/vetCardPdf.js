import PDFDocument from 'pdfkit';
import {fileURLToPath} from 'node:url';
export async function vetCardPdf(document){
 const {snapshot,reference,revision,issuedAt,refreshedAt}=document;
 const pdf=new PDFDocument({size:'A4',margin:45,bufferPages:true,info:{Title:`Digital Vet Card - ${snapshot.pet.name}`,Author:snapshot.clinic.name,Subject:`${reference} revision ${revision}`,CreationDate:new Date(refreshedAt)}});
 const chunks=[];
 const finished=new Promise((resolve,reject)=>{pdf.on('data',chunk=>chunks.push(chunk));pdf.on('end',()=>resolve(Buffer.concat(chunks)));pdf.on('error',reject);});
 pdf.font(fileURLToPath(new URL('./assets/DejaVuSans.ttf',import.meta.url))).fontSize(10);
 const heading=text=>{if(pdf.y>700)pdf.addPage();pdf.moveDown().fontSize(13).fillColor('#183153').text(text).fontSize(10).fillColor('#111827').moveDown(.3);};
 const line=(label,value)=>pdf.text(`${label}: ${value || 'Not recorded'}`,{lineGap:3});
 const clinic=snapshot.clinic,pet=snapshot.pet;
 pdf.fontSize(20).fillColor('#183153').text('Digital Vet Card').fontSize(11).text('Official clinic document').fillColor('#111827').moveDown();
 line('Clinic',clinic.name);line('Address',clinic.address);line('Contact',`${clinic.phone} | ${clinic.email}`);line('Clinic registration',clinic.registration);
 line('Document reference',`${reference} / revision ${revision}`);line('Original issue date',issuedAt);line('Last refreshed',refreshedAt);
 heading('Patient identification');
 for(const [label,key] of [['Patient name','name'],['Patient ID','id'],['Internal card reference','internalReference'],['Species','species'],['Breed','breed'],['Sex','sex'],['Birth date','birth'],['Coat / markings','color'],['Spayed / neutered','neutered'],['Registered owner','ownerName']])line(label,pet[key]);
 line('Recorded allergies',pet.allergies?.length?pet.allergies.join(', '):'None recorded');
 heading('Publication coverage');
 pdf.text('Includes the complete saved history of completed, paid visits at this revision. Unlinked historical records retain their provenance; their visit/payment status is unknown. Plans are not proof of administration. Registration weights are owner reports. Private admission observations are excluded. Payment does not confirm release.');
 heading('Vaccination and vitals timeline');
 line('Total history entries',String(snapshot.events.length));
 for(const event of snapshot.events){
  const visit=snapshot.visits.find(v=>v.id===event.visitId);
  const title=event.kind==='reference'?`UNVERIFIED previous-clinic reference: ${event.vaccine}`:event.kind==='vaccination'?`Administered vaccine: ${event.vaccine}`:event.kind==='planned'?`PLANNED vaccine - NOT ADMINISTERED: ${event.vaccine}`:event.kind==='registration'?'Owner-entered registration weight - NOT clinic measured':event.kind==='weight'?(event.origin==='legacy_unknown'?'Historical weight - source unknown':'Measured weight'):event.kind==='temp'?(event.origin==='legacy_unknown'?'Historical temperature - source unknown':'Measured temperature'):'Historical observation';
  heading(`${event.date || 'Date not recorded'} | ${title}`);
  line('Entry reference',event.id);
  if(['vaccination','planned','reference'].includes(event.kind)){
   line('Brand / batch',`${event.brand || 'Not recorded'} / ${event.batch || 'Not recorded'}`);
   line(event.kind==='reference'?'Reference entered date (dose date unknown)':event.administered?'Administered date':'Plan recorded date',event.date);
   line('Dose',event.doseNo?`${event.doseNo}${event.doseOf?` of ${event.doseOf}`:''}`:'Not recorded');
   line('Recording veterinarian',event.kind==='reference'?'Unverified external report; no clinic certification':event.vetName);line('Recorded by',event.recordedBy);line('Next due / planned',event.nextDue);line('Provenance',event.provenance);
  }else{
   if(event.value!=null)line('Value',`${event.value} ${event.unit || ''}`);
   line('Measured at',event.measuredAt || (event.kind==='registration'?'Owner report; not measured in clinic':'Historical time not recorded'));
   line('Recording staff',`${event.staffName || 'Not recorded'}${event.staffRole?` (${event.staffRole})`:''}`);
   if(event.correctsId)line('Corrects entry',`${event.correctsId} - ${event.correctionReason}`);
   if(event.supersededBy)line('Corrected by',`${event.supersededBy} (original retained)`);
   line('Source',event.origin || event.source);
  }
  if(event.notes)line('Notes',event.notes);
  line('Visit',visit?`${visit.id} | ${visit.date} | ${visit.status} | ${visit.billingStatus}`:event.visitId || 'Historical visit link not recorded');
 }
 heading('Visit details and recording veterinarians');
 for(const visit of snapshot.visits){
  heading(`${visit.date} | ${visit.id}`);line('Requested visit',visit.reason);line('Recording veterinarian',`${visit.vetName} (${visit.vetId})`);line('Status',`${visit.status} | ${visit.billingStatus}`);
  line('Payment saved at',visit.billingStatus==='Paid'?(visit.paidAt || 'Historical payment time not recorded'):'Not recorded');
  if(visit.admissionStatus)line('Admission status',`${visit.admissionStatus} - payment does not confirm release`);
  for(const consultation of visit.consultations || (visit.consultation?[visit.consultation]:[])){
   line('Consultation veterinarian',`${consultation.vetName || visit.vetName} (${consultation.vetId || visit.vetId})`);
   for(const [label,key] of [['Consultation ID','id'],['Subjective','symptoms'],['Objective','objective'],['Assessment','diagnosis'],['Plan','treatment'],['Prescription','prescription'],['Care status','careStatus'],['Follow-up date','followUpDate'],['Follow-up instructions','followUpReason']])line(label,consultation[key]);
  }
 }
 const pages=pdf.bufferedPageRange();
 for(let i=0;i<pages.count;i++){
  pdf.switchToPage(i);const bottom=pdf.page.margins.bottom;pdf.page.margins.bottom=0;
  pdf.fontSize(8).fillColor('#475569').text(`${reference} · r${revision} · Page ${i+1} of ${pages.count}`,45,pdf.page.height-28,{lineBreak:false});pdf.page.margins.bottom=bottom;
 }
 pdf.end();return finished;
}
