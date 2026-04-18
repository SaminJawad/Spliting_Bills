/* ═══════════════════════════════════════════════════════════
   BillSplit v2 – Main Application Logic
   No currency, unlimited members, payer settlement, last-10 history
   ═══════════════════════════════════════════════════════════ */
'use strict';

/* ══════════════════════════════════════
   STATE
══════════════════════════════════════ */
const state = {
  members: [],          // { id, name }
  tipPct: 10,
  method: 'equal',      // equal | percentage | custom | items
  items: [],            // { id, name, price, assignees: [memberId] }
  payerMode: 'even',    // even | single | multi
  singlePayer: null,    // memberId
  multiPayers: {},      // { memberId: amountPaid }
  results: null,
  history: [],
  deferredPrompt: null,
};

const HISTORY_LIMIT = 10;
const HISTORY_KEY   = 'billsplit_history_v2';

const AVATAR_COLORS = [
  '#6C63FF', '#FF6584', '#10B981', '#F59E0B', '#EF4444',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
  '#06B6D4', '#84CC16', '#D946EF', '#A855F7'
];

const DEFAULT_NAMES = [
  'Alice','Bob','Carol','Dave','Eve','Frank','Grace','Heidi',
  'Ivan','Judy','Kevin','Linda','Mike','Nina','Oscar','Paula',
  'Quinn','Ruth','Sam','Tina','Uma','Victor','Wendy','Xavier','Yara','Zack'
];

/* ══════════════════════════════════════
   DOM HELPERS
══════════════════════════════════════ */
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const uid = () => Math.random().toString(36).slice(2, 10);

const fmt = n => {
  if (!isFinite(n)) return '–';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const round2 = n => Math.round(n * 100) / 100;

const getAvatarColor = idx => AVATAR_COLORS[idx % AVATAR_COLORS.length];

const initials = name => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/* ══════════════════════════════════════
   TOAST
══════════════════════════════════════ */
let toastTimer;
function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' toast--' + type : '');
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.classList.add('hidden'), 300);
  }, 2400);
}

/* ══════════════════════════════════════
   TAB NAV
══════════════════════════════════════ */
$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.tab;
    $$('.tab').forEach(t => t.classList.add('hidden'));
    const active = $('tab-' + target);
    active.classList.remove('hidden');
    if (target === 'history') renderHistory();
  });
});

/* ══════════════════════════════════════
   BILL CALC (subtotal/tax/tip/total)
══════════════════════════════════════ */
function calcBill() {
  const sub = parseFloat($('total-amount').value) || 0;
  const taxPct = parseFloat($('tax-pct').value) || 0;
  const tipPct = state.tipPct || 0;
  const tax = sub * taxPct / 100;
  const tip = sub * tipPct / 100;
  const total = sub + tax + tip;
  return { sub, tax, tip, total };
}

function updateBillSummary() {
  const b = calcBill();
  $('s-subtotal').textContent = b.sub ? fmt(b.sub) : '–';
  $('s-tax').textContent      = b.tax ? fmt(b.tax) : '–';
  $('s-tip').textContent      = b.tip ? fmt(b.tip) : '–';
  $('s-total').textContent    = b.total ? fmt(b.total) : '–';
  // Refresh derived UIs that depend on total
  renderMethodPanel();
  renderPayerPanel();
}

$('total-amount').addEventListener('input', updateBillSummary);
$('tax-pct').addEventListener('input', updateBillSummary);

/* Tip pills */
$('tip-pills').querySelectorAll('.pill').forEach(p => {
  p.addEventListener('click', () => {
    $('tip-pills').querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
    p.classList.add('active');
    const val = p.dataset.tip;
    if (val === 'custom') {
      $('tip-custom').classList.remove('hidden');
      $('tip-custom').focus();
      state.tipPct = parseFloat($('tip-custom').value) || 0;
    } else {
      $('tip-custom').classList.add('hidden');
      state.tipPct = parseFloat(val);
    }
    updateBillSummary();
  });
});
$('tip-custom').addEventListener('input', e => {
  state.tipPct = parseFloat(e.target.value) || 0;
  updateBillSummary();
});

