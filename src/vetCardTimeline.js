export function eventTitle(event){
 if(event.kind==='reference')return `Previous-clinic reference · ${event.vaccine} · Unverified`;
 if(event.kind==='vaccination')return `Administered vaccine · ${event.vaccine}`;
 if(event.kind==='planned')return `Planned vaccine · ${event.vaccine} · Not administered`;
 if(event.kind==='registration')return 'Owner-entered registration weight · Not clinic measured';
 if(event.kind==='weight')return event.origin==='legacy_unknown'?'Historical weight · Source unknown':'Measured weight';
 if(event.kind==='temp')return event.origin==='legacy_unknown'?'Historical temperature · Source unknown':'Measured temperature';
 return 'Admission observation · Staff only';
}
export function filterCardEvents(events,filters){
 const q=filters.query.trim().toLowerCase();
 return events.filter(e=>(!filters.kind||e.kind===filters.kind) && (!filters.from||e.date>=filters.from) && (!filters.to||e.date<=filters.to) && (!q||[eventTitle(e),e.notes,e.brand,e.batch,e.staffName,e.vetName,e.visitId].join(' ').toLowerCase().includes(q)));
}
