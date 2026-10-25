import { TYPES, BANKS, parseQuick, parseAmount } from './parse.js';
import {
  emptyState, makeItem, occurrence, occurrences, summary, debts, pastOverdue,
  ymOf, isoOf, ymAdd, ymDiff, isActive, validateState, toICS,
} from './model.js';

const KEY = 'cebim-v1';
const $ = (sel, root = document) => root.querySelector(sel);

// ---------- Depolama ----------
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return validateState(JSON.parse(raw));
  } catch (e) { console.warn(e); }
  return emptyState();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Kaydedilemedi: depolama dolu olabilir'); }
}
function pref(k, v) {
  try {
    if (v === undefined) return localStorage.getItem('cebim-' + k);
    localStorage.setItem('cebim-' + k, v);
  } catch { return null; }
}

let state = load();
const todayIso = () => isoOf(new Date());
const thisYm = () => ymOf(new Date());
const ui = { tab: pref('tab') || 'summary', ym: thisYm() };
if (!['summary', 'items', 'debts', 'settings'].includes(ui.tab)) ui.tab = 'summary';

// ---------- Biçimlendirme ----------
const nf0 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (v) => (Math.abs(v - Math.round(v)) < 0.005 ? nf0 : nf2).format(v);
const plainNum = (v) => (v ? String(v).replace('.', ',') : '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const monthName = (ym, opts = { month: 'long', year: 'numeric' }) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('tr-TR', opts);
};
const shortDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
const SUFFIX = { 0: 'u', 1: 'i', 2: 'si', 3: 'ü', 4: 'ü', 5: 'i', 6: 'sı', 7: 'si', 8: 'i', 9: 'u' };
const dayWord = (d) => `ayın ${d}'${d === 20 ? 'si' : SUFFIX[d % 10]}`;

function recurrenceText(d) {
  if (d.recurrence === 'once') return `${shortDate(d.date)} · tek sefer`;
  if (d.recurrence === 'installments') return `${d.installments} taksit · ${dayWord(Number(d.day))}`;
  return `Her ${dayWord(Number(d.day))}`;
}

// ---------- Ortak parçalar ----------
function dueBadge(o) {
  if (o.item.kind === 'income') return o.paid ? '<small class="badge green">alındı</small>' : '';
  if (o.paid) return '<small class="badge green">ödendi</small>';
  const diff = daysBetween(todayIso(), o.date);
  if (diff < 0) return `<small class="badge red">${-diff} gün gecikti</small>`;
  if (diff === 0) return '<small class="badge orange">bugün</small>';
  if (diff === 1) return '<small class="badge orange">yarın</small>';
  if (diff <= 7) return `<small class="badge blue">${diff} gün</small>`;
  return '';
}

function rowHtml(o, { showMonth = false } = {}) {
  const it = o.item;
  const sub = [shortDate(o.date)];
  if (showMonth && o.ym !== ui.ym) sub[0] = shortDate(o.date);
  if (o.installmentNo) sub.push(`${o.installmentNo}/${it.installments} taksit`);
  if (it.auto) sub.push(it.kind === 'income' ? 'otomatik' : 'talimatlı');
  if (it.bank && !it.name.includes(it.bank)) sub.push(it.bank);
  const cls = it.kind === 'income' ? 'income' : '';
  return `<div class="row ${o.paid ? 'done' : ''}" data-act="open-occ" data-id="${it.id}" data-ym="${o.ym}">
    <button class="check ${o.paid ? 'on' : ''} ${o.overdue ? 'overdue' : ''}" data-act="toggle" data-id="${it.id}" data-ym="${o.ym}" aria-label="${it.kind === 'income' ? 'Alındı' : 'Ödendi'}"></button>
    <div class="ico">${esc(it.icon)}</div>
    <div class="main"><div class="title">${esc(it.name)}</div><div class="sub">${esc(sub.join(' · '))}</div></div>
    <div class="amt num ${cls}">${it.kind === 'income' ? '+' : ''}${money(o.amount)}${dueBadge(o)}</div>
  </div>`;
}

const TEMPLATES = [
  { type: 'salary', name: 'Maaş', icon: '💼' },
  { type: 'card', name: 'Kredi kartı', icon: '💳' },
  { type: 'loan', name: 'Kredi', icon: '🏦', recurrence: 'installments' },
  { type: 'rent', name: 'Kira', icon: '🏠' },
  { type: 'dues', name: 'Aidat', icon: '🏢' },
  { type: 'bill', name: 'Elektrik', icon: '⚡' },
  { type: 'bill', name: 'Su', icon: '💧' },
  { type: 'bill', name: 'Doğalgaz', icon: '🔥' },
  { type: 'bill', name: 'İnternet', icon: '🌐' },
  { type: 'bill', name: 'Telefon', icon: '📱' },
  { type: 'subscription', name: 'Abonelik', icon: '🔁' },
  { type: 'other', name: 'Diğer gider', icon: '📌' },
  { type: 'income', name: 'Ek gelir', icon: '💰' },
];

