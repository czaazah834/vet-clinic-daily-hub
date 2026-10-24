import {createContext,useContext,useEffect,useRef,useState} from 'react';
import {clinicRequest} from './clinicApi.js';
const Context=createContext(null);
const combine=(older=[],current=[])=>[...new Map([...older,...current].map(row=>[row.id,row])).values()];
export function mergeClinicHistory(db,history,me) {
  if(!history)return db;
  const patients=new Set(db.pets.map(p=>p.id));
  const permitted=row=>patients.has(row.petId);
  const assigned=row=>me?.role!=='vet'||[me.id,me.vetId].filter(Boolean).includes(row.vetId);
  const appts=combine((history.appts||[]).filter(row=>permitted(row)&&assigned(row)),db.appts),vacc=combine((history.vaccs||[]).filter(permitted),db.vacc),records=combine((history.consults||[]).filter(permitted),db.records);
  const pets=db.pets.map(p=>({...p,weights:combine(history.weights?.[p.id],p.weights).sort((a,b)=>a.date.localeCompare(b.date))}));
  return {...db,appts,vacc,vaccs:vacc,records,consults:records,pets};
}
export function ClinicHistory({db,me,children}) {
  const [history,setHistory]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [stale,setStale]=useState(false);
  const pending=useRef(null),mounted=useRef(true),baseline=useRef(null);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;pending.current?.abort();};},[]);
  useEffect(()=>{if(history && baseline.current && (baseline.current.appts!==db.appts || baseline.current.vacc!==db.vacc || baseline.current.records!==db.records || JSON.stringify(baseline.current.totals)!==JSON.stringify(db.totals)))setStale(true);},[db.appts,db.vacc,db.records,db.totals,history]);
  const load=async(reset=false)=>{
    if(pending.current)return;
    const controller=new AbortController();pending.current=controller;setLoading(true);setError('');
    const timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const path='/api/state/history'+(!reset && history?.page?.cursor?'?'+new URLSearchParams({cursor:history.page.cursor}):'');
      const result=await clinicRequest('GET',path,undefined,{signal:controller.signal});
      if(!mounted.current || controller.signal.aborted)return;
      setHistory(previous=>{
        if(reset || !previous)return result;
        const weights={...previous.weights};
        for(const [pet,rows] of Object.entries(result.weights||{}))weights[pet]=combine(weights[pet],rows);
        return {...result,appts:combine(previous.appts,result.appts),vaccs:combine(previous.vaccs,result.vaccs),consults:combine(previous.consults,result.consults),weights};
      });
      baseline.current=db;setStale(false);
    }catch(err){if(mounted.current)setError(controller.signal.aborted?'History loading timed out. Please retry.':err.message);}
    finally{clearTimeout(timeout);pending.current=null;if(mounted.current)setLoading(false);}
  };
  const value={loading,error,stale,started:!!history,complete:!!history&&!history.page.hasMore&&!stale,hasMore:!history||history.page.hasMore,load};
  const merged=mergeClinicHistory(db,history,me);
  return <Context.Provider value={value}>{children({...merged,historyComplete:value.complete})}</Context.Provider>;
}
export function HistoryControls({auto=false}) {
  const history=useContext(Context);
  useEffect(()=>{if(auto && history && !history.started && !history.loading)history.load();},[auto,history?.started]);
  if(!history)return null;
  return <section className="card history-controls" aria-label="Saved history loading" style={{padding:12,marginBottom:12}}>
    <p role="status">{history.complete?'All saved history is loaded.':'Current care is shown. Searches and lists cover loaded records; load more to include older history.'}</p>
    {history.stale && <p role="status">Clinic records changed. Refresh saved history before using historical totals or reports.</p>}
    {history.error && <p className="err" role="alert">{history.error}</p>}
    {(history.hasMore || history.error || history.stale) && <button className="btn sm ghost" disabled={history.loading} onClick={()=>history.load(history.stale)}>{history.loading?'Loading history…':history.error?'Retry loading history':history.stale?'Refresh saved history':history.started?'Load more saved history':'Load saved history'}</button>}
    {history.started && !history.stale && <button className="btn sm ghost" disabled={history.loading} onClick={()=>history.load(true)}>Refresh history</button>}
  </section>;
}
export function useHistoryComplete(){return useContext(Context)?.complete ?? true;}