/* ══════════════════════════════════════
   MEMBERS
══════════════════════════════════════ */
function addMember(name) {
  const n = (name || '').trim();
  if (!n) { toast('Enter a name', 'error'); return; }
  if (state.members.some(m => m.name.toLowerCase() === n.toLowerCase())) {
    toast(`${n} already added`, 'error'); return;
  }
  state.members.push({ id: uid(), name: n });
  renderMembers();
  $('new-member-name').value = '';
  $('new-member-name').focus();
}

function removeMember(id) {
  state.members = state.members.filter(m => m.id !== id);
  // cascade cleanups
  state.items.forEach(it => { it.assignees = it.assignees.filter(a => a !== id); });
  if (state.singlePayer === id) state.singlePayer = null;
  delete state.multiPayers[id];
  renderMembers();
}

function renderMembers() {
  const ul = $('members-list');
  $('member-count-badge').textContent = state.members.length;

  if (state.members.length === 0) {
    ul.innerHTML = `<li class="members-list__empty">No members yet — add people above</li>`;
  } else {
    ul.innerHTML = state.members.map((m, i) => `
      <li class="member-item">
        <span class="member-avatar" style="background:${getAvatarColor(i)}">${initials(m.name)}</span>
        <span class="member-name">${escapeHtml(m.name)}</span>
        <button class="member-remove" aria-label="Remove ${escapeHtml(m.name)}" data-id="${m.id}">✕</button>
      </li>
    `).join('');
    ul.querySelectorAll('.member-remove').forEach(btn =>
      btn.addEventListener('click', () => removeMember(btn.dataset.id))
    );
  }

  // refresh everything that depends on members
  renderMethodPanel();
  renderItems();
  renderPayerPanel();
}

$('add-member-btn').addEventListener('click', () => addMember($('new-member-name').value));
$('new-member-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addMember(e.target.value); }
});

/* Preset counts */
$$('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.id === 'preset-custom') {
      const n = parseInt(prompt('How many people?', '8'), 10);
      if (!n || n < 1 || n > 100) { toast('Enter 1-100', 'error'); return; }
      applyPreset(n);
    } else {
      applyPreset(parseInt(btn.dataset.count, 10));
    }
  });
});

function applyPreset(count) {
  if (state.members.length > 0) {
    if (!confirm(`Replace current ${state.members.length} member(s) with ${count} auto-named people?`)) return;
  }
  state.members = [];
  for (let i = 0; i < count; i++) {
    const base = DEFAULT_NAMES[i % DEFAULT_NAMES.length];
    const name = i < DEFAULT_NAMES.length ? base : `${base} ${Math.floor(i / DEFAULT_NAMES.length) + 1}`;
    state.members.push({ id: uid(), name });
  }
  renderMembers();
  toast(`Added ${count} members`, 'success');
}

