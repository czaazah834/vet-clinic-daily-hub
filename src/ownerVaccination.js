import { currentVaccinationDue, vaccineFamily } from './vaccinationDue.js';
import { today, lastDay } from './booking.js';

export { currentVaccinationDue };

export function vaccinationStatus(record, current, date = today()) {
  if (!record.done) return 'Vet review needed';
  if (!current.some(v => v.id === record.id)) return 'Completed';
  if (record.nextDue < date) return 'Overdue';
  const soon = new Date(`${date}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 14);
  return record.nextDue <= soon.toISOString().slice(0, 10) ? 'Due soon' : 'On track';
}

// A same-day visit for another service is not a vaccination reservation.
// Match only an active visit that explicitly names this vaccine family.
export function vaccinationAppointment(record, appointments, date = today()) {
  return appointments.filter(a => a.petId === record.petId && a.date >= date &&
    ['Scheduled', 'Confirmed', 'Checked-in', 'In consultation'].includes(a.status) &&
    (!a.service || ['vaccination', 'deworming'].includes(a.service)) &&
    vaccineFamily((a.reason || '').replace(/^(vaccination|deworming)\s*[–:-]\s*/i, '')) === vaccineFamily(record.vaccine))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0] || null;
}

export function vaccinationBooking(record, date = today(), last = lastDay()) {
  const target = record.nextDue || date;
  return {
    petId: record.petId,
    service: /deworm/i.test(record.vaccine) ? 'deworming' : 'vaccination',
    reason: record.vaccine || 'Vaccination',
    date: target > last ? '' : target < date ? date : target,
    vaccineDueDate: record.nextDue || '',
    fromVaccineCard: true,
    vaccineName: record.vaccine
  };
}
