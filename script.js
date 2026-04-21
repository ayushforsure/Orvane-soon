/**
 * ORVANE — script.js
 * All interactive logic: scroll reveal, parallax, counters, waitlist form.
 * Pure vanilla JS — no libraries. requestAnimationFrame for all motion.
 */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════
     1.  SCROLL REVEAL — IntersectionObserver
  ═══════════════════════════════════════════════════════ */
  const revealEls = document.querySelectorAll('.reveal');

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  revealEls.forEach((el) => revealObserver.observe(el));

  /* ═══════════════════════════════════════════════════════
     2.  ANIMATED COUNTERS — triggered on scroll entry
  ═══════════════════════════════════════════════════════ */
  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animateCounter(el, target, duration) {
    duration = duration || 2000;
    const start = performance.now();

    function tick(now) {
      const elapsed  = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const value    = Math.round(easeOut(progress) * target);

      if (target === 80) {
        el.innerHTML = value + '<span class="small">%</span>';
      } else if (target === 4200) {
        el.textContent = value.toLocaleString();
      } else if (target === 6) {
        el.innerHTML = '<span class="small">&lt;</span>' + value + '<span class="small">min</span>';
      }

      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  const statCards = document.querySelectorAll('.stat-card');

  const statObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const numEl  = entry.target.querySelector('.stat-num');
          const target = parseInt(numEl.dataset.target, 10);
          if (target) animateCounter(numEl, target);
          statObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.4 }
  );

  statCards.forEach((c) => statObserver.observe(c));

  /* ═══════════════════════════════════════════════════════
     3.  NAV — frosted glass on scroll
  ═══════════════════════════════════════════════════════ */
  const nav = document.getElementById('main-nav');

  window.addEventListener(
    'scroll',
    function () {
      nav.classList.toggle('scrolled', window.scrollY > 40);
    },
    { passive: true }
  );

  /* ═══════════════════════════════════════════════════════
     4.  LIGHTWEIGHT PARALLAX — rAF + LERP (desktop only)
         Completely idles when mouse is still.
  ═══════════════════════════════════════════════════════ */
  var isTouch = window.matchMedia('(pointer: coarse)').matches;

  if (!isTouch) {
    var blobs = document.querySelectorAll('.blob');
    var mx = 0, my = 0, lx = 0, ly = 0, rafId = null;

    window.addEventListener(
      'mousemove',
      function (e) {
        mx = e.clientX / window.innerWidth  - 0.5;
        my = e.clientY / window.innerHeight - 0.5;
        if (!rafId) rafId = requestAnimationFrame(parallax);
      },
      { passive: true }
    );

    function parallax() {
      lx += (mx - lx) * 0.05;
      ly += (my - ly) * 0.05;

      blobs.forEach(function (b, i) {
        var factor = (i + 1) * 10;
        b.style.transform = 'translate3d(' + (lx * factor) + 'px,' + (ly * factor) + 'px,0)';
      });

      if (Math.abs(mx - lx) > 0.0005 || Math.abs(my - ly) > 0.0005) {
        rafId = requestAnimationFrame(parallax);
      } else {
        rafId = null;
      }
    }
  }

  /* ═══════════════════════════════════════════════════════
     5.  WAITLIST FORM — POSTs to /api/waitlist (Supabase)
         Captures: email, name, source (from URL ?source=)
  ═══════════════════════════════════════════════════════ */
  const form      = document.getElementById('wl-form');
  const btn       = document.getElementById('wl-btn');
  const nameInput = document.getElementById('wl-name');
  const inp       = document.getElementById('wl-email');
  const msgEl     = document.getElementById('form-message');

  // Detect traffic source from URL (?source=twitter, etc.)
  const source = new URLSearchParams(window.location.search).get('source') || 'website';

  // ── Helpers ────────────────────────────────────────────
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function showMessage(text, type) {
    msgEl.textContent   = text;
    msgEl.className     = 'form-message ' + type;
    msgEl.style.display = 'block';
    requestAnimationFrame(function () { msgEl.style.opacity = '1'; });
  }

  function clearMessage() {
    msgEl.style.opacity = '0';
    msgEl.style.display = 'none';
    msgEl.className     = 'form-message';
    msgEl.textContent   = '';
  }

  function setLoading(loading) {
    btn.disabled = loading;
    if (loading) { btn.classList.add('loading'); }
    else         { btn.classList.remove('loading'); }
  }

  function setSuccess() {
    btn.textContent      = '✓ You\'re in';
    btn.style.background = '#5A8A60';
    btn.style.color      = '#fff';
    btn.disabled         = true;
    nameInput.value      = '';
    inp.value            = '';
    nameInput.disabled   = true;
    inp.disabled         = true;
  }

  // ── Client-side validation ─────────────────────────────
  function validateInputs(name, email) {
    if (!name)                  return 'Please enter your name.';
    if (!email)                 return 'Please enter your email address.';
    if (!EMAIL_RE.test(email))  return 'Please enter a valid email address.';
    return null;
  }

  // ── Submit handler ─────────────────────────────────────
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearMessage();

      var name  = nameInput.value.trim();
      var email = inp.value.trim();
      var err   = validateInputs(name, email);

      if (err) {
        showMessage(err, 'error');
        (name ? inp : nameInput).focus();
        return;
      }

      setLoading(true);

      fetch('/api/waitlist', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email, name: name, source: source }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (result) {
          setLoading(false);
          if (result.status === 200 || result.status === 201) {
            setSuccess();
            showMessage(result.data.message || "You're on the list!", 'success');
          } else {
            showMessage(result.data.error || 'Something went wrong. Please try again.', 'error');
          }
        })
        .catch(function () {
          setLoading(false);
          showMessage('Network error — please check your connection and try again.', 'error');
        });
    });

    // Live-clear error message while user types
    [nameInput, inp].forEach(function (el) {
      el.addEventListener('input', function () {
        if (msgEl.classList.contains('error')) clearMessage();
      });
    });
  }
})();

