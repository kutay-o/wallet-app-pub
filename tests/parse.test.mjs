import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuick, parseAmount } from '../app/js/parse.js';

const today = new Date(2026, 9, 24);
const p = (s) => parseQuick(s, today).draft;

test('tutar biçimleri', () => {
  assert.equal(parseAmount('15.000'), 15000);
  assert.equal(parseAmount('1.250,50'), 1250.5);
  assert.equal(parseAmount('12,5'), 12.5);
  assert.equal(parseAmount('15000'), 15000);
  assert.ok(Number.isNaN(parseAmount('abc')));
});

test('kira: tutar ve gün', () => {
  assert.deepEqual(
    (({ type, name, amount, day, recurrence }) => ({ type, name, amount, day, recurrence }))(p('Kira 15000 5')),
    { type: 'rent', name: 'Kira', amount: 15000, day: 5, recurrence: 'monthly' });
});

test('maaş, "bin" ve kesme işaretli gün', () => {
  const d = p("maas 85bin 15'inde");
  assert.equal(d.type, 'salary');
  assert.equal(d.name, 'Maaş');
  assert.equal(d.amount, 85000);
  assert.equal(d.day, 15);
});

test('banka kartı', () => {
  const d = p('Garanti kart 12.500 20');
  assert.equal(d.type, 'card');
  assert.equal(d.bank, 'Garanti BBVA');
  assert.equal(d.amount, 12500);
  assert.equal(d.day, 20);
});

test('taksitli kredi', () => {
  const d = p('İş Bankası ihtiyaç kredisi 6.150 3 24 taksit');
  assert.equal(d.type, 'loan');
  assert.equal(d.bank, 'İş Bankası');
  assert.equal(d.name, 'İş Bankası ihtiyaç kredisi');
  assert.equal(d.installments, 24);
  assert.equal(d.amount, 6150);
  assert.equal(d.day, 3);
});

test('"Yapı Kredi" kredi sayılmaz, kart sayılır', () => {
  const d = p('Yapı Kredi 3500 12');
  assert.equal(d.type, 'card');
  assert.equal(d.bank, 'Yapı Kredi');
});

test('faturalar ve abonelik', () => {
  assert.equal(p('Elektrik 900 25').icon, '⚡');
  assert.equal(p('su 300 12').name, 'Su');
  assert.equal(p('Netflix 229,99 8').amount, 229.99);
  assert.equal(p('Netflix 229,99 8').type, 'subscription');
});

test('ay adıyla tek seferlik ödeme', () => {
  const d = p('MTV 5.400 15 ocak');
  assert.equal(d.recurrence, 'once');
  assert.equal(d.date, '2027-01-15');
});

test('tutar yoksa ok=false', () => {
  assert.equal(parseQuick('kira', today).ok, false);
});
