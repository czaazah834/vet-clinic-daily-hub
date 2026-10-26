import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { confirmedCheckoutClaim, confirmedCheckoutLease } from './checkoutClaim.js';

const expired = 'Your checkout reservation expired. Retry checkout before recording payment. Your invoice entries are preserved.';
const empty = {ready:false, checking:false, error:'', claimToken:null};

export function useCheckoutClaim(appointmentId, paid, enabled = true) {
  const current = useRef(null), latest = useRef(null);
  const [state,setState] = useState(empty);
  latest.current = {appointmentId,paid,enabled};
  useEffect(() => {
    if (paid || !enabled) { current.current = null; setState(empty); return; }
    const session = {appointmentId, active:true, token:null, leaseUntil:0, ready:false, inFlight:false, expiryTimer:null};
    current.current = session;
    setState({...empty,session});
    const path = `/api/checkout-inbox/${encodeURIComponent(appointmentId)}`;
    const update = value => {
      if (session.active) setState(previous => ({...previous,...value,session}));
    };
    const release = claimToken => api.post(`${path}/release`, {claimToken}).catch(() => {});
    const expire = () => {
      if (session.ready && session.leaseUntil <= Date.now()) {
        session.ready = false;
        update({ready:false,error:expired});
      }
    };
    session.isActive = () => {
      expire();
      return session.ready && !!session.token && session.leaseUntil > Date.now();
    };
    const confirm = leaseUntil => {
      session.leaseUntil = leaseUntil;
      session.ready = true;
      clearTimeout(session.expiryTimer);
      // Recheck the clock when the timer runs, including after a suspended tab.
      const schedule = () => {
        expire();
        if (session.active && session.ready) session.expiryTimer = setTimeout(schedule, Math.min(leaseUntil - Date.now(), 2147483647));
      };
      session.expiryTimer = setTimeout(schedule, Math.min(leaseUntil - Date.now(), 2147483647));
      update({ready:true,error:'',claimToken:session.token});
    };
    const acquire = async () => {
      const response = await api.post(`${path}/claim`, {});
      const returnedToken = typeof response?.claimToken === 'string' && response.claimToken.trim() ? response.claimToken : null;
      if (!session.active) { if (returnedToken) await release(returnedToken); return; }
      let claim;
      try { claim = confirmedCheckoutClaim(response); }
      catch (error) {
        // A committed but unusable response must not occupy the checkout.
        if (returnedToken) await release(returnedToken);
        throw error;
      }
      session.token = claim.claimToken;
      update({invoiceItems:claim.invoiceItems,prescriptionItems:claim.prescriptionItems,prescription:claim.prescription});
      confirm(claim.leaseUntil);
    };
    const run = async (retry = false) => {
      if (!session.active || session.inFlight || latest.current.paid || (!retry && !session.token)) return;
      session.inFlight = true;
      expire();
      if (retry) { session.ready = false; update({ready:false,error:''}); }
      update({checking:true});
      try {
        if (!session.token) await acquire();
        else {
          try {
            const response = await api.post(`${path}/renew`, {claimToken:session.token});
            if (session.active) confirm(confirmedCheckoutLease(response));
          } catch (error) {
            if (error.status !== 409) throw error;
            session.token = null;
            session.ready = false;
            update({ready:false,claimToken:null});
            if (retry && session.active) await acquire();
            else throw error;
          }
        }
      } catch (error) {
        session.ready = false;
        update({ready:false,error:error.message});
      } finally {
        session.inFlight = false;
        update({checking:false});
      }
    };
    session.retry = () => run(true);
    run(true);
    const timer = setInterval(() => run(),60000);
    const onFocus = () => { expire(); run(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') onFocus(); };
    window.addEventListener('focus',onFocus);
    document.addEventListener('visibilitychange',onVisibility);
    return () => {
      session.active = false;
      clearInterval(timer);
      clearTimeout(session.expiryTimer);
      window.removeEventListener('focus',onFocus);
      document.removeEventListener('visibilitychange',onVisibility);
      // Mutation responses finish so a late successful claim can be released.
      const saved = latest.current;
      if (session.token && !(saved.appointmentId === appointmentId && saved.paid)) release(session.token);
    };
  },[appointmentId,paid,enabled]);
  const session = current.current;
  const matches = session?.active && session.appointmentId === appointmentId && enabled && !paid && state.session === session;
  return {
    ...(matches ? state : empty),
    isActive:() => !!(matches && session.active && current.current === session && latest.current.appointmentId === appointmentId && latest.current.enabled && !latest.current.paid && session.isActive()),
    retry:() => { if (matches) return session.retry(); }
  };
}
