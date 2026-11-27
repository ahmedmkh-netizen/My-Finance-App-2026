// Checks the "لم تسجّل اليوم" reminder in family.html (no network, no real data).
const fs = require('fs');
const assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../family.html', 'utf8');
const m = src.match(/function checkReminders\(\)\{[\s\S]*?\n\}\nfunction notifyReminder/);
assert(m, 'checkReminders not found');
const fnSrc = m[0].replace(/function notifyReminder$/, '');

function run({ loaded, txs, hourUTC }) {
  const RealDate = Date;
  const fixed = new RealDate(Date.UTC(2026, 10, 27, hourUTC, 0, 0));
  class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(fixed.getTime()); } static now() { return fixed.getTime(); } }
  const calls = [];
  const store = {};
  const ctx = {
    Date: FakeDate, Intl, Number, currentUser: { id: 'u1' }, budget: 0, viewDataLoaded: loaded,
    cachedTx: txs, CAIRO_TZ: 'Africa/Cairo', REMINDERS_LAST_CHECK: 'k',
    localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    isoDate: () => '2026-11-27', notifyReminder: (t) => calls.push(t), fmt: String,
  };
  const f = new Function(...Object.keys(ctx), fnSrc + '; return checkReminders;')(...Object.values(ctx));
  f();
  return calls.length;
}
// 21:00 Cairo = 19:00 UTC in late November (UTC+2)
assert.strictEqual(run({ loaded: false, txs: [], hourUTC: 19 }), 0, 'must not fire before data loaded');
assert.strictEqual(run({ loaded: true, txs: [{ _isoDate: '2026-11-27', createdBy: 'other' }], hourUTC: 19 }), 0, 'entry by another user counts');
assert.strictEqual(run({ loaded: true, txs: [{ _isoDate: '2026-11-27' }], hourUTC: 19 }), 0, 'entry without createdBy (from Daftari) counts');
assert.strictEqual(run({ loaded: true, txs: [], hourUTC: 19 }), 1, 'fires when nothing recorded today');
assert.strictEqual(run({ loaded: true, txs: [], hourUTC: 17 }), 0, 'not before 20:00 Cairo (19:00 Cairo = 17 UTC)');
console.log('5 tests passed');