function templatesHtml(list = TEMPLATES) {
  return `<div class="tpl-grid">${list.map((t, i) => `<button class="tpl" data-act="tpl" data-i="${TEMPLATES.indexOf(t)}"><span class="e">${t.icon}</span>${esc(t.name)}</button>`).join('')}</div>`;
}

// ---------- Görünümler ----------
const TITLES = { summary: 'Özet', items: 'Kalemler', debts: 'Borçlar', settings: 'Ayarlar' };

function render() {
  document.querySelectorAll('.tabbar [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
  const showMonth = ui.tab === 'summary' || ui.tab === 'items';
  $('#month-nav').hidden = !showMonth;
  $('#month-title').innerHTML = esc(monthName(ui.ym)) + (ui.ym === thisYm() ? '' : '<span class="today-dot" title="Bu aya dön"></span>');
  $('#page-title').textContent = TITLES[ui.tab];
  const view = $('#view');
  view.innerHTML = { summary: viewSummary, items: viewItems, debts: viewDebts, settings: viewSettings }[ui.tab]();
}

function viewEmpty() {
  return `<div class="empty">
    <div class="emoji">👛</div>
    <h2>Hadi başlayalım</h2>
    <p>Maaşını, kiranı, kartlarını bir kere ekle; her ay kendiliğinden tekrar eder. Alttaki <b>+</b> ile yazarak da ekleyebilirsin: <i>“Kira 15000 5”</i></p>
  </div>${templatesHtml(TEMPLATES.slice(0, 8))}`;
}

function viewSummary() {
  if (!state.items.length) return viewEmpty();
  const today = todayIso();
  const s = summary(state, ui.ym, today);
  const isCurrent = ui.ym === thisYm();
  const paidPct = s.expense ? Math.round((s.expensePaid / s.expense) * 100) : 0;
  const d = debts(state, thisYm(), today);

  let html = `<section class="hero">
    <div class="label">${isCurrent ? 'Ay sonunda kalacak' : ui.ym < thisYm() ? 'Ay sonunda kalan' : 'Bu ay kalacak (tahmini)'}</div>
    <div class="big num ${s.endOfMonth < 0 ? 'neg' : 'pos'}">${money(s.endOfMonth)}</div>
    <div class="eq num">${money(s.income)} gelir − ${money(s.expense)} gider</div>
    <div class="bar"><span style="width:${paidPct}%"></span></div>
    <div class="bar-label">Giderlerin %${paidPct}'i ödendi</div>
  </section>
  <div class="tiles">
    <div class="tile"><div class="label">Şu an elde</div><div class="val num ${s.inHand < 0 ? 'neg' : ''}">${money(s.inHand)}</div><div class="hint">alınan − ödenen</div></div>
    <div class="tile"><div class="label">Kalan ödeme</div><div class="val num">${money(s.toPay)}</div><div class="hint">${s.unpaidCount} kalem</div></div>
    ${d.total > 0 ? `<button class="tile wide" data-act="goto-debts"><div><div class="label">Toplam banka borcu</div><div class="val num">${money(d.total)}</div></div><span class="chev">›</span></button>` : ''}
  </div>`;

  if (isCurrent) {
    const past = pastOverdue(state, ui.ym, today);
    if (past.length) {
      html += `<div class="section-h"><h2>Geçmiş aylardan kalan</h2><span class="sum num neg">${money(past.reduce((a, o) => a + o.amount, 0))}</span></div>
        <div class="list">${past.map((o) => rowHtml(o, { showMonth: true })).join('')}</div>`;
    }
  }

  const exp = s.occ.filter((o) => o.item.kind === 'expense');
  const unpaid = exp.filter((o) => !o.paid);
  const paid = exp.filter((o) => o.paid);
  html += `<div class="section-h"><h2>Ödenecekler</h2><span class="sum num">${money(s.toPay)}</span></div>`;
  html += unpaid.length ? `<div class="list">${unpaid.map((o) => rowHtml(o)).join('')}</div>` : `<div class="note">${exp.length ? '🎉 Bu ayın tüm ödemeleri tamam.' : 'Bu ay için gider yok.'}</div>`;
  if (paid.length) {
    html += `<details class="done-list" ${pref('showPaid') === '1' ? 'open' : ''} data-pref="showPaid"><summary>Ödenenler (${paid.length}) · ${money(s.expensePaid)}</summary>
      <div class="list">${paid.map((o) => rowHtml(o)).join('')}</div></details>`;
  }
  const inc = s.occ.filter((o) => o.item.kind === 'income');
  html += `<div class="section-h"><h2>Gelirler</h2><span class="sum num">${money(s.income)}</span></div>`;
  html += inc.length ? `<div class="list">${inc.map((o) => rowHtml(o)).join('')}</div>` : `<div class="note">Gelir eklenmemiş. <button class="link" data-act="tpl" data-i="0">Maaş ekle</button></div>`;
  return html;
}

function viewItems() {
  if (!state.items.length) return viewEmpty();
  const occ = occurrences(state, ui.ym, todayIso());
  if (!occ.length) return `<div class="note">${esc(monthName(ui.ym))} için kalem yok.</div>`;
  const order = ['salary', 'income', 'card', 'loan', 'rent', 'dues', 'bill', 'subscription', 'other'];
  const groups = order.map((t) => ({ t, list: occ.filter((o) => o.item.type === t) })).filter((g) => g.list.length);
  return groups.map((g) => {
    const total = g.list.reduce((a, o) => a + o.amount, 0);
    const label = { salary: 'Maaş', income: 'Diğer gelirler', card: 'Kredi kartları', loan: 'Krediler', rent: 'Kira', dues: 'Aidat', bill: 'Faturalar', subscription: 'Abonelikler', other: 'Diğer' }[g.t];
    return `<div class="section-h"><h2>${label}</h2><span class="sum num">${money(total)}</span></div>
      <div class="list">${g.list.map((o) => rowHtml(o)).join('')}</div>`;
  }).join('') + `<p class="note">Bir kaleme dokunarak bu ayın tutarını değiştirebilir, düzenleyebilir ya da silebilirsin.</p>`;
}

function viewDebts() {
  const ym = thisYm();
  const d = debts(state, ym, todayIso());
  if (!d.groups.length) {
    return `<div class="empty"><div class="emoji">🏦</div><h2>Banka borcu yok</h2><p>Kredi kartı ya da kredi eklediğinde burada banka banka görürsün.</p></div>
      ${templatesHtml(TEMPLATES.slice(1, 3))}`;
  }
  let html = `<section class="hero"><div class="label">Toplam borç</div><div class="big num">${money(d.total)}</div>
    <div class="eq">${d.groups.length} banka · kart borçları + kalan kredi taksitleri</div></section>`;
  for (const g of d.groups) {
    html += `<div class="section-h"><h2>${esc(g.bank)}</h2><span class="sum num">${money(g.total)}</span></div><div class="list">`;
    for (const r of g.rows) {
      const it = r.item;
      let sub;
      if (it.type === 'card') {
        sub = `Bu ay: ${money(r.monthly)}${r.paidThisMonth ? ' (ödendi)' : ''}${it.debt == null ? ' · toplam borç girilmedi' : ''}`;
      } else {
        sub = `${r.left} taksit kaldı · ${money(r.monthly)}/ay · son: ${monthName(r.endYm, { month: 'short', year: 'numeric' })}`;
      }
      html += `<div class="row" data-act="open-occ" data-id="${it.id}" data-ym="${isActive(it, ym) ? ym : it.startYm}">
        <div class="ico">${esc(it.icon)}</div>
        <div class="main"><div class="title">${esc(it.name)}</div><div class="sub">${esc(sub)}</div></div>
        <div class="amt num">${money(r.total)}</div></div>`;
    }
    html += '</div>';
  }
  html += '<p class="note">Kart borcunu güncellemek için karta dokun. Kredilerde kalan borç, ödenmemiş taksitlerden hesaplanır.</p>';
  return html;
}

function viewSettings() {
  const count = state.items.length;
  return `<div class="list settings">
      <button class="row" data-act="export"><div class="ico">⬆️</div><div class="main"><div class="title">Yedek al</div><div class="sub">Tüm verileri dosya olarak kaydet / paylaş</div></div></button>
      <button class="row" data-act="import"><div class="ico">⬇️</div><div class="main"><div class="title">Yedekten geri yükle</div><div class="sub">Daha önce aldığın yedek dosyasını seç</div></div></button>
      <button class="row" data-act="ics"><div class="ico">📅</div><div class="main"><div class="title">Takvime ekle (hatırlatma)</div><div class="sub">Ödemeleri iPhone Takvim'e aktar, bir gün önce hatırlatsın</div></div></button>
    </div>
    <div class="section-h"><h2>Veri</h2></div>
    <div class="list settings">
      <button class="row" data-act="wipe"><div class="ico">🗑️</div><div class="main"><div class="title" style="color:var(--red)">Tüm verileri sil</div><div class="sub">${count} kalem kayıtlı</div></div></button>
    </div>
    <p class="note">Veriler yalnızca bu cihazda saklanır, hiçbir sunucuya gönderilmez. Uygulamayı Safari'de <b>Paylaş → Ana Ekrana Ekle</b> ile eklersen tam ekran açılır ve internet olmadan da çalışır. Ara sıra yedek almanı öneririm.</p>
    <input type="file" id="import-file" accept="application/json,.json" hidden>`;
}

// ---------- Alt sayfa ----------
let sheetEl = null;
function openSheet(html, onMount) {
  closeSheet(true);
  const root = $('#sheet-root');
  root.innerHTML = `<div class="backdrop" data-act="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div>${html}</div>`;
  sheetEl = $('.sheet', root);
  const bd = $('.backdrop', root);
  onMount && onMount(sheetEl);
  requestAnimationFrame(() => { bd.classList.add('show'); sheetEl.classList.add('show'); });
  return sheetEl;
}
function closeSheet(immediate) {
  const root = $('#sheet-root');
  if (!root.firstChild) return;
  if (immediate) { root.innerHTML = ''; sheetEl = null; return; }
  root.querySelector('.backdrop')?.classList.remove('show');
  root.querySelector('.sheet')?.classList.remove('show');
  const el = root.querySelector('.sheet');
  sheetEl = null;
  setTimeout(() => { if (root.contains(el)) root.innerHTML = ''; }, 260);
}

// Yeni taksitli kalem: bu ayın günü geçtiyse "kalan taksit" sayısı gelecek aydan başlar.
function startYmFor(draft) {
  if (draft.recurrence === 'installments' && ui.ym === thisYm() && Number(draft.day) < new Date().getDate()) return ymAdd(ui.ym, 1);
  return ui.ym;
}

// ---------- Hızlı ekleme ----------
const EXAMPLES = ['Maaş 85.000 15', 'Kira 18.000 5', 'Aidat 2.500 1', 'Garanti kart 12.500 20', 'Akbank kredi 4.200 10 18 taksit', 'Elektrik 900 25', 'Netflix 229,99 8'];

function openQuickAdd(prefill = '') {
  const added = [];
  openSheet(`
    <div class="sheet-top"><h2>Ekle</h2><button class="link" data-act="close-sheet">Bitti</button></div>
    <input class="input quick-input" id="qa" placeholder="ör. Kira 15000 5" autocomplete="off" autocorrect="off" enterkeyhint="done" value="${esc(prefill)}">
    <div id="qa-preview"></div>
    <div class="examples" id="qa-ex">${EXAMPLES.map((e) => `<button data-ex="${esc(e)}">${esc(e)}</button>`).join('')}</div>
    <div class="added" id="qa-added"></div>
    <h3>ya da seç</h3>
    ${templatesHtml()}
  `, (sh) => {
    const input = $('#qa', sh);
    const prev = $('#qa-preview', sh);
    let parsed = null;
    const update = () => {
      const txt = input.value.trim();
      $('#qa-ex', sh).hidden = !!txt;
      if (!txt) { prev.innerHTML = ''; parsed = null; return; }
      parsed = parseQuick(txt);
      const d = parsed.draft;
      const t = TYPES[d.type];
      prev.innerHTML = `<div class="preview">
          <div class="ico">${d.icon}</div>
          <div class="main"><div class="title">${esc(d.name)}</div><div class="sub">${esc(t.label)} · ${esc(recurrenceText(d))}</div></div>
          <div class="amt num ${t.kind === 'income' ? 'pos' : ''}">${parsed.ok ? money(d.amount) : '<span class="muted small">tutar?</span>'}</div>
        </div>
        <div class="preview-actions">
          <button class="btn primary" data-act="qa-add" ${parsed.ok ? '' : 'disabled style="opacity:.5"'}>Ekle</button>
          <button class="btn" data-act="qa-edit">Ayrıntılı</button>
        </div>`;
    };
    const add = () => {
      if (!parsed || !parsed.ok) { toast('Tutarı da yaz, ör. “Kira 15000 5”'); return; }
      const item = makeItem(parsed.draft, startYmFor(parsed.draft));
      state.items.push(item);
      save(); render();
      added.push(item.name);
      $('#qa-added', sh).innerHTML = `<b>✓</b> Eklendi: ${added.map(esc).join(', ')}`;
      input.value = '';
      update();
      input.focus();
      toast(`${item.name} eklendi`, 'Geri al', () => { removeItem(item.id); });
    };
    input.addEventListener('input', update);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    sh.addEventListener('click', (e) => {
      const ex = e.target.closest('[data-ex]');
      if (ex) { input.value = ex.dataset.ex; update(); input.focus(); return; }
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'qa-add') { e.stopPropagation(); add(); }
      if (a.dataset.act === 'qa-edit') { e.stopPropagation(); openForm(parsed ? parsed.draft : {}); }
    });
    update();
    input.focus();
  });
}

