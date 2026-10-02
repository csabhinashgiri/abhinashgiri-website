// Cloudflare Pages Function: POST /api/contact
// Receives the website enquiry form, validates it server-side and sends it
// through the Resend HTTP API. The API key is read from the encrypted
// Cloudflare Pages secret RESEND_API_KEY and is never exposed to the browser.

const TO_ADDRESS = 'abhinash@abhinashgiri.com';
const FROM_ADDRESS = 'Abhinash Giri & Co. <website@abhinashgiri.com>';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const MAX_BODY_BYTES = 20000;
const LIMITS = {
  name: 100,
  organisation: 150,
  email: 254,
  phone: 30,
  enquiry_type: 100,
  description: 5000
};

// Must match the options in the "Nature of Enquiry" dropdown in index.html.
const ENQUIRY_TYPES = [
  'Capital Markets & IPO Advisory',
  'Listed Company Advisory',
  'Fund Raising & Strategic Transaction Advisory',
  'Secretarial & Regulatory Services',
  'Corporate Governance & Restructuring',
  'General Enquiry'
];

const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const PHONE_PATTERN = /^[0-9+()\-.\s]{5,30}$/;

function json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: Object.assign(
      {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      },
      extraHeaders || {}
    )
  });
}

function fail(status, message, extraHeaders) {
  return json({ success: false, error: message }, status, extraHeaders);
}

// Single-line fields: remove control characters (including CR/LF) and collapse whitespace.
function cleanLine(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Multi-line field: normalise line breaks, drop other control characters.
function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimestamp(date) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date) + ' IST';
  } catch (e) {
    return date.toISOString();
  }
}

function buildEmail(data) {
  const submittedAt = formatTimestamp(new Date());

  const rows = [
    ['Name', data.name],
    ['Organisation', data.organisation || 'Not provided'],
    ['Email', data.email],
    ['Phone', data.phone || 'Not provided'],
    ['Nature of Enquiry', data.enquiry_type]
  ];

  const rowsHtml = rows
    .map(function (row) {
      return (
        '<tr>' +
        '<td style="padding:10px 16px;border-bottom:1px solid #eee5cf;width:170px;vertical-align:top;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6b6b6b;">' +
        escapeHtml(row[0]) +
        '</td>' +
        '<td style="padding:10px 16px;border-bottom:1px solid #eee5cf;vertical-align:top;font-size:14px;color:#1a1a1a;">' +
        escapeHtml(row[1]) +
        '</td>' +
        '</tr>'
      );
    })
    .join('');

  const descriptionHtml = data.description
    ? escapeHtml(data.description).replace(/\n/g, '<br>')
    : '<span style="color:#6b6b6b;">Not provided</span>';

  const html =
    '<!DOCTYPE html>' +
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#faf8f3;font-family:Arial,Helvetica,sans-serif;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f3;padding:24px 12px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-top:3px solid #b8922a;">' +
    '<tr><td style="background:#0f1e38;padding:22px 24px;">' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:20px;color:#d4aa55;">Abhinash Giri &amp; Co.</div>' +
    '<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#ffffff;margin-top:4px;">Company Secretaries</div>' +
    '</td></tr>' +
    '<tr><td style="padding:24px 24px 8px 24px;">' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:22px;color:#0f1e38;">New Website Enquiry</div>' +
    '<div style="font-size:12px;color:#6b6b6b;margin-top:6px;">Received ' + escapeHtml(submittedAt) + ' via abhinashgiri.com</div>' +
    '</td></tr>' +
    '<tr><td style="padding:8px 8px 0 8px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' +
    rowsHtml +
    '</table>' +
    '</td></tr>' +
    '<tr><td style="padding:20px 24px 8px 24px;">' +
    '<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6b6b6b;margin-bottom:8px;">Brief Description</div>' +
    '<div style="font-size:14px;line-height:1.7;color:#1a1a1a;background:#faf8f3;border:1px solid #eee5cf;padding:14px 16px;">' +
    descriptionHtml +
    '</div>' +
    '</td></tr>' +
    '<tr><td style="padding:16px 24px 24px 24px;font-size:12px;color:#6b6b6b;">' +
    'Reply to this email to respond directly to ' + escapeHtml(data.name) + '.' +
    '</td></tr>' +
    '</table>' +
    '</td></tr></table>' +
    '</body></html>';

  const text = [
    'New Website Enquiry',
    'Received ' + submittedAt + ' via abhinashgiri.com',
    '',
    'Name: ' + data.name,
    'Organisation: ' + (data.organisation || 'Not provided'),
    'Email: ' + data.email,
    'Phone: ' + (data.phone || 'Not provided'),
    'Nature of Enquiry: ' + data.enquiry_type,
    '',
    'Brief Description:',
    data.description || 'Not provided',
    '',
    'Reply to this email to respond directly to ' + data.name + '.'
  ].join('\n');

  return { html: html, text: text };
}

