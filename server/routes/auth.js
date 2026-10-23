import express from 'express';
import { query } from '../db.js';
import {
  hashPassword,
  verifyPassword,
  sha256,
  randomHex,
  validatePasswordComplexity,
  issueCsrfToken,
  verifyCsrfToken,
} from '../security.js';
import { sendMail, sendSms, serverOutbox } from '../services.js';

export function getAppUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (req) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    if (host && !host.includes('localhost:3000')) return `${proto}://${host}`;
  }
  return 'http://localhost:5173';
}

const router = express.Router();
const G = 'Invalid email or password.';

// Middleware to authenticate user via session cookie or Bearer token
export async function requireAuth(req, res, next) {
  const sid = req.cookies?.sid || (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
  if (!sid) return res.status(401).json({ error: 'Not signed in.' });

  try {
    const r = await query(
      `SELECT u.*, a.house_street, a.country, a.city, a.state, a.zip_code
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN addresses a ON a.user_id = u.id
       WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
      [sha256(sid)]
    );

    if (!r.rows.length) return res.status(401).json({ error: 'Session expired. Please log in again.' });

    const user = r.rows[0];
    req.user = {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      middleInitial: user.middle_initial,
      name: `${user.first_name}${user.middle_initial ? ' ' + user.middle_initial + '.' : ''} ${user.last_name}`.trim(),
      email: user.email,
      role: user.role,
      vetId: user.vet_id,
      ownerId: user.owner_id,
      phone: user.mobile_number,
      birthday: user.birthday,
      emailVerified: !!user.email_verified_at,
      mobileVerified: user.mobile_verified,
      address: {
        houseStreet: user.house_street,
        country: user.country,
        city: user.city,
        state: user.state,
        zipCode: user.zip_code,
      },
    };
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Authentication check failed.' });
  }
}

// Restrict routes by RBAC roles
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });
    if (!roles.includes(req.user.role) && req.user.role !== 'admin') {
      return res.status(403).json({ error: `Access forbidden for role ${req.user.role}.` });
    }
    next();
  };
}

// 1. REGISTER
router.post('/register', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      middleInitial,
      birthday,
      email,
      password,
      mobile,
      address,
      role = 'owner',
    } = req.body;

    const em = String(email || '').trim().toLowerCase();
    if (!em) return res.status(400).json({ error: 'Email address is required.' });

    // Check existing
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = $1', [em]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const pwErr = validatePasswordComplexity(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const pwHash = await hashPassword(password);
    const userId = 'u_' + randomHex(8);
    const ownerId = role === 'owner' ? 'o_' + randomHex(8) : null;
    const vetId = role === 'vet' ? 'v_' + randomHex(8) : null;

    // Insert user
    await query(
      `INSERT INTO users (
        id, first_name, last_name, middle_initial, birthday,
        password_hash, email, role, vet_id, owner_id, mobile_number,
        email_verified_at, mobile_verified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        userId,
        firstName.trim(),
        lastName.trim(),
        middleInitial ? middleInitial.trim().toUpperCase() : null,
        birthday,
        pwHash,
        em,
        role,
        vetId,
        ownerId,
        mobile.trim(),
        null,
        false,
      ]
    );

    // Insert address if present
    if (address) {
      await query(
        `INSERT INTO addresses (user_id, house_street, country, state, city, zip_code)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          address.houseStreet || address.street || 'Default Street',
          address.country || 'Philippines',
          address.state || 'Metro Manila',
          address.city || 'Quezon City',
          address.zipCode || '1100',
        ]
      );
    }

    // Insert into owners table if owner role
    if (role === 'owner') {
      const fullName = `${firstName}${middleInitial ? ' ' + middleInitial + '.' : ''} ${lastName}`.trim();
      await query(
        `INSERT INTO owners (id, user_id, name, email, phone, address)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          ownerId,
          userId,
          fullName,
          em,
          mobile.trim(),
          address ? `${address.houseStreet}, ${address.city}` : 'Metro Manila',
        ]
      );
    }

    // Generate email verification token
    const rawToken = randomHex(24);
    await query(
      `INSERT INTO verification_tokens (user_id, token_hash, type, expired_at)
       VALUES ($1, $2, 'email_verify', NOW() + INTERVAL '24 hours')`,
      [userId, sha256(rawToken)]
    );

    // Send verification email
    const siteUrl = getAppUrl(req);
    const verifyLink = `${siteUrl}/?verify=${rawToken}`;
    await sendMail(
      em,
      'Welcome to PawCare - Verify your email address',
      `Hello ${firstName}!\n\nPlease verify your email for your PawCare account:\n${verifyLink}\n\nWarm regards,\nPawCare Team`,
      `<p>Hello <b>${firstName}</b>!</p><p>Please verify your email address to activate your PawCare account:</p><p><a href="${verifyLink}" style="background:#0b3a5b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Verify My Account</a></p>`
    );

    res.json({
      status: 'ok',
      email: em,
      message: 'Registration successful! Verification link dispatched.',
      token: rawToken, // Convenient for local testing
    });
  } catch (err) {
    console.error('Registration failed:', err);
    res.status(500).json({ error: 'Registration failed. ' + err.message });
  }
});

