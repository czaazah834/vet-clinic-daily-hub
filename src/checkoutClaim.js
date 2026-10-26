const unconfirmed = () => new Error('The clinic server did not confirm an active checkout reservation. Retry checkout; your invoice entries are preserved.');
const text = value => typeof value === 'string' && !!value.trim();

export function confirmedCheckoutLease(response, now = Date.now()) {
  const leaseUntil = typeof response?.leaseUntil === 'string' ? Date.parse(response.leaseUntil) : NaN;
  if (response?.success !== true || !Number.isFinite(leaseUntil) || leaseUntil <= now) throw unconfirmed();
  return leaseUntil;
}

export function confirmedCheckoutClaim(response, now = Date.now()) {
  const leaseUntil = confirmedCheckoutLease(response, now);
  if (!text(response.claimToken) || !Array.isArray(response.invoiceItems) || !Array.isArray(response.prescriptionItems) || typeof response.prescription !== 'string'
    || response.invoiceItems.some(line => !line || !text(line.catalogId) || !text(line.name) || typeof line.price !== 'number' || !Number.isFinite(line.price) || line.price < 0 || !Number.isInteger(line.qty) || line.qty < 1)
    || response.prescriptionItems.some(line => !line || !text(line.catalogId) || !Number.isInteger(line.quantity) || line.quantity < 1)) throw unconfirmed();
  return {claimToken:response.claimToken, leaseUntil, invoiceItems:response.invoiceItems, prescriptionItems:response.prescriptionItems, prescription:response.prescription};
}