export async function onRequest(context) {
  const request = context.request;
  const env = context.env;

  // 1. POST only.
  if (request.method !== 'POST') {
    return fail(405, 'Method not allowed.', { Allow: 'POST' });
  }

  // 2. Expect JSON.
  const contentType = (request.headers.get('Content-Type') || '').toLowerCase();
  if (contentType.indexOf('application/json') === -1) {
    return fail(415, 'Unsupported content type.');
  }

  // 3. Bound the request size before and after reading it.
  const declaredLength = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (declaredLength > MAX_BODY_BYTES) {
    return fail(413, 'Your message is too long.');
  }

  let raw;
  try {
    raw = await request.text();
  } catch (e) {
    return fail(400, 'Invalid request.');
  }
  if (raw.length > MAX_BODY_BYTES) {
    return fail(413, 'Your message is too long.');
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    return fail(400, 'Invalid request.');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return fail(400, 'Invalid request.');
  }

  // 4. Read and sanitise the fields present in the form.
  const data = {
    name: cleanLine(payload.name),
    organisation: cleanLine(payload.organisation),
    email: cleanLine(payload.email),
    phone: cleanLine(payload.phone),
    enquiry_type: cleanLine(payload.enquiry_type),
    description: cleanText(payload.description)
  };

  // 5. Server-side validation.
  if (!data.name) {
    return fail(400, 'Please enter your name.');
  }
  if (!data.email) {
    return fail(400, 'Please enter your email address.');
  }
  if (!data.enquiry_type) {
    return fail(400, 'Please select the nature of your enquiry.');
  }

  for (const field in LIMITS) {
    if (data[field].length > LIMITS[field]) {
      return fail(400, 'One or more fields are too long. Please shorten your entry and try again.');
    }
  }

  if (!EMAIL_PATTERN.test(data.email)) {
    return fail(400, 'Please enter a valid email address.');
  }
  if (data.phone && !PHONE_PATTERN.test(data.phone)) {
    return fail(400, 'Please enter a valid phone number.');
  }
  if (ENQUIRY_TYPES.indexOf(data.enquiry_type) === -1) {
    return fail(400, 'Please select a valid nature of enquiry.');
  }

  // 6. The API key must be configured as an encrypted Pages secret.
  const apiKey = env && env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('contact: RESEND_API_KEY is not configured for this environment.');
    return fail(500, 'We could not send your enquiry right now. Please try again later or contact us directly.');
  }

  const email = buildEmail(data);

  // 7. Send through Resend (native fetch, with a timeout).
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 10000);

  try {
    const resendResponse = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [TO_ADDRESS],
        reply_to: data.email,
        subject: 'New Website Enquiry - ' + data.name,
        html: email.html,
        text: email.text
      }),
      signal: controller.signal
    });

    if (!resendResponse.ok) {
      // Log status only for diagnosis. Never return provider details to the visitor.
      console.error('contact: Resend rejected the request with status ' + resendResponse.status + '.');
      return fail(502, 'We could not send your enquiry right now. Please try again later or contact us directly.');
    }

    return json({ success: true }, 200);
  } catch (e) {
    console.error('contact: request to Resend failed (' + (e && e.name ? e.name : 'error') + ').');
    return fail(502, 'We could not send your enquiry right now. Please try again later or contact us directly.');
  } finally {
    clearTimeout(timer);
  }
}
