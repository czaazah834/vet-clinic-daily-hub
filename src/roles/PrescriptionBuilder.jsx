import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { calculateSupply, prescriptionText } from '../prescription.js';

export default function PrescriptionBuilder({items, onChange, notes, onNotes, error}) {
  const [catalog, setCatalog] = useState([]), [loadError, setLoadError] = useState(''), [attempt, retry] = useState(0);
  const [search, setSearch] = useState(''), [category, setCategory] = useState('');
  useEffect(() => {
    let active = true; setLoadError('');
    api.get('/api/services/prices').then(r => { if (active) setCatalog(r.catalog.filter(p => p.id.startsWith('product_') || p.requiresPrescription)); }).catch(e => { if (active) setLoadError(e.message); });
    return () => { active = false; };
  }, [attempt]);
  const update = (id, patch) => onChange(items.map(p => p.catalogId === id ? {...p, ...patch} : p));
  const selected = new Set(items.map(p => p.catalogId));
  const found = catalog.filter(p => (!category || p.category === category) && `${p.name} ${p.group || ''} ${p.need || ''}`.toLowerCase().includes(search.toLowerCase()));
  const preview = items.map(p => {
    try { const supply = p.dose ? calculateSupply(p.dose) : null; return {...p, quantity: supply?.quantity ?? p.quantity, instructions: supply?.directions ?? p.instructions}; }
    catch { return {...p, instructions:'Complete the supply calculation.'}; }
  });
  return <section className="rx-builder" aria-label="Product prescriptions">
    <h4>Prescription &amp; take-home products</h4>
    <p>Select the exact product, then enter your directions and supply. Selected products load into reception billing when you finalize the consultation.</p>
    <div className="rx-grid"><label>Find product<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label><label>Product category<select value={category} onChange={e => setCategory(e.target.value)}><option value="">All products</option>{[...new Set(catalog.map(p => p.category))].map(c => <option key={c}>{c}</option>)}</select></label></div>
    {loadError ? <p role="alert">{loadError} <button type="button" className="btn sm" onClick={() => retry(n => n + 1)}>Retry products</button></p> : !catalog.length ? <p role="status">Loading products…</p> : <div className="rx-catalog">{found.map(p => <button type="button" className="rx-product" key={p.id} disabled={selected.has(p.id) || items.length >= 30} onClick={() => onChange([...items, {catalogId:p.id,name:p.name,price:p.price,unit:p.unit || 'item / package',category:p.category,quantity:1,instructions:''}])}><span><b>{p.name}</b><small>{p.category}{p.group ? ` · ${p.group}` : ''}{p.requiresPrescription ? ' · Prescription required' : ''}</small></span><b>₱{p.price.toLocaleString()} {selected.has(p.id) ? '✓' : '+'}</b></button>)}{!found.length && <p>No products match.</p>}</div>}
    {items.map(p => {
      let supply, calculationError;
      try { if (p.dose) supply = calculateSupply(p.dose); } catch (e) { calculationError = e.message; }
      const quantity = supply?.quantity ?? p.quantity;
      return <fieldset className="rx-line" key={p.catalogId}><legend>{p.name}</legend><p>₱{p.price.toLocaleString()} per item/package · Confirm the actual product form, strength and package size.</p>
        <label><input type="checkbox" checked={!!p.dose} onChange={e => update(p.catalogId, {dose:e.target.checked ? {amount:'',unit:'tablet',route:'by mouth',timesPerDay:'',days:'',unitsPerItem:''} : null, quantity:supply?.quantity || p.quantity, instructions:supply?.directions || p.instructions})} /> Calculate supply from my dosing instructions</label>
        {p.dose ? <><p>Enter the same unit for the dose and package contents. The calculator does not convert mg to tablets or mL.</p><div className="rx-grid">
          <label>Dose per administration<input type="number" min="0.0001" step="any" value={p.dose.amount} onChange={e => update(p.catalogId, {dose:{...p.dose,amount:e.target.value === '' ? '' : Number(e.target.value)}})} /></label>
          <label>Dose unit<select value={p.dose.unit} onChange={e => update(p.catalogId, {dose:{...p.dose,unit:e.target.value}})}>{['tablet','capsule','mL','g','drop'].map(u => <option key={u}>{u}</option>)}</select></label>
          <label>Route<select value={p.dose.route} onChange={e => update(p.catalogId, {dose:{...p.dose,route:e.target.value}})}>{['by mouth','on skin','in ear','in eye'].map(u => <option key={u}>{u}</option>)}</select></label>
          <label>Doses per day<input type="number" min="1" max="24" step="1" value={p.dose.timesPerDay} onChange={e => update(p.catalogId, {dose:{...p.dose,timesPerDay:e.target.value === '' ? '' : Number(e.target.value)}})} /></label>
          <label>Days of treatment<input type="number" min="1" max="365" step="1" value={p.dose.days} onChange={e => update(p.catalogId, {dose:{...p.dose,days:e.target.value === '' ? '' : Number(e.target.value)}})} /></label>
          <label>{p.dose.unit} per billed item/package<input type="number" min="0.0001" step="any" value={p.dose.unitsPerItem} onChange={e => update(p.catalogId, {dose:{...p.dose,unitsPerItem:e.target.value === '' ? '' : Number(e.target.value)}})} /></label>
        </div>{calculationError ? <p className="err" role="status">{calculationError}</p> : <p><b>{supply.directions}</b><br />Course supply: {supply.totalUnits} {p.dose.unit}. Bill {supply.quantity} item(s)/package(s), rounded up.</p>}</> : <div className="rx-grid"><label>Directions / clinical instructions<textarea maxLength={1000} value={p.instructions} onChange={e => update(p.catalogId,{instructions:e.target.value})} /></label><label>Items / packages to dispense<input type="number" min="1" max="1000" step="1" value={p.quantity} onChange={e => update(p.catalogId,{quantity:e.target.value === '' ? '' : Number(e.target.value)})} /></label></div>}
        <div className="row end"><b>Product total: ₱{(Number(quantity || 0) * p.price).toLocaleString()}</b><button className="btn sm ghost" type="button" onClick={() => onChange(items.filter(x => x.catalogId !== p.catalogId))}>Remove {p.name}</button></div>
      </fieldset>;
    })}
    <label>External prescriptions / additional home-care instructions<textarea rows={3} maxLength={3000} value={notes} onChange={e => onNotes(e.target.value)} /></label>
    <p>External prescriptions are recorded for the owner; only selected catalog products are added to clinic billing.</p>
    {!!items.length && <div className="rx-preview"><b>Prescription preview</b><p style={{whiteSpace:'pre-wrap'}}>{prescriptionText(preview, notes)}</p></div>}
    {error && <p className="err" role="alert">{error}</p>}
  </section>;
}