// ---------- Ayrıntılı form ----------
const POPULAR_BANKS = ['Garanti BBVA', 'İş Bankası', 'Yapı Kredi', 'Akbank', 'Ziraat', 'QNB', 'Enpara', 'VakıfBank', 'Halkbank', 'DenizBank', 'TEB', 'ING', 'Kuveyt Türk'];

function openForm(draftIn) {
  const editing = !!draftIn.id && state.items.some((i) => i.id === draftIn.id);
  const draft = {
    type: 'other', name: '', amount: '', day: new Date().getDate(), recurrence: 'monthly', bank: '',
    ...draftIn,
  };
  if (!draftIn.recurrence && draft.type === 'loan') draft.recurrence = 'installments';
  if (draft.auto === undefined) draft.auto = TYPES[draft.type].kind === 'income';
  if (!draft.date) draft.date = `${ui.ym}-${String(Math.min(Number(draft.day) || 1, 28)).padStart(2, '0')}`;

  const paint = (sh) => {
    const t = TYPES[draft.type];
    const amountLabel = { card: 'Bu ay ödenecek (ekstre)', loan: 'Aylık taksit', salary: 'Net maaş', bill: 'Tutar (tahmini olabilir)' }[draft.type] || 'Tutar';
    sh.querySelector('.form-body').innerHTML = `
      <div class="chips">${Object.entries(TYPES).map(([k, v]) => `<button class="chip ${k === draft.type ? 'on' : ''}" data-type="${k}">${v.icon} ${v.label}</button>`).join('')}</div>
      <label class="field"><span>Ad</span><input name="name" value="${esc(draft.name)}" placeholder="${esc(t.label)}" autocomplete="off"></label>
      ${t.bank ? `<label class="field"><span>Banka</span><input name="bank" value="${esc(draft.bank)}" placeholder="Banka adı" autocomplete="off"></label>
        <div class="chips">${POPULAR_BANKS.map((b) => `<button class="chip ${b === draft.bank ? 'on' : ''}" data-bank="${esc(b)}">${esc(b)}</button>`).join('')}</div>` : ''}
      <div class="field-row">
        <label class="field"><span>${amountLabel}</span><input name="amount" inputmode="decimal" value="${esc(plainNum(draft.amount))}" placeholder="0" autocomplete="off"></label>
        ${draft.recurrence === 'once' ? `<label class="field"><span>Tarih</span><input name="date" type="date" value="${esc(draft.date)}"></label>`
          : `<label class="field"><span>Ayın kaçında?</span><input name="day" type="number" inputmode="numeric" min="1" max="31" value="${esc(draft.day)}"></label>`}
      </div>
      ${draft.type === 'card' ? `<label class="field"><span>Toplam kart borcu (isteğe bağlı)</span><input name="debt" inputmode="decimal" value="${esc(plainNum(draft.debt))}" placeholder="ör. 45.000" autocomplete="off"></label>` : ''}
      <div class="seg">
        <button data-rec="monthly" class="${draft.recurrence === 'monthly' ? 'on' : ''}">Her ay</button>
        <button data-rec="installments" class="${draft.recurrence === 'installments' ? 'on' : ''}">Taksitli</button>
        <button data-rec="once" class="${draft.recurrence === 'once' ? 'on' : ''}">Tek sefer</button>
      </div>
      ${draft.recurrence === 'installments' ? `<label class="field"><span>${editing ? `Toplam taksit (${esc(monthName(draft.startYm, { month: 'short', year: 'numeric' }))} başlangıçlı)` : 'Kalan taksit sayısı'}</span><input name="installments" type="number" inputmode="numeric" min="1" value="${esc(draft.installments || '')}" placeholder="ör. 12"></label>` : ''}
      <label class="toggle"><div>${t.kind === 'income' ? 'Hesaba otomatik yatıyor' : 'Otomatik ödeme talimatı var'}<small>Günü gelince kendiliğinden ${t.kind === 'income' ? 'alındı' : 'ödendi'} sayılır</small></div><input type="checkbox" name="auto" ${draft.auto ? 'checked' : ''}></label>
    `;
  };

  const readInto = (sh) => {
    const f = (n) => sh.querySelector(`[name="${n}"]`);
    if (f('name')) draft.name = f('name').value;
    if (f('bank')) draft.bank = f('bank').value.trim();
    if (f('amount')) draft.amount = f('amount').value;
    if (f('day')) draft.day = f('day').value;
    if (f('date')) draft.date = f('date').value;
    if (f('debt')) draft.debt = f('debt').value;
    if (f('installments')) draft.installments = f('installments').value;
    if (f('auto')) draft.auto = f('auto').checked;
  };

  openSheet(`
    <div class="sheet-top"><button class="link" data-act="close-sheet">Vazgeç</button><h2>${editing ? 'Düzenle' : 'Yeni kalem'}</h2><button class="link" data-act="form-save"><b>Kaydet</b></button></div>
    <div class="form-body"></div>
    <button class="btn primary" data-act="form-save">Kaydet</button>
  `, (sh) => {
    paint(sh);
    sh.addEventListener('click', (e) => {
      const ty = e.target.closest('[data-type]');
      const bk = e.target.closest('[data-bank]');
      const rc = e.target.closest('[data-rec]');
      const sv = e.target.closest('[data-act="form-save"]');
      if (ty) {
        readInto(sh);
        const prevType = draft.type;
        draft.type = ty.dataset.type;
        const tpl = TEMPLATES.find((x) => x.type === draft.type);
        if (!draft.name || draft.name === TYPES[prevType].label || TEMPLATES.some((x) => x.name === draft.name)) draft.name = tpl ? tpl.name : '';
        draft.icon = tpl ? tpl.icon : TYPES[draft.type].icon;
        draft.auto = TYPES[draft.type].kind === 'income';
        if (draft.type === 'loan' && draft.recurrence === 'monthly') draft.recurrence = 'installments';
        paint(sh);
      } else if (bk) {
        readInto(sh);
        draft.bank = bk.dataset.bank;
        paint(sh);
      } else if (rc) {
        readInto(sh);
        draft.recurrence = rc.dataset.rec;
        paint(sh);
      } else if (sv) {
        e.stopPropagation();
        readInto(sh);
        submit();
      }
    });
    const first = sh.querySelector(draft.amount ? '[name="name"]' : '[name="amount"]');
    if (!editing && first) first.focus();
  });

  function submit() {
    const amount = parseAmount(draft.amount);
    if (!(amount > 0)) { toast('Geçerli bir tutar gir'); return; }
    if (draft.recurrence === 'installments' && !(Number(draft.installments) > 0)) { toast('Taksit sayısını gir'); return; }
    const debtVal = parseAmount(draft.debt);
    const clean = { ...draft, amount, debt: Number.isNaN(debtVal) ? undefined : debtVal };
    if (TYPES[clean.type].bank && clean.bank && (!clean.name || clean.name === TYPES[clean.type].label)) {
      const label = TYPES[clean.type].label;
      clean.name = clean.bank.endsWith('Kredi') && label.startsWith('Kredi ') ? `${clean.bank} ${label.slice(6)}` : `${clean.bank} ${label}`;
    }
    if (!TYPES[clean.type].bank) clean.bank = '';
    if (!editing) clean.icon = clean.icon || (TEMPLATES.find((x) => x.name === clean.name) || {}).icon;
    const item = makeItem(clean, editing ? draft.startYm : startYmFor(clean));
    if (editing) {
      const idx = state.items.findIndex((i) => i.id === item.id);
      state.items[idx] = item;
    } else {
      state.items.push(item);
    }
    save(); closeSheet(); render();
    toast(editing ? 'Kaydedildi' : `${item.name} eklendi`, editing ? null : 'Geri al', editing ? null : () => removeItem(item.id));
  }
}

