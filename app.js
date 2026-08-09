/* ============================================================================
   ORDER MANAGER v3 — app.js
   Vanilla JS + Supabase (PostgREST) + Sage 200 via the "sage" Edge Function.
   ========================================================================== */

/* ───────────────────────────── CONFIG — EDIT ME ─────────────────────────── */
const CONFIG = {
  SUPABASE_URL: 'https://fcxtwaqrrrghysupbulz.supabase.co',
  SUPABASE_KEY: 'sb_publishable_ri54UxsPSzwPq2b2fAnO0A_YaY1Q8qQ',

  // Edge Function endpoint + shared key. APP_SHARED_KEY must be EXACTLY the
  // same string you saved as the APP_SHARED_KEY secret on the Edge Function.
  FUNCTIONS_URL: 'https://fcxtwaqrrrghysupbulz.supabase.co/functions/v1/sage',
  APP_SHARED_KEY: 'j8s9]6CYOq*MmVUAzAYRy0-PmR_!x82',                    // ← EDIT ME

  // Sage OAuth (the Client Secret lives ONLY in the Edge Function secrets)
  SAGE_CLIENT_ID: '89TPM5AcTd8NCGATTE3UviwDMsukxhMU',
  SAGE_REDIRECT: 'https://orders.william-cooper.uk',

  // Printed on delivery notes                                    // ← EDIT ME
  COMPANY: {
    name: 'RICHMOND PAPER SUPPLY COMPANY (LIVERPOOL) LIMITED',
    lines: ['1-3 Forge St', 'Bootle', 'L20 8JG', 'Tel: 0151 933 1000'],
  },

  ROUTES: ['Brian', 'Chris', 'Ian', 'John', 'Mike', 'Nick', 'Steve', 'Misc'],
};

const TYPE_TO_COL = {
  'Retail': 'retail_price',
  'Wholesale': 'wholesale_price',
  'Wholesale 1': 'wholesale_price_1',
  'Wholesale 2': 'wholesale_price_2',
};

/* ───────────────────────────── tiny helpers ─────────────────────────────── */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const money = (v) => '£' + num(v).toFixed(2);
const dISO = (d) => { const x = d || new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const dOnly = (s) => String(s ?? '').slice(0, 10);
const dNice = (s) => { const d = new Date(dOnly(s) + 'T12:00:00'); return isNaN(d) ? String(s) : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};

let toastTimer = null;
function toast(msg, isErr) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('err', !!isErr);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), isErr ? 6000 : 3000);
}
function loading(on, text) {
  $('loadingText').textContent = text || 'Working…';
  $('loading').classList.toggle('open', !!on);
}

/* ───────────────────────────── theme ────────────────────────────────────── */
(function initTheme() {
  const saved = store.get('theme');
  if (saved === 'dark' || (!saved && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
$('themeToggle').addEventListener('click', () => {
  const el = document.documentElement;
  const next = el.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  el.setAttribute('data-theme', next);
  store.set('theme', next);
});

/* ───────────────────────────── Supabase REST ────────────────────────────── */
async function sb(method, pathAndQuery, body, prefer) {
  const headers = {
    apikey: CONFIG.SUPABASE_KEY,
    Authorization: 'Bearer ' + CONFIG.SUPABASE_KEY,
    'Content-Type': 'application/json',
  };
  if (prefer) headers['Prefer'] = prefer;
  const res = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/' + pathAndQuery, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(method + ' ' + pathAndQuery.split('?')[0] + ' failed (' + res.status + '): ' + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}
const sbGet = (q) => sb('GET', q);
const sbPost = (q, b, p) => sb('POST', q, b, p);
const sbPatch = (q, b) => sb('PATCH', q, b, 'return=minimal');
const sbDelete = (q) => sb('DELETE', q);

/* Edge Function caller */
async function fn(action, payload) {
  const res = await fetch(CONFIG.FUNCTIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-key': CONFIG.APP_SHARED_KEY },
    body: JSON.stringify(Object.assign({ action }, payload || {})),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Sage function error (' + res.status + ')'));
  return data;
}

/* ─────────────────────── copyable error dialog ─────────────────────────── */
function showError(context, err) {
  const msg = (err && err.message) ? err.message : String(err);
  $('errContext').textContent = context;
  $('errText').value = context + '\n\n' + msg + '\n\n' + new Date().toLocaleString('en-GB');
  $('errModal').classList.add('open');
  console.error(context, err);
}
$('errCloseBtn').addEventListener('click', () => $('errModal').classList.remove('open'));
$('errModal').addEventListener('click', (e) => { if (e.target === $('errModal')) $('errModal').classList.remove('open'); });
$('errCopyBtn').addEventListener('click', () => {
  const ta = $('errText');
  ta.select();
  const done = () => toast('Copied');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, () => { document.execCommand('copy'); done(); });
  else { document.execCommand('copy'); done(); }
});

/* ────────────── self-healing writes (survive missing columns) ───────────────
   If the live table lacks an optional column this app sends (PostgREST error
   PGRST204: "Could not find the 'X' column …"), strip that field and retry,
   so small schema differences never block saving an order. Essential columns
   are never stripped — those errors surface properly. */
const ESSENTIAL_COLS = {
  Orders: ['AccountNumber', 'DeliveryDate', 'Total'],
  order_lines: ['OrderId', 'ProductCode', 'Qty', 'Price'],
};
function missingColFrom(message) {
  const m = /'([^']+)' column/i.exec(message) || /column "([^"]+)"/i.exec(message);
  return m ? m[1] : null;
}
async function writeWithFallback(method, table, query, body, prefer) {
  const isArray = Array.isArray(body);
  let payload = isArray ? body.map((r) => Object.assign({}, r)) : Object.assign({}, body);
  const essentials = ESSENTIAL_COLS[table] || [];
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await sb(method, table + (query || ''), payload, prefer);
    } catch (err) {
      const col = missingColFrom(err.message);
      const sample = isArray ? payload[0] : payload;
      if (col && sample && Object.prototype.hasOwnProperty.call(sample, col) && !essentials.includes(col)) {
        console.warn('Column "' + col + '" not found in ' + table + ' — retrying without it');
        if (isArray) payload = payload.map((r) => { const c = Object.assign({}, r); delete c[col]; return c; });
        else delete payload[col];
        continue;
      }
      throw err;
    }
  }
  throw new Error('Save failed after several retries — copy the previous error and send it to me.');
}

/* ───────────────────────────── state ────────────────────────────────────── */
let PRODUCTS = [];      // { code, name, shorthand, prices:{col:val} }
let PRICE_TIERS = [];   // Prices columns except 'code'
let CUSTOMERS = [];     // rows from Customers
let ORDERS = [];        // rows from Orders, each with .lines[]
let OVERRIDES = [];     // rows from customer_overrides
let BAND_MAP = [];      // rows from price_band_map
let ROUTES = [];
let TIER_LOOKUP = {};   // normalised tier name -> real Prices column

const custByAcct = (a) => CUSTOMERS.find((c) => c.account_number === a);
const prodByCode = (c) => PRODUCTS.find((p) => p.code === c);

/* Resolve a stored band/tier value to a real Prices column, forgiving
   stray spaces and capitalisation (e.g. "Harlequin " -> "Harlequin"). */
function resolveTierCol(name) {
  if (!name) return null;
  if (PRICE_TIERS.includes(name)) return name;
  return TIER_LOOKUP[String(name).trim().toLowerCase()] || null;
}

async function loadData() {
  const [products, prices, customers, orders, lines, overrides, bands] = await Promise.all([
    sbGet('Products?select=*'),
    sbGet('Prices?select=*'),
    sbGet('Customers?select=*'),
    sbGet('Orders?select=*'),
    sbGet('order_lines?select=*'),
    sbGet('customer_overrides?select=*').catch(() => []),
    sbGet('price_band_map?select=*').catch(() => []),
  ]);

  const priceByCode = {};
  (prices || []).forEach((r) => { priceByCode[r.code] = r; });

  const preferred = ['retail_price', 'wholesale_price', 'wholesale_price_1', 'wholesale_price_2'];
  const cols = prices && prices.length ? Object.keys(prices[0]).filter((k) => k !== 'code') : preferred.slice();
  PRICE_TIERS = preferred.filter((c) => cols.includes(c))
    .concat(cols.filter((c) => !preferred.includes(c)).sort((a, b) => a.localeCompare(b)));

  TIER_LOOKUP = {};
  PRICE_TIERS.forEach((c) => { TIER_LOOKUP[c.trim().toLowerCase()] = c; });

  PRODUCTS = (products || []).map((p) => ({
    code: p.code, name: p.name || '', shorthand: p.shorthand || '',
    prices: priceByCode[p.code] || { code: p.code },
  })).sort((a, b) => a.name.localeCompare(b.name));

  CUSTOMERS = (customers || []).sort((a, b) => String(a.account_name || '').localeCompare(String(b.account_name || '')));

  const linesByOrder = {};
  (lines || []).forEach((l) => { (linesByOrder[l.OrderId] = linesByOrder[l.OrderId] || []).push(l); });
  ORDERS = (orders || []).map((o) => Object.assign({}, o, { lines: linesByOrder[o.id] || [] }));

  OVERRIDES = overrides || [];
  BAND_MAP = (bands || []).sort((a, b) => (a.band_id || 0) - (b.band_id || 0));

  const set = new Set(CONFIG.ROUTES);
  CUSTOMERS.forEach((c) => { if (c.Route) set.add(c.Route); });
  ORDERS.forEach((o) => { if (o.Route) set.add(o.Route); });
  ROUTES = Array.from(set);

  fillRouteSelects();
  updateBadges();
}

function fillRouteSelects() {
  const opts = ROUTES.map((r) => '<option>' + esc(r) + '</option>').join('');
  $('routeSel').innerHTML = opts;
  $('cmRoute').innerHTML = '<option value="">— none —</option>' + opts;
  $('logRoute').innerHTML = '<option value="">All routes</option>' + opts;
  $('cmBand').innerHTML = '<option value="">— none —</option>' + PRICE_TIERS.map((t) => '<option>' + esc(t) + '</option>').join('');
}

function updateBadges() {
  const today = dISO();
  const n = ORDERS.filter((o) => dOnly(o.DeliveryDate) === today).length;
  const b = $('routesBadge');
  b.textContent = n;
  b.style.display = n ? '' : 'none';
}

/* ───────────────────────────── pricing ──────────────────────────────────── */
function priceFor(code, cust, orderType) {
  const p = prodByCode(code);
  const row = p ? p.prices : {};
  if (orderType !== 'Custom') {
    return num(row[TYPE_TO_COL[orderType]]);
  }
  if (cust) {
    const ov = OVERRIDES.find((o) => o.account_number === cust.account_number && o.product_code === code);
    if (ov) return num(ov.price);
    const tierCol = resolveTierCol(cust.price_band);
    if (tierCol && row[tierCol] !== undefined && row[tierCol] !== null && row[tierCol] !== '') {
      return num(row[tierCol]);
    }
    const fb = String(cust.fallback_price || '').toLowerCase();
    if (fb.indexOf('ret') !== -1) return num(row.retail_price);
  }
  return num(row.wholesale_price);
}

/* ───────────────────────────── tabs ─────────────────────────────────────── */
const TABS = ['entry', 'routes', 'log', 'products', 'customers', 'sage'];
function switchTab(name) {
  TABS.forEach((t) => { $('tab-' + t).style.display = t === name ? '' : 'none'; });
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  if (name === 'routes') renderRoutes();
  if (name === 'log') renderLog();
  if (name === 'products') renderProducts();
  if (name === 'customers') renderCustomers();
  if (name === 'sage') { refreshSageStatus(); renderBandMap(); loadSyncLog(); loadSageProductMap(); }
}
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (b) switchTab(b.dataset.tab);
});

