import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, makeItem, summary, debts, occurrences, pastOverdue, toICS } from '../app/js/model.js';

const OLD = new Date(2026, 8, 1).getTime();
function setup() {
  const s = emptyState();
  s.items.push(makeItem({ type: 'salary', name: 'Maaş', amount: 80000, day: 15 , createdAt: OLD }, '2026-10'));
  s.items.push(makeItem({ type: 'rent', name: 'Kira', amount: 20000, day: 5 , createdAt: OLD }, '2026-10'));
  s.items.push(makeItem({ type: 'loan', name: 'Akbank Kredi', bank: 'Akbank', amount: 5000, day: 10, recurrence: 'installments', installments: 3 , createdAt: OLD }, '2026-10'));
  s.items.push(makeItem({ type: 'card', name: 'Garanti kart', bank: 'Garanti BBVA', amount: 7000, day: 28, debt: 30000 , createdAt: OLD }, '2026-10'));
  return s;
}

test('aylık özet', () => {
  const s = setup();
  const r = summary(s, '2026-10', '2026-10-20');
  assert.equal(r.income, 80000);
  assert.equal(r.incomeIn, 80000); // maaş otomatik, 15'i geçti
  assert.equal(r.expense, 32000);
  assert.equal(r.endOfMonth, 48000);
  assert.equal(r.expensePaid, 0);
  s.records[`${s.items[1].id}|2026-10`] = { paid: true };
  const r2 = summary(s, '2026-10', '2026-10-20');
  assert.equal(r2.expensePaid, 20000);
  assert.equal(r2.inHand, 60000);
});

test('ay bazında tutar değişikliği', () => {
  const s = setup();
  s.records[`${s.items[3].id}|2026-11`] = { amount: 9000 };
  const occ = occurrences(s, '2026-11', '2026-10-20');
  assert.equal(occ.find((o) => o.item.type === 'card').amount, 9000);
});

test('taksitler bitince kalem görünmez', () => {
  const s = setup();
  assert.ok(occurrences(s, '2026-12', '2026-10-20').some((o) => o.item.type === 'loan'));
  assert.ok(!occurrences(s, '2027-01', '2026-10-20').some((o) => o.item.type === 'loan'));
});

test('banka borçları', () => {
  const s = setup();
  s.records[`${s.items[2].id}|2026-10`] = { paid: true };
  const d = debts(s, '2026-10', '2026-10-20');
  assert.equal(d.total, 30000 + 10000);
  const ak = d.groups.find((g) => g.bank === 'Akbank');
  assert.equal(ak.rows[0].left, 2);
});

test('31 çeken gün kısa ayda son güne kayar', () => {
  const s = emptyState();
  s.items.push(makeItem({ type: 'bill', name: 'X', amount: 1, day: 31 }, '2027-02'));
  assert.equal(occurrences(s, '2027-02', '2027-01-01')[0].date, '2027-02-28');
});

test('geçmiş aydan kalan ödemeler', () => {
  const s = emptyState();
  const it = makeItem({ type: 'rent', name: 'Kira', amount: 100, day: 5, createdAt: new Date(2026, 7, 1).getTime() }, '2026-08');
  s.items.push(it);
  s.records[`${it.id}|2026-08`] = { paid: true };
  const late = pastOverdue(s, '2026-10', '2026-10-20');
  assert.deepEqual(late.map((o) => o.ym), ['2026-09']);
});

test('ics çıktısı', () => {
  const ics = toICS(setup(), (v) => `${v} TL`);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /RRULE:FREQ=MONTHLY;COUNT=3/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
});

test('eklenmeden önceki tarihler ödenmiş sayılır', () => {
  const s = emptyState();
  const it = makeItem({ type: 'subscription', name: 'Netflix', amount: 230, day: 8, createdAt: new Date(2026, 9, 24, 10).getTime() }, '2026-10');
  s.items.push(it);
  const o = occurrences(s, '2026-10', '2026-10-24')[0];
  assert.equal(o.paid, true);
  assert.equal(o.overdue, false);
  assert.equal(occurrences(s, '2026-11', '2026-11-10')[0].paid, false);
});
