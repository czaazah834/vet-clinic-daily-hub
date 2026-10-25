const PREFIX = 'pawcare_soap_draft_v1:';
export const soapDraftKey = (userId, visitId, petId) => PREFIX + [userId, visitId, petId].map(encodeURIComponent).join(':');

export function readSoapDraft(storage, key, initialForm) {
  const raw = storage.getItem(key);
  if (!raw) return null;
  const draft = JSON.parse(raw);
  if(draft.form)for(const key of ['manufacturer','serialNumber','microchipNumber','microchipDate'])if(draft.form[key]===undefined && initialForm[key]!==undefined)draft.form[key]=initialForm[key];
  if (draft.version !== 1 || !Number.isFinite(draft.savedAt)
      || !draft.expectedVisit || !draft.consultationId || !draft.vaccinationId
      || !draft.form || !Object.entries(initialForm).every(([field, value]) => typeof draft.form[field] === typeof value)
      || !Array.isArray(draft.prescriptionItems) || !draft.prescriptionItems.every(p => p && typeof p.catalogId === 'string' && typeof p.name === 'string' && typeof p.price === 'number' && typeof p.instructions === 'string')
      || !Array.isArray(draft.performedServices) || !draft.performedServices.every(id => typeof id === 'string')) {
    throw new Error('This saved draft is unreadable.');
  }
  return draft;
}

export function writeSoapDraft(storage, key, draft, now = Date.now()) {
  storage.setItem(key, JSON.stringify({...draft, version:1, savedAt:now}));
}