/* ───────────────────────── generic search dropdown ──────────────────────── */
function attachDropdown(inputEl, listEl, getItems, renderItem, onPick) {
  let items = [], hl = -1;

  function close() { listEl.classList.remove('open'); hl = -1; }
  function open() { if (items.length) listEl.classList.add('open'); else close(); }

  function render() {
    listEl.innerHTML = items.map((it, i) =>
      '<div class="dd-item' + (i === hl ? ' hl' : '') + '" data-i="' + i + '">' + renderItem(it) + '</div>'
    ).join('');
  }
  function update() {
    const q = inputEl.value.trim().toLowerCase();
    items = q ? getItems(q).slice(0, 30) : [];
    hl = items.length ? 0 : -1;
    render(); open();
  }

  inputEl.addEventListener('input', update);
  inputEl.addEventListener('focus', update);
  inputEl.addEventListener('keydown', (e) => {
    if (!listEl.classList.contains('open')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); hl = Math.min(hl + 1, items.length - 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); hl = Math.max(hl - 1, 0); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (hl >= 0) { onPick(items[hl]); close(); } }
    else if (e.key === 'Escape') close();
  });
  listEl.addEventListener('mousedown', (e) => {
    const d = e.target.closest('.dd-item');
    if (d) { e.preventDefault(); onPick(items[+d.dataset.i]); close(); }
  });
  document.addEventListener('click', (e) => {
    if (!inputEl.contains(e.target) && !listEl.contains(e.target)) close();
  });
  return { close };
}

function searchCustomers(q) {
  const starts = [], contains = [];
  CUSTOMERS.forEach((c) => {
    const name = String(c.account_name || '').toLowerCase();
    const acct = String(c.account_number || '').toLowerCase();
    if (name.startsWith(q) || acct.startsWith(q)) starts.push(c);
    else if (name.includes(q) || acct.includes(q)) contains.push(c);
  });
  return starts.concat(contains);
}
function searchProducts(q) {
  const starts = [], contains = [];
  PRODUCTS.forEach((p) => {
    const hay = [p.code, p.name, p.shorthand].map((x) => String(x || '').toLowerCase());
    if (hay.some((h) => h.startsWith(q))) starts.push(p);
    else if (hay.some((h) => h.includes(q))) contains.push(p);
  });
  return starts.concat(contains);
}

/* ═════════════════════════════ ORDER ENTRY ══════════════════════════════ */
let currentCustomer = null;
let currentLines = [];    // { code, name, shorthand, qty, price, manual }
let editingOrderId = null;

function renderCustPanel() {
  const c = currentCustomer;
  const panel = $('custPanel');
  if (!c) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  panel.classList.toggle('on-hold', !!c.on_hold);
  $('cpName').textContent = c.account_name || c.account_number;
  $('cpHold').style.display = c.on_hold ? '' : 'none';
  const meta = [];
  meta.push('Acct ' + (c.account_number || '—'));
  const tierCol = resolveTierCol(c.price_band);
  if (tierCol) {
    meta.push('Tier: ' + tierCol);
  } else if (c.price_band) {
    meta.push('⚠ tier “' + c.price_band + '” is not a Prices column — using fallback ' + (c.fallback_price || 'Wholesale'));
  } else {
    meta.push('Tier: none — fallback ' + (c.fallback_price || 'Wholesale'));
  }
  if (c.Route) meta.push('Route: ' + c.Route);
  $('cpMeta').textContent = meta.join('  ·  ');
  const addr = [c.address_1, c.address_2, c.address_3, c.city, c.postcode].filter(Boolean).join(', ');
  const contact = [addr, c.phone].filter(Boolean).join('  ·  ');
  $('cpContact').textContent = contact;
  $('cpContact').style.display = contact ? '' : 'none';
  $('cpBalance').textContent = (c.balance !== null && c.balance !== undefined) ? 'Balance: ' + money(c.balance) : '';
  $('cpBalance').style.display = (c.balance !== null && c.balance !== undefined) ? '' : 'none';
}

function selectCustomer(c) {
  currentCustomer = c;
  $('custSearch').value = (c.account_name || '') + '  (' + (c.account_number || '') + ')';
  if (c.Route && !editingOrderId) $('routeSel').value = c.Route;
  renderCustPanel();
  repriceLines();
  if (c.on_hold) toast(String(c.account_name || c.account_number) + ' is ON HOLD in Sage', true);
}

attachDropdown($('custSearch'), $('custResults'), searchCustomers, (c) => {
  const hold = c.on_hold ? ' <span class="badge b-hold">HOLD</span>' : '';
  const bal = (c.balance !== null && c.balance !== undefined) ? '<span>' + money(c.balance) + '</span>' : '';
  return '<span class="dd-main">' + esc(c.account_name || '') + hold + '</span>' +
         '<span class="dd-side"><span class="mono">' + esc(c.account_number || '') + '</span>' +
         (c.Route ? '<span class="badge b-route">' + esc(c.Route) + '</span>' : '') + bal + '</span>';
}, selectCustomer);

