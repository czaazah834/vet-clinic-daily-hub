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
  if (req) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || (req.get ? req.get('host') : req.headers?.host);
    if (host && !host.includes('localhost:3000') && !host.includes('127.0.0.1:3000')) return `${proto}://${host}`;
  }
  if (process.env.APP_URL && !process.env.APP_URL.includes('localhost')) return process.env.APP_URL.replace(/\/+$/, '');
  if (process.env.SITE_URL && !process.env.SITE_URL.includes('localhost')) return process.env.SITE_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
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
    const fn = (req.body.firstName || req.body.first_name || 'Pet').trim();
    const ln = (req.body.lastName || req.body.last_name || 'Owner').trim();
    const mi = (req.body.middleInitial || req.body.middle_initial || '').trim().toUpperCase() || null;
    const bd = req.body.birthday || '1995-01-01';
    const mob = (req.body.mobile || req.body.mobileNumber || req.body.phone || '+639170000000').trim();

    const houseStreet = req.body.house_street || req.body.address?.houseStreet || (typeof req.body.address === 'string' ? req.body.address : 'Street');
    const country = req.body.country || req.body.address?.country || 'Philippines';
    const state = req.body.state || req.body.address?.state || 'Metro Manila';
    const city = req.body.city || req.body.address?.city || 'Quezon City';
    const zipCode = req.body.zip_code || req.body.address?.zipCode || '1100';
    const fullAddress = `${houseStreet}, ${city}, ${state} ${zipCode}, ${country}`;

    const em = String(req.body.email || '').trim().toLowerCase();
    if (!em) return res.status(400).json({ error: 'Email address is required.' });

    // Strict RBAC: Public registration is strictly restricted to Pet Owners only!
    // Staff (Veterinarians and Vet Assistants) must be invited by the Clinic Administrator.
    if (req.body.role && req.body.role !== 'owner') {
      return res.status(403).json({
        error: 'Public registration is only available for Pet Owners. Staff accounts must be invited by the Clinic Administrator.'
      });
    }

    // Check existing
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = $1', [em]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const pwErr = validatePasswordComplexity(req.body.password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const pwHash = await hashPassword(req.body.password);
    const userId = 'u_' + randomHex(8);
    const ownerId = 'o_' + randomHex(8);

    // Insert user
    await query(
      `INSERT INTO users (
        id, first_name, last_name, middle_initial, birthday,
        password_hash, email, role, vet_id, owner_id, mobile_number,
        email_verified_at, mobile_verified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        userId,
        fn,
        ln,
        mi,
        bd,
        pwHash,
        em,
        'owner',
        null,
        ownerId,
        mob,
        null,
        false,
      ]
    );

    // Insert address
    await query(
      `INSERT INTO addresses (user_id, house_street, country, state, city, zip_code)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, houseStreet, country, state, city, zipCode]
    );

    // Insert into owners table
    const fullName = `${fn}${mi ? ' ' + mi + '.' : ''} ${ln}`.trim();
    await query(
      `INSERT INTO owners (id, user_id, name, email, phone, address)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [ownerId, userId, fullName, em, mob, fullAddress]
    );

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
      `Hello ${fn}!\n\nPlease verify your email for your PawCare account:\n${verifyLink}\n\nWarm regards,\nPawCare Team`,
      `<p>Hello <b>${fn}</b>!</p><p>Please verify your email address to activate your PawCare account:</p><p><a href="${verifyLink}" style="background:#0b3a5b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Verify My Account</a></p>`
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

// 6. VERIFY EMAIL LINK (Supports GET and POST)
async function handleEmailVerification(req, res) {
  const token = req.query.token || req.body?.token;
  if (!token) {
    if (req.headers.accept?.includes('text/html')) {
      return res.redirect('/?verified=invalid');
    }
    return res.status(400).json({ status: 'invalid', error: 'Token is required.' });
  }

  try {
    const r = await query(
      `SELECT t.*, u.id as user_id, u.email, u.first_name, u.mobile_number, u.mobile_verified
       FROM verification_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1 AND t.type = 'email_verify' AND t.expired_at > NOW()`,
      [sha256(token)]
    );
    if (!r.rows.length) {
      if (req.headers.accept?.includes('text/html')) {
        return res.redirect('/?verified=invalid');
      }
      return res.status(400).json({ status: 'invalid', error: 'Verification link is invalid or has expired.' });
    }

    const tok = r.rows[0];
    await query('UPDATE users SET email_verified_at = NOW() WHERE id = $1', [tok.user_id]);
    await query('DELETE FROM verification_tokens WHERE id = $1', [tok.id]);

    // Create session cookie so subsequent OTP requests are authenticated
    const sid = randomHex(32);
    await query(
      `INSERT INTO sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [sha256(sid), tok.user_id]
    );
    res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400 * 1000 });

    // Generate and send mobile OTP via TextBee
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    await query(`DELETE FROM verification_tokens WHERE user_id = $1 AND type = 'mobile_otp'`, [tok.user_id]);
    await query(
      `INSERT INTO verification_tokens (user_id, token_hash, type, expired_at)
       VALUES ($1, $2, 'mobile_otp', NOW() + INTERVAL '10 minutes')`,
      [tok.user_id, sha256(otpCode)]
    );

    if (tok.mobile_number) {
      try {
        await sendSms(tok.mobile_number.trim(), `PawCare Security: Your verification OTP code is ${otpCode}. Valid for 10 minutes.`);
      } catch (smsErr) {
        console.warn('Initial TextBee SMS warning:', smsErr.message);
      }
    }

    if (req.headers.accept?.includes('text/html') && !req.xhr) {
      return res.redirect('/?verified=ok');
    }

    return res.json({
      status: 'ok',
      message: 'Email address successfully verified!',
      token: sid,
      phone: tok.mobile_number,
      devCode: otpCode
    });
  } catch (err) {
    console.error('Email verify error:', err);
    if (req.headers.accept?.includes('text/html')) {
      return res.redirect('/?verified=invalid');
    }
    res.status(500).json({ status: 'error', error: 'Verification failed.' });
  }
}

router.get('/verify-email', handleEmailVerification);
router.post('/verify-email', handleEmailVerification);

// 6.5 OTP INFO (Resilient session lookup)
router.get(['/otp/info', '/otp-info'], async (req, res) => {
  const sid = req.cookies?.sid || (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
  if (sid) {
    try {
      const r = await query(
        `SELECT u.mobile_number, u.mobile_verified, u.mobile_verified_at
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
        [sha256(sid)]
      );
      if (r.rows.length) {
        const u = r.rows[0];
        return res.json({
          mobileVerified: !!u.mobile_verified || !!u.mobile_verified_at,
          phone: u.mobile_number || ''
        });
      }
    } catch (_) {}
  }
  try {
    const r = await query(
      `SELECT u.mobile_number, u.mobile_verified, u.mobile_verified_at
       FROM verification_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.type = 'mobile_otp' AND t.expired_at > NOW()
       ORDER BY t.created_at DESC LIMIT 1`
    );
    if (r.rows.length) {
      const u = r.rows[0];
      return res.json({
        mobileVerified: !!u.mobile_verified || !!u.mobile_verified_at,
        phone: u.mobile_number || ''
      });
    }
  } catch (_) {}

  return res.json({
    mobileVerified: false,
    phone: ''
  });
});

