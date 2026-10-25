import DigitalVetCard from '../DigitalVetCard.jsx';
import PetPortrait from '../PetPortrait.jsx';
import {useState,useEffect,useRef} from 'react';
import {scope} from '../../lib.jsx';
import {auth,OFFLINE_MSG} from '../../authApi.js';
import {toSquare,pick} from './ui.jsx';
export function OwnerVacc({db,setDb,me,go,say}){
 const pets=scope(db,me,'pets').filter(p=>!p.registrationStatus || p.registrationStatus==='Verified');
 const [selected,setSelected]=useState(()=>pick.petId || pets[0]?.id || '');
 const sel=pets.some(p=>p.id===selected)?selected:pets[0]?.id;
 const p=pets.find(p=>p.id===sel),fileInputRef=useRef(null);
 useEffect(()=>{pick.petId=null;},[]);
  const savePhoto = async photo => {
    try {
      const r = await auth.petPhoto(sel, photo);
      const updatedPet = r?.pet || { ...p, photo };
      setDb(d => ({
        ...d,
        pets: (d.pets || []).map(x => x.id === sel ? { ...x, ...updatedPet, photo } : x)
      }));
      say(photo ? "Picture saved to vaccination card" : "Picture removed");
    } catch (x) {
      console.warn("Photo save error:", x);
      say(x.offline ? OFFLINE_MSG : x.message || "We couldn’t save the picture. Please try again.");
    }
  };

  const handlePhotoFileChange = async e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      say("Only JPG, PNG or WEBP pictures are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      say("Picture is too big. The limit is 5 MB.");
      return;
    }
    try {
      const squareBase64 = await toSquare(file);
      await savePhoto(squareBase64);
    } catch (err) {
      say(err.message === "small" ? "Picture is too small. Use at least 64 × 64 pixels." : "Could not process picture.");
    }
  };


 if(!p)return <div className="empty"><h3>No registered pets yet</h3><p>Add your pet in My Pets to create their vaccination card.</p><button className="btn gold" onClick={()=>go('home')}>My Pets</button></div>;
 return <section aria-label={`${p.name}’s vaccination card`}>
  <div className="row" style={{flexWrap:'wrap',gap:12}}><label htmlFor="card-pet">Pet</label><select id="card-pet" value={sel} onChange={e=>setSelected(e.target.value)}>{pets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="btn ghost sm" onClick={()=>go('appts')}>Book a visit</button></div>
  <DigitalVetCard key={p.id} petId={p.id} portrait={<PetPortrait pet={p} inputRef={fileInputRef} onChange={handlePhotoFileChange} onRemove={()=>savePhoto('')}/>}/>
 </section>;
}