let pendingProd = null;

attachDropdown($('prodSearch'), $('prodResults'), searchProducts, (p) => {
  const price = currentCustomer || $('orderType').value !== 'Custom'
    ? money(priceFor(p.code, currentCustomer, $('orderType').value)) : '';
  return '<span class="dd-main">' + esc(p.name) + '</span>' +
         '<span class="dd-side"><span class="mono">' + esc(p.code) + '</span><span>' + price + '</span></span>';
}, (p) => {
  pendingProd = p;
  $('prodSearch').value = p.name + '  (' + p.code + ')';
  $('addQty').focus();
  $('addQty').select();
});

// typing in the search again abandons the previous selection
$('prodSearch').addEventListener('input', () => { pendingProd = null; });

function commitAddLine() {
  if (!pendingProd) { toast('Pick a product first', true); $('prodSearch').focus(); return; }
  const qty = Math.max(1, Math.round(num($('addQty').value)) || 1);
  addLine(pendingProd, qty);
  pendingProd = null;
  $('prodSearch').value = '';
  $('addQty').value = 1;
  $('prodSearch').focus();
}
$('addLineBtn').addEventListener('click', commitAddLine);
$('addQty').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); commitAddLine(); }
});

function addLine(p, qty) {
  const q = Math.max(1, Math.round(num(qty)) || 1);
  const existing = currentLines.find((l) => l.code === p.code);
  if (existing) { existing.qty += q; renderLines(); return; }
  currentLines.push({
    code: p.code, name: p.name, shorthand: p.shorthand,
    qty: q,
    price: priceFor(p.code, currentCustomer, $('orderType').value),
    manual: false,
  });
  renderLines();
}

function repriceLines() {
  currentLines.forEach((l) => {
    if (!l.manual) l.price = priceFor(l.code, currentCustomer, $('orderType').value);
  });
  renderLines();
}
$('orderType').addEventListener('change', repriceLines);

function renderLines() {
  const tb = $('linesBody');
  if (!currentLines.length) {
    tb.innerHTML = '<tr><td colspan="6" class="empty">No lines yet</td></tr>';
  } else {
    tb.innerHTML = currentLines.map((l, i) =>
      '<tr>' +
      '<td class="mono">' + esc(l.code) + '</td>' +
      '<td>' + esc(l.name) + '</td>' +
      '<td class="t-right"><input type="number" min="0" step="1" class="qty-in num" data-i="' + i + '" data-k="qty" value="' + l.qty + '"></td>' +
      '<td class="t-right"><input type="number" min="0" step="0.01" class="price-in num" tabindex="-1" data-i="' + i + '" data-k="price" value="' + num(l.price).toFixed(2) + '"></td>' +
      '<td class="t-right num">' + money(l.qty * l.price) + '</td>' +
      '<td class="t-right"><button class="btn btn-small btn-danger" data-del="' + i + '">✕</button></td>' +
      '</tr>'
    ).join('');
  }
  const total = currentLines.reduce((s, l) => s + l.qty * l.price, 0);
  const items = currentLines.reduce((s, l) => s + num(l.qty), 0);
  $('orderTotal').textContent = money(total);
  $('orderItems').textContent = items + ' item' + (items === 1 ? '' : 's');
}

$('linesBody').addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.i === undefined) return;
  const l = currentLines[+el.dataset.i];
  if (!l) return;
  if (el.dataset.k === 'qty') l.qty = Math.max(0, num(el.value));
  if (el.dataset.k === 'price') { l.price = num(el.value); l.manual = true; }
  const total = currentLines.reduce((s, x) => s + x.qty * x.price, 0);
  const items = currentLines.reduce((s, x) => s + num(x.qty), 0);
  $('orderTotal').textContent = money(total);
  $('orderItems').textContent = items + ' item' + (items === 1 ? '' : 's');
  const row = el.closest('tr');
  if (row) row.children[4].textContent = money(l.qty * l.price);
});
$('linesBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-del]');
  if (b) { currentLines.splice(+b.dataset.del, 1); renderLines(); }
});

function resetOrderForm() {
  currentCustomer = null;
  currentLines = [];
  editingOrderId = null;
  $('custSearch').value = '';
  $('orderNotes').value = '';
  $('orderType').value = 'Custom';
  $('delDate').value = dISO(new Date(Date.now() + 86400000)); // tomorrow
  $('editBanner').style.display = 'none';
  renderCustPanel();
  renderLines();
}
$('clearOrderBtn').addEventListener('click', resetOrderForm);
$('cancelEditBtn').addEventListener('click', resetOrderForm);

$('saveOrderBtn').addEventListener('click', async () => {
  if (!currentCustomer) { toast('Choose a customer first', true); return; }
  const lines = currentLines.filter((l) => l.qty > 0);
  if (!lines.length) { toast('Add at least one line', true); return; }
  const order = {
    AccountNumber: currentCustomer.account_number,
    Route: $('routeSel').value,
    DeliveryDate: $('delDate').value || dISO(),
    Total: lines.reduce((s, l) => s + l.qty * l.price, 0),
    DeliveryNotes: $('orderNotes').value,
    OrderType: $('orderType').value,
  };
  loading(true, editingOrderId ? 'Updating order…' : 'Saving order…');
  try {
    let orderId = editingOrderId;
    if (editingOrderId) {
      await writeWithFallback('PATCH', 'Orders', '?id=eq.' + editingOrderId, order, 'return=minimal');
      await sbDelete('order_lines?OrderId=eq.' + editingOrderId);
    } else {
      order.CreatedAt = new Date().toISOString();
      order.Picked = false;
      const rows = await writeWithFallback('POST', 'Orders', '', [order], 'return=representation');
      orderId = rows[0].id;
    }
    await writeWithFallback('POST', 'order_lines', '', lines.map((l) => ({
      OrderId: orderId, ProductCode: l.code, ProductName: l.name, Qty: l.qty, Price: l.price,
    })), 'return=minimal');
    toast(editingOrderId ? 'Order updated' : 'Order saved');
    resetOrderForm();
    await loadData();
  } catch (err) {
    showError('Saving the order failed', err);
  } finally { loading(false); }
});

function beginEditOrder(o) {
  const c = custByAcct(o.AccountNumber);
  editingOrderId = o.id;
  currentCustomer = c || { account_number: o.AccountNumber, account_name: o.AccountNumber };
  $('custSearch').value = (currentCustomer.account_name || '') + '  (' + o.AccountNumber + ')';
  $('orderType').value = o.OrderType || 'Custom';
  $('delDate').value = dOnly(o.DeliveryDate);
  $('routeSel').value = o.Route || ROUTES[0];
  $('orderNotes').value = o.DeliveryNotes || '';
  currentLines = (o.lines || []).map((l) => ({
    code: l.ProductCode,
    name: l.ProductName || (prodByCode(l.ProductCode) || {}).name || l.ProductCode,
    shorthand: (prodByCode(l.ProductCode) || {}).shorthand || '',
    qty: num(l.Qty), price: num(l.Price), manual: true,
  }));
  $('editBannerText').textContent = 'Editing order for ' + (currentCustomer.account_name || o.AccountNumber) + ' — ' + dNice(o.DeliveryDate);
  $('editBanner').style.display = '';
  renderCustPanel();
  renderLines();
  switchTab('entry');
  window.scrollTo({ top: 0 });
}