/* ══════════════════════════════════════
   METHOD SELECTOR
══════════════════════════════════════ */
$$('.method-card').forEach(card => {
  card.addEventListener('click', () => {
    $$('.method-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    state.method = card.dataset.method;
    $$('.method-panel').forEach(p => p.classList.add('hidden'));
    $('panel-' + state.method).classList.remove('hidden');
    renderMethodPanel();
  });
});

function renderMethodPanel() {
  if (state.method === 'percentage') renderPercentagePanel();
  else if (state.method === 'custom') renderCustomPanel();
  else if (state.method === 'items') renderItems();
}

/* ── Percentage ── */
function renderPercentagePanel() {
  const ul = $('pct-list');
  if (state.members.length === 0) {
    ul.innerHTML = `<li class="members-list__empty">Add members first</li>`;
    $('pct-total-display').textContent = '0%';
    return;
  }
  const evenly = round2(100 / state.members.length);
  ul.innerHTML = state.members.map((m, i) => {
    const cur = m._pct != null ? m._pct : evenly;
    return `
      <li class="adjust-item">
        <span class="member-avatar" style="background:${getAvatarColor(i)}">${initials(m.name)}</span>
        <span class="adjust-item__name">${escapeHtml(m.name)}</span>
        <div class="adjust-item__input-wrap">
          <input type="number" class="adjust-item__input" data-id="${m.id}"
                 value="${cur}" min="0" max="100" step="0.1" inputmode="decimal" />
          <span class="adjust-item__suffix">%</span>
        </div>
      </li>`;
  }).join('');
  ul.querySelectorAll('.adjust-item__input').forEach(inp => {
    inp.addEventListener('input', e => {
      const m = state.members.find(x => x.id === inp.dataset.id);
      if (m) m._pct = parseFloat(e.target.value) || 0;
      updatePctTotal();
    });
  });
  // ensure defaults are stored
  state.members.forEach(m => { if (m._pct == null) m._pct = evenly; });
  updatePctTotal();
}
function updatePctTotal() {
  const total = state.members.reduce((s, m) => s + (parseFloat(m._pct) || 0), 0);
  const el = $('pct-total-display');
  el.textContent = total.toFixed(1) + '%';
  el.classList.toggle('pct-total--good', Math.abs(total - 100) < 0.05);
  el.classList.toggle('pct-total--bad', Math.abs(total - 100) >= 0.05);
}

/* ── Custom amount ── */
function renderCustomPanel() {
  const ul = $('custom-list');
  if (state.members.length === 0) {
    ul.innerHTML = `<li class="members-list__empty">Add members first</li>`;
    $('custom-remaining').textContent = '–';
    return;
  }
  ul.innerHTML = state.members.map((m, i) => {
    const cur = m._custom != null ? m._custom : '';
    return `
      <li class="adjust-item">
        <span class="member-avatar" style="background:${getAvatarColor(i)}">${initials(m.name)}</span>
        <span class="adjust-item__name">${escapeHtml(m.name)}</span>
        <div class="adjust-item__input-wrap">
          <input type="number" class="adjust-item__input" data-id="${m.id}"
                 value="${cur}" min="0" step="0.01" inputmode="decimal" placeholder="0.00" />
        </div>
      </li>`;
  }).join('');
  ul.querySelectorAll('.adjust-item__input').forEach(inp => {
    inp.addEventListener('input', e => {
      const m = state.members.find(x => x.id === inp.dataset.id);
      if (m) m._custom = parseFloat(e.target.value) || 0;
      updateCustomRemaining();
    });
  });
  updateCustomRemaining();
}
function updateCustomRemaining() {
  const b = calcBill();
  const sum = state.members.reduce((s, m) => s + (parseFloat(m._custom) || 0), 0);
  const rem = round2(b.total - sum);
  const el = $('custom-remaining');
  el.textContent = fmt(rem);
  el.classList.toggle('pct-total--good', Math.abs(rem) < 0.005);
  el.classList.toggle('pct-total--bad', Math.abs(rem) >= 0.005);
}

/* ── Items ── */
$('add-item-btn').addEventListener('click', addItem);
$('item-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });
$('item-price').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });

function addItem() {
  const name  = $('item-name').value.trim();
  const price = parseFloat($('item-price').value);
  if (!name) { toast('Item name required', 'error'); return; }
  if (!isFinite(price) || price <= 0) { toast('Valid price required', 'error'); return; }
  state.items.push({ id: uid(), name, price, assignees: [] });
  $('item-name').value = '';
  $('item-price').value = '';
  $('item-name').focus();
  renderItems();
}

function removeItem(id) {
  state.items = state.items.filter(i => i.id !== id);
  renderItems();
}
function toggleAssignee(itemId, memberId) {
  const it = state.items.find(x => x.id === itemId);
  if (!it) return;
  if (it.assignees.includes(memberId)) {
    it.assignees = it.assignees.filter(a => a !== memberId);
  } else {
    it.assignees.push(memberId);
  }
  renderItems();
}

function renderItems() {
  const ul = $('items-list');
  if (state.items.length === 0) {
    ul.innerHTML = `<li class="items-list__empty">No items added yet</li>`;
    $('items-total-display').textContent = '–';
    return;
  }
  ul.innerHTML = state.items.map(it => `
    <li class="item-card">
      <div class="item-card__head">
        <span class="item-card__name">${escapeHtml(it.name)}</span>
        <span class="item-card__price">${fmt(it.price)}</span>
        <button class="item-card__remove" data-id="${it.id}" aria-label="Remove">✕</button>
      </div>
      <div class="item-assignees">
        ${state.members.length === 0
          ? '<span class="hint-text">Add members first</span>'
          : state.members.map((m, i) => `
            <button class="item-assignee-chip ${it.assignees.includes(m.id) ? 'active' : ''}"
                    data-item="${it.id}" data-member="${m.id}">${escapeHtml(m.name)}</button>
          `).join('')
        }
      </div>
    </li>
  `).join('');
  ul.querySelectorAll('.item-card__remove').forEach(b =>
    b.addEventListener('click', () => removeItem(b.dataset.id))
  );
  ul.querySelectorAll('.item-assignee-chip').forEach(b =>
    b.addEventListener('click', () => toggleAssignee(b.dataset.item, b.dataset.member))
  );
  const total = state.items.reduce((s, i) => s + i.price, 0);
  $('items-total-display').textContent = fmt(total);
}

