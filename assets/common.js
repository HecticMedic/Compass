// Shared helpers for every Compass app. Data lives in this browser's
// localStorage under "compass:<key>", so nothing leaves the device.

const Store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('compass:' + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('compass:' + key, JSON.stringify(value));
    } catch {
      alert('Could not save. Your browser storage may be full or blocked.');
    }
  },
  // Every compass:* entry, for backups.
  dump() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('compass:')) out[k] = localStorage.getItem(k);
    }
    return out;
  },
  restore(data) {
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith('compass:') && typeof v === 'string') localStorage.setItem(k, v);
    }
  },
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Dates are handled as local "YYYY-MM-DD" strings so time zones never shift a day.
function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

function friendlyDate(s) {
  const diff = daysBetween(isoDate(), s);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return parseDate(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// Next due date for a repeating chore, counted from `from`.
function nextDue(repeat, from) {
  switch (repeat) {
    case 'day': return addDays(from, 1);
    case '3day': return addDays(from, 3);
    case 'week': return addDays(from, 7);
    case '2week': return addDays(from, 14);
    case 'month':
    case '3month': {
      const d = parseDate(from);
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + (repeat === 'month' ? 1 : 3));
      // Keep the 31st from spilling into the next month.
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, last));
      return isoDate(d);
    }
  }
}

// ---- Claude ----
// The API key lives outside the "compass:" namespace so backups never include it.
const AI_KEY = 'compass-secret:apiKey';

function hasAIKey() {
  try { return !!localStorage.getItem(AI_KEY); } catch { return false; }
}

const COMPASS_ROOT = document.querySelector('meta[name="compass-root"]')?.content || './';

// Loads assets/ai.js on first use, so pages stay light until Claude is needed.
function getAI() {
  return import(new URL(COMPASS_ROOT + 'assets/ai.js', location.href).href);
}

// Runs an AI action on a button: shows a busy label, reports errors kindly.
async function withAI(button, busyLabel, fn) {
  const label = button.innerHTML;
  button.disabled = true;
  button.innerHTML = busyLabel;
  try {
    const AI = await getAI();
    await fn(AI);
  } catch (err) {
    alert(err.friendly || 'Something went wrong talking to Claude. Please try again.');
    console.error(err);
  } finally {
    button.disabled = false;
    button.innerHTML = label;
  }
}

// Wires up a .tabs bar: buttons with data-tab="x" show the element #tab-x.
function setupTabs(onChange) {
  const buttons = document.querySelectorAll('.tabs button');
  const show = name => {
    buttons.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('[id^="tab-"]').forEach(p => p.classList.toggle('hidden', p.id !== 'tab-' + name));
    onChange?.(name);
  };
  buttons.forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
  show(buttons[0].dataset.tab);
  return show;
}

// Shows elements marked .ai-only once a Claude key is set up.
document.addEventListener('DOMContentLoaded', () => {
  if (hasAIKey()) document.querySelectorAll('.ai-only').forEach(el => el.classList.remove('hidden'));
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(COMPASS_ROOT + 'sw.js').catch(() => {});
}