// 2. LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const em = String(email || '').trim().toLowerCase();

    if (!em || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const r = await query('SELECT * FROM users WHERE LOWER(email) = $1', [em]);
    if (!r.rows.length) {
      return res.status(401).json({ error: G });
    }

    const u = r.rows[0];

    // Check account lockout
    if (u.is_locked) {
      if (u.lockout_until && new Date() < new Date(u.lockout_until)) {
        const waitMins = Math.ceil((new Date(u.lockout_until) - new Date()) / 60000);
        return res.status(423).json({
          error: `Account locked due to 3 failed attempts. Please wait ${waitMins} minute(s) cooling period or use unlock link.`,
          locked: true,
        });
      }
    }

    const valid = await verifyPassword(password, u.password_hash);
    if (!valid) {
      const attempts = (u.failed_login_attempts || 0) + 1;
      if (attempts >= 3) {
        const lockoutUntil = new Date(Date.now() + 2 * 60 * 1000); // 2-minute cooling period
        await query(
          'UPDATE users SET failed_login_attempts = $1, is_locked = true, lockout_until = $2 WHERE id = $3',
          [attempts, lockoutUntil, u.id]
        );
        return res.status(423).json({
          error: 'Your account has been locked after 3 failed sign-in attempts. A 2-minute cooling period is in effect.',
          locked: true,
        });
      } else {
        await query('UPDATE users SET failed_login_attempts = $1 WHERE id = $2', [attempts, u.id]);
        return res.status(401).json({
          error: `Invalid email or password. ${3 - attempts} attempt(s) remaining before temporary lockout.`,
        });
      }
    }

    // Reset login attempts on success
    await query('UPDATE users SET failed_login_attempts = 0, is_locked = false, lockout_until = NULL WHERE id = $1', [u.id]);

    // Check mobile verification
    if (!u.mobile_verified && u.role === 'owner') {
      const sid = randomHex(32);
      await query(
        'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
        [sha256(sid), u.id]
      );
      res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400 * 1000 });
      return res.json({
        status: 'ok',
        needsOtp: true,
        message: 'Please complete mobile number SMS verification.',
      });
    }

    // Create session
    const sid = randomHex(32);
    await query(
      'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'14 days\')',
      [sha256(sid), u.id]
    );

    res.cookie('sid', sid, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 14 * 86400 * 1000,
    });

    const userObj = {
      id: u.id,
      name: `${u.first_name}${u.middle_initial ? ' ' + u.middle_initial + '.' : ''} ${u.last_name}`.trim(),
      email: u.email,
      role: u.role,
      vetId: u.vet_id,
      ownerId: u.owner_id,
      phone: u.mobile_number,
    };

    res.json({
      status: 'ok',
      user: userObj,
      token: sid,
    });
  } catch (err) {
    console.error('Login failed:', err);
    res.status(500).json({ error: 'Sign-in failed.' });
  }
});

// 3. CURRENT USER (GET /api/auth/me)
router.get('/me', requireAuth, (req, res) => {
  res.json({
    status: 'ok',
    user: req.user,
  });
});

// 4. LOGOUT
router.post('/logout', async (req, res) => {
  const sid = req.cookies?.sid;
  if (sid) {
    await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(sid)]).catch(() => {});
  }
  res.clearCookie('sid');
  res.json({ status: 'ok', message: 'Logged out successfully.' });
});

