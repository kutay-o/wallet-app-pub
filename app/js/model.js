// Veri modeli ve hesaplamalar. DOM'a dokunmaz; testlerde Node ile çalışır.
//
// item: { id, type, kind, name, icon, bank, amount, day, recurrence: 'monthly'|'installments'|'once',
//         startYm, endYm?, installments?, date?, auto, debt?, note?, createdAt }
// records["<id>|YYYY-MM"]: { paid?: bool, amount?: number }

import { TYPES } from './parse.js';

const pad = (n) => String(n).padStart(2, '0');

export const ymOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const isoOf = (d) => `${ymOf(d)}-${pad(d.getDate())}`;
export function ymAdd(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return ymOf(d);
}
export function ymDiff(a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}
export const daysInMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

export function emptyState() {
  return { version: 1, items: [], records: {} };
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Taslağı (formdan ya da hızlı eklemeden) kalıcı kaleme çevirir.
export function makeItem(draft, startYm) {
  const t = TYPES[draft.type] || TYPES.other;
  const item = {
    id: draft.id || uid(),
    type: draft.type in TYPES ? draft.type : 'other',
    kind: t.kind,
    name: (draft.name || t.label).trim(),
    icon: draft.icon || t.icon,
    bank: draft.bank || '',
    amount: Number(draft.amount) || 0,
    day: Math.min(31, Math.max(1, Number(draft.day) || 1)),
    recurrence: draft.recurrence || 'monthly',
    startYm: draft.startYm || startYm,
    auto: draft.auto ?? t.kind === 'income',
    createdAt: draft.createdAt || Date.now(),
  };
  if (draft.note) item.note = draft.note;
  if (item.type === 'card' && Number(draft.debt) > 0) item.debt = Number(draft.debt);
  if (item.recurrence === 'installments') {
    item.installments = Math.max(1, Number(draft.installments) || 1);
    item.endYm = ymAdd(item.startYm, item.installments - 1);
  } else if (item.recurrence === 'once') {
    item.date = draft.date || `${item.startYm}-${pad(item.day)}`;
    item.startYm = item.date.slice(0, 7);
    item.day = Number(item.date.slice(8));
  } else if (draft.endYm) {
    item.endYm = draft.endYm;
  }
  return item;
}

export function isActive(item, ym) {
  if (item.recurrence === 'once') return item.date.slice(0, 7) === ym;
  return ym >= item.startYm && (!item.endYm || ym <= item.endYm);
}

export function occurrence(state, item, ym, todayIso) {
  const key = `${item.id}|${ym}`;
  const rec = state.records[key] || {};
  const date = item.recurrence === 'once' ? item.date : `${ym}-${pad(Math.min(item.day, daysInMonth(ym)))}`;
  const amount = rec.amount ?? item.amount;
  // Elle işaretlenmediyse: otomatik kalemler (maaş, talimatlı ödemeler) günü gelince "tamam" sayılır;
  // uygulamaya eklenmeden önceki tarihler de zaten ödenmiş kabul edilir.
  const createdIso = item.createdAt ? isoOf(new Date(item.createdAt)) : '';
  const paid = rec.paid ?? ((item.auto && date <= todayIso) || date < createdIso);
  const overdue = !paid && item.kind === 'expense' && date < todayIso;
  let installmentNo = null;
  if (item.recurrence === 'installments') installmentNo = ymDiff(item.startYm, ym) + 1;
  return { key, item, ym, date, amount, paid, overdue, installmentNo };
}

export function occurrences(state, ym, todayIso) {
  return state.items
    .filter((it) => isActive(it, ym))
    .map((it) => occurrence(state, it, ym, todayIso))
    .sort((a, b) => a.date.localeCompare(b.date) || a.item.name.localeCompare(b.item.name, 'tr'));
}

export function summary(state, ym, todayIso) {
  const occ = occurrences(state, ym, todayIso);
  const s = { occ, income: 0, incomeIn: 0, expense: 0, expensePaid: 0, unpaidCount: 0 };
  for (const o of occ) {
    if (o.item.kind === 'income') {
      s.income += o.amount;
      if (o.paid) s.incomeIn += o.amount;
    } else {
      s.expense += o.amount;
      if (o.paid) s.expensePaid += o.amount;
      else s.unpaidCount++;
    }
  }
  s.toPay = s.expense - s.expensePaid;
  s.endOfMonth = s.income - s.expense; // ay sonunda kalacak
  s.inHand = s.incomeIn - s.expensePaid; // şu an elde (bu ay)
  return s;
}

// Önceki aylardan ödenmemiş kalan giderler (son 3 ay).
export function pastOverdue(state, currentYm, todayIso, lookback = 3) {
  const out = [];
  for (let i = lookback; i >= 1; i--) {
    const ym = ymAdd(currentYm, -i);
    for (const o of occurrences(state, ym, todayIso)) {
      if (o.item.kind === 'expense' && !o.paid && o.item.createdAt <= endOfYm(ym)) out.push(o);
    }
  }
  return out;
}

function endOfYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 1).getTime();
}