/* ══════════════════════════════════════
   PAYER PANEL (NEW)
══════════════════════════════════════ */
$$('.payer-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.payer-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.payerMode = btn.dataset.payerMode;
    renderPayerPanel();
  });
});

function renderPayerPanel() {
  // hide all panels first
  $('payer-panel-single').classList.add('hidden');
  $('payer-panel-multi').classList.add('hidden');

  if (state.payerMode === 'single') {
    $('payer-panel-single').classList.remove('hidden');
    renderSinglePayerList();
  } else if (state.payerMode === 'multi') {
    $('payer-panel-multi').classList.remove('hidden');
    renderMultiPayerList();
  }
}

function renderSinglePayerList() {
  const wrap = $('single-payer-list');
  if (state.members.length === 0) {
    wrap.innerHTML = `<div class="members-list__empty">Add members first</div>`;
    return;
  }
  wrap.innerHTML = state.members.map((m, i) => `
    <button type="button" class="single-payer-opt ${state.singlePayer === m.id ? 'active' : ''}"
            data-id="${m.id}">
      <span class="member-avatar" style="background:${getAvatarColor(i)}">${initials(m.name)}</span>
      <span class="single-payer-opt__name">${escapeHtml(m.name)}</span>
      <span class="single-payer-opt__check">✓</span>
    </button>
  `).join('');
  wrap.querySelectorAll('.single-payer-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      state.singlePayer = btn.dataset.id;
      renderSinglePayerList();
    });
  });
}

function renderMultiPayerList() {
  const ul = $('multi-payer-list');
  if (state.members.length === 0) {
    ul.innerHTML = `<li class="members-list__empty">Add members first</li>`;
    $('multi-payer-total').textContent = '–';
    return;
  }
  ul.innerHTML = state.members.map((m, i) => {
    const cur = state.multiPayers[m.id] != null ? state.multiPayers[m.id] : '';
    return `
      <li class="adjust-item">
        <span class="member-avatar" style="background:${getAvatarColor(i)}">${initials(m.name)}</span>
        <span class="adjust-item__name">${escapeHtml(m.name)}</span>
        <div class="adjust-item__input-wrap">
          <input type="number" class="adjust-item__input" data-id="${m.id}"
                 value="${cur}" min="0" step="0.01" inputmode="decimal" placeholder="0.00" />
        </div>
      </li>`;
  }).join('');
  ul.querySelectorAll('.adjust-item__input').forEach(inp => {
    inp.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      if (isFinite(v) && v > 0) state.multiPayers[inp.dataset.id] = v;
      else delete state.multiPayers[inp.dataset.id];
      updateMultiPayerTotal();
    });
  });
  updateMultiPayerTotal();
}
function updateMultiPayerTotal() {
  const paid = Object.values(state.multiPayers).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const b = calcBill();
  const el = $('multi-payer-total');
  el.textContent = fmt(paid);
  if (b.total > 0) {
    el.classList.toggle('pct-total--good', Math.abs(paid - b.total) < 0.005);
    el.classList.toggle('pct-total--bad',  Math.abs(paid - b.total) >= 0.005);
  }
}

/* ══════════════════════════════════════
   CALCULATE SPLIT
══════════════════════════════════════ */
$('calculate-btn').addEventListener('click', calculateSplit);

