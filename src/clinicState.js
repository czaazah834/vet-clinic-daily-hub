export const emptyClinicState = () => ({ users: [], owners: [], pets: [], appts: [], vacc: [], vaccs: [], records: [], consults: [], petRequests: [], vets: [], log: [] });

// An empty server result is authoritative. Never merge demo or previous-account data.
export function applyClinicState(previous, remote) {
  return {
    ...previous,
    owners: remote.owners || [], pets: remote.pets || [], appts: remote.appts || [],
    vacc: remote.vaccs || [], vaccs: remote.vaccs || [],
    records: remote.consults || [], consults: remote.consults || [],
    petRequests: remote.petRequests || [], vets: remote.vets || [], log: remote.log || [],
  };
}
