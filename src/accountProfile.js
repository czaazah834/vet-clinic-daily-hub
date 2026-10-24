export const formatAccountAddress = address => [address.houseStreet, address.city,
  [address.state, address.zipCode].filter(Boolean).join(' '), address.country].filter(Boolean).join(', ');

/** Account data is keyed by user ID, including staff who have no owner record. */
export function accountProfile(db, me) {
  const owner = me.role === 'owner' ? (db.owners || []).find(o => o.userId === me.id || o.id === me.ownerId) : null;
  const profile = { ...me, ...owner, ...db.accountProfiles?.[me.id] };
  const address = typeof profile.address === 'object' && profile.address ? profile.address : {};
  return { ...profile, id: me.id, ...address, address: typeof profile.address === 'string' ? profile.address : formatAccountAddress(address), birthday: String(profile.birthday || '').slice(0, 10) };
}

export function saveAccountProfile(db, userId, profile) {
  return {
    ...db,
    accountProfiles: { ...db.accountProfiles, [userId]: { ...db.accountProfiles?.[userId], ...profile } },
    owners: (db.owners || []).map(o => profile.role === 'owner' && (o.userId === userId || o.id === profile.ownerId)
      ? { ...o, ...profile, id: o.id, userId, ...(typeof profile.address === 'object' ? { ...profile.address, address: formatAccountAddress(profile.address) } : {}) } : o),
  };
}
