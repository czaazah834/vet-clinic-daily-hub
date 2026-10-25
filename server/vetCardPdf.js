import PDFDocument from 'pdfkit';
import {fileURLToPath} from 'node:url';
export async function vetCardPdf(document){
 const {snapshot}=document,pet=snapshot.pet,owner=snapshot.owner;
 const pdf=new PDFDocument({size:'A4',margin:45,bufferPages:true,info:{Title:`Vaccination Card - ${pet.name}`}});
 const chunks=[];
 const finished=new Promise((resolve,reject)=>{pdf.on('data',chunk=>chunks.push(chunk));pdf.on('end',()=>resolve(Buffer.concat(chunks)));pdf.on('error',reject);});
 pdf.font(fileURLToPath(new URL('./assets/DejaVuSans.ttf',import.meta.url))).fontSize(10);
 const heading=text=>{if(pdf.y>650)pdf.addPage();pdf.moveDown().fontSize(13).fillColor('#183153').text(text).fontSize(10).fillColor('#111827').moveDown(.3);};
 const line=(label,value)=>pdf.text(`${label}: ${value || 'Not recorded'}`,{lineGap:3});
 pdf.fontSize(20).fillColor('#183153').text('Veterinary Vaccination Card').fontSize(10).fillColor('#111827');
 heading('Pet information');
 for(const [label,value] of [['Name of pet',pet.name],['Species',pet.speciesOther || pet.species],['Breed',pet.breed],['Date of birth',pet.birth],['Sex',pet.sex],['Spayed / neutered',pet.neutered],['Color / distinguishing features',pet.color]])line(label,value);
 if(pet.microchipNumber){line('Microchip number',pet.microchipNumber);line('Implantation / scan date',pet.microchipDate);}
 heading('Owner information');
 for(const [label,key] of [['Full name','name'],['Home address','address'],['Contact number','phone'],['Email address','email']])line(label,owner[key]);
 for(const [kind,title] of [['vaccination','Vaccinations'],['deworming','Deworming history'],['weight','Weight per visit']]){
  heading(title);
  const events=snapshot.events.filter(e=>e.kind===kind);
  if(!events.length)pdf.text('None recorded.');
  for(const event of events){
   if(kind==='weight'){line(event.date,`${event.value} kg`);continue;}
   heading(`${event.date || 'Date not recorded'} | ${event.vaccine}`);
   line(kind==='deworming'?'Medication / brand':'Vaccine brand',event.brand);
   line('Date administered',event.date);line('Next due',event.nextDue);
   if(kind==='vaccination'){line('Manufacturer',event.manufacturer);line('Lot / batch number',event.batch);line('Serial number',event.serialNumber);}
   line('Veterinarian',event.vetName);
   pdf.moveDown(.7).text('Veterinarian signature: ______________________________').moveDown(.5);
  }
 }
 const pages=pdf.bufferedPageRange();
 for(let i=0;i<pages.count;i++){
  pdf.switchToPage(i);const bottom=pdf.page.margins.bottom;pdf.page.margins.bottom=0;
  pdf.fontSize(8).fillColor('#475569').text(`${pet.name} · Page ${i+1} of ${pages.count}`,45,pdf.page.height-28,{lineBreak:false});pdf.page.margins.bottom=bottom;
 }
 pdf.end();return finished;
}