/* ═════════════════════════════ ROUTES ═══════════════════════════════════ */
function renderRoutes() {
  if (!$('routeDate').value) $('routeDate').value = dISO();
  const date = $('routeDate').value;
  const board = $('routeBoard');
  const todays = ORDERS.filter((o) => dOnly(o.DeliveryDate) === date);

  if (!todays.length) {
    board.innerHTML = '<div class="empty">No orders for ' + esc(dNice(date)) + '</div>';
    return;
  }
  const byRoute = {};
  todays.forEach((o) => { (byRoute[o.Route || 'Unassigned'] = byRoute[o.Route || 'Unassigned'] || []).push(o); });

  const routeNames = ROUTES.filter((r) => byRoute[r]).concat(Object.keys(byRoute).filter((r) => !ROUTES.includes(r)));

  board.innerHTML = routeNames.map((r) => {
    const orders = byRoute[r].slice().sort((a, b) => {
      const an = (custByAcct(a.AccountNumber) || {}).account_name || a.AccountNumber;
      const bn = (custByAcct(b.AccountNumber) || {}).account_name || b.AccountNumber;
      return String(an).localeCompare(String(bn));
    });
    const allPicked = orders.every((o) => o.Picked);
    const total = orders.reduce((s, o) => s + num(o.Total), 0);
    return '<div class="route-card' + (allPicked ? ' done' : '') + '" data-route="' + esc(r) + '">' +
      '<div class="rc-head"><span class="rc-driver">' + esc(r) + '</span>' +
      '<span class="rc-count">' + orders.length + ' order' + (orders.length === 1 ? '' : 's') + ' · ' + money(total) + '</span></div>' +
      '<div class="rc-orders">' +
      orders.map((o) => {
        const c = custByAcct(o.AccountNumber);
        return '<div class="rc-order' + (o.Picked ? ' picked' : '') + '">' +
          '<input type="checkbox" data-pick="' + o.id + '"' + (o.Picked ? ' checked' : '') + ' title="Picked">' +
          '<span class="who">' + esc((c && c.account_name) || o.AccountNumber) + '</span>' +
          '<span class="amt">' + money(o.Total) + '</span>' +
          '</div>';
      }).join('') +
      '</div>' +
      '<div class="rc-foot">' +
      '<button class="btn btn-small" data-pl="' + esc(r) + '">Pick list</button>' +
      '<button class="btn btn-small" data-dn="' + esc(r) + '">Delivery notes</button>' +
      '<button class="btn btn-small btn-danger" data-done="' + esc(r) + '">Mark delivered</button>' +
      '</div></div>';
  }).join('');
}
$('routeDate').addEventListener('change', () => renderRoutes());

$('routeBoard').addEventListener('change', async (e) => {
  const cb = e.target.closest('[data-pick]');
  if (!cb) return;
  const id = +cb.dataset.pick;
  try {
    await sbPatch('Orders?id=eq.' + id, { Picked: cb.checked });
    const o = ORDERS.find((x) => x.id === id);
    if (o) o.Picked = cb.checked;
    renderRoutes();
    updateBadges();
  } catch (err) { toast(err.message, true); cb.checked = !cb.checked; }
});

$('routeBoard').addEventListener('click', async (e) => {
  const pl = e.target.closest('[data-pl]');
  const dn = e.target.closest('[data-dn]');
  const done = e.target.closest('[data-done]');
  const date = $('routeDate').value;
  const forRoute = (r) => ORDERS.filter((o) => dOnly(o.DeliveryDate) === date && (o.Route || 'Unassigned') === r);

  if (pl) printPickList(pl.dataset.pl, date, forRoute(pl.dataset.pl));
  if (dn) printDeliveryNotes(forRoute(dn.dataset.dn));
  if (done) {
    const r = done.dataset.done;
    const orders = forRoute(r);
    if (!confirm('Mark ' + r + "'s route as delivered?\n\nThis deletes " + orders.length + ' order(s) for ' + dNice(date) + ' from this system. Invoice history stays in Sage.')) return;
    loading(true, 'Clearing route…');
    try {
      await sbDelete('Orders?Route=eq.' + encodeURIComponent(r) + '&DeliveryDate=eq.' + encodeURIComponent(date));
      toast(r + "'s route cleared");
      await loadData();
      renderRoutes();
    } catch (err) { toast(err.message, true); }
    finally { loading(false); }
  }
});

/* ───────────────────────────── printing ─────────────────────────────────── */
function doPrint(html) {
  const root = $('printRoot');
  root.innerHTML = html;
  document.body.classList.add('printing');
  const cleanup = () => { document.body.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => { window.print(); setTimeout(cleanup, 500); }, 60);
}

function custAddressLines(c) {
  if (!c) return [];
  return [c.address_1, c.address_2, c.address_3, c.address_4, c.city, c.county, c.postcode]
    .map((x) => String(x || '').trim()).filter(Boolean);
}

function printPickList(route, date, orders) {
  if (!orders.length) { toast('No orders on this route', true); return; }
  const sorted = orders.slice().sort((a, b) => {
    const an = (custByAcct(a.AccountNumber) || {}).account_name || a.AccountNumber;
    const bn = (custByAcct(b.AccountNumber) || {}).account_name || b.AccountNumber;
    return String(an).localeCompare(String(bn));
  });

  const agg = {};
  sorted.forEach((o) => (o.lines || []).forEach((l) => {
    const key = l.ProductCode;
    if (!agg[key]) agg[key] = { name: l.ProductName || key, short: (prodByCode(key) || {}).shorthand || '', qty: 0 };
    agg[key].qty += num(l.Qty);
  }));
  const aggRows = Object.keys(agg).map((k) => agg[k]).sort((a, b) => a.name.localeCompare(b.name));

  const html =
    '<div class="p-doc">' +
    '<div class="p-head"><div class="p-title">Pick list — ' + esc(route) + '</div>' +
    '<div class="p-co"><div class="co-name">' + esc(CONFIG.COMPANY.name) + '</div>' + esc(dNice(date)) + '</div></div>' +
    sorted.map((o) => {
      const c = custByAcct(o.AccountNumber);
      return '<div class="p-picksec">' +
        '<div class="p-pickhead"><span>' + esc((c && c.account_name) || o.AccountNumber) + '</span><span class="mono">' + esc(o.AccountNumber) + '</span></div>' +
        (o.DeliveryNotes ? '<div class="p-picknotes">' + esc(o.DeliveryNotes) + '</div>' : '') +
        '<table class="p-tbl"><thead><tr><th style="width:70px" class="r">Qty</th><th>Product</th><th style="width:120px">Shorthand</th></tr></thead><tbody>' +
        (o.lines || []).map((l) =>
          '<tr><td class="r"><b>' + num(l.Qty) + '</b></td><td>' + esc(l.ProductName || l.ProductCode) + '</td><td>' + esc((prodByCode(l.ProductCode) || {}).shorthand || '') + '</td></tr>'
        ).join('') +
        '</tbody></table></div>';
    }).join('') +
    '<div class="p-agg-title">Route totals — ' + esc(route) + '</div>' +
    '<table class="p-tbl"><thead><tr><th style="width:70px" class="r">Qty</th><th>Product</th><th style="width:120px">Shorthand</th></tr></thead><tbody>' +
    aggRows.map((a) => '<tr><td class="r"><b>' + a.qty + '</b></td><td>' + esc(a.name) + '</td><td>' + esc(a.short) + '</td></tr>').join('') +
    '</tbody></table>' +
    '</div>';
  doPrint(html);
}

function deliveryNoteHTML(o) {
  const c = custByAcct(o.AccountNumber);
  const addr = custAddressLines(c);
  return '<div class="p-doc">' +
    '<div class="p-head"><div class="p-title">Delivery note</div>' +
    '<div class="p-co"><div class="co-name">' + esc(CONFIG.COMPANY.name) + '</div>' +
    CONFIG.COMPANY.lines.map((l) => esc(l)).join('<br>') + '</div></div>' +

    '<div class="p-meta">' +
    '<div><b>Date</b>' + esc(dNice(o.DeliveryDate)) + '</div>' +
    '<div><b>Route</b>' + esc(o.Route || '—') + '</div>' +
    '<div><b>Account</b><span class="mono">' + esc(o.AccountNumber) + '</span></div>' +
    '<div><b>Order type</b>' + esc(o.OrderType || 'Custom') + '</div>' +
    '</div>' +

    '<div class="p-addr"><b>Deliver to</b>' +
    esc((c && c.account_name) || o.AccountNumber) +
    (addr.length ? '<br>' + addr.map(esc).join('<br>') : '') +
    ((c && c.phone) ? '<br>Tel: ' + esc(c.phone) : '') +
    '</div>' +

    '<table class="p-tbl"><thead><tr><th style="width:70px" class="r">Qty</th><th>Product</th><th style="width:90px" class="r">Unit £</th><th style="width:90px" class="r">Total £</th></tr></thead><tbody>' +
    (o.lines || []).map((l) =>
      '<tr><td class="r">' + num(l.Qty) + '</td><td>' + esc(l.ProductName || l.ProductCode) + '</td>' +
      '<td class="r">' + num(l.Price).toFixed(2) + '</td><td class="r">' + (num(l.Qty) * num(l.Price)).toFixed(2) + '</td></tr>'
    ).join('') +
    '</tbody></table>' +

    '<div class="p-total"><span>Total</span><span>' + money(o.Total) + '</span></div>' +
    (o.DeliveryNotes ? '<div class="p-notes"><b>Notes</b><br>' + esc(o.DeliveryNotes) + '</div>' : '') +
    '<div class="p-sign">' +
    '<div class="slot"><div class="rule"></div>Received by (print &amp; sign)</div>' +
    '<div class="slot"><div class="rule"></div>Cash received £</div>' +
    '</div>' +
    '</div>';
}