// Banka bazında borç dökümü.
export function debts(state, currentYm, todayIso) {
  const rows = [];
  for (const it of state.items) {
    if (it.kind !== 'expense') continue;
    if (it.type === 'card') {
      if (it.endYm && it.endYm < currentYm) continue;
      const occ = isActive(it, currentYm) ? occurrence(state, it, currentYm, todayIso) : null;
      const total = it.debt ?? (occ && !occ.paid ? occ.amount : 0);
      rows.push({ item: it, total, monthly: occ ? occ.amount : it.amount, paidThisMonth: occ ? occ.paid : false });
    } else if (it.recurrence === 'installments') {
      if (it.endYm < currentYm) continue;
      let total = 0;
      let left = 0;
      for (let ym = currentYm > it.startYm ? currentYm : it.startYm; ym <= it.endYm; ym = ymAdd(ym, 1)) {
        const o = occurrence(state, it, ym, todayIso);
        if (!o.paid) { total += o.amount; left++; }
      }
      rows.push({ item: it, total, left, monthly: it.amount, endYm: it.endYm });
    }
  }
  const groups = new Map();
  for (const r of rows) {
    const g = r.item.bank || 'Diğer';
    if (!groups.has(g)) groups.set(g, { bank: g, total: 0, rows: [] });
    const grp = groups.get(g);
    grp.total += r.total;
    grp.rows.push(r);
  }
  const list = [...groups.values()].sort((a, b) => b.total - a.total);
  return { groups: list, total: list.reduce((s, g) => s + g.total, 0) };
}

// Bundan sonraki N gün içindeki ödenmemiş giderler (aylar arası).
export function upcoming(state, todayIso, days = 35) {
  const ym = todayIso.slice(0, 7);
  const end = new Date(todayIso + 'T12:00:00');
  end.setDate(end.getDate() + days);
  const endIso = isoOf(end);
  const out = [];
  for (let m = ym; m <= endIso.slice(0, 7); m = ymAdd(m, 1)) {
    for (const o of occurrences(state, m, todayIso)) {
      if (o.item.kind === 'expense' && !o.paid && o.date >= todayIso && o.date <= endIso) out.push(o);
    }
  }
  return out;
}

export function validateState(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.items) || typeof obj.records !== 'object') {
    throw new Error('Geçersiz yedek dosyası');
  }
  return { version: 1, items: obj.items, records: obj.records || {} };
}

// iOS Takvim'e eklenebilir .ics (her kalem için aylık tekrar + 1 gün önce hatırlatma)
export function toICS(state, fmt) {
  const esc = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cebim//TR', 'CALSCALE:GREGORIAN'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  for (const it of state.items) {
    if (it.kind !== 'expense') continue;
    const startYm = it.startYm;
    const day = it.recurrence === 'once' ? Number(it.date.slice(8)) : Math.min(it.day, daysInMonth(startYm));
    const dt = `${startYm.replace('-', '')}${pad(day)}`;
    lines.push('BEGIN:VEVENT', `UID:${it.id}@cebim`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${dt}`,
      `SUMMARY:${esc(`${it.icon} ${it.name} – ${fmt(it.amount)}`)}`);
    if (it.recurrence !== 'once') {
      // Ayın 31'i gibi günler kısa aylarda atlanmasın diye BYMONTHDAY=-1 kullan.
      const byDay = it.day >= 29 ? `;BYMONTHDAY=${it.day === 31 ? -1 : it.day}` : '';
      const until = it.endYm ? `;COUNT=${ymDiff(startYm, it.endYm) + 1}` : '';
      lines.push(`RRULE:FREQ=MONTHLY${byDay}${until}`);
    }
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(it.name)}`, 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