// ---------- Ay içi kayıt ----------
function openOccurrence(id, ym) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  const o = occurrence(state, item, ym, todayIso());
  const isInc = item.kind === 'income';
  const paidWord = isInc ? 'Alındı' : 'Ödendi';
  openSheet(`
    <div class="sheet-top"><span></span><span></span><button class="link" data-act="close-sheet">Kapat</button></div>
    <div class="occ-head"><div class="ico">${esc(item.icon)}</div><h2>${esc(item.name)}</h2>
      <p>${esc(shortDate(o.date))} ${esc(monthName(ym, { year: 'numeric' }))} · ${esc(TYPES[item.type].label)}${o.installmentNo ? ` · ${o.installmentNo}/${item.installments}. taksit` : ''}</p></div>
    <label class="field"><span>${esc(monthName(ym, { month: 'long' }))} tutarı</span><input name="amount" inputmode="decimal" value="${esc(plainNum(o.amount))}" autocomplete="off"></label>
    ${item.recurrence !== 'once' ? `<label class="toggle"><div>Sonraki aylar da bu tutar olsun</div><input type="checkbox" name="future"></label>` : ''}
    ${item.type === 'card' ? `<label class="field"><span>Toplam kart borcu</span><input name="debt" inputmode="decimal" value="${esc(plainNum(item.debt))}" placeholder="ör. 45.000" autocomplete="off"></label>` : ''}
    <div class="btn-row">
      <button class="btn" data-act="occ-save">Kaydet</button>
      <button class="btn ${o.paid ? '' : 'green'}" data-act="occ-paid">${o.paid ? `${paidWord} değil` : `✓ ${paidWord}`}</button>
    </div>
    <div class="links">
      <button class="link" data-act="occ-edit">Kalemi düzenle</button>
      ${item.recurrence !== 'once' && (!item.endYm || item.endYm > ym) ? '<button class="link" data-act="occ-end">Bu aydan sonra bitir</button>' : ''}
      <button class="link danger" data-act="occ-del">Sil</button>
    </div>
  `, (sh) => {
    const persist = () => {
      const amt = parseAmount(sh.querySelector('[name="amount"]').value);
      const rec = { ...(state.records[o.key] || {}) };
      if (amt >= 0 && sh.querySelector('[name="future"]')?.checked) {
        // Bu aydan itibaren varsayılan tutar değişir; geçmiş ayların tutarları korunur.
        for (let m = item.startYm; m < ym; m = ymAdd(m, 1)) {
          const k = `${item.id}|${m}`;
          if (state.records[k]?.amount == null) state.records[k] = { ...(state.records[k] || {}), amount: item.amount };
        }
        item.amount = amt;
        delete rec.amount;
      } else if (amt >= 0 && amt !== o.amount) {
        if (amt === item.amount) delete rec.amount; else rec.amount = amt;
      }
      const dEl = sh.querySelector('[name="debt"]');
      if (dEl) {
        const dv = parseAmount(dEl.value);
        if (dEl.value.trim() === '') delete item.debt; else if (dv >= 0) item.debt = dv;
      }
      if (Object.keys(rec).length) state.records[o.key] = rec; else delete state.records[o.key];
    };
    sh.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'occ-save') { persist(); save(); closeSheet(); render(); toast('Kaydedildi'); }
      if (act === 'occ-paid') { persist(); setPaid(item, ym, !o.paid); save(); closeSheet(); render(); }
      if (act === 'occ-edit') openForm({ ...item });
      if (act === 'occ-end') {
        if (item.recurrence === 'installments') item.installments = ymDiff(item.startYm, ym) + 1;
        item.endYm = ym;
        save(); closeSheet(); render(); toast(`${item.name} ${monthName(ym, { month: 'long' })} sonunda bitecek`);
      }
      if (act === 'occ-del') {
        if (!confirm(`“${item.name}” tamamen silinsin mi? Tüm aylardaki kayıtları da silinir.`)) return;
        const snapshot = JSON.stringify(state);
        removeItem(item.id);
        closeSheet();
        toast('Silindi', 'Geri al', () => { state = JSON.parse(snapshot); save(); render(); });
      }
    });
  });
}

