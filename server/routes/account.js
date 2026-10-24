import express from 'express';
import { query, withTransaction } from '../db.js';
import { requireAuth } from './auth.js';
import { hashPassword, verifyPassword, validatePasswordComplexity, sha256 } from '../security.js';

export const accountRouter = express.Router();
accountRouter.use(requireAuth);

// Existing databases gain photo storage on first use; fresh databases include it in schema.sql.
let photoStorage;
function ensurePhotoStorage() {
  if (!photoStorage) photoStorage = query(`CREATE TABLE IF NOT EXISTS account_photos (
    user_id VARCHAR(50) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    photo TEXT NOT NULL DEFAULT ''
  )`).catch(error => { photoStorage = undefined; throw error; });
  return photoStorage;
}

accountRouter.get('/profile', async (req, res) => {
  try {
    await ensurePhotoStorage();
    const result = await query('SELECT photo FROM account_photos WHERE user_id = $1', [req.user.id]);
    res.json({ profile: { ...req.user, photo: result.rows[0]?.photo || '' } });
  } catch (error) {
    console.error('Load account profile failed:', error.message);
    res.status(500).json({ error: 'Could not load your profile. Please try again.' });
  }
});

accountRouter.post('/profile/photo', async (req, res) => {
  const photo = req.body?.photo;
  if (typeof photo !== 'string' || photo.length > 700000 || (photo !== '' && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo))) {
    return res.status(400).json({ error: 'Use a JPG, PNG or WEBP profile picture up to 500 KB after resizing.' });
  }
  if (photo) {
    const [, type, encoded] = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(photo);
    const bytes = Buffer.from(encoded, 'base64');
    const valid = type === 'jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : type === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!valid || bytes.length > 512 * 1024) return res.status(400).json({ error: 'That picture could not be read. Choose a JPG, PNG or WEBP up to 500 KB after resizing.' });
  }
  try {
    await ensurePhotoStorage();
    await query(`INSERT INTO account_photos (user_id, photo) VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET photo = EXCLUDED.photo`, [req.user.id, photo]);
    res.json({ photo });
  } catch (error) {
    console.error('Save account photo failed:', error.message);
    res.status(500).json({ error: 'Your picture could not be saved. Please try again.' });
  }
});

accountRouter.post('/profile/contact', async (req, res) => {
  const input = req.body || {};
  const email = String(input.email || '').trim().toLowerCase();
  const phone = String(input.phone || '').replace(/[\s-]/g, '');
  const errors = {};
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
  if (!/^\+?\d{10,15}$/.test(phone)) errors.phone = 'Enter a valid mobile number.';
  const address = {};
  for (const [key, limit] of Object.entries({ houseStreet: 255, city: 100, state: 100, country: 100, zipCode: 20 })) {
    address[key] = String(input[key] || '').trim();
    if (address[key].length > limit) errors[key] = `Use ${limit} characters or fewer.`;
  }
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Check your contact details.', errors });
  try {
    await withTransaction(async client => {
      await client.query('UPDATE users SET email = $1, mobile_number = $2, updated_at = NOW() WHERE id = $3', [email, phone, req.user.id]);
      const existing = await client.query('SELECT id FROM addresses WHERE user_id = $1', [req.user.id]);
      const values = [address.houseStreet, address.country, address.city, address.state, address.zipCode, req.user.id];
      if (existing.rows.length) {
        await client.query('UPDATE addresses SET house_street = $1, country = $2, city = $3, state = $4, zip_code = $5 WHERE user_id = $6', values);
      } else {
        await client.query('INSERT INTO addresses (house_street, country, city, state, zip_code, user_id) VALUES ($1, $2, $3, $4, $5, $6)', values);
      }
      if (req.user.role === 'owner') {
        const fullAddress = [address.houseStreet, address.city, address.state, address.zipCode, address.country].filter(Boolean).join(', ');
        await client.query('UPDATE owners SET email = $1, phone = $2, address = $3 WHERE user_id = $4', [email, phone, fullAddress, req.user.id]);
      }
    });
    res.json({ profile: { ...req.user, email, phone, address } });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'This email is already registered.', errors: { email: 'This email is already registered.' } });
    console.error('Save account contact failed:', error.message);
    res.status(500).json({ error: 'Your contact details could not be saved. Please try again.' });
  }
});

accountRouter.post('/password', async (req, res) => {
  const { cur, next, conf } = req.body || {};
  const errors = {};
  if (typeof cur !== 'string' || !cur || cur.length > 128) errors.cur = 'Enter your current password.';
  if (typeof next !== 'string') errors.next = 'Enter a new password.';
  else if (validatePasswordComplexity(next)) errors.next = validatePasswordComplexity(next);
  else if (next === cur) errors.next = 'New password must be different from current password.';
  if (conf !== next) errors.conf = 'Passwords do not match.';
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Check the password fields.', errors });
  try {
    const changed = await withTransaction(async client => {
      const result = await client.query('SELECT password_hash FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
      if (!result.rows[0] || !await verifyPassword(cur, result.rows[0].password_hash)) return false;
      await client.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [await hashPassword(next), req.user.id]);
      const sid = req.cookies?.sid || req.headers.authorization?.replace('Bearer ', '');
      await client.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [req.user.id, sha256(sid)]);
      return true;
    });
    if (!changed) return res.status(400).json({ error: 'Current password is incorrect.', errors: { cur: 'Current password is incorrect.' } });
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Change account password failed:', error.message);
    res.status(500).json({ error: 'Your password could not be changed. Please try again.' });
  }
});