function calculateSplit() {
  const b = calcBill();

  if (!b.sub || b.sub <= 0) { toast('Enter bill amount', 'error'); return; }
  if (state.members.length === 0) { toast('Add at least one member', 'error'); return; }

  // Compute each member's SHARE
  let shares = {}; // memberId -> amount
  state.members.forEach(m => { shares[m.id] = 0; });

  if (state.method === 'equal') {
    const each = b.total / state.members.length;
    state.members.forEach(m => { shares[m.id] = each; });
  }
  else if (state.method === 'percentage') {
    const total = state.members.reduce((s, m) => s + (parseFloat(m._pct) || 0), 0);
    if (Math.abs(total - 100) >= 0.05) {
      toast(`Percentages must total 100% (currently ${total.toFixed(1)}%)`, 'error'); return;
    }
    state.members.forEach(m => { shares[m.id] = b.total * (parseFloat(m._pct) || 0) / 100; });
  }
  else if (state.method === 'custom') {
    const sum = state.members.reduce((s, m) => s + (parseFloat(m._custom) || 0), 0);
    if (Math.abs(sum - b.total) >= 0.01) {
      toast(`Custom amounts must total ${fmt(b.total)} (currently ${fmt(sum)})`, 'error'); return;
    }
    state.members.forEach(m => { shares[m.id] = parseFloat(m._custom) || 0; });
  }
  else if (state.method === 'items') {
    if (state.items.length === 0) { toast('Add items first', 'error'); return; }
    const itemsTotal = state.items.reduce((s, i) => s + i.price, 0);
    if (itemsTotal <= 0) { toast('Items total is zero', 'error'); return; }
    // Sum items per person
    let subTotalsByMember = {};
    state.members.forEach(m => { subTotalsByMember[m.id] = 0; });
    for (const it of state.items) {
      if (it.assignees.length === 0) {
        toast(`Assign "${it.name}" to at least one person`, 'error'); return;
      }
      const per = it.price / it.assignees.length;
      it.assignees.forEach(a => { subTotalsByMember[a] = (subTotalsByMember[a] || 0) + per; });
    }
    // Prorate tax + tip on top of each person's subtotal share
    const factor = b.total / itemsTotal;
    state.members.forEach(m => { shares[m.id] = (subTotalsByMember[m.id] || 0) * factor; });
  }

  // Round each share to 2 decimals (fix rounding drift on last person)
  const ids = state.members.map(m => m.id);
  let roundedTotal = 0;
  ids.forEach(id => { shares[id] = round2(shares[id]); roundedTotal += shares[id]; });
  const drift = round2(b.total - roundedTotal);
  if (Math.abs(drift) >= 0.01 && ids.length > 0) {
    shares[ids[0]] = round2(shares[ids[0]] + drift);
  }

  /* ── PAYER PROCESSING ── */
  let paid = {}; // memberId -> amount actually paid upfront
  state.members.forEach(m => { paid[m.id] = 0; });

  if (state.payerMode === 'even') {
    // Each person pays own share — no settlement needed
    state.members.forEach(m => { paid[m.id] = shares[m.id]; });
  }
  else if (state.payerMode === 'single') {
    if (!state.singlePayer || !state.members.find(m => m.id === state.singlePayer)) {
      toast('Select who paid the bill', 'error'); return;
    }
    paid[state.singlePayer] = b.total;
  }
  else if (state.payerMode === 'multi') {
    const paidSum = Object.values(state.multiPayers).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    if (Math.abs(paidSum - b.total) >= 0.01) {
      toast(`Total paid (${fmt(paidSum)}) must equal grand total (${fmt(b.total)})`, 'error'); return;
    }
    state.members.forEach(m => { paid[m.id] = parseFloat(state.multiPayers[m.id]) || 0; });
  }

  /* ── NET + SETTLEMENT ──
     net = paid - share
       positive → person is creditor (others owe them)
       negative → person is debtor (they owe others)
  */
  const nets = state.members.map(m => ({
    id: m.id, name: m.name,
    share: shares[m.id],
    paid: paid[m.id],
    net: round2(paid[m.id] - shares[m.id])
  }));

  const settlements = computeSettlements(nets);

  /* ── BUILD RESULT OBJECT ── */
  state.results = {
    occasion:  $('bill-name').value.trim() || 'Untitled Split',
    subtotal:  b.sub,
    tax:       b.tax,
    tip:       b.tip,
    total:     b.total,
    method:    state.method,
    payerMode: state.payerMode,
    breakdown: nets,     // each person's share / paid / net
    settlements,
    date:      Date.now(),
  };

  renderResults();
  $('results-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Greedy debtor→creditor settlement algorithm ── */
function computeSettlements(nets) {
  const EPS = 0.01;
  const debtors   = nets.filter(n => n.net < -EPS).map(n => ({ ...n, net: -n.net })).sort((a,b) => b.net - a.net);
  const creditors = nets.filter(n => n.net >  EPS).map(n => ({ ...n }))              .sort((a,b) => b.net - a.net);

  const txs = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].net, creditors[j].net);
    const amt = round2(pay);
    if (amt >= 0.01) {
      txs.push({ from: debtors[i].name, to: creditors[j].name, amount: amt });
    }
    debtors[i].net   = round2(debtors[i].net   - pay);
    creditors[j].net = round2(creditors[j].net - pay);
    if (debtors[i].net   < EPS) i++;
    if (creditors[j].net < EPS) j++;
  }
  return txs;
}

