/**
 * ORVANE — /api/waitlist.js
 * Vercel Serverless Function — Waitlist capture via Supabase + Resend.
 *
 * Route:  POST /api/waitlist
 * Body:   { "email": "...", "name": "...", "source": "..." }
 *
 * Env vars required (set in Vercel dashboard):
 *   SUPABASE_URL          → your Supabase project URL
 *   SUPABASE_SERVICE_KEY  → service role key (NOT anon key)
 *   RESEND_API_KEY        → from resend.com dashboard
 *
 * Supabase table schema:
 *   create table waitlist (
 *     id         bigint generated always as identity primary key,
 *     email      text not null unique,
 *     name       text,
 *     source     text not null default 'website',
 *     created_at timestamptz default now()
 *   );
 */

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// ── Supabase client (initialised once per cold start) ────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Resend client ─────────────────────────────────────────────
const resend = new Resend(process.env.RESEND_API_KEY);

// ── Helpers ───────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return EMAIL_RE.test(email);
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Main handler ──────────────────────────────────────────────
module.exports = async function handler(req, res) {
  setCors(res);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  // Parse + validate
  const { email, name, source } = req.body || {};

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const trimmed = email.trim().toLowerCase();

  if (!isValidEmail(trimmed)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  // Insert into Supabase
  const { error } = await supabase
    .from('waitlist')
    .insert([{
      email: trimmed,
      name: (typeof name === 'string' && name.trim()) || null,
      source: (typeof source === 'string' && source.trim()) || 'website',
    }]);

  if (error) {
    // Postgres unique_violation code = '23505'
    if (error.code === '23505') {
      return res.status(200).json({
        message: "You're already on the list — we'll reach out soon.",
      });
    }

    // Any other DB error
    return res.status(500).json({
      error: 'Could not save your email. Please try again.',
    });
  }

  // ── Send welcome email via Resend ────────────────────────────
  // Wrapped in try/catch: email failure must NEVER break the signup flow.
  const firstName = (typeof name === 'string' && name.trim().split(' ')[0]) || 'there';

  try {
    await resend.emails.send({
      from: 'Orvane <team@orvane.in>',
      to: trimmed,
      subject: "You’re in. And that actually matters.",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#f5f1ea; padding:48px; color:#111; max-width:600px; margin:auto; line-height:1.7;">

      <h2 style="margin-bottom:20px;">You’re in. And that actually matters.</h2>

      <p>Hey ${firstName},</p>

      <p>
        I don’t know what made you stop today —<br/>
        but I’m glad you did.
      </p>

      <p>
        And genuinely, thank you for it.
      </p>

      <br/>

      <p>
        Most people scroll past things that matter.
      </p>

      <p>
        You didn’t.
      </p>

      <br/>

      <p>
        So this isn’t just another signup.
      </p>

      <p>
        <strong>You’re early.</strong><br/>
        And that’s not something we take lightly.
      </p>

      <br/>

      <p>
        We’re building this quietly.<br/>
        No rush. No noise. Just doing it right.
      </p>

      <p>
        When it’s ready — you’ll be among the first to see it.
      </p>

      <br/>

      <p>
        Until then,<br/>
        stay a little more curious than everyone else.
      </p>

      <br/>

      <p>— Team Orvane</p>

      <br/>

      <p style="font-size:13px; color:#555;">
        P.S. If something about the way people consume information has ever felt “off”…<br/>
        you’re not imagining it.
      </p>

    </div>
      `,
    });

    console.log('[resend] Welcome email sent to:', trimmed);

  } catch (err) {
    console.error('[resend] Email send failed:', err);
  }

  return res.status(201).json({
    message: "You're on the list! We'll reach out when we launch.",
  });
};
