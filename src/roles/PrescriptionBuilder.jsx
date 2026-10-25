import { numberError } from '../formValidation.js';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { editablePrescription, prescriptionText } from '../prescription.js';

export default function PrescriptionBuilder({items, onChange, notes, onNotes, error}) {
  const [catalog, setCatalog] = useState([]), [loadError, setLoadError] = useState(''), [attempt, retry] = useState(0);
  const [search, setSearch] = useState(''), [category, setCategory] = useState('');
  useEffect(() => {
    let active = true; setLoadError('');
    api.get('/api/services/prices').then(r => { if (active) setCatalog(r.catalog.filter(p => p.id.startsWith('product_') || p.requiresPrescription)); }).catch(e => { if (active) setLoadError(e.message); });
    return () => { active = false; };
  }, [attempt]);
  const update = (id, patch) => onChange(items.map(p => p.catalogId === id ? {...editablePrescription(p), ...patch} : p));
  const selected = new Set(items.map(p => p.catalogId));
  const found = catalog.filter(p => (!category || p.category === category) && `${p.name} ${p.group || ''} ${p.need || ''}`.toLowerCase().includes(search.toLowerCase()));
  const preview = items.map(editablePrescription);
  return <section className="rx-builder" aria-label="Product prescriptions">
    <h4>Prescription &amp; take-home products</h4>
    <p>Select the exact product, then enter directions and quantity. Selected products load into reception billing when you finalize the consultation.</p>
    <div className="rx-grid"><label>Find product<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label><label>Product category<select value={category} onChange={e => setCategory(e.target.value)}><option value="">All products</option>{[...new Set(catalog.map(p => p.category))].map(c => <option key={c}>{c}</option>)}</select></label></div>
    {loadError ? <p role="alert">{loadError} <button type="button" className="btn sm" onClick={() => retry(n => n + 1)}>Retry products</button></p> : !catalog.length ? <p role="status">Loading products…</p> : <div className="rx-catalog">{found.map(p => <button type="button" className="rx-product" key={p.id} disabled={selected.has(p.id) || items.length >= 30} onClick={() => onChange([...items, {catalogId:p.id,name:p.name,price:p.price,unit:p.unit || 'item / package',category:p.category,quantity:1,instructions:''}])}><span><b>{p.name}</b><small>{p.category}{p.group ? ` · ${p.group}` : ''}{p.requiresPrescription ? ' · Prescription required' : ''}</small></span><b>₱{p.price.toLocaleString()} {selected.has(p.id) ? '✓' : '+'}</b></button>)}{!found.length && <p>No products match.</p>}</div>}
    {preview.map(p => {
      const quantityError=numberError(p.quantity,'Quantity',1,1000,{integer:true});
      return <fieldset className="rx-line" key={p.catalogId}><legend>{p.name}</legend><p>₱{p.price.toLocaleString()} each · {p.unit || 'item / package'}</p>
        <div className="rx-grid">
          <label>Directions / clinical instructions *
            <textarea
              maxLength={1000}
              value={p.instructions}
              placeholder="e.g. Give 1 tablet twice daily with meals for 7 days"
              className={!p.instructions?.trim() ? "bad" : "ok"}
              onChange={e => update(p.catalogId,{instructions:e.target.value})}
            />
            {!p.instructions?.trim() && <span className="err" style={{fontSize:11.5,marginTop:2,display:'block'}}>Directions / administration instructions are required.</span>}
          </label>
          <label>Quantity *
            <input
              type="number"
              min="1"
              max="1000"
              step="1"
              value={p.quantity}
              aria-invalid={!!quantityError} aria-describedby={`rx-${p.catalogId}-qty-error`} className={quantityError ? "bad" : "ok"}
              onChange={e => update(p.catalogId,{quantity:e.target.value === '' ? '' : Number(e.target.value)})}
            />
            {quantityError && <span id={`rx-${p.catalogId}-qty-error`} className="err" aria-live="polite" style={{fontSize:11.5,marginTop:2,display:'block'}}>{quantityError}</span>}
          </label>
        </div>
        <div className="row end"><b>Product total: ₱{(Number(p.quantity || 0) * p.price).toLocaleString()}</b><button className="btn sm ghost" type="button" aria-label={`Remove ${p.name}`} onClick={() => onChange(items.filter(x => x.catalogId !== p.catalogId))}>Remove</button></div>
      </fieldset>;
    })}
    <label>External prescriptions / additional home-care instructions<textarea rows={3} maxLength={3000} value={notes} onChange={e => onNotes(e.target.value)} /></label>
    <p>External prescriptions are recorded for the owner; only selected catalog products are added to clinic billing.</p>
    {!!items.length && <div className="rx-preview"><b>Prescription preview</b><p style={{whiteSpace:'pre-wrap'}}>{prescriptionText(preview, notes)}</p></div>}
    {error && <p className="err" role="alert">{error}</p>}
  </section>;
}