function printDeliveryNotes(orders) {
  if (!orders.length) { toast('No orders on this route', true); return; }
  const sorted = orders.slice().sort((a, b) => {
    const an = (custByAcct(a.AccountNumber) || {}).account_name || a.AccountNumber;
    const bn = (custByAcct(b.AccountNumber) || {}).account_name || b.AccountNumber;
    return String(an).localeCompare(String(bn));
  });
  doPrint(sorted.map(deliveryNoteHTML).join(''));
}

/* ═════════════════════════════ ORDER LOG ════════════════════════════════ */
function renderLog() {
  const q = $('logSearch').value.trim().toLowerCase();
  const route = $('logRoute').value;
  const type = $('logType').value;

  let list = ORDERS.slice();
  if (route) list = list.filter((o) => (o.Route || '') === route);
  if (type) list = list.filter((o) => (o.OrderType || 'Custom') === type);
  if (q) {
    list = list.filter((o) => {
      const c = custByAcct(o.AccountNumber);
      return String(o.AccountNumber || '').toLowerCase().includes(q) ||
             String((c && c.account_name) || '').toLowerCase().includes(q);
    });
  }
  $('logCount').textContent = list.length + ' order' + (list.length === 1 ? '' : 's');

  const byDay = {};
  list.forEach((o) => { (byDay[dOnly(o.DeliveryDate)] = byDay[dOnly(o.DeliveryDate)] || []).push(o); });
  const days = Object.keys(byDay).sort().reverse();

  $('logList').innerHTML = !days.length ? '<div class="empty">No matching orders</div>' :
    days.map((day) =>
      '<div class="log-day">' + esc(dNice(day)) + '</div>' +
      byDay[day].slice().sort((a, b) => String(a.Route || '').localeCompare(String(b.Route || ''))).map((o) => {
        const c = custByAcct(o.AccountNumber);
        const pushed = !!o.sage_order_id;
        return '<div class="log-item">' +
          '<span class="who">' + esc((c && c.account_name) || o.AccountNumber) +
          '<span class="acct">' + esc(o.AccountNumber) + '</span></span>' +
          (o.Route ? '<span class="badge b-route">' + esc(o.Route) + '</span>' : '') +
          '<span class="badge b-type">' + esc(o.OrderType || 'Custom') + '</span>' +
          (o.Picked ? '<span class="badge b-new">picked</span>' : '') +
          (pushed ? '<span class="badge b-new" title="Sage document ' + esc(o.sage_document_no || '') + '">sage ✓</span>' : '') +
          (o.sage_push_error && !pushed ? '<span class="badge b-err" title="' + esc(o.sage_push_error).slice(0, 200) + '">push failed</span>' : '') +
          '<span class="amt">' + money(o.Total) + '</span>' +
          '<button class="btn btn-small" data-lines="' + o.id + '">Lines</button>' +
          '<button class="btn btn-small" data-edit="' + o.id + '">Edit</button>' +
          '<button class="btn btn-small" data-print="' + o.id + '">Note</button>' +
          (pushed ? '' : '<button class="btn btn-small" data-push="' + o.id + '">Push to Sage</button>') +
          '<button class="btn btn-small btn-danger" data-delete="' + o.id + '">✕</button>' +
          '</div>' +
          '<div class="log-lines" id="lines-' + o.id + '"><table>' +
          (o.lines || []).map((l) =>
            '<tr><td style="width:50px"><b>' + num(l.Qty) + '</b></td><td>' + esc(l.ProductName || l.ProductCode) + '</td>' +
            '<td class="num" style="width:80px;text-align:right">' + money(num(l.Qty) * num(l.Price)) + '</td></tr>'
          ).join('') +
          (o.DeliveryNotes ? '<tr><td colspan="3" class="hint">' + esc(o.DeliveryNotes) + '</td></tr>' : '') +
          '</table></div>';
      }).join('')
    ).join('');
}
['logSearch', 'logRoute', 'logType'].forEach((id) => {
  $(id).addEventListener('input', renderLog);
});

$('logList').addEventListener('click', async (e) => {
  const lines = e.target.closest('[data-lines]');
  const edit = e.target.closest('[data-edit]');
  const print = e.target.closest('[data-print]');
  const del = e.target.closest('[data-delete]');
  const push = e.target.closest('[data-push]');

  if (push) {
    const o = ORDERS.find((x) => x.id === +push.dataset.push);
    if (!o) return;
    const c = custByAcct(o.AccountNumber);
    if (!confirm('Push this order for ' + ((c && c.account_name) || o.AccountNumber) + ' (' + money(o.Total) + ') to Sage as a real sales order?\n\nThis creates a live document in Sage — it is not a test.')) return;
    loading(true, 'Pushing to Sage…');
    try {
      const r = await fn('pushOrder', { order_id: o.id });
      o.sage_order_id = r.sage_order_id;
      o.sage_document_no = r.sage_document_no;
      toast('Pushed to Sage as ' + (r.sage_document_no || r.sage_order_id));
      renderLog();
    } catch (err) {
      showError('Pushing to Sage failed', err);
    } finally { loading(false); }
    return;
  }

  if (lines) $('lines-' + lines.dataset.lines).classList.toggle('open');
  if (edit) { const o = ORDERS.find((x) => x.id === +edit.dataset.edit); if (o) beginEditOrder(o); }
  if (print) { const o = ORDERS.find((x) => x.id === +print.dataset.print); if (o) doPrint(deliveryNoteHTML(o)); }
  if (del) {
    const o = ORDERS.find((x) => x.id === +del.dataset.delete);
    if (!o) return;
    const c = custByAcct(o.AccountNumber);
    if (!confirm('Delete this order for ' + ((c && c.account_name) || o.AccountNumber) + '?')) return;
    try {
      await sbDelete('Orders?id=eq.' + o.id);
      toast('Order deleted');
      await loadData();
      renderLog();
    } catch (err) { toast(err.message, true); }
  }
});

/* ═════════════════════════════ PRODUCTS ═════════════════════════════════ */
$('addProductBtn').addEventListener('click', async () => {
  const code = $('npCode').value.trim();
  const name = $('npName').value.trim();
  if (!code || !name) { toast('Code and name are required', true); return; }
  loading(true, 'Adding product…');
  try {
    await sbPost('Products?on_conflict=code', [{ code, name, shorthand: $('npShort').value.trim() }], 'resolution=merge-duplicates,return=minimal');
    const priceRow = { code };
    if ($('npRetail').value !== '') priceRow.retail_price = num($('npRetail').value);
    if ($('npWholesale').value !== '') priceRow.wholesale_price = num($('npWholesale').value);
    await sbPost('Prices?on_conflict=code', [priceRow], 'resolution=merge-duplicates,return=minimal');
    ['npCode', 'npName', 'npShort', 'npRetail', 'npWholesale'].forEach((id) => { $(id).value = ''; });
    toast('Product added');
    await loadData();
    renderProducts();
  } catch (err) { toast(err.message, true); }
  finally { loading(false); }
});

function renderProducts() {
  const q = $('prodFilter').value.trim().toLowerCase();
  const list = q ? searchProducts(q) : PRODUCTS;
  $('prodCount').textContent = list.length + ' of ' + PRODUCTS.length;
  $('prodBody').innerHTML = list.map((p) =>
    '<tr data-code="' + esc(p.code) + '">' +
    '<td class="mono">' + esc(p.code) + '</td>' +
    '<td><input type="text" data-f="name" value="' + esc(p.name) + '"></td>' +
    '<td><input type="text" data-f="shorthand" value="' + esc(p.shorthand) + '" style="width:110px"></td>' +
    '<td class="t-right"><input type="number" step="0.01" class="price-in num" data-p="retail_price" value="' + (p.prices.retail_price ?? '') + '"></td>' +
    '<td class="t-right"><input type="number" step="0.01" class="price-in num" data-p="wholesale_price" value="' + (p.prices.wholesale_price ?? '') + '"></td>' +
    '<td><button class="btn btn-small" data-tiers="' + esc(p.code) + '">All prices</button></td>' +
    '<td><button class="btn btn-small btn-danger" data-delprod="' + esc(p.code) + '">✕</button></td>' +
    '</tr>' +
    '<tr class="tier-row" data-tier-for="' + esc(p.code) + '" style="display:none"><td colspan="7"></td></tr>'
  ).join('') || '<tr><td colspan="7" class="empty">No products</td></tr>';
}
$('prodFilter').addEventListener('input', renderProducts);