/* ══════════════════════════════════════
   RENDER RESULTS
══════════════════════════════════════ */
function renderResults() {
  const r = state.results;
  const card = $('results-card');
  card.classList.remove('hidden');

  $('result-occasion').textContent = r.occasion;
  $('result-grand-total').textContent = fmt(r.total);

  // Per-person share list
  const ul = $('results-list');
  ul.innerHTML = r.breakdown.map((p, i) => {
    const sub = r.payerMode === 'even'
      ? 'Pays own share'
      : (p.paid > 0 ? `Paid upfront: ${fmt(p.paid)}` : 'Did not pay upfront');
    return `
      <li class="result-item">
        <span class="member-avatar" style="background:${getAvatarColor(i)}">${initials(p.name)}</span>
        <span>
          <span class="result-item__name">${escapeHtml(p.name)}</span>
          <span class="result-item__sub">${sub}</span>
        </span>
        <span class="result-item__amount">${fmt(p.share)}</span>
      </li>`;
  }).join('');

  // Settlement
  const sec = $('settlement-section');
  const list = $('settlement-list');
  if (r.payerMode === 'even') {
    sec.classList.add('hidden');
  } else {
    sec.classList.remove('hidden');
    if (r.settlements.length === 0) {
      list.innerHTML = `<li class="settle-empty">✓ All settled! Everyone's paid their share.</li>`;
    } else {
      list.innerHTML = r.settlements.map(s => `
        <li class="settle-item">
          <span class="settle-item__text">
            <span class="settle-item__debtor">${escapeHtml(s.from)}</span>
            <span class="settle-item__arrow"> → </span>
            <span class="settle-item__creditor">${escapeHtml(s.to)}</span>
          </span>
          <span class="settle-item__amt">${fmt(s.amount)}</span>
        </li>
      `).join('');
    }
  }
}

/* ══════════════════════════════════════
   RESULTS ACTIONS: copy / share / save / reset
══════════════════════════════════════ */
function buildShareText() {
  const r = state.results;
  if (!r) return '';
  const lines = [];
  lines.push(`🧾 ${r.occasion}`);
  lines.push(`Grand Total: ${fmt(r.total)}`);
  if (r.tax)  lines.push(`  Tax: ${fmt(r.tax)}`);
  if (r.tip)  lines.push(`  Tip: ${fmt(r.tip)}`);
  lines.push('');
  lines.push("— Each person's share —");
  r.breakdown.forEach(p => lines.push(`  ${p.name}: ${fmt(p.share)}`));
  if (r.payerMode !== 'even') {
    lines.push('');
    lines.push('— Who paid —');
    r.breakdown.forEach(p => {
      if (p.paid > 0) lines.push(`  ${p.name} paid ${fmt(p.paid)}`);
    });
    lines.push('');
    lines.push('— Settlement —');
    if (r.settlements.length === 0) {
      lines.push('  ✓ All settled!');
    } else {
      r.settlements.forEach(s => lines.push(`  ${s.from} → ${s.to}: ${fmt(s.amount)}`));
    }
  }
  lines.push('');
  lines.push('— Split with BillSplit');
  return lines.join('\n');
}

$('copy-btn').addEventListener('click', async () => {
  const txt = buildShareText();
  try {
    await navigator.clipboard.writeText(txt);
    toast('Copied to clipboard', 'success');
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Copied!', 'success'); }
    catch { toast('Copy failed', 'error'); }
    document.body.removeChild(ta);
  }
});

$('share-btn').addEventListener('click', async () => {
  const txt = buildShareText();
  if (navigator.share) {
    try { await navigator.share({ title: 'BillSplit', text: txt }); }
    catch { /* cancelled */ }
  } else {
    // fallback: copy
    $('copy-btn').click();
  }
});

$('save-btn').addEventListener('click', () => {
  if (!state.results) return;
  saveToHistory(state.results);
  toast('Saved to history', 'success');
});

