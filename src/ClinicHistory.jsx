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
  useEffect(()=>{
    if(history && baseline.current) {
      const apptsChanged = (baseline.current.appts?.length !== db.appts?.length);
      const vaccChanged = (baseline.current.vacc?.length !== db.vacc?.length);
      const recordsChanged = (baseline.current.records?.length !== db.records?.length);
      const totalsChanged = JSON.stringify(baseline.current.totals) !== JSON.stringify(db.totals);
      if (apptsChanged || vaccChanged || recordsChanged || totalsChanged) {
        setStale(true);
      }
    }
  },[db.appts,db.vacc,db.records,db.totals,history]);
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
  const value={loading,error,stale,started:!!history,complete:!!history&&!history.page?.hasMore,hasMore:!history||history.page?.hasMore,load};
  const merged=mergeClinicHistory(db,history,me);
  return <Context.Provider value={value}>{children({...merged,historyComplete:value.complete})}</Context.Provider>;
}
export function HistoryControls({auto=false}) {
  const history=useContext(Context);
  useEffect(()=>{
    if(auto && history && !history.started && !history.loading) {
      history.load();
    }
  },[auto,history?.started,history?.loading]);

  useEffect(()=>{
    if(auto && history?.stale && !history.loading) {
      history.load(true);
    }
  },[auto,history?.stale,history?.loading]);

  if(!history)return null;

  if(history.error) {
    return (
      <div className="clinic-data-error" role="alert" style={{margin:'0 0 14px',padding:'10px 14px',borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span>{history.error}</span>
        <button className="btn sm ghost" onClick={()=>history.load(true)}>Retry loading history</button>
      </div>
    );
  }

  if(!auto && history.hasMore) {
    return (
      <div style={{margin:'0 0 12px'}}>
        <button className="btn sm ghost" disabled={history.loading} onClick={()=>history.load()}>
          {history.loading ? 'Loading older records…' : 'Load older history'}
        </button>
      </div>
    );
  }

  return null;
}
export function useHistoryComplete(){return useContext(Context)?.complete ?? true;}