$('prodBody').addEventListener('change', async (e) => {
  const el = e.target;
  const tr = el.closest('tr[data-code]');
  if (!tr) return;
  const code = tr.dataset.code;
  try {
    if (el.dataset.f) {
      await sbPatch('Products?code=eq.' + encodeURIComponent(code), { [el.dataset.f]: el.value.trim() });
    } else if (el.dataset.p) {
      await sbPost('Prices?on_conflict=code', [{ code, [el.dataset.p]: el.value === '' ? null : num(el.value) }], 'resolution=merge-duplicates,return=minimal');
    } else return;
    const p = prodByCode(code);
    if (p) {
      if (el.dataset.f) p[el.dataset.f] = el.value.trim();
      if (el.dataset.p) p.prices[el.dataset.p] = el.value === '' ? null : num(el.value);
    }
    toast('Saved');
  } catch (err) { toast(err.message, true); }
});

$('prodBody').addEventListener('click', async (e) => {
  const tiers = e.target.closest('[data-tiers]');
  const del = e.target.closest('[data-delprod]');
  const saveTiers = e.target.closest('[data-savetiers]');

  if (tiers) {
    const code = tiers.dataset.tiers;
    const row = document.querySelector('tr[data-tier-for="' + CSS.escape(code) + '"]');
    if (row.style.display !== 'none') { row.style.display = 'none'; return; }
    const p = prodByCode(code);
    row.firstElementChild.innerHTML =
      '<div class="row" style="flex-wrap:wrap;gap:10px;padding:6px 0">' +
      PRICE_TIERS.map((t) =>
        '<div style="flex:0 0 150px"><label class="fld">' + esc(t) + '</label>' +
        '<input type="number" step="0.01" class="num" data-tiercol="' + esc(t) + '" value="' + (p.prices[t] ?? '') + '"></div>'
      ).join('') +
      '</div><div class="modal-actions" style="margin-top:4px"><div class="right">' +
      '<button class="btn btn-small btn-primary" data-savetiers="' + esc(code) + '">Save all prices</button></div></div>';
    row.style.display = '';
  }

  if (saveTiers) {
    const code = saveTiers.dataset.savetiers;
    const row = document.querySelector('tr[data-tier-for="' + CSS.escape(code) + '"]');
    const body = { code };
    row.querySelectorAll('[data-tiercol]').forEach((inp) => {
      body[inp.dataset.tiercol] = inp.value === '' ? null : num(inp.value);
    });
    loading(true, 'Saving prices…');
    try {
      await sbPost('Prices?on_conflict=code', [body], 'resolution=merge-duplicates,return=minimal');
      const p = prodByCode(code);
      if (p) Object.assign(p.prices, body);
      toast('Prices saved');
      row.style.display = 'none';
    } catch (err) { toast(err.message, true); }
    finally { loading(false); }
  }

  if (del) {
    const code = del.dataset.delprod;
    const p = prodByCode(code);
    if (!confirm('Delete ' + ((p && p.name) || code) + ' and all its prices?')) return;
    try {
      await sbDelete('Prices?code=eq.' + encodeURIComponent(code));
      await sbDelete('Products?code=eq.' + encodeURIComponent(code));
      toast('Product deleted');
      await loadData();
      renderProducts();
    } catch (err) { toast(err.message, true); }
  }
});

/* ═════════════════════════════ CUSTOMERS ════════════════════════════════ */
$('addCustomerBtn').addEventListener('click', async () => {
  const acct = $('ncNum').value.trim();
  const name = $('ncName').value.trim();
  if (!acct || !name) { toast('Account number and name are required', true); return; }
  try {
    await sbPost('Customers?on_conflict=account_number', [{ account_number: acct, account_name: name, fallback_price: 'Wholesale' }], 'resolution=merge-duplicates,return=minimal');
    $('ncNum').value = ''; $('ncName').value = '';
    toast('Customer added');
    await loadData();
    renderCustomers();
  } catch (err) { toast(err.message, true); }
});

function renderCustomers() {
  const q = $('custFilter').value.trim().toLowerCase();
  const list = q ? searchCustomers(q) : CUSTOMERS;
  $('custCount').textContent = list.length + ' of ' + CUSTOMERS.length;
  $('custBody').innerHTML = list.slice(0, 400).map((c) =>
    '<tr>' +
    '<td>' + esc(c.account_name || '') + '</td>' +
    '<td class="mono">' + esc(c.account_number || '') + '</td>' +
    '<td>' + esc(c.price_band || '—') + '</td>' +
    '<td>' + (c.Route ? '<span class="badge b-route">' + esc(c.Route) + '</span>' : '—') + '</td>' +
    '<td>' + (c.on_hold ? '<span class="badge b-hold">HOLD</span>' : '') + '</td>' +
    '<td class="t-right"><button class="btn btn-small" data-editcust="' + esc(c.account_number) + '">Edit</button></td>' +
    '</tr>'
  ).join('') || '<tr><td colspan="6" class="empty">No customers</td></tr>';
  if (list.length > 400) $('custBody').innerHTML += '<tr><td colspan="6" class="empty">Showing first 400 — refine the filter</td></tr>';
}
$('custFilter').addEventListener('input', renderCustomers);

let modalCustomer = null;

$('custBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-editcust]');
  if (b) openCustomerModal(custByAcct(b.dataset.editcust));
});

function openCustomerModal(c) {
  if (!c) return;
  modalCustomer = c;
  $('cmTitle').textContent = c.account_number + ' — ' + (c.account_name || '');
  $('cmName').value = c.account_name || '';
  $('cmRoute').value = c.Route || '';
  $('cmBand').value = resolveTierCol(c.price_band) || '';
  $('cmFallback').value = /ret/i.test(c.fallback_price || '') ? 'Retail' : 'Wholesale';
  $('cmNotes').value = c.Notes || '';
  $('cmPhone').value = c.phone || '';
  $('cmEmail').value = c.email || '';
  const addr = custAddressLines(c);
  $('cmAddress').textContent = addr.length ? addr.join(', ') : 'No address yet — it arrives with the Sage sync';
  renderOverrides();
  $('ovSearch').value = ''; $('ovPrice').value = '';
  $('custModal').classList.add('open');
}
function closeCustomerModal() { $('custModal').classList.remove('open'); modalCustomer = null; }
$('cmCloseBtn').addEventListener('click', closeCustomerModal);
$('custModal').addEventListener('click', (e) => { if (e.target === $('custModal')) closeCustomerModal(); });

function renderOverrides() {
  const c = modalCustomer;
  const list = OVERRIDES.filter((o) => o.account_number === c.account_number);
  $('ovList').innerHTML = list.length ? list.map((o) => {
    const p = prodByCode(o.product_code);
    return '<div class="log-item"><span class="who">' + esc((p && p.name) || o.product_code) +
      '<span class="acct">' + esc(o.product_code) + '</span></span>' +
      '<span class="amt">' + money(o.price) + '</span>' +
      '<button class="btn btn-small btn-danger" data-delov="' + esc(o.product_code) + '">✕</button></div>';
  }).join('') : '<div class="empty">No overrides for this customer</div>';
}

let ovSelected = null;
attachDropdown($('ovSearch'), $('ovResults'), searchProducts, (p) =>
  '<span class="dd-main">' + esc(p.name) + '</span><span class="dd-side"><span class="mono">' + esc(p.code) + '</span></span>',
(p) => { ovSelected = p; $('ovSearch').value = p.name + ' (' + p.code + ')'; });