function setPaid(item, ym, paid) {
  const key = `${item.id}|${ym}`;
  const rec = { ...(state.records[key] || {}) };
  const auto = occurrence({ records: {} }, item, ym, todayIso()).paid;
  // Otomatik hesaplananla aynıysa kaydı sade tut.
  if (paid === auto) delete rec.paid; else rec.paid = paid;
  if (Object.keys(rec).length) state.records[key] = rec; else delete state.records[key];
}

function removeItem(id) {
  state.items = state.items.filter((i) => i.id !== id);
  for (const k of Object.keys(state.records)) if (k.startsWith(id + '|')) delete state.records[k];
  save(); render();
}

// ---------- Toast ----------
let toastTimer;
function toast(msg, actionLabel, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button>${esc(actionLabel)}</button>` : ''}`;
  if (actionLabel) el.querySelector('button').onclick = () => { el.classList.remove('show'); action(); };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), actionLabel ? 4500 : 2200);
}

// ---------- Dosya işlemleri ----------
async function shareOrDownload(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const file = new File([blob], filename, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------- Olaylar ----------
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.tabbar [data-tab]');
  if (tab) {
    ui.tab = tab.dataset.tab; pref('tab', ui.tab);
    if (ui.tab === 'debts' || ui.tab === 'settings') ui.ym = thisYm();
    render(); window.scrollTo(0, 0); return;
  }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  if (sheetEl && sheetEl.contains(a) && !['close-sheet', 'tpl'].includes(a.dataset.act)) return; // sayfanın kendi işleyicisi
  switch (a.dataset.act) {
    case 'prev-month': ui.ym = ymAdd(ui.ym, -1); render(); break;
    case 'next-month': ui.ym = ymAdd(ui.ym, 1); render(); break;
    case 'this-month': ui.ym = thisYm(); render(); break;
    case 'quick-add': openQuickAdd(); break;
    case 'close-sheet': closeSheet(); break;
    case 'goto-debts': ui.tab = 'debts'; pref('tab', 'debts'); render(); window.scrollTo(0, 0); break;
    case 'tpl': {
      const t = TEMPLATES[Number(a.dataset.i)];
      openForm({ type: t.type, name: t.name, icon: t.icon, recurrence: t.recurrence || 'monthly' });
      break;
    }
    case 'toggle': {
      e.stopPropagation();
      const item = state.items.find((i) => i.id === a.dataset.id);
      if (!item) break;
      const o = occurrence(state, item, a.dataset.ym, todayIso());
      setPaid(item, a.dataset.ym, !o.paid);
      save(); render();
      if (!o.paid) toast(`${item.name}: ${item.kind === 'income' ? 'alındı' : 'ödendi'} ✓`, 'Geri al', () => { setPaid(item, a.dataset.ym, false); save(); render(); });
      break;
    }
    case 'open-occ': openOccurrence(a.dataset.id, a.dataset.ym); break;
    case 'export': {
      const stamp = todayIso();
      shareOrDownload(`cebim-yedek-${stamp}.json`, JSON.stringify(state, null, 2), 'application/json');
      pref('lastBackup', stamp);
      break;
    }
    case 'import': $('#import-file').click(); break;
    case 'ics': {
      if (!state.items.some((i) => i.kind === 'expense')) { toast('Önce gider ekle'); break; }
      shareOrDownload('cebim-odemeler.ics', toICS(state, money), 'text/calendar');
      break;
    }
    case 'wipe':
      if (confirm('Tüm veriler silinsin mi? Bu geri alınamaz (yedeğin yoksa).')) { state = emptyState(); save(); render(); toast('Tüm veriler silindi'); }
      break;
  }
});

