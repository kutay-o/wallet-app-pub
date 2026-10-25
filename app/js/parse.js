// Hızlı ekleme: "Kira 15000 5", "Garanti kart 12.500 20", "Akbank kredi 4.200 10 18 taksit"
// gibi serbest metni bir kalem taslağına çevirir.

export const TYPES = {
  salary:       { label: 'Maaş',        kind: 'income',  icon: '💼' },
  income:       { label: 'Ek gelir',    kind: 'income',  icon: '💰' },
  card:         { label: 'Kredi kartı', kind: 'expense', icon: '💳', bank: true },
  loan:         { label: 'Kredi',       kind: 'expense', icon: '🏦', bank: true },
  rent:         { label: 'Kira',        kind: 'expense', icon: '🏠' },
  dues:         { label: 'Aidat',       kind: 'expense', icon: '🏢' },
  bill:         { label: 'Fatura',      kind: 'expense', icon: '🧾' },
  subscription: { label: 'Abonelik',    kind: 'expense', icon: '🔁' },
  other:        { label: 'Diğer gider', kind: 'expense', icon: '📌' },
};

export const BANKS = [
  ['Garanti BBVA', /\b(garanti|bbva|bonus)\b/],
  ['İş Bankası', /\b(is ?bank(asi)?|isbank|maximum)\b/],
  ['Yapı Kredi', /\b(yapi ?kredi|ykb|world)\b/],
  ['Akbank', /\b(akbank|axess)\b/],
  ['Ziraat', /\b(ziraat|bankkart)\b/],
  ['Halkbank', /\b(halk ?bank(asi)?|paraf)\b/],
  ['VakıfBank', /\b(vakif ?bank|vakif)\b/],
  ['QNB', /\b(qnb|finansbank|cardfinans)\b/],
  ['Enpara', /\benpara\b/],
  ['DenizBank', /\bdeniz ?bank\b/],
  ['TEB', /\bteb\b/],
  ['ING', /\bing\b/],
  ['Kuveyt Türk', /\bkuveyt( ?turk)?\b/],
  ['Türkiye Finans', /\bturkiye finans\b/],
  ['Şekerbank', /\bseker ?bank\b/],
  ['Fibabanka', /\bfiba ?banka\b/],
  ['Odeabank', /\bodea ?bank\b/],
  ['HSBC', /\bhsbc\b/],
  ['Albaraka', /\balbaraka\b/],
  ['Papara', /\bpapara\b/],
];

// Sıra önemli: daha özel kurallar önce.
const RULES = [
  { re: /\bmaas/, type: 'salary', name: 'Maaş' },
  { re: /\bkira geliri/, type: 'income', name: 'Kira geliri', icon: '🏘️' },
  { re: /\b(ek gelir|freelance|prim|ikramiye|gelir|harclik|burs)\b/, type: 'income' },
  { re: /\bkira/, type: 'rent', name: 'Kira' },
  { re: /\baidat/, type: 'dues', name: 'Aidat' },
  { re: /\belektrik/, type: 'bill', name: 'Elektrik', icon: '⚡' },
  { re: /\b(dogal ?gaz|gaz)\b|\bdogalgaz/, type: 'bill', name: 'Doğalgaz', icon: '🔥' },
  { re: /\b(internet|fiber|modem|superonline|turknet)\b/, type: 'bill', name: 'İnternet', icon: '🌐' },
  { re: /\b(telefon|gsm|turkcell|vodafone|hat)\b/, type: 'bill', name: 'Telefon', icon: '📱' },
  { re: /\bsu\b|\bsu fatura/, type: 'bill', name: 'Su', icon: '💧' },
  { re: /\b(netflix|spotify|youtube|disney|prime|icloud|exxen|blutv|tabii|gain|abonelik|uyelik|spor salonu|gym|chatgpt|claude)\b/, type: 'subscription' },
  { re: /\b(kart|kartim|kredi karti|ekstre)\b|\bkart/, type: 'card' },
  { re: /\b(kredi|kredisi|taksit|ihtiyac|konut|tasit)\b/, type: 'loan' },
  { re: /\b(fatura|faturasi)\b/, type: 'bill' },
  { re: /\b(sigorta|okul|kurs|vergi|mtv|egitim)\b/, type: 'other' },
];

const MONTHS = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];

const FILLER = /\b(her|ayin|ayın|ayda|aylik|aylık|gunu|günü|gun|gün|tl|lira|try|taksit|taksitli|kaldi|kaldı|kalan|tek|sefer|seferlik|bir|kez|kere|odeme|ödeme|son)\b/giu;

// Türkçe karakterleri sadeleştirip küçük harfe çevirir (eşleştirme için).
export function fold(s) {
  return String(s)
    .toLocaleLowerCase('tr')
    .replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g').replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u').replace(/[çÇ]/g, 'c')
    .replace(/[âà]/g, 'a').replace(/[î]/g, 'i').replace(/[û]/g, 'u');
}

// "15.000" -> 15000, "1.250,50" -> 1250.5, "12,5" -> 12.5, "15000" -> 15000
export function parseAmount(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim().replace(/[₺\s]|tl$/gi, '');
  if (!s) return NaN;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^\d+,\d+$/.test(s)) s = s.replace(',', '.');
  else if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

const pad = (n) => String(n).padStart(2, '0');