// 5. RESEND VERIFICATION EMAIL
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  const em = String(email || '').trim().toLowerCase();
  if (!em) return res.status(400).json({ error: 'Email is required.' });

  try {
    const r = await query('SELECT * FROM users WHERE email = $1', [em]);
    if (!r.rows.length) {
      return res.json({ status: 'ok', message: 'If an account exists, a verification link has been sent.' });
    }
    const u = r.rows[0];
    if (u.email_verified_at) {
      return res.json({ status: 'ok', message: 'Email address is already verified.' });
    }

    const rawToken = randomHex(24);
    await query('DELETE FROM verification_tokens WHERE user_id = $1 AND type = \'email_verify\'', [u.id]);
    await query(
      `INSERT INTO verification_tokens (user_id, token_hash, type, expired_at)
       VALUES ($1, $2, 'email_verify', NOW() + INTERVAL '24 hours')`,
      [u.id, sha256(rawToken)]
    );

    const siteUrl = getAppUrl(req);
    const verifyLink = `${siteUrl}/?verify=${rawToken}`;
    await sendMail(
      em,
      'PawCare - Verify your email address',
      `Please verify your email address:\n${verifyLink}`,
      `<p>Please verify your email address to activate your PawCare account:</p><p><a href="${verifyLink}" style="background:#0b3a5b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Verify My Account</a></p>`
    );

    res.json({ status: 'ok', message: 'Verification link sent to your email.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resend verification link.' });
  }
});

// 6. VERIFY EMAIL LINK
router.post('/verify-email', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token is required.' });

  try {
    const r = await query(
      `SELECT * FROM verification_tokens WHERE token_hash = $1 AND type = 'email_verify' AND expired_at > NOW()`,
      [sha256(token)]
    );
    if (!r.rows.length) {
      return res.status(400).json({ error: 'Verification link is invalid or has expired.' });
    }

    const tok = r.rows[0];
    await query('UPDATE users SET email_verified_at = NOW() WHERE id = $1', [tok.user_id]);
    await query('DELETE FROM verification_tokens WHERE id = $1', [tok.id]);

    res.json({ status: 'ok', message: 'Email address successfully verified!' });
  } catch (err) {
    console.error('Email verify error:', err);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// 6. SEND MOBILE OTP
router.post('/send-otp', requireAuth, async (req, res) => {
  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await query('DELETE FROM verification_tokens WHERE user_id = $1 AND type = \'mobile_otp\'', [req.user.id]);
    await query(
      'INSERT INTO verification_tokens (user_id, token_hash, type, expired_at) VALUES ($1, $2, \'mobile_otp\', NOW() + INTERVAL \'10 minutes\')',
      [req.user.id, sha256(code)]
    );

    await sendSms(req.user.phone, `PawCare Security: Your verification code is ${code}. Valid for 10 minutes.`);
    res.json({ status: 'ok', message: `Verification code sent to ${req.user.phone}.`, devCode: code });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ error: 'Failed to send OTP.' });
  }
});

// 7. VERIFY MOBILE OTP
router.post('/verify-otp', requireAuth, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code is required.' });

  try {
    const r = await query(
      `SELECT * FROM verification_tokens WHERE user_id = $1 AND type = 'mobile_otp' AND expired_at > NOW()`,
      [req.user.id]
    );
    if (!r.rows.length) {
      return res.status(400).json({ error: 'Code has expired. Request a new one.' });
    }

    const tok = r.rows[0];
    if (tok.token_hash !== sha256(code.trim())) {
      const attempts = (tok.attempts || 0) + 1;
      if (attempts >= 3) {
        await query('DELETE FROM verification_tokens WHERE id = $1', [tok.id]);
        return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new code.' });
      }
      await query('UPDATE verification_tokens SET attempts = $1 WHERE id = $2', [attempts, tok.id]);
      return res.status(400).json({ error: `Incorrect code. ${3 - attempts} attempt(s) remaining.` });
    }

    await query('UPDATE users SET mobile_verified = true WHERE id = $1', [req.user.id]);
    await query('DELETE FROM verification_tokens WHERE id = $1', [tok.id]);

    res.json({ status: 'ok', message: 'Mobile number verified successfully!' });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: 'Code verification failed.' });
  }
});

// 8. UNLOCK STATUS & EXECUTE
router.post('/unlock', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Unlock token is required.' });

  try {
    const r = await query(
      `SELECT * FROM verification_tokens WHERE token_hash = $1 AND type = 'account_unlock' AND expired_at > NOW()`,
      [sha256(token)]
    );
    if (!r.rows.length) {
      return res.status(400).json({ error: 'Unlock link is invalid or expired.' });
    }

    const tok = r.rows[0];
    await query(
      'UPDATE users SET is_locked = false, failed_login_attempts = 0, lockout_until = NULL WHERE id = $1',
      [tok.user_id]
    );
    await query('DELETE FROM verification_tokens WHERE id = $1', [tok.id]);

    res.json({ status: 'ok', message: 'Account unlocked! You can now log in.' });
  } catch (err) {
    console.error('Unlock error:', err);
    res.status(500).json({ error: 'Account unlock failed.' });
  }
});

// 9. DEV OUTBOX
router.get('/outbox', (req, res) => {
  res.json({ outbox: serverOutbox });
});

export const authRouter = router;
export default router;