$('ovAddBtn').addEventListener('click', async () => {
  if (!modalCustomer || !ovSelected) { toast('Pick a product first', true); return; }
  if ($('ovPrice').value === '') { toast('Enter the override price', true); return; }
  try {
    await sbPost('customer_overrides?on_conflict=account_number,product_code',
      [{ account_number: modalCustomer.account_number, product_code: ovSelected.code, price: num($('ovPrice').value) }],
      'resolution=merge-duplicates,return=minimal');
    OVERRIDES = OVERRIDES.filter((o) => !(o.account_number === modalCustomer.account_number && o.product_code === ovSelected.code));
    OVERRIDES.push({ account_number: modalCustomer.account_number, product_code: ovSelected.code, price: num($('ovPrice').value) });
    ovSelected = null; $('ovSearch').value = ''; $('ovPrice').value = '';
    renderOverrides();
    toast('Override saved');
  } catch (err) { toast(err.message, true); }
});

$('ovList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-delov]');
  if (!b || !modalCustomer) return;
  try {
    await sbDelete('customer_overrides?account_number=eq.' + encodeURIComponent(modalCustomer.account_number) + '&product_code=eq.' + encodeURIComponent(b.dataset.delov));
    OVERRIDES = OVERRIDES.filter((o) => !(o.account_number === modalCustomer.account_number && o.product_code === b.dataset.delov));
    renderOverrides();
    toast('Override removed');
  } catch (err) { toast(err.message, true); }
});

$('cmSaveBtn').addEventListener('click', async () => {
  if (!modalCustomer) return;
  loading(true, 'Saving customer…');
  try {
    await sbPatch('Customers?account_number=eq.' + encodeURIComponent(modalCustomer.account_number), {
      account_name: $('cmName').value.trim(),
      Route: $('cmRoute').value || null,
      price_band: $('cmBand').value || null,
      fallback_price: $('cmFallback').value,
      Notes: $('cmNotes').value,
      phone: $('cmPhone').value.trim(),
      email: $('cmEmail').value.trim(),
    });
    toast('Customer saved');
    closeCustomerModal();
    await loadData();
    renderCustomers();
  } catch (err) { toast(err.message, true); }
  finally { loading(false); }
});

$('cmDeleteBtn').addEventListener('click', async () => {
  if (!modalCustomer) return;
  if (!confirm('Delete ' + (modalCustomer.account_name || modalCustomer.account_number) + '?\n\nIf they still exist in Sage, the next sync will bring them back.')) return;
  loading(true, 'Deleting…');
  try {
    await sbDelete('customer_overrides?account_number=eq.' + encodeURIComponent(modalCustomer.account_number)).catch(() => {});
    await sbDelete('Customers?account_number=eq.' + encodeURIComponent(modalCustomer.account_number));
    toast('Customer deleted');
    closeCustomerModal();
    await loadData();
    renderCustomers();
  } catch (err) { toast(err.message, true); }
  finally { loading(false); }
});

/* ═════════════════════════════ SAGE TAB ═════════════════════════════════ */
async function refreshSageStatus() {
  const strip = $('sgStrip');
  try {
    const s = await fn('status');
    strip.classList.toggle('ok', s.connected);
    strip.classList.remove('err');
    $('sgStatusText').textContent = s.connected ? 'Connected to Sage' : 'Not connected';
    const bits = [];
    if (s.connected && s.site_id) bits.push('Site ' + s.site_id + ' · Company ' + s.company_id);
    if (s.last_sync) bits.push('Last sync: ' + new Date(s.last_sync.started_at).toLocaleString('en-GB') + ' (' + s.last_sync.status + ')');
    $('sgMeta').textContent = bits.join('  ·  ');
    $('sgDisconnectBtn').style.display = s.connected ? '' : 'none';
    $('sgChangeCompanyBtn').style.display = s.connected ? '' : 'none';
    $('sgConnectBtn').textContent = s.connected ? 'Reconnect' : 'Connect to Sage';
  } catch (err) {
    strip.classList.add('err');
    strip.classList.remove('ok');
    $('sgStatusText').textContent = 'Sage function unreachable';
    $('sgMeta').textContent = err.message;
    $('sgDisconnectBtn').style.display = 'none';
  }
}

function renderCompanyPicker(companies, currentCompanyId) {
  const box = $('sgCompanyPicker');
  if (!companies || !companies.length) {
    box.classList.remove('open');
    box.innerHTML = '';
    return;
  }
  box.innerHTML = '<b>Choose the correct Sage company</b><br>' +
    companies.map((c) => {
      const isDemo = /demo/i.test(c.company_name || '');
      const isCurrent = String(c.company_id) === String(currentCompanyId);
      return '<div class="log-item">' +
        '<span class="who">' + esc(c.company_name || '') +
        (isDemo ? ' <span class="badge b-hold">demo</span>' : '') +
        (isCurrent ? ' <span class="badge b-new">current</span>' : '') +
        '<span class="acct">' + esc(c.site_name || '') + '</span></span>' +
        '<button class="btn btn-small' + (isCurrent ? '' : ' btn-primary') + '" data-pickco="' + esc(c.company_id) + '" data-siteco="' + esc(c.site_id) + '">' +
        (isCurrent ? 'Selected' : 'Use this company') + '</button>' +
        '</div>';
    }).join('');
  box.classList.add('open');
}

$('sgCompanyPicker').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-pickco]');
  if (!b) return;
  loading(true, 'Switching company…');
  try {
    await fn('selectCompany', { company_id: b.dataset.pickco, site_id: b.dataset.siteco });
    toast('Company updated — run Sync now to load its data');
    $('sgCompanyPicker').classList.remove('open');
    await refreshSageStatus();
  } catch (err) { showError('Could not switch company', err); }
  finally { loading(false); }
});

$('sgChangeCompanyBtn').addEventListener('click', async () => {
  loading(true, 'Loading companies…');
  try {
    const s = await fn('status');
    const r = await fn('sites');
    renderCompanyPicker(r.companies, s.company_id);
  } catch (err) { showError('Could not load Sage companies', err); }
  finally { loading(false); }
});
$('sgConnectBtn').addEventListener('click', () => {
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  try { sessionStorage.setItem('sage_state', state); } catch (_) {}
  const url = 'https://id.sage.com/authorize' +
    '?audience=' + encodeURIComponent('s200ukipd/sage200') +
    '&response_type=code' +
    '&client_id=' + encodeURIComponent(CONFIG.SAGE_CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(CONFIG.SAGE_REDIRECT) +
    '&scope=' + encodeURIComponent('openid profile email offline_access') +
    '&state=' + encodeURIComponent(state);
  location.href = url;
});

$('sgDisconnectBtn').addEventListener('click', async () => {
  if (!confirm('Disconnect from Sage? You can reconnect at any time.')) return;
  try { await fn('disconnect'); toast('Disconnected'); refreshSageStatus(); }
  catch (err) { toast(err.message, true); }
});

async function handleOAuthReturn() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (!code) return;
  let saved = null;
  try { saved = sessionStorage.getItem('sage_state'); sessionStorage.removeItem('sage_state'); } catch (_) {}
  history.replaceState({}, '', location.pathname); // clean the URL immediately
  if (saved && params.get('state') && saved !== params.get('state')) {
    toast('Sage sign-in state mismatch — please press Connect again', true);
    return;
  }
  loading(true, 'Finishing Sage sign-in…');
  try {
    const r = await fn('exchange', { code });
    if (r.needs_company_selection) {
      toast('Connected — choose which company to use');
      switchTab('sage');
      renderCompanyPicker(r.companies, null);
    } else {
      toast(r.warning ? r.warning : ('Connected to ' + (r.company_name || 'Sage')));
      switchTab('sage');
    }
  } catch (err) {
    showError('Sage connection failed', err);
    switchTab('sage');
  } finally { loading(false); }
}