document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (d.matches && d.matches('details[data-pref]')) pref(d.dataset.pref, d.open ? '1' : '0');
}, true);

document.addEventListener('change', async (e) => {
  if (e.target.id !== 'import-file') return;
  const f = e.target.files[0];
  if (!f) return;
  try {
    const next = validateState(JSON.parse(await f.text()));
    if (!confirm(`${next.items.length} kalem yüklenecek. Mevcut veriler bunlarla değiştirilsin mi?`)) return;
    state = next; save(); render(); toast('Yedek geri yüklendi');
  } catch (err) {
    toast('Dosya okunamadı: ' + err.message);
  } finally {
    e.target.value = '';
  }
});

// Sağa/sola kaydırarak ay değiştir
let touch = null;
const viewEl = $('#view');
viewEl.addEventListener('touchstart', (e) => { const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY, at: Date.now() }; }, { passive: true });
viewEl.addEventListener('touchend', (e) => {
  if (!touch || !(ui.tab === 'summary' || ui.tab === 'items')) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  if (Math.abs(dx) > 70 && Math.abs(dy) < 40 && Date.now() - touch.at < 600) {
    ui.ym = ymAdd(ui.ym, dx < 0 ? 1 : -1); render();
  }
  touch = null;
}, { passive: true });

// Uygulama arka plandan dönünce (gün/ay değişmiş olabilir) yenile
let lastDay = todayIso();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const t = todayIso();
  if (t !== lastDay) { if (ui.ym === lastDay.slice(0, 7)) ui.ym = t.slice(0, 7); lastDay = t; }
  state = load();
  render();
});

render();

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
