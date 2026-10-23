import nodemailer from 'nodemailer';

const E = process.env;

let transporter = null;
if (E.SMTP_USER && E.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: E.SMTP_HOST || 'smtp.gmail.com',
    port: Number(E.SMTP_PORT) || 587,
    secure: Number(E.SMTP_PORT) === 465,
    auth: {
      user: E.SMTP_USER,
      pass: E.SMTP_PASS,
    },
  });
}

// Global in-memory outbox for dev/testing when SMTP is not set
export const serverOutbox = [];

export async function sendMail(to, subject, text, html) {
  const from = E.MAIL_FROM || 'PawCare Veterinary Clinic <noreply@pawcare.com>';

  const record = {
    id: Math.random().toString(36).substring(2, 9),
    to,
    from,
    subject,
    text,
    html,
    sentAt: new Date().toISOString(),
  };
  serverOutbox.unshift(record);
  if (serverOutbox.length > 50) serverOutbox.pop();

  if (transporter) {
    try {
      await transporter.sendMail({ from, to, subject, text, html });
      console.log(`Email sent via SMTP to ${to}: "${subject}"`);
      return { ok: true, via: 'smtp' };
    } catch (err) {
      console.error('SMTP send failed:', err.message);
    }
  }

  console.log(`[Dev Mail Delivery] To: ${to} | Subject: ${subject}`);
  return { ok: true, via: 'dev_outbox' };
}

export async function sendSms(phone, message) {
  const record = {
    id: Math.random().toString(36).substring(2, 9),
    phone,
    message,
    sentAt: new Date().toISOString(),
  };
  serverOutbox.unshift(record);

  if (E.PHILSMS_API_TOKEN && E.PHILSMS_API_TOKEN.startsWith('http') === false) {
    try {
      const res = await fetch('https://dashboard.philsms.com/api/v3/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${E.PHILSMS_API_TOKEN}`,
        },
        body: JSON.stringify({
          recipient: phone,
          sender_id: E.PHILSMS_SENDER_ID || 'PhilSMS',
          type: 'plain',
          message,
        }),
      });
      console.log('SMS sent via PhilSMS:', await res.json());
      return { ok: true, via: 'philsms' };
    } catch (err) {
      console.error('PhilSMS send failed:', err.message);
    }
  }

  console.log(`[Dev SMS Delivery] To: ${phone} | Body: ${message}`);
  return { ok: true, via: 'dev_outbox' };
}

