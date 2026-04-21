/**
 * ORVANE — /api/waitlist.js
 * Vercel Serverless Function — Waitlist email capture via Supabase.
 *
 * Route:  POST /api/waitlist
 * Body:   { "email": "user@example.com" }
 *
 * Env vars required (set in Vercel dashboard):
 *   SUPABASE_URL          → your project URL
 *   SUPABASE_SERVICE_KEY  → service role key (NOT anon key)
 *
 * Supabase table schema (run in SQL editor):
 *   create table waitlist (
 *     id         bigint generated always as identity primary key,
 *     email      text not null unique,
 *     created_at timestamptz default now()
 *   );
 */

const { createClient } = require('@supabase/supabase-js');

// ── Supabase client (initialised once per cold start) ────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

  // Parse + validate email
  const { email } = req.body || {};

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
    .insert([{ email: trimmed }]);

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

  return res.status(201).json({
    message: "You're on the list! We'll reach out when we launch.",
  });
};
