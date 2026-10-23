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

if ('serviceWorker' in navigator) {
  const root = document.querySelector('meta[name="compass-root"]')?.content || './';
  navigator.serviceWorker.register(root + 'sw.js').catch(() => {});
}
