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
const { Resend }       = require('resend');

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
      email:      trimmed,
      name:       (typeof name === 'string' && name.trim()) || null,
      source:     (typeof source === 'string' && source.trim()) || 'website',
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
      from:    'Orvane <onboarding@resend.dev>',
      to:      trimmed,
      subject: "You're in — Orvane Early Access",
      html: `
        <div style="font-family: 'Georgia', serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; color: #1A1815; background: #F5F0E8;">

          <p style="font-size: 0.78rem; text-transform: uppercase; letter-spacing: 2px; color: #B89A6A; margin-bottom: 8px;">Orvane</p>

          <h1 style="font-size: 2rem; font-weight: 400; line-height: 1.15; margin: 0 0 24px;">
            Welcome, ${firstName}.
          </h1>

          <p style="font-size: 1rem; line-height: 1.75; color: #3D3A34; margin-bottom: 16px;">
            You're officially on the early access list.
          </p>

          <p style="font-size: 1rem; line-height: 1.75; color: #3D3A34; margin-bottom: 16px;">
            We're building something powerful — turning raw market news into structured,
            actionable intelligence. You'll be among the first to experience it.
          </p>

          <p style="font-size: 1rem; line-height: 1.75; color: #3D3A34; margin-bottom: 32px;">
            We'll reach out when your access is ready. No spam, no noise — just signal.
          </p>

          <div style="border-top: 1px solid #D8D2C6; padding-top: 24px; font-size: 0.85rem; color: #7A756B;">
            — Team Orvane
          </div>
        </div>
      `,
    });
  } catch (emailError) {
    // Log internally but do NOT surface to the user
    console.error('[resend] Welcome email failed:', emailError.message);
  }

  return res.status(201).json({
    message: "You're on the list! We'll reach out when we launch.",
  });
};