$('reset-btn').addEventListener('click', resetAll);

function resetAll() {
  state.items = [];
  state.singlePayer = null;
  state.multiPayers = {};
  state.members.forEach(m => { delete m._pct; delete m._custom; });
  state.results = null;
  $('bill-name').value = '';
  $('total-amount').value = '';
  $('tax-pct').value = '';
  $('tip-custom').value = '';
  $('tip-pills').querySelectorAll('.pill').forEach(p => p.classList.toggle('active', p.dataset.tip === '10'));
  $('tip-custom').classList.add('hidden');
  state.tipPct = 10;

  // reset method
  state.method = 'equal';
  $$('.method-card').forEach(c => c.classList.toggle('active', c.dataset.method === 'equal'));
  $$('.method-panel').forEach(p => p.classList.add('hidden'));
  $('panel-equal').classList.remove('hidden');

  // reset payer
  state.payerMode = 'even';
  $$('.payer-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.payerMode === 'even'));

  $('results-card').classList.add('hidden');
  updateBillSummary();
  renderItems();
  renderPayerPanel();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ══════════════════════════════════════
   HISTORY (last 10, auto-prune)
══════════════════════════════════════ */
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    state.history = raw ? JSON.parse(raw) : [];
  } catch { state.history = []; }
  // Prune to last HISTORY_LIMIT just in case
  if (state.history.length > HISTORY_LIMIT) {
    state.history = state.history.slice(0, HISTORY_LIMIT);
    persistHistory();
  }
}
function persistHistory() {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history)); } catch {}
}
function saveToHistory(entry) {
  const copy = JSON.parse(JSON.stringify(entry));
  copy.id = uid();
  state.history.unshift(copy);
  if (state.history.length > HISTORY_LIMIT) state.history.length = HISTORY_LIMIT;
  persistHistory();
}
function deleteHistoryEntry(id) {
  state.history = state.history.filter(h => h.id !== id);
  persistHistory();
  renderHistory();
}
function renderHistory() {
  const ul = $('history-list');
  const empty = $('history-empty');
  if (!state.history.length) {
    empty.classList.remove('hidden');
    ul.innerHTML = '';
    return;
  }
  empty.classList.add('hidden');
  ul.innerHTML = state.history.map(h => {
    const d = new Date(h.date);
    const ds = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const nPeople = h.breakdown ? h.breakdown.length : 0;
    return `
      <li class="history-item">
        <div class="history-item__body">
          <div class="history-item__occasion">${escapeHtml(h.occasion || 'Untitled')}</div>
          <div class="history-item__meta">${ds} · ${nPeople} people · ${h.payerMode === 'even' ? 'No settlement' : 'With settlement'}</div>
        </div>
        <div class="history-item__total">${fmt(h.total)}</div>
        <div class="history-item__actions">
          <button class="history-item__delete" data-id="${h.id}" aria-label="Delete">🗑</button>
        </div>
      </li>`;
  }).join('');
  ul.querySelectorAll('.history-item__delete').forEach(b =>
    b.addEventListener('click', () => deleteHistoryEntry(b.dataset.id))
  );
}
$('clear-history-btn').addEventListener('click', () => {
  if (!state.history.length) { toast('History is already empty'); return; }
  if (!confirm('Clear all saved splits? This cannot be undone.')) return;
  state.history = [];
  persistHistory();
  renderHistory();
  toast('History cleared', 'success');
});

/* ══════════════════════════════════════
   PWA INSTALL PROMPT
══════════════════════════════════════ */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  state.deferredPrompt = e;
  if (!localStorage.getItem('install_dismissed')) {
    $('install-banner').classList.remove('hidden');
  }
});
$('install-btn').addEventListener('click', async () => {
  if (!state.deferredPrompt) { $('install-banner').classList.add('hidden'); return; }
  state.deferredPrompt.prompt();
  try { await state.deferredPrompt.userChoice; } catch {}
  state.deferredPrompt = null;
  $('install-banner').classList.add('hidden');
});
$('install-dismiss').addEventListener('click', () => {
  $('install-banner').classList.add('hidden');
  localStorage.setItem('install_dismissed', '1');
});

/* ══════════════════════════════════════
   UTILS
══════════════════════════════════════ */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
loadHistory();
renderMembers();
updateBillSummary();
renderPayerPanel();