export function parseQuick(text, today = new Date()) {
  const original = String(text || '').trim();
  const f = fold(original);
  const result = { type: null, name: '', icon: '', bank: '', amount: NaN, day: null, recurrence: 'monthly', installments: null, date: null };
  if (!original) return { ok: false, draft: result, missing: ['amount'] };

  // Banka
  let rest = f;
  let nameSrc = original;
  for (const [name, re] of BANKS) {
    const m = rest.match(re);
    if (m) {
      result.bank = name;
      rest = rest.replace(re, ' ');
      // fold() harf sayısını koruyorsa banka adını orijinal metinden de çıkar
      if (f.length === original.length) nameSrc = original.slice(0, m.index) + ' ' + original.slice(m.index + m[0].length);
      break;
    }
  }

  // Ay adı -> tek seferlik tarih ("5 kasım")
  let monthIdx = -1;
  const monthRe = new RegExp(`(?:(\\d{1,2})\\s*)?\\b(${MONTHS.join('|')})\\w*`);
  const mm = rest.match(monthRe);
  let monthDay = null;
  if (mm) {
    monthIdx = MONTHS.indexOf(mm[2]);
    if (mm[1]) monthDay = Number(mm[1]);
    rest = rest.replace(mm[0], ' ');
  }

  // Taksit sayısı ("18 taksit", "12 ay")
  const tm = rest.match(/(\d{1,3})\s*(taksit|ay\b)/);
  if (tm) {
    result.installments = Number(tm[1]);
    result.recurrence = 'installments';
    rest = rest.replace(tm[0], ' ');
  }

  // Açıkça gün belirtilmiş mi? ("ayın 5'i", "15'inde", "5. gün")
  let explicitDay = null;
  const dm = rest.match(/ayin\s*(\d{1,2})\b|(\d{1,2})\s*(?:'|’)\s*\w*|(\d{1,2})\s*\.\s*gun|(\d{1,2})\s*(?:inde|sinde|unde|nde|nda)\b/);
  if (dm) {
    const v = Number(dm[1] || dm[2] || dm[3] || dm[4]);
    if (v >= 1 && v <= 31) { explicitDay = v; rest = rest.replace(dm[0], ' '); }
  }

  // Kalan sayılar
  const nums = [];
  const numRe = /(\d[\d.,]*)\s*(bin|k)?\b/g;
  let n;
  while ((n = numRe.exec(rest))) {
    let raw = n[1].replace(/[.,]$/, '');
    let v = parseAmount(raw);
    if (Number.isNaN(v)) continue;
    const mult = !!n[2];
    if (mult) v *= 1000;
    nums.push({ v, big: mult || /[.,]\d{3}/.test(raw) || v > 31, int: Number.isInteger(v) });
  }
  if (nums.length) {
    // Tutar: en büyük sayı; gün: 1-31 arası başka bir tam sayı.
    const sorted = [...nums].sort((a, b) => b.v - a.v);
    result.amount = sorted[0].v;
    const dayCand = nums.find((x) => x !== sorted[0] && x.int && !x.big && x.v >= 1 && x.v <= 31);
    if (dayCand && explicitDay == null) explicitDay = dayCand.v;
  }
  if (monthDay && explicitDay == null) explicitDay = monthDay;
  result.day = explicitDay;

  if (/\b(tek seferlik|tek sefer|bir kez|bir kere|tek)\b/.test(f) || monthIdx >= 0) {
    result.recurrence = 'once';
    result.installments = null;
    const y = today.getFullYear();
    let m = monthIdx >= 0 ? monthIdx : today.getMonth();
    let year = y;
    if (monthIdx >= 0 && monthIdx < today.getMonth()) year = y + 1;
    const d = Math.min(explicitDay || today.getDate(), new Date(year, m + 1, 0).getDate());
    result.date = `${year}-${pad(m + 1)}-${pad(d)}`;
  }

  // Tür
  let rule = RULES.find((r) => r.re.test(rest));
  if (!rule && result.bank) rule = { type: result.installments ? 'loan' : 'card' };
  if (!rule && result.installments) rule = { type: 'loan' };
  result.type = rule ? rule.type : 'other';
  result.icon = (rule && rule.icon) || TYPES[result.type].icon;

  // Ad: sayıları ve dolgu kelimelerini atılmış orijinal metin
  let name = nameSrc
    .replace(/\d[\d.,]*\s*(bin|k)?\b(\s*(['’]\S*|inde|sinde|nde|nda|\.\s*gün))?/giu, ' ')
    .replace(/[₺]/g, ' ')
    .replace(FILLER, ' ');
  if (mm) name = name.replace(new RegExp(`\\b${mm[2]}\\S*`, 'i'), ' ').replace(/\b(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\S*/gi, ' ');
  name = name.replace(/\s+/g, ' ').trim();
  const words = name ? name.split(' ') : [];
  if (rule && rule.name && words.length <= 1) name = rule.name;
  if (!name) name = TYPES[result.type].label;
  if (result.bank) {
    const generic = /^(kart|kartı|kartim|kartım|kredi|kredisi|kredi kartı|kredi karti)$/i.test(name);
    const label = generic || name === TYPES[result.type].label ? TYPES[result.type].label : name;
    name = result.bank.endsWith('Kredi') && label.startsWith('Kredi ') ? `${result.bank} ${label.slice(6)}` : `${result.bank} ${label}`;
  }
  result.name = name.charAt(0).toLocaleUpperCase('tr') + name.slice(1);

  if (result.day == null) result.day = result.date ? Number(result.date.slice(8)) : today.getDate();
  const ok = Number.isFinite(result.amount) && result.amount > 0;
  return { ok, draft: result, missing: ok ? [] : ['amount'] };
}