$('sgSyncBtn').addEventListener('click', async () => {
  loading(true, 'Syncing from Sage…');
  const box = $('sgSummary');
  try {
    const r = await fn('sync');
    const s = r.summary || {};
    const parts = [];
    parts.push('<b>Sync complete.</b> ' + (s.customers_fetched ?? 0) + ' customers fetched from Sage — ' +
      (s.customers_created ?? 0) + ' new, ' + (s.customers_updated ?? 0) + ' updated. ' +
      (s.price_bands ?? 0) + ' price bands.');
    if (s.addresses_included === false) parts.push('<span class="badge b-err">Addresses unavailable this run</span>');
    if (s.new_customers && s.new_customers.length) {
      parts.push('<b>New customers (assign a route):</b><ul>' + s.new_customers.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>');
    }
    if (s.unmapped_bands && s.unmapped_bands.length) {
      parts.push('<b>Bands with no Prices column yet</b> — map them below, then sync again:<ul>' +
        s.unmapped_bands.map((b) => '<li>' + esc(b.band_name) + ' (id ' + b.band_id + ') — ' + b.customers + ' customer(s)</li>').join('') + '</ul>');
    }
    if (s.warnings && s.warnings.length) {
      parts.push('<b>Warnings:</b><ul>' + s.warnings.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>');
    }
    box.innerHTML = parts.join('<br>');
    box.classList.add('open');
    toast('Sage sync complete');
    await loadData();
    renderBandMap();
    loadSyncLog();
    refreshSageStatus();
  } catch (err) {
    box.innerHTML = '<span class="badge b-err">Sync failed</span> ' + esc(err.message);
    box.classList.add('open');
    showError('Sage sync failed', err);
  } finally { loading(false); }
});

function renderBandMap() {
  const counts = {};
  CUSTOMERS.forEach((c) => {
    if (c.price_band_id != null) counts[c.price_band_id] = (counts[c.price_band_id] || 0) + 1;
  });
  const tb = $('bandBody');
  if (!BAND_MAP.length) {
    tb.innerHTML = '<tr><td colspan="4" class="empty">Run a sync to load bands from Sage</td></tr>';
    return;
  }
  const opts = (sel) => '<option value="">— not mapped —</option>' +
    PRICE_TIERS.map((t) => '<option' + (t === sel ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
  tb.innerHTML = BAND_MAP.slice().sort((a, b) => (counts[b.band_id] || 0) - (counts[a.band_id] || 0)).map((m) =>
    '<tr>' +
    '<td class="mono">' + esc(m.band_id) + '</td>' +
    '<td>' + esc(m.band_name || '') + '</td>' +
    '<td class="t-right">' + (counts[m.band_id] || 0) + '</td>' +
    '<td><select data-band="' + esc(m.band_id) + '">' + opts(m.tier_column || '') + '</select></td>' +
    '</tr>'
  ).join('');
}

$('bandBody').addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-band]');
  if (!sel) return;
  try {
    await sbPatch('price_band_map?band_id=eq.' + encodeURIComponent(sel.dataset.band), { tier_column: sel.value || null });
    const m = BAND_MAP.find((x) => String(x.band_id) === String(sel.dataset.band));
    if (m) m.tier_column = sel.value || null;
    toast('Mapping saved — run Sync now to apply it to customers');
  } catch (err) { toast(err.message, true); }
});

$('sgSyncProductsBtn').addEventListener('click', async () => {
  loading(true, 'Syncing products from Sage…');
  const box = $('sgProductSummary');
  try {
    const r = await fn('syncProducts');
    const s = r.summary || {};
    box.innerHTML = '<b>Product sync complete.</b> ' + (s.sage_products_fetched ?? 0) + ' products fetched from Sage — ' +
      (s.matched_to_your_products ?? 0) + ' matched to your products' +
      (s.your_products_still_unmapped ? '. <span class="badge b-err">' + s.your_products_still_unmapped + ' of your products have no Sage match</span> — check their codes match exactly.' : '.');
    box.classList.add('open');
    toast('Product sync complete');
    await loadSageProductMap();
  } catch (err) {
    box.innerHTML = '<span class="badge b-err">Sync failed</span> ' + esc(err.message);
    box.classList.add('open');
    showError('Product sync failed', err);
  } finally { loading(false); }
});

async function loadSageProductMap() {
  try {
    const rows = await sbGet('sage_product_map?select=*&order=product_code.asc');
    const mapped = new Set(rows.map((r) => r.product_code));
    const unmapped = PRODUCTS.filter((p) => !mapped.has(p.code));
    const tb = $('sgUnmappedBody');
    if (!rows.length && !unmapped.length) {
      tb.innerHTML = '<tr><td colspan="4" class="empty">Run Sync products to see mapping status</td></tr>';
      return;
    }
    const mappedRows = rows.map((r) =>
      '<tr><td class="mono">' + esc(r.product_code) + '</td><td class="mono">' + esc(r.sage_code || '') + '</td><td>' + esc(r.tax_code_id ?? '') + '</td><td><span class="badge b-new">mapped</span></td></tr>'
    ).join('');
    const unmappedRows = unmapped.map((p) =>
      '<tr><td class="mono">' + esc(p.code) + '</td><td>—</td><td>—</td><td><span class="badge b-err">no Sage match</span></td></tr>'
    ).join('');
    tb.innerHTML = unmappedRows + mappedRows || '<tr><td colspan="4" class="empty">No products yet</td></tr>';
  } catch (_) { /* table may not exist until migration runs */ }
}

$('probeBtn').addEventListener('click', async () => {
  const path = $('probePath').value.trim();
  if (!path) { toast('Enter a Sage path, e.g. price_bands', true); return; }
  const out = $('probeOut');
  out.textContent = 'Calling Sage…';
  out.classList.add('open');
  try {
    const r = await fn('probe', { path });
    out.textContent = 'HTTP ' + r.status + '\n\n' + r.body;
  } catch (err) {
    out.textContent = 'Error: ' + err.message;
  }
});

async function loadSyncLog() {
  try {
    const rows = await sbGet('sage_sync_log?select=*&order=id.desc&limit=10');
    $('sgLogBody').innerHTML = rows && rows.length ? rows.map((r) => {
      const s = r.summary || {};
      const desc = r.status === 'ok'
        ? (s.customers_fetched ?? 0) + ' customers · ' + (s.customers_created ?? 0) + ' new · ' + (s.customers_updated ?? 0) + ' updated'
        : esc(r.error || 'failed');
      return '<tr><td>' + new Date(r.started_at).toLocaleString('en-GB') + '</td>' +
        '<td>' + (r.status === 'ok' ? '<span class="badge b-new">ok</span>' : '<span class="badge b-err">error</span>') + '</td>' +
        '<td>' + desc + '</td></tr>';
    }).join('') : '<tr><td colspan="3" class="empty">No syncs yet</td></tr>';
  } catch (_) { /* table may not exist yet */ }
}

/* ═════════════════════════════ BACKUP ═══════════════════════════════════ */
$('exportBtn').addEventListener('click', async () => {
  loading(true, 'Building backup…');
  try {
    const [products, prices, customers, overrides, orders, lines] = await Promise.all([
      sbGet('Products?select=*'), sbGet('Prices?select=*'), sbGet('Customers?select=*'),
      sbGet('customer_overrides?select=*').catch(() => []),
      sbGet('Orders?select=*'), sbGet('order_lines?select=*'),
    ]);
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), products, prices, customers, overrides, orders, lines }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'orders-backup-' + dISO() + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup downloaded');
  } catch (err) { toast(err.message, true); }
  finally { loading(false); }
});

$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); }
  catch (_) { toast('That file is not a valid backup', true); return; }
  if (!confirm('Restore products, prices, customers and overrides from this backup?\n\nExisting records with the same keys are overwritten. Orders are not restored.')) return;
  loading(true, 'Restoring backup…');
  try {
    if (Array.isArray(data.products) && data.products.length) {
      await sbPost('Products?on_conflict=code', data.products, 'resolution=merge-duplicates,return=minimal');
    }
    if (Array.isArray(data.prices) && data.prices.length) {
      await sbPost('Prices?on_conflict=code', data.prices, 'resolution=merge-duplicates,return=minimal');
    }
    if (Array.isArray(data.customers) && data.customers.length) {
      for (let i = 0; i < data.customers.length; i += 300) {
        await sbPost('Customers?on_conflict=account_number', data.customers.slice(i, i + 300), 'resolution=merge-duplicates,return=minimal');
      }
    }
    if (Array.isArray(data.overrides) && data.overrides.length) {
      await sbPost('customer_overrides?on_conflict=account_number,product_code', data.overrides, 'resolution=merge-duplicates,return=minimal');
    }
    toast('Backup restored');
    await loadData();
  } catch (err) { toast(err.message, true); }
  finally { loading(false); }
});

/* ═════════════════════════════ BOOT ═════════════════════════════════════ */
(async function boot() {
  $('delDate').value = dISO(new Date(Date.now() + 86400000));
  $('routeDate').value = dISO();
  try {
    await loadData();
    $('dbDot').classList.add('ok');
    $('dbLabel').textContent = CUSTOMERS.length + ' customers · ' + PRODUCTS.length + ' products';
  } catch (err) {
    $('dbDot').classList.add('bad');
    $('dbLabel').textContent = 'database error';
    toast('Could not load data: ' + err.message, true);
  }
  handleOAuthReturn();
})();