// 7. SEND / RESEND MOBILE OTP
router.post(['/otp/resend', '/send-otp'], async (req, res) => {
  const sid = req.cookies?.sid || (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
  let userId = null;
  let phone = null;

  if (sid) {
    try {
      const r = await query(
        `SELECT u.id, u.mobile_number FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
        [sha256(sid)]
      );
      if (r.rows.length) {
        userId = r.rows[0].id;
        phone = r.rows[0].mobile_number;
      }
    } catch (_) {}
  }

  if (!userId) {
    try {
      const r = await query(
        `SELECT t.user_id, u.mobile_number FROM verification_tokens t JOIN users u ON u.id = t.user_id WHERE t.type = 'mobile_otp' AND t.created_at > NOW() - INTERVAL '15 minutes' ORDER BY t.created_at DESC LIMIT 1`
      );
      if (r.rows.length) {
        userId = r.rows[0].user_id;
        phone = r.rows[0].mobile_number;
      }
    } catch (_) {}
  }

  if (!userId) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }

  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await query(`DELETE FROM verification_tokens WHERE user_id = $1 AND type = 'mobile_otp'`, [userId]);
    await query(
      `INSERT INTO verification_tokens (user_id, token_hash, type, expired_at) VALUES ($1, $2, 'mobile_otp', NOW() + INTERVAL '10 minutes')`,
      [userId, sha256(code)]
    );

    if (phone) {
      await sendSms(phone.trim(), `PawCare Security: Your verification code is ${code}. Valid for 10 minutes.`);
    }
    res.json({ status: 'ok', ok: true, message: `Verification code sent to ${phone || 'your phone'}.`, devCode: code });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ error: 'Failed to send OTP.' });
  }
});

// 8. VERIFY MOBILE OTP (Session + Code token fallback)
router.post(['/otp/verify', '/verify-otp'], async (req, res) => {
  const code = String(req.body?.code ?? '').trim();
  if (!code) return res.status(400).json({ error: 'Code is required.' });

  const sid = req.cookies?.sid || (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
  let userId = null;
  let userObj = null;

  if (sid) {
    try {
      const s = await query(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
        [sha256(sid)]
      );
      if (s.rows.length) {
        userId = s.rows[0].id;
        userObj = s.rows[0];
      }
    } catch (_) {}
  }

  try {
    let tok = null;
    if (userId) {
      const r = await query(
        `SELECT * FROM verification_tokens WHERE user_id = $1 AND type = 'mobile_otp' AND expired_at > NOW() ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      tok = r.rows[0];
    } else {
      // Find token by code directly across active mobile_otp tokens
      const r = await query(
        `SELECT t.*, u.id as uid, u.email, u.first_name, u.last_name, u.role, u.mobile_number
         FROM verification_tokens t
         JOIN users u ON u.id = t.user_id
         WHERE t.type = 'mobile_otp' AND t.token_hash = $1 AND t.expired_at > NOW()
         ORDER BY t.created_at DESC LIMIT 1`,
        [sha256(code)]
      );
      if (r.rows.length) {
        tok = r.rows[0];
        userId = tok.uid;
        userObj = tok;
      }
    }

    if (!tok) {
      return res.status(400).json({ error: 'Code has expired or is invalid. Request a new one.' });
    }

    if (tok.token_hash !== sha256(code)) {
      const attempts = (tok.attempts || 0) + 1;
      if (attempts >= 3) {
        await query('DELETE FROM verification_tokens WHERE id = $1', [tok.id]);
        return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new code.' });
      }
      await query('UPDATE verification_tokens SET attempts = $1 WHERE id = $2', [attempts, tok.id]);
      return res.status(400).json({ error: `Incorrect code. ${3 - attempts} attempt(s) remaining.` });
    }

    await query('UPDATE users SET mobile_verified = true, mobile_verified_at = NOW() WHERE id = $1', [userId]);
    await query('DELETE FROM verification_tokens WHERE id = $1', [tok.id]);

    // Issue fresh 7-day session token
    const newSid = randomHex(32);
    await query(
      `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [sha256(newSid), userId]
    );
    res.cookie('sid', newSid, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400 * 1000 });

    const safeUser = {
      id: userId,
      email: userObj.email,
      name: `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim(),
      role: userObj.role,
      mobileVerified: true,
      mobile_verified: true,
      emailVerified: true
    };

    res.json({
      status: 'ok',
      ok: true,
      message: 'Mobile number verified successfully!',
      token: newSid,
      user: safeUser
    });
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

// 10. INVITE STAFF (Clinic Administrator Only)
router.post('/staff/invite', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the Clinic Administrator can invite staff members.' });
  }

  const { email, name, role } = req.body;
  const em = String(email || '').trim().toLowerCase();
  const staffRole = role === 'assistant' ? 'assistant' : 'vet';
  const roleName = staffRole === 'vet' ? 'Veterinarian' : 'Vet Assistant';

  if (!em) return res.status(400).json({ error: 'Staff email address is required.' });
  if (!name) return res.status(400).json({ error: 'Staff full name is required.' });

  try {
    const existingUser = await query('SELECT id FROM users WHERE LOWER(email) = $1', [em]);
    if (existingUser.rows.length) {
      return res.status(400).json({ error: 'A user account with this email already exists.' });
    }

    const rawToken = randomHex(32);
    await query(
      `INSERT INTO staff_invitations (email, name, role, token_hash, invited_by, expired_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         token_hash = EXCLUDED.token_hash,
         invited_by = EXCLUDED.invited_by,
         accepted_at = NULL,
         expired_at = NOW() + INTERVAL '7 days'`,
      [em, name.trim(), staffRole, sha256(rawToken), req.user.id]
    );

    const siteUrl = getAppUrl(req);
    const inviteLink = `${siteUrl}/?invite=${rawToken}`;

    await sendMail(
      em,
      `PawCare Staff Invitation: Set up your ${roleName} Account`,
      `Hello ${name},\n\nYou have been invited by the Clinic Administrator to join PawCare Clinic as a ${roleName}.\n\nClick the link below to set your password and complete your mobile phone verification via OTP:\n${inviteLink}\n\nThis invitation link expires in 7 days.\n\nWarm regards,\nPawCare Administration`,
      `<div style="font-family: Arial, sans-serif; padding: 24px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; max-width: 520px;">
        <h2 style="color: #1e3a8a; margin-top: 0;">🐾 Welcome to the PawCare Clinic Staff</h2>
        <p style="color: #334155; font-size: 15px; line-height: 1.6;">
          Hello <b>${name}</b>,<br>
          You have been invited by the Clinic Administrator to join the PawCare team as a <b>${roleName}</b>.
        </p>
        <p style="color: #334155; font-size: 14px;">
          Please click below to set your password and complete your mobile phone OTP verification:
        </p>
        <div style="margin: 24px 0;">
          <a href="${inviteLink}" style="background: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
            Activate ${roleName} Account
          </a>
        </div>
        <p style="color: #64748b; font-size: 12px;">
          Direct Link: <a href="${inviteLink}" style="color: #2563eb;">${inviteLink}</a><br>
          This invitation expires in 7 days.
        </p>
      </div>`
    );

    res.json({
      status: 'ok',
      message: `Invitation successfully sent to ${em} via Brevo!`,
      inviteLink,
      token: rawToken
    });
  } catch (err) {
    console.error('Staff invite error:', err);
    res.status(500).json({ error: 'Failed to send staff invitation: ' + err.message });
  }
});

// 11. GET STAFF INVITATION INFO
router.get('/staff/invite-info', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Invitation token is required.' });

  try {
    const r = await query(
      `SELECT * FROM staff_invitations WHERE token_hash = $1 AND expired_at > NOW()`,
      [sha256(token)]
    );
    if (!r.rows.length) {
      return res.status(404).json({ error: 'Invitation link is invalid or has expired.' });
    }
    const inv = r.rows[0];
    if (inv.accepted_at) {
      return res.status(400).json({ error: 'This invitation has already been accepted.' });
    }

    res.json({
      status: 'ok',
      email: inv.email,
      name: inv.name,
      role: inv.role
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. ACCEPT STAFF INVITATION (Sets password + sends TextBee OTP)
router.post('/staff/accept-invite', async (req, res) => {
  const { token, firstName, lastName, birthday, mobileNumber, password } = req.body;
  if (!token) return res.status(400).json({ error: 'Invitation token is required.' });
  if (!mobileNumber) return res.status(400).json({ error: 'Mobile number is required for OTP verification.' });

  try {
    const r = await query(
      `SELECT * FROM staff_invitations WHERE token_hash = $1 AND expired_at > NOW()`,
      [sha256(token)]
    );
    if (!r.rows.length) {
      return res.status(400).json({ error: 'Invitation link is invalid or has expired.' });
    }
    const inv = r.rows[0];
    if (inv.accepted_at) {
      return res.status(400).json({ error: 'This invitation has already been used.' });
    }

    const pwErr = validatePasswordComplexity(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const pwHash = await hashPassword(password);
    const userId = 'u_' + randomHex(8);
    const vetId = inv.role === 'vet' ? 'v_' + randomHex(8) : null;

    // Insert user account with email pre-verified
    await query(
      `INSERT INTO users (
        id, first_name, last_name, birthday,
        password_hash, email, role, vet_id, mobile_number,
        email_verified_at, mobile_verified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), false)`,
      [
        userId,
        (firstName || inv.name).trim(),
        (lastName || '').trim(),
        birthday || '1990-01-01',
        pwHash,
        inv.email,
        inv.role,
        vetId,
        mobileNumber.trim()
      ]
    );

    // Mark invitation accepted
    await query('UPDATE staff_invitations SET accepted_at = NOW() WHERE id = $1', [inv.id]);

    // Generate TextBee SMS OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    await query(
      `INSERT INTO verification_tokens (user_id, token_hash, type, expired_at)
       VALUES ($1, $2, 'mobile_otp', NOW() + INTERVAL '10 minutes')`,
      [userId, sha256(otpCode)]
    );

    await sendSms(
      mobileNumber.trim(),
      `PawCare Staff Security: Your verification OTP code is ${otpCode}. Valid for 10 minutes.`
    );

    // Create session cookie with needsOtp
    const sid = randomHex(32);
    await query(
      `INSERT INTO sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [sha256(sid), userId]
    );

    res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400 * 1000 });

    res.json({
      status: 'ok',
      needsOtp: true,
      message: `Account created! Verification code sent via TextBee to ${mobileNumber}.`,
      token: sid,
      devCode: otpCode
    });
  } catch (err) {
    console.error('Accept staff invite failed:', err);
    res.status(500).json({ error: 'Failed to complete staff registration: ' + err.message });
  }
});

export const authRouter = router;
export default router;
