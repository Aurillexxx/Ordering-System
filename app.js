// ── DEFAULT DATA ──────────────────────────────────────────────────────────────
const ROUTES=["Route 1 – North","Route 2 – South","Route 3 – East","Route 4 – West","Route 5 – City","Route 6 – Collect"];

// ── STATE ─────────────────────────────────────────────────────────────────────
let PRODUCTS=[],CUSTOMERS=[],TIERS={};
let lines=[],savedOrders=[],lineIdCounter=0;
let activeDD=null,ddHighlight=-1;
let activeRouteDay=null,activeRoute=null,pickedState={},deliveredRoutes={};
let activeCat='All';
let saveTimer=null;

// ── SUPABASE CONNECTION ──────────────────────────────────────────────────────
const SUPABASE_URL = 'https://nkrngozfcbrqfsrydnqw.supabase.co/rest/v1';
const SUPABASE_KEY = 'sb_publishable_sPepBMPUdlt6dMpL6yNCfg_bdkrMvNY';

function sbHeaders(extra={}){
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function sbGet(table, query=''){
  const res = await fetch(`${SUPABASE_URL}/${table}${query}`, { headers: sbHeaders() });
  if(!res.ok) throw new Error(`GET ${table} failed: ${res.status}`);
  return res.json();
}
async function sbInsert(table, body){
  const res = await fetch(`${SUPABASE_URL}/${table}`, {
    method:'POST', headers: sbHeaders({'Prefer':'return=representation'}), body: JSON.stringify(body)
  });
  if(!res.ok) throw new Error(`INSERT ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}
async function sbUpdate(table, query, body){
  const res = await fetch(`${SUPABASE_URL}/${table}${query}`, {
    method:'PATCH', headers: sbHeaders({'Prefer':'return=representation'}), body: JSON.stringify(body)
  });
  if(!res.ok) throw new Error(`UPDATE ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}
async function sbDelete(table, query){
  const res = await fetch(`${SUPABASE_URL}/${table}${query}`, { method:'DELETE', headers: sbHeaders() });
  if(!res.ok) throw new Error(`DELETE ${table} failed: ${res.status}`);
}
async function sbUpsert(table, body){
  const res = await fetch(`${SUPABASE_URL}/${table}`, {
    method:'POST', headers: sbHeaders({'Prefer':'resolution=merge-duplicates,return=representation'}), body: JSON.stringify(body)
  });
  if(!res.ok) throw new Error(`UPSERT ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// In-memory id maps so the rest of the app can keep using names/codes as keys
let tierIdByName = {};
let tierNameById = {};
let custIdByName = {};

// ── LOAD ALL DATA FROM SUPABASE ──────────────────────────────────────────────
async function loadData(){
  showSaveStatus('Loading…');
  try{
    const [prodRows, tierRows, tierPriceRows, custRows, overrideRows, orderRows, orderLineRows] = await Promise.all([
      sbGet('products', '?select=*&order=code'),
      sbGet('tiers', '?select=*&order=name'),
      sbGet('tier_prices', '?select=*'),
      sbGet('customers', '?select=*&order=name'),
      sbGet('customer_overrides', '?select=*'),
      sbGet('orders', '?select=*&order=created_at'),
      sbGet('order_lines', '?select=*')
    ]);

    // Products
    PRODUCTS = prodRows.map(p=>({
      code:p.code, name:p.name, cat:p.category||'', unit:p.unit||'Each',
      retail:Number(p.retail_price)||0, wholesale:Number(p.wholesale_price)||0, short:p.shorthand||''
    }));

    // Tiers
    tierIdByName = {}; tierNameById = {};
    tierRows.forEach(t=>{ tierIdByName[t.name]=t.id; tierNameById[t.id]=t.name; });
    TIERS = {};
    tierRows.forEach(t=>{ TIERS[t.name] = {}; });
    tierPriceRows.forEach(tp=>{
      const tName = tierNameById[tp.tier_id];
      if(tName) TIERS[tName][tp.product_code] = Number(tp.price);
    });

    // Customers
    custIdByName = {};
    CUSTOMERS = custRows.map(c=>{
      custIdByName[c.name] = c.id;
      const tierName = c.tier_id ? tierNameById[c.tier_id] : '';
      const overrides = {};
      overrideRows.filter(o=>o.customer_id===c.id).forEach(o=>{ overrides[o.product_code]=Number(o.price); });
      return { id:c.id, name:c.name, notes:c.notes||'', tier:tierName||'', fallback:c.fallback_price||'Retail', overrides };
    });

    // Orders + lines
    savedOrders = orderRows.map(o=>{
      const lines = orderLineRows.filter(l=>l.order_id===o.id).map(l=>({
        productCode:l.product_code, productName:l.product_name, qty:Number(l.qty), price:Number(l.price)
      }));
      return {
        dbId:o.id, num:o.order_number, cust:o.customer_name, type:o.order_type,
        driver:o.driver_route, delDate:o.delivery_date, total:Number(o.total), items:o.items_count,
        custNotes:o.customer_notes||'', custTier:o.customer_tier||'', lines
      };
    });

    pickedState = {}; deliveredRoutes = {};
    orderRows.forEach(o=>{
      // Reconstruct picked/delivered state per route+customer (best effort from order flags)
    });

    showSaveStatus('Loaded');
  } catch(e){
    console.error(e);
    showSaveStatus('Could not load — check connection', true);
  }
}

// ── SAVE HELPERS (called from individual edit functions, not a single blob) ──
async function saveProductToDb(p){
  try{
    await sbUpsert('products', [{
      code:p.code, name:p.name, category:p.cat, unit:p.unit,
      retail_price:p.retail, wholesale_price:p.wholesale, shorthand:p.short,
      updated_at:new Date().toISOString()
    }]);
    showSaveStatus('Saved');
  }catch(e){console.error(e);showSaveStatus('Save failed',true);}
}
async function deleteProductFromDb(code){
  try{ await sbDelete('products', `?code=eq.${encodeURIComponent(code)}`); showSaveStatus('Saved'); }
  catch(e){console.error(e);showSaveStatus('Delete failed',true);}
}
async function saveCustomerToDb(c){
  try{
    const tierId = c.tier ? tierIdByName[c.tier] : null;
    const rows = await sbUpsert('customers', [{
      id:c.id, name:c.name, notes:c.notes, tier_id:tierId, fallback_price:c.fallback||'Retail', updated_at:new Date().toISOString()
    }]);
    if(rows && rows[0]) c.id = rows[0].id;
    custIdByName[c.name]=c.id;
    showSaveStatus('Saved');
  }catch(e){console.error(e);showSaveStatus('Save failed',true);}
}
async function deleteCustomerFromDb(id){
  try{ await sbDelete('customers', `?id=eq.${id}`); showSaveStatus('Saved'); }
  catch(e){console.error(e);showSaveStatus('Delete failed',true);}
}
async function saveOverrideToDb(customerId, code, price){
  try{ await sbUpsert('customer_overrides', [{customer_id:customerId, product_code:code, price}]); showSaveStatus('Saved'); }
  catch(e){console.error(e);showSaveStatus('Save failed',true);}
}
async function deleteOverrideFromDb(customerId, code){
  try{ await sbDelete('customer_overrides', `?customer_id=eq.${customerId}&product_code=eq.${encodeURIComponent(code)}`); showSaveStatus('Saved'); }
  catch(e){console.error(e);showSaveStatus('Delete failed',true);}
}
async function saveTierPriceToDb(tierName, code, price){
  try{
    const tierId = tierIdByName[tierName];
    if(price===null){
      await sbDelete('tier_prices', `?tier_id=eq.${tierId}&product_code=eq.${encodeURIComponent(code)}`);
    } else {
      await sbUpsert('tier_prices', [{tier_id:tierId, product_code:code, price}]);
    }
    showSaveStatus('Saved');
  }catch(e){console.error(e);showSaveStatus('Save failed',true);}
}
async function createTierInDb(name){
  try{
    const rows = await sbInsert('tiers', [{name}]);
    if(rows && rows[0]){ tierIdByName[name]=rows[0].id; tierNameById[rows[0].id]=name; }
    showSaveStatus('Saved');
  }catch(e){console.error(e);showSaveStatus('Save failed',true);}
}
async function deleteTierFromDb(name){
  try{ const id=tierIdByName[name]; await sbDelete('tiers', `?id=eq.${id}`); showSaveStatus('Saved'); }
  catch(e){console.error(e);showSaveStatus('Delete failed',true);}
}
async function renameTierInDb(oldName, newName){
  try{
    const id=tierIdByName[oldName];
    await sbUpdate('tiers', `?id=eq.${id}`, {name:newName});
    delete tierIdByName[oldName]; tierIdByName[newName]=id; tierNameById[id]=newName;
    showSaveStatus('Saved');
  }catch(e){console.error(e);showSaveStatus('Save failed',true);}
}
async function saveOrderToDb(order){
  try{
    const rows = await sbInsert('orders', [{
      order_number:order.num, customer_name:order.cust, order_type:order.type,
      driver_route:order.driver, delivery_date:order.delDate, total:order.total,
      items_count:order.items, customer_notes:order.custNotes, customer_tier:order.custTier
    }]);
    const dbId = rows[0].id;
    order.dbId = dbId;
    const lineRows = order.lines.map(l=>({
      order_id:dbId, product_code:l.productCode, product_name:l.productName, qty:l.qty, price:l.price
    }));
    await sbInsert('order_lines', lineRows);
    showSaveStatus('Saved');
  }catch(e){console.error(e);showSaveStatus('Save failed',true);}
}
async function updateOrderInDb(order){
  try{
    await sbUpdate('orders', `?id=eq.${order.dbId}`, {
      customer_name:order.cust, order_type:order.type, driver_route:order.driver,
      delivery_date:order.delDate, total:order.total, items_count:order.items,
      customer_notes:order.custNotes, customer_tier:order.custTier
    });
    await sbDelete('order_lines', `?order_id=eq.${order.dbId}`);
    const lineRows = order.lines.map(l=>({
      order_id:order.dbId, product_code:l.productCode, product_name:l.productName, qty:l.qty, price:l.price
    }));
    await sbInsert('order_lines', lineRows);
    showSaveStatus('Saved');
  }catch(e){console.error(e);showSaveStatus('Save failed',true);}
}
async function deleteOrderFromDb(dbId){
  try{ await sbDelete('orders', `?id=eq.${dbId}`); showSaveStatus('Saved'); }
  catch(e){console.error(e);showSaveStatus('Delete failed',true);}
}

function showSaveStatus(msg,err=false){
  const el=document.getElementById('save-status');
  if(!el)return;
  el.innerHTML=`<i class="ti ti-${err?'cloud-off':'circle-check'}"></i> ${msg}`;
  el.className='save-status'+(err?' disconnected':' saved');
  if(!err) setTimeout(()=>{el.innerHTML='<i class="ti ti-cloud"></i> Connected';el.className='save-status connected';},2500);
  else setTimeout(()=>{el.innerHTML='<i class="ti ti-cloud-off"></i> Disconnected';el.className='save-status disconnected';},2500);
}

function exportBackup(){
  const data={products:PRODUCTS,customers:CUSTOMERS,tiers:TIERS,savedOrders,exportedAt:new Date().toISOString()};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=`warehouse_backup_${new Date().toISOString().slice(0,10)}.json`;a.click();
}

function importBackup(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async ev=>{
    try{
      const d=JSON.parse(ev.target.result);
      if(!d.products||!d.customers)throw new Error('Invalid backup file');
      if(!confirm(`Restore backup from ${d.exportedAt?d.exportedAt.slice(0,10):'unknown date'}?\n\nThis will overwrite the live database for everyone. Continue?`))return;
      showSaveStatus('Restoring…');
      // Push tiers first
      for(const tName of Object.keys(d.tiers||{})){
        if(!tierIdByName[tName]) await createTierInDb(tName);
      }
      for(const [tName,prices] of Object.entries(d.tiers||{})){
        for(const [code,price] of Object.entries(prices)) await saveTierPriceToDb(tName,code,price);
      }
      // Push products
      for(const p of d.products) await saveProductToDb(p);
      // Push customers
      for(const c of d.customers){
        await saveCustomerToDb(c);
        for(const [code,price] of Object.entries(c.overrides||{})) await saveOverrideToDb(custIdByName[c.name],code,price);
      }
      await loadData();
      populateCustDropdown();updateBadges();
      alert('Backup restored successfully.');
    } catch(err){console.error(err);alert('Could not restore backup: '+err.message);}
  };
  reader.readAsText(file);e.target.value='';
}

// ── GENERIC SAVE ROUTER ──────────────────────────────────────────────────────
// Many UI handlers historically called scheduleSave() after mutating PRODUCTS/
// CUSTOMERS/TIERS arrays in place. Rather than rewire every call site, this
// pushes the full current state of those tables to Supabase shortly after any
// such mutation. Order-specific actions use their own direct DB calls instead.
function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(async ()=>{
    showSaveStatus('Saving…');
    try{
      await Promise.all(PRODUCTS.map(p=>saveProductToDb(p)));
      for(const c of CUSTOMERS){
        await saveCustomerToDb(c);
      }
      for(const [tName,prices] of Object.entries(TIERS)){
        for(const [code,price] of Object.entries(prices)) await saveTierPriceToDb(tName,code,price);
      }
      showSaveStatus('Saved');
    }catch(e){console.error(e);showSaveStatus('Save failed',true);}
  },700);
}

// ── PRICING LOGIC ─────────────────────────────────────────────────────────────
function getPrice(code,type,custName){
  const p=PRODUCTS.find(x=>x.code===code);if(!p)return 0;
  if(type==='Retail')return p.retail;
  if(type==='Wholesale')return p.wholesale;
  // Custom (tier-based):
  // 1) per-customer override
  const c=CUSTOMERS.find(x=>x.name===custName);
  if(c&&c.overrides&&c.overrides[code]!==undefined)return c.overrides[code];
  // 2) customer's tier price
  if(c&&c.tier&&TIERS[c.tier]&&TIERS[c.tier][code]!==undefined)return TIERS[c.tier][code];
  // 3) fallback to the customer's chosen fallback (Retail or Wholesale)
  const fallback=(c&&c.fallback)||'Retail';
  return fallback==='Wholesale'?p.wholesale:p.retail;
}

function getPriceLabel(code,type,custName){
  if(type==='Retail')return 'Retail';
  if(type==='Wholesale')return 'Wholesale';
  const c=CUSTOMERS.find(x=>x.name===custName);
  if(c&&c.overrides&&c.overrides[code]!==undefined)return 'Override';
  if(c&&c.tier&&TIERS[c.tier]&&TIERS[c.tier][code]!==undefined)return c.tier;
  return (c&&c.fallback)||'Retail';
}

function getShort(code){const p=PRODUCTS.find(x=>x.code===code);return p?.short||code;}
function getCust(name){return CUSTOMERS.find(c=>c.name===name)||{name,notes:'',tier:'',fallback:'Retail',overrides:{}};}

// ── TAB SWITCHING ─────────────────────────────────────────────────────────────
function switchTab(t){
  ['entry','routes','log','products','customers','tiers'].forEach(n=>{document.getElementById('tab-'+n).style.display=n===t?'':'none';});
  document.querySelectorAll('.tab').forEach((b,i)=>b.classList.toggle('active',['entry','routes','log','products','customers','tiers'][i]===t));
  if(t==='routes')renderRouteTab();
  if(t==='log')renderLog();
  if(t==='products')renderProductManager();
  if(t==='customers')renderCustomerManager();
  if(t==='tiers')renderTierManager();
}

// ── CUSTOMER DROPDOWN ─────────────────────────────────────────────────────────
function populateCustDropdown(){
  const sel=document.getElementById('cust-select');
  const cur=sel.value;
  sel.innerHTML='<option value="">— Select customer —</option>';
  CUSTOMERS.forEach(c=>{const o=document.createElement('option');o.value=c.name;o.textContent=c.name;sel.appendChild(o);});
  if(cur)sel.value=cur;
}

function onCustChange(){
  const name=document.getElementById('cust-select').value;
  const c=getCust(name);
  const bar=document.getElementById('cust-info-bar');
  const txt=document.getElementById('cust-info-text');
  const parts=[];
  if(c.notes)parts.push(c.notes);
  if(c.tier)parts.push(`Price tier: ${c.tier}`);
  if(parts.length){bar.style.display='block';txt.textContent=parts.join(' · ');}
  else bar.style.display='none';
  refreshLinePrices();
}

function onTypeChange(){refreshLinePrices();}

function refreshLinePrices(){
  const type=document.getElementById('type-select').value;
  const cust=document.getElementById('cust-select').value;
  lines.forEach(l=>{if(l.productCode)l.price=getPrice(l.productCode,type,cust);});
  renderLines();
}

// ── ORDER ENTRY ───────────────────────────────────────────────────────────────
function addLine(focusIt=true){
  const id=++lineIdCounter;
  lines.push({id,productCode:'',productName:'',qty:1,price:0});
  renderLines();
  if(focusIt)setTimeout(()=>{const i=document.getElementById('pi-'+id);if(i)i.focus();},30);
}
function removeLine(id){lines=lines.filter(l=>l.id!==id);renderLines();}

function renderLines(){
  const c=document.getElementById('lines-container');
  if(!lines.length){c.innerHTML='<div class="no-items">No lines yet — search a product to start</div>';updateTotals();updateLineCount();return;}
  c.innerHTML=lines.map((l,i)=>lineHTML(l,i+1)).join('');
  updateTotals();updateLineCount();
}

function lineHTML(l,num){
  const priceStr=l.price>0?'£'+l.price.toFixed(2):'—';
  const total=(l.qty&&l.price)?'£'+(l.qty*l.price).toFixed(2):'—';
  return `<div class="line-row" id="row-${l.id}">
    <span class="line-num">${num}</span>
    <div class="product-wrap" id="wrap-${l.id}">
      <input class="product-input${l.productCode?' filled':''}" id="pi-${l.id}" value="${l.productName||''}" placeholder="Search product…" autocomplete="off"
        oninput="onProductInput(${l.id},this.value)" onkeydown="onProductKey(event,${l.id})"
        onblur="onProductBlur(${l.id})" onfocus="onProductFocus(${l.id},this.value)"/>
    </div>
    <input class="qty-input" id="qi-${l.id}" type="number" min="0.5" step="1" value="${l.qty}"
      oninput="onQtyInput(${l.id},this.value)"
      onblur="onQtyBlur(${l.id},this.value)"
      onkeydown="onQtyKey(event,${l.id})"/>
    <span class="price-cell" id="pc-${l.id}">${priceStr}</span>
    <span class="total-cell" id="tc-${l.id}">${total}</span>
    <button class="del-btn" onclick="removeLine(${l.id})"><i class="ti ti-x"></i></button>
  </div>`;
}

function onProductInput(id,val){
  closeDropdown();
  if(!val.trim()){const l=lines.find(x=>x.id===id);if(l){l.productCode='';l.productName='';l.price=0;}updateTotals();return;}
  const m=PRODUCTS.filter(p=>
    p.name.toLowerCase().includes(val.toLowerCase())||
    p.code.toLowerCase().includes(val.toLowerCase())||
    p.cat.toLowerCase().includes(val.toLowerCase())||
    (p.short&&p.short.toLowerCase()===val.toLowerCase())
  ).slice(0,10);
  if(m.length)showDropdown(id,m,val);
}
function onProductFocus(id,val){if(val&&val.trim())onProductInput(id,val);}

function showDropdown(id,matches,query){
  closeDropdown();ddHighlight=-1;
  const inp=document.getElementById('pi-'+id);if(!inp)return;
  const rect=inp.getBoundingClientRect();
  const type=document.getElementById('type-select').value;
  const cust=document.getElementById('cust-select').value;
  const dd=document.createElement('div');dd.className='dropdown';dd.id='dd-active';
  dd.style.cssText=`top:${rect.bottom+window.scrollY+2}px;left:${rect.left+window.scrollX}px;width:${Math.max(rect.width,340)}px`;
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  dd.innerHTML=matches.map((p,i)=>{
    const pr=getPrice(p.code,type,cust);
    const lbl=getPriceLabel(p.code,type,cust);
    const hl=p.name.replace(new RegExp(`(${esc(query)})`,'gi'),'<strong>$1</strong>');
    const shortBadge=p.short?`<span class="dd-short">${p.short}</span>`:'';
    const lblBadge=`<span style="font-size:10px;color:var(--text3);margin-left:4px">${lbl}</span>`;
    return `<div class="dd-item" onmousedown="selectProduct(${id},'${p.code}',${JSON.stringify(p.name)})" onmouseover="highlightDD(${i})">
      <div><div class="dd-name">${hl}${shortBadge}${lblBadge}</div><div class="dd-meta">${p.code} · ${p.cat} · per ${p.unit}</div></div>
      <div class="dd-price">£${pr.toFixed(2)}</div></div>`;
  }).join('');
  document.body.appendChild(dd);activeDD={id,dd,matches};
}
function highlightDD(idx){ddHighlight=idx;if(!activeDD)return;activeDD.dd.querySelectorAll('.dd-item').forEach((el,i)=>el.classList.toggle('highlighted',i===idx));}
function closeDropdown(){if(activeDD?.dd)activeDD.dd.remove();activeDD=null;ddHighlight=-1;}

function selectProduct(lineId,code,name){
  const type=document.getElementById('type-select').value,cust=document.getElementById('cust-select').value;
  const pr=getPrice(code,type,cust);
  const l=lines.find(x=>x.id===lineId);
  if(l){l.productCode=code;l.productName=name;l.price=pr;}
  closeDropdown();
  const inp=document.getElementById('pi-'+lineId);
  if(inp){inp.value=name;inp.classList.add('filled');}
  document.getElementById('pc-'+lineId).textContent='£'+pr.toFixed(2);
  updateTotals();
  setTimeout(()=>{const qi=document.getElementById('qi-'+lineId);if(qi){qi.focus();qi.select();}},30);
}
function onProductBlur(id){setTimeout(()=>closeDropdown(),150);}
function onProductKey(e,id){
  if(!activeDD){if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();maybeAddNext(id);}return;}
  if(e.key==='ArrowDown'){e.preventDefault();ddHighlight=Math.min(ddHighlight+1,activeDD.matches.length-1);highlightDD(ddHighlight);}
  else if(e.key==='ArrowUp'){e.preventDefault();ddHighlight=Math.max(ddHighlight-1,0);highlightDD(ddHighlight);}
  else if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();const idx=ddHighlight>=0?ddHighlight:0;if(activeDD.matches[idx])selectProduct(id,activeDD.matches[idx].code,activeDD.matches[idx].name);}
  else if(e.key==='Escape')closeDropdown();
}
function onQtyInput(id,val){
  // Update live without resetting to 1 — just store and refresh total
  const l=lines.find(x=>x.id===id);
  const v=parseFloat(val);
  if(l&&v>0){l.qty=v;const tc=document.getElementById('tc-'+id);if(tc)tc.textContent=l.price?'£'+(v*l.price).toFixed(2):'—';updateTotals();}
}
function onQtyBlur(id,val){
  const inp=document.getElementById('qi-'+id);
  const v=!val||isNaN(val)||parseFloat(val)<=0?1:parseFloat(val);
  const l=lines.find(x=>x.id===id);
  if(l)l.qty=v;
  if(inp)inp.value=v;
  const tc=document.getElementById('tc-'+id);
  if(tc&&l)tc.textContent=l.price?'£'+(v*l.price).toFixed(2):'—';
  updateTotals();
}
function onQtyKey(e,id){
  if(e.key==='Enter'||e.key==='Tab'){
    e.preventDefault();
    const inp=document.getElementById('qi-'+id);
    if(inp)onQtyBlur(id,inp.value);
    maybeAddNext(id);
  }
}
function maybeAddNext(id){
  const idx=lines.findIndex(l=>l.id===id);
  if(idx===lines.length-1)addLine(true);
  else{const nxt=document.getElementById('pi-'+lines[idx+1].id);if(nxt)nxt.focus();}
}
function updateTotals(){
  let total=0,items=0;
  lines.forEach(l=>{if(l.productCode&&l.price){total+=l.qty*l.price;items+=l.qty;}});
  document.getElementById('order-total').textContent='£'+total.toFixed(2);
  document.getElementById('total-items').textContent=items;
}
function updateLineCount(){const el=document.getElementById('line-count');if(el)el.textContent=lines.length?`(${lines.length} line${lines.length>1?'s':''})`:'';}

function clearOrder(){
  lines=[];lineIdCounter=0;
  document.getElementById('cust-select').value='';
  document.getElementById('driver-select').value='';
  document.getElementById('type-select').value='Custom';
  document.getElementById('cust-info-bar').style.display='none';
  setDefaultDate();renderLines();
}

async function saveOrder(){
  const cust=document.getElementById('cust-select').value,type=document.getElementById('type-select').value;
  const driver=document.getElementById('driver-select').value,delDate=document.getElementById('del-date').value;
  const filled=lines.filter(l=>l.productCode&&l.qty);
  if(!cust){alert('Please select a customer.');return;}
  if(!driver){alert('Please assign a route.');return;}
  if(!delDate){alert('Please set a delivery date.');return;}
  if(!filled.length){alert('Add at least one product line.');return;}
  let total=0,items=0;filled.forEach(l=>{total+=l.qty*l.price;items+=l.qty;});
  const custObj=getCust(cust);
  const newOrder={
    num:'ORD-'+(1000+savedOrders.length+1),cust,type,driver,delDate,
    lines:filled.map(l=>({...l})),total,items,
    custNotes:custObj.notes,custTier:custObj.tier||''
  };
  savedOrders.push(newOrder);
  await saveOrderToDb(newOrder);
  updateBadges();
  const b=document.getElementById('saved-banner');b.style.display='flex';
  setTimeout(()=>{b.style.display='none';},2500);
  clearOrder();
}
function updateBadges(){
  document.getElementById('routes-badge').textContent=savedOrders.length;
  document.getElementById('log-badge').textContent=savedOrders.length;
}

// ── PICKING ───────────────────────────────────────────────────────────────────
function togglePickCust(rk,cust){
  if(!pickedState[rk])pickedState[rk]={};
  pickedState[rk][cust]=!pickedState[rk][cust];
  renderRouteInner();
}
function getPickedCount(rk,customers){
  if(!pickedState[rk])return 0;
  return customers.filter(c=>pickedState[rk][c.cust]).length;
}

// ── ROUTES TAB ────────────────────────────────────────────────────────────────
function getUniqueDates(){return[...new Set(savedOrders.map(o=>o.delDate))].sort();}
function getMergedForRoute(routeOrders){
  const byCust={};
  routeOrders.forEach(o=>{
    if(!byCust[o.cust])byCust[o.cust]={cust:o.cust,orders:[],mergedLines:{},total:0,items:0,custNotes:o.custNotes||'',custTier:o.custTier||''};
    const bc=byCust[o.cust];bc.orders.push(o.num);bc.total+=o.total;bc.items+=o.items;
    o.lines.forEach(l=>{
      if(!bc.mergedLines[l.productCode])bc.mergedLines[l.productCode]={...l,qty:0,lineTotal:0};
      bc.mergedLines[l.productCode].qty+=l.qty;
      bc.mergedLines[l.productCode].lineTotal+=l.qty*l.price;
    });
  });
  return byCust;
}

function renderRouteTab(){
  const container=document.getElementById('routes-content');
  const dates=getUniqueDates();
  if(!dates.length){container.innerHTML='<div class="no-items" style="padding:48px">No active orders. Mark routes as delivered to remove them.</div>';return;}
  if(!activeRouteDay||!dates.includes(activeRouteDay))activeRouteDay=dates[0];
  const dayOrders=savedOrders.filter(o=>o.delDate===activeRouteDay);
  const usedRoutes=ROUTES.filter(r=>dayOrders.some(o=>o.driver===r));
  if(!activeRoute||!usedRoutes.includes(activeRoute))activeRoute=usedRoutes[0]||null;
  const datePills=dates.map(d=>`<button class="pill${d===activeRouteDay?' active':''}" onclick="selectDay('${d}')">${fmt(d)}<span class="cnt">${savedOrders.filter(o=>o.delDate===d).length}</span></button>`).join('');
  const routePills=usedRoutes.map(r=>{
    const isDelivered=!!(deliveredRoutes[activeRouteDay]?.[r]);
    const cnt=dayOrders.filter(o=>o.driver===r).length;
    return `<button class="pill${r===activeRoute?' active':''}${isDelivered?' delivered':''}" onclick="selectRoute('${r.replace(/'/g,"\\'")}')">
      ${isDelivered?'<i class="ti ti-check"></i> ':''}${r}<span class="cnt">${cnt}</span></button>`;
  }).join('');
  container.innerHTML=`
    <div class="section" style="padding-bottom:10px">
      <div class="section-title">Delivery date</div><div class="pill-row">${datePills}</div>
      ${usedRoutes.length?`<div class="section-title" style="margin-top:8px">Route</div><div class="pill-row">${routePills}</div>`:''}
    </div>
    <div id="route-inner"></div>`;
  renderRouteInner();
}

function renderRouteInner(){
  const inner=document.getElementById('route-inner');if(!inner||!activeRoute)return;
  const dayOrders=savedOrders.filter(o=>o.delDate===activeRouteDay&&o.driver===activeRoute);
  const byCust=getMergedForRoute(dayOrders);
  const customers=Object.values(byCust);
  const rk=routeKey(activeRouteDay,activeRoute);
  const isDelivered=!!(deliveredRoutes[activeRouteDay]?.[activeRoute]);
  const totalCusts=customers.length;
  const pickedCount=getPickedCount(rk,customers);
  const pct=totalCusts?Math.round(pickedCount/totalCusts*100):0;
  const allItems=customers.reduce((a,c)=>a+c.items,0);
  const allVal=customers.reduce((a,c)=>a+c.total,0);
  let html=`<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;gap:12px;flex-wrap:wrap">
    <div class="route-summary">
      <div class="route-stat"><div class="rs-val">${totalCusts}</div><div class="rs-lbl">Customers</div></div>
      <div class="route-stat"><div class="rs-val">${dayOrders.length}</div><div class="rs-lbl">Orders</div></div>
      <div class="route-stat"><div class="rs-val">${allItems}</div><div class="rs-lbl">Items</div></div>
      <div class="route-stat"><div class="rs-val">£${allVal.toFixed(2)}</div><div class="rs-lbl">Value</div></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" onclick="printRoute()"><i class="ti ti-printer"></i> Print pick list</button>
      <button class="btn" onclick="printDeliveryNotes()"><i class="ti ti-clipboard-list"></i> Print delivery notes</button>
      <button class="btn" onclick="exportSageCSV()"><i class="ti ti-file-spreadsheet"></i> Export to Sage</button>
      ${isDelivered
        ?`<button class="btn" style="opacity:.5;cursor:default"><i class="ti ti-check"></i> Delivered</button>`
        :`<button class="btn btn-success" onclick="confirmDelivered()"><i class="ti ti-truck-delivery"></i> Mark delivered</button>`}
    </div>
  </div>
  ${isDelivered?`<div class="msg-box msg-success"><i class="ti ti-check"></i> This route has been marked as delivered.</div>`:''}
  <div style="margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;margin-bottom:4px">
      <span style="font-size:12px;color:#5a5a58">Picking progress</span>
      <span style="font-size:12px;font-weight:500;color:${pct===100?'#166534':'#5a5a58'}">${pickedCount}/${totalCusts} customers${pct===100?' — all done!':''}</span>
    </div>
    <div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
  </div>`;
  html+=customers.map(c=>{
    const mergedArr=Object.values(c.mergedLines);
    const ordersLabel=c.orders.length>1?`Merged: ${c.orders.join(', ')}`:`Order: ${c.orders[0]}`;
    const done=!!(pickedState[rk]?.[c.cust]);
    const tierBadge=c.custTier?`<span class="tier-badge" style="margin-left:6px;font-size:10px">${c.custTier}</span>`:'';
    const notesHtml=c.custNotes?`<div class="cust-notes-badge"><i class="ti ti-note" style="font-size:11px"></i>${c.custNotes}</div>`:'';
    return `<div class="cust-block">
      <div class="cust-header${done?' done':''}">
        <div><div class="cust-name">${done?'<i class="ti ti-check"></i> ':''}${c.cust}${tierBadge}</div>
        <div class="cust-meta">${ordersLabel} · ${c.items} items · £${c.total.toFixed(2)}</div>
        ${notesHtml}</div>
        <button class="pick-check${done?' checked':''}" onclick="togglePickCust('${rk}','${c.cust.replace(/'/g,"\\'")}')"><i class="ti ti-check"></i></button>
      </div>
      <table class="pick-table">
        <thead><tr><th style="width:28px">#</th><th>Product</th><th style="text-align:center">Code</th><th style="text-align:center">Qty</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${mergedArr.map((l,i)=>`<tr>
          <td style="color:#9a9a97;font-size:12px">${i+1}</td>
          <td style="font-weight:500">${l.productName}</td>
          <td class="pick-short" style="text-align:center">${getShort(l.productCode)}</td>
          <td class="pick-qty">${l.qty}</td>
          <td style="text-align:right;font-weight:500">£${l.lineTotal.toFixed(2)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }).join('');
  inner.innerHTML=html;
}

function routeKey(d,r){return d+'||'+r;}
function selectDay(d){activeRouteDay=d;activeRoute=null;renderRouteTab();}
function selectRoute(r){activeRoute=r;renderRouteTab();}

function confirmDelivered(){
  if(!confirm(`Mark ${activeRoute} on ${fmt(activeRouteDay)} as delivered?\n\nWhen all routes for this day are marked, the day is removed.`))return;
  if(!deliveredRoutes[activeRouteDay])deliveredRoutes[activeRouteDay]={};
  deliveredRoutes[activeRouteDay][activeRoute]=true;
  const dayOrders=savedOrders.filter(o=>o.delDate===activeRouteDay);
  const usedRoutes=ROUTES.filter(r=>dayOrders.some(o=>o.driver===r));
  if(usedRoutes.every(r=>deliveredRoutes[activeRouteDay]?.[r])){
    const toRemove=savedOrders.filter(o=>o.delDate===activeRouteDay);
    savedOrders=savedOrders.filter(o=>o.delDate!==activeRouteDay);
    delete deliveredRoutes[activeRouteDay];
    activeRoute=null;
    const remaining=getUniqueDates();
    activeRouteDay=remaining.length?remaining[0]:null;
    for(const o of toRemove) deleteOrderFromDb(o.dbId);
  }
  updateBadges();renderRouteTab();
}

// ── PRINT ─────────────────────────────────────────────────────────────────────
function fmt(s){if(!s)return'—';const[y,m,d]=s.split('-');return new Date(y,m-1,d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'});}

function printRoute(){
  const dayOrders=savedOrders.filter(o=>o.delDate===activeRouteDay&&o.driver===activeRoute);
  if(!dayOrders.length)return;
  const byCust=getMergedForRoute(dayOrders);
  const customers=Object.values(byCust);
  const rk=routeKey(activeRouteDay,activeRoute);
  const rows=customers.map(c=>{
    const mergedArr=Object.values(c.mergedLines);
    const allDone=!!(pickedState[rk]?.[c.cust]);
    const shorthands=mergedArr.map(l=>`<strong>${l.qty} ${getShort(l.productCode)}</strong>`).join(' &nbsp; ');
    const notesCell=c.custNotes?`<div style="font-size:10px;margin-top:2px;font-style:italic">★ ${c.custNotes}</div>`:'';
    return `<tr>
      <td style="padding:5px 10px;border-bottom:1px solid #000;font-weight:600;width:175px;vertical-align:top">${c.cust}${notesCell}</td>
      <td style="padding:5px 10px;border-bottom:1px solid #000;font-size:14px;vertical-align:middle">${shorthands}</td>
      <td style="padding:5px 10px;border-bottom:1px solid #000;text-align:center;vertical-align:middle;font-size:16px">${allDone?'✓':'<span style="display:inline-block;width:18px;height:18px;border:1.5px solid #000;border-radius:3px"></span>'}</td>
    </tr>`;
  }).join('');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Pick List</title>
  <style>body{font-family:Arial,sans-serif;font-size:13px;color:#000;max-width:800px;margin:0 auto;padding:16px}@media print{body{padding:8px}}</style></head><body>
  <div style="display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:10px">
    <div><div style="font-size:16px;font-weight:700">PICK LIST · ${activeRoute}</div>
    <div style="font-size:12px;margin-top:2px">Delivery: ${fmt(activeRouteDay)}</div></div>
  </div>
  <table style="width:100%;border-collapse:collapse">
    <thead><tr>
      <th style="padding:5px 10px;text-align:left;border-bottom:2px solid #000;width:175px;font-size:11px;text-transform:uppercase">Customer</th>
      <th style="padding:5px 10px;text-align:left;border-bottom:2px solid #000;font-size:11px;text-transform:uppercase">Items</th>
      <th style="padding:5px 10px;text-align:center;border-bottom:2px solid #000;width:40px;font-size:11px;text-transform:uppercase">Done</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ── SAGE EXPORT ───────────────────────────────────────────────────────────────
// ── DELIVERY NOTES ────────────────────────────────────────────────────────────
function printDeliveryNotes(){
  const dayOrders=savedOrders.filter(o=>o.delDate===activeRouteDay&&o.driver===activeRoute);
  if(!dayOrders.length){alert('No orders to print delivery notes for.');return;}
  const byCust=getMergedForRoute(dayOrders);
  const customers=Object.values(byCust);

  const pages=customers.map((c,ci)=>{
    const mergedArr=Object.values(c.mergedLines);
    const orderNums=c.orders.join(', ');
    const subtotal=c.total;
    const notesHtml=c.custNotes?`<div style="margin:6px 0;padding:6px 8px;background:#fffbeb;border-left:3px solid #f59e0b;font-size:11px;color:#92400e"><strong>Note:</strong> ${c.custNotes}</div>`:'';

    const itemRows=mergedArr.map((l,i)=>`
      <tr style="${i%2===0?'background:#fafafa':''}">
        <td style="padding:5px 8px;border-bottom:1px solid #eee">${l.productName}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;font-weight:600">${l.qty}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right">£${l.price.toFixed(2)}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:500">£${l.lineTotal.toFixed(2)}</td>
      </tr>`).join('');

    const noteHtml=`<div style="padding:16px;font-family:Arial,sans-serif;font-size:12px;color:#111;min-height:100%;display:flex;flex-direction:column">
      <div style="border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:8px">
        <div style="font-size:15px;font-weight:600">${c.cust}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:10px">
        <thead>
          <tr style="background:#f0f0f0">
            <th style="padding:5px 8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #ccc">Product</th>
            <th style="padding:5px 8px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #ccc;width:50px">Qty</th>
            <th style="padding:5px 8px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #ccc;width:70px">Unit £</th>
            <th style="padding:5px 8px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #ccc;width:80px">Total £</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="flex:1"></div>
      <div>
        <div style="display:flex;justify-content:flex-end;margin-bottom:14px">
          <div style="width:200px">
            <div style="display:flex;justify-content:space-between;padding:6px 8px;border:1px solid #111;font-size:13px">
              <span style="font-weight:600">Order total</span>
              <span style="font-weight:700;font-size:14px">£${subtotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
        <div style="border-top:1px solid #ccc;padding-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <div style="font-size:11px;color:#666;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Cash received</div>
            <div style="border-bottom:1px solid #999;height:24px">£ _______________</div>
          </div>
          <div>
            <div style="font-size:11px;color:#666;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Received by (print name)</div>
            <div style="border-bottom:1px solid #999;height:24px"></div>
          </div>
          <div>
            <div style="font-size:11px;color:#666;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Signature</div>
            <div style="border-bottom:1px solid #999;height:28px"></div>
          </div>
          <div>
            <div style="font-size:11px;color:#666;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Items not delivered / changes</div>
            <div style="border-bottom:1px solid #999;height:28px"></div>
          </div>
        </div>
      </div>
    </div>`;
    const pageBreak='page-break-after:always;height:100vh';
    return `<div style="${pageBreak}">${noteHtml}</div><div style="${ci<customers.length-1?pageBreak:'min-height:100vh'}">${noteHtml}</div>`;
  }).join('');

  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Delivery Notes</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{background:#fff;height:100%}
    @media print{
      @page{margin:10mm;size:auto}
      .no-print{display:none}
      html,body{height:auto}
    }
  </style>
  </head><body>
  <div class="no-print" style="font-family:Arial,sans-serif;font-size:13px;background:#1a1a1a;color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center">
    <span>Delivery Notes — ${fmt(activeRouteDay)} — ${customers.length} customer${customers.length>1?'s':''}</span>
    <button onclick="window.print()" style="background:#fff;color:#111;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-weight:600">Print</button>
  </div>
  ${pages}
  <script>window.onload=()=>window.print()<\/script>
  </body></html>`);
  w.document.close();
}



function exportSageCSV(){
  const dayOrders=savedOrders.filter(o=>o.delDate===activeRouteDay&&o.driver===activeRoute);
  if(!dayOrders.length){alert('No orders to export.');return;}
  const rows=[['Type','Customer Account','Order Date','Delivery Date','Order No','Product Code','Description','Qty','Unit Price','Discount %','Nominal Code','Tax Code','Line Notes']];
  dayOrders.forEach(o=>{
    o.lines.forEach(l=>{
      rows.push(['SI',o.cust,o.delDate,o.delDate,o.num,l.productCode,l.productName,l.qty,l.price.toFixed(2),'0.00','4000','T1',getCust(o.cust).notes||'']);
    });
  });
  const safeRoute=activeRoute.replace(/[^a-z0-9]/gi,'_');
  downloadCSV(rows,`sage_import_${safeRoute}_${activeRouteDay.replace(/-/g,'')}.csv`);
  alert('CSV exported.\n\nTo import into Sage 200:\nSales Order Processing → Import Sales Orders → select the file.\n\nCheck Nominal Code (default 4000) and Tax Code (default T1) match your Sage setup.');
}

// ── LOG ───────────────────────────────────────────────────────────────────────
function renderLog(){
  const body=document.getElementById('log-body');
  if(!savedOrders.length){body.innerHTML='<div class="no-items">No orders saved yet</div>';return;}
  const typeClass={Retail:'badge-rt',Wholesale:'badge-wh','Custom (tier-based)':'badge-cu'};
  const byDate={};savedOrders.forEach(o=>{if(!byDate[o.delDate])byDate[o.delDate]=[];byDate[o.delDate].push(o);});
  let html=`<div class="log-row log-hdr"><span>Order</span><span>Customer</span><span>Lines</span><span>Total</span><span>Route</span><span>Type</span><span></span></div>`;
  Object.keys(byDate).sort().forEach(d=>{
    html+=`<div class="date-group-label"><i class="ti ti-calendar" style="font-size:12px;vertical-align:-1px;margin-right:4px"></i>${fmt(d)}</div>`;
    byDate[d].forEach((o,i)=>{
      const idx=savedOrders.indexOf(o);
      html+=`<div class="log-row">
        <span style="font-weight:500">${o.num}</span>
        <span>${o.cust}</span>
        <span style="text-align:center">${o.lines.length}</span>
        <span style="text-align:right;font-weight:500">£${o.total.toFixed(2)}</span>
        <span style="font-size:11px;color:#5a5a58">${o.driver}</span>
        <span><span class="badge ${typeClass[o.type]||'badge-wh'}">${o.type==='Custom (tier-based)'?'Tier':'Wholesale'}</span></span>
        <span><button class="btn" style="height:26px;padding:0 8px;font-size:11px" onclick="openEditModal(${idx})"><i class="ti ti-pencil"></i> Edit</button></span>
      </div>`;
    });
  });
  body.innerHTML=html;
}

// ── EDIT ORDER MODAL ──────────────────────────────────────────────────────────
let editOrderIdx = null;
let editLines = [];
let editLineIdCounter = 0;
let editActiveDD = null;
let editDDHighlight = -1;

function openEditModal(idx){
  editOrderIdx = idx;
  const o = savedOrders[idx];
  editLines = o.lines.map((l,i)=>({id:++editLineIdCounter,...l}));

  // Populate customer dropdown
  const sel=document.getElementById('edit-cust');
  sel.innerHTML='';
  CUSTOMERS.forEach(c=>{const op=document.createElement('option');op.value=c.name;op.textContent=c.name;sel.appendChild(op);});
  sel.value=o.cust;

  document.getElementById('edit-type').value=o.type;
  document.getElementById('edit-date').value=o.delDate;
  document.getElementById('edit-driver').value=o.driver;
  document.getElementById('edit-modal-title').textContent=`Edit ${o.num} — ${o.cust}`;

  renderEditLines();
  document.getElementById('edit-modal').style.display='flex';
}

function closeEditModal(){
  document.getElementById('edit-modal').style.display='none';
  closeEditDropdown();
  editOrderIdx=null;editLines=[];
}

function addEditLine(focusIt=true){
  const id=++editLineIdCounter;
  editLines.push({id,productCode:'',productName:'',qty:1,price:0});
  renderEditLines();
  if(focusIt)setTimeout(()=>{const i=document.getElementById('epi-'+id);if(i)i.focus();},30);
}

function removeEditLine(id){editLines=editLines.filter(l=>l.id!==id);renderEditLines();}

function renderEditLines(){
  const c=document.getElementById('edit-lines');
  if(!editLines.length){c.innerHTML='<div class="no-items" style="padding:16px">No lines — add one below</div>';updateEditTotal();return;}
  c.innerHTML=editLines.map((l,i)=>{
    const priceStr=l.price>0?'£'+l.price.toFixed(2):'—';
    const total=(l.qty&&l.price)?'£'+(l.qty*l.price).toFixed(2):'—';
    return `<div class="line-row" id="erow-${l.id}">
      <span class="line-num">${i+1}</span>
      <div class="product-wrap">
        <input class="product-input${l.productCode?' filled':''}" id="epi-${l.id}" value="${l.productName||''}" placeholder="Search product…" autocomplete="off"
          oninput="onEditProductInput(${l.id},this.value)" onkeydown="onEditProductKey(event,${l.id})"
          onblur="onEditProductBlur(${l.id})" onfocus="onEditProductFocus(${l.id},this.value)"/>
      </div>
      <input class="qty-input" id="eqi-${l.id}" type="number" min="0.5" step="1" value="${l.qty}"
        oninput="onEditQtyInput(${l.id},this.value)" onblur="onEditQtyBlur(${l.id},this.value)"
        onkeydown="onEditQtyKey(event,${l.id})"/>
      <span class="price-cell">${priceStr}</span>
      <span class="total-cell" id="etc-${l.id}">${total}</span>
      <button class="del-btn" onclick="removeEditLine(${l.id})"><i class="ti ti-x"></i></button>
    </div>`;
  }).join('');
  updateEditTotal();
}

function updateEditTotal(){
  let total=0;
  editLines.forEach(l=>{if(l.productCode&&l.price)total+=l.qty*l.price;});
  document.getElementById('edit-total').textContent='£'+total.toFixed(2);
}

function getEditPrice(code){
  const type=document.getElementById('edit-type').value;
  const cust=document.getElementById('edit-cust').value;
  return getPrice(code,type,cust);
}

function onEditProductInput(id,val){
  closeEditDropdown();
  if(!val.trim()){const l=editLines.find(x=>x.id===id);if(l){l.productCode='';l.productName='';l.price=0;}updateEditTotal();return;}
  const m=PRODUCTS.filter(p=>p.name.toLowerCase().includes(val.toLowerCase())||p.code.toLowerCase().includes(val.toLowerCase())||(p.short&&p.short.toLowerCase()===val.toLowerCase())).slice(0,10);
  if(m.length)showEditDropdown(id,m,val);
}
function onEditProductFocus(id,val){if(val&&val.trim())onEditProductInput(id,val);}

function showEditDropdown(id,matches,query){
  closeEditDropdown();editDDHighlight=-1;
  const inp=document.getElementById('epi-'+id);if(!inp)return;
  const rect=inp.getBoundingClientRect();
  const dd=document.createElement('div');dd.className='dropdown';dd.id='edd-active';
  dd.style.cssText=`top:${rect.bottom+window.scrollY+2}px;left:${rect.left+window.scrollX}px;width:${Math.max(rect.width,320)}px`;
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  dd.innerHTML=matches.map((p,i)=>{
    const pr=getEditPrice(p.code);
    const hl=p.name.replace(new RegExp(`(${esc(query)})`,'gi'),'<strong>$1</strong>');
    const sb=p.short?`<span class="dd-short">${p.short}</span>`:'';
    return `<div class="dd-item" onmousedown="selectEditProduct(${id},'${p.code}',${JSON.stringify(p.name)})" onmouseover="highlightEditDD(${i})">
      <div><div class="dd-name">${hl}${sb}</div><div class="dd-meta">${p.code} · ${p.cat}</div></div>
      <div class="dd-price">£${pr.toFixed(2)}</div></div>`;
  }).join('');
  document.body.appendChild(dd);
  editActiveDD={id,dd,matches};
}
function highlightEditDD(idx){editDDHighlight=idx;if(!editActiveDD)return;editActiveDD.dd.querySelectorAll('.dd-item').forEach((el,i)=>el.classList.toggle('highlighted',i===idx));}
function closeEditDropdown(){if(editActiveDD?.dd)editActiveDD.dd.remove();editActiveDD=null;editDDHighlight=-1;}
function selectEditProduct(lineId,code,name){
  const pr=getEditPrice(code);
  const l=editLines.find(x=>x.id===lineId);
  if(l){l.productCode=code;l.productName=name;l.price=pr;}
  closeEditDropdown();
  const inp=document.getElementById('epi-'+lineId);
  if(inp){inp.value=name;inp.classList.add('filled');}
  const tc=document.getElementById('etc-'+lineId);
  if(tc)tc.textContent='£'+(l.qty*pr).toFixed(2);
  updateEditTotal();
  setTimeout(()=>{const qi=document.getElementById('eqi-'+lineId);if(qi){qi.focus();qi.select();}},30);
}
function onEditProductBlur(id){setTimeout(()=>closeEditDropdown(),150);}
function onEditProductKey(e,id){
  if(!editActiveDD){if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();editMaybeAddNext(id);}return;}
  if(e.key==='ArrowDown'){e.preventDefault();editDDHighlight=Math.min(editDDHighlight+1,editActiveDD.matches.length-1);highlightEditDD(editDDHighlight);}
  else if(e.key==='ArrowUp'){e.preventDefault();editDDHighlight=Math.max(editDDHighlight-1,0);highlightEditDD(editDDHighlight);}
  else if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();const idx=editDDHighlight>=0?editDDHighlight:0;if(editActiveDD.matches[idx])selectEditProduct(id,editActiveDD.matches[idx].code,editActiveDD.matches[idx].name);}
  else if(e.key==='Escape')closeEditDropdown();
}
function onEditQtyInput(id,val){
  const l=editLines.find(x=>x.id===id);const v=parseFloat(val);
  if(l&&v>0){l.qty=v;const tc=document.getElementById('etc-'+id);if(tc)tc.textContent=l.price?'£'+(v*l.price).toFixed(2):'—';updateEditTotal();}
}
function onEditQtyBlur(id,val){
  const v=!val||isNaN(val)||parseFloat(val)<=0?1:parseFloat(val);
  const l=editLines.find(x=>x.id===id);if(l)l.qty=v;
  const inp=document.getElementById('eqi-'+id);if(inp)inp.value=v;
  const tc=document.getElementById('etc-'+id);if(tc&&l)tc.textContent=l.price?'£'+(v*l.price).toFixed(2):'—';
  updateEditTotal();
}
function onEditQtyKey(e,id){if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();const inp=document.getElementById('eqi-'+id);if(inp)onEditQtyBlur(id,inp.value);editMaybeAddNext(id);}}
function editMaybeAddNext(id){
  const idx=editLines.findIndex(l=>l.id===id);
  if(idx===editLines.length-1)addEditLine(true);
  else{const nxt=document.getElementById('epi-'+editLines[idx+1].id);if(nxt)nxt.focus();}
}

async function saveEditOrder(){
  if(editOrderIdx===null)return;
  const filled=editLines.filter(l=>l.productCode&&l.qty);
  if(!filled.length){alert('Add at least one product line.');return;}
  const cust=document.getElementById('edit-cust').value;
  const type=document.getElementById('edit-type').value;
  const driver=document.getElementById('edit-driver').value;
  const delDate=document.getElementById('edit-date').value;
  if(!cust||!driver||!delDate){alert('Please fill in all order details.');return;}
  let total=0,items=0;
  filled.forEach(l=>{total+=l.qty*l.price;items+=l.qty;});
  const custObj=getCust(cust);
  savedOrders[editOrderIdx]={
    ...savedOrders[editOrderIdx],
    cust,type,driver,delDate,
    lines:filled.map(l=>({...l})),
    total,items,
    custNotes:custObj.notes,custTier:custObj.tier||''
  };
  await updateOrderInDb(savedOrders[editOrderIdx]);
  updateBadges();
  closeEditModal();
  renderLog();
  if(document.getElementById('tab-routes').style.display!=='none')renderRouteTab();
}

async function deleteOrder(){
  if(editOrderIdx===null)return;
  const o=savedOrders[editOrderIdx];
  if(!confirm(`Delete ${o.num} for ${o.cust}?\n\nThis cannot be undone.`))return;
  savedOrders.splice(editOrderIdx,1);
  await deleteOrderFromDb(o.dbId);
  updateBadges();
  closeEditModal();
  renderLog();
  if(document.getElementById('tab-routes').style.display!=='none')renderRouteTab();
}

// ── PRODUCT MANAGER ───────────────────────────────────────────────────────────
function renderProductManager(){
  const tierNames=Object.keys(TIERS);
  const cats=['All',...new Set(PRODUCTS.map(p=>p.cat))];
  document.getElementById('cat-filter').innerHTML=cats.map(c=>`<button class="cat-btn${c===activeCat?' active':''}" onclick="setCat('${c}')">${c}</button>`).join('');
  const filtered=activeCat==='All'?PRODUCTS:PRODUCTS.filter(p=>p.cat===activeCat);
  document.getElementById('pm-grid').innerHTML=filtered.map(p=>{
    const tierFields=tierNames.map(t=>`
      <div class="pm-field" style="width:88px;flex-shrink:0">
        <label>${t}</label>
        <input type="number" step="0.01" value="${TIERS[t][p.code]!==undefined?TIERS[t][p.code]:''}" placeholder="—"
          oninput="updateTierPrice('${t}','${p.code}',this.value)">
      </div>`).join('');
    return `<div class="pm-card" style="flex-direction:row;align-items:center;gap:10px;padding:10px 14px">
      <div style="min-width:180px;flex:2;margin-right:4px">
        <div class="pm-name">${p.name}</div>
        <div class="pm-code">${p.code} · ${p.cat} · per ${p.unit}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        <div class="pm-field" style="width:72px;flex-shrink:0">
          <label>Shorthand</label>
          <input type="text" maxlength="8" value="${p.short||''}" placeholder="e.g. C"
            oninput="updateShort('${p.code}',this.value)"
            style="font-family:monospace;font-weight:600;text-transform:uppercase">
        </div>
        <div class="pm-field" style="width:88px;flex-shrink:0">
          <label>Wholesale £</label>
          <input type="number" step="0.01" value="${p.wholesale}" oninput="updateProductField('${p.code}','wholesale',this.value)">
        </div>
        <div class="pm-field" style="width:88px;flex-shrink:0">
          <label>Retail £</label>
          <input type="number" step="0.01" value="${p.retail}" oninput="updateProductField('${p.code}','retail',this.value)">
        </div>
        ${tierFields}
      </div>
      <button onclick="deleteProduct('${p.code}')" style="background:none;border:none;cursor:pointer;color:#9a9a97;font-size:16px;padding:4px;flex-shrink:0;margin-left:4px"><i class="ti ti-trash"></i></button>
    </div>`;
  }).join('');
}
function setCat(c){activeCat=c;renderProductManager();}
function updateShort(code,val){const p=PRODUCTS.find(x=>x.code===code);if(p){p.short=val.toUpperCase().trim();saveProductToDb(p);}}
function updateProductField(code,field,val){const p=PRODUCTS.find(x=>x.code===code);if(p){p[field]=parseFloat(val)||0;saveProductToDb(p);}}
function updateTierPrice(tier,code,val){
  if(!TIERS[tier])TIERS[tier]={};
  if(val===''||val===null){delete TIERS[tier][code];saveTierPriceToDb(tier,code,null);}
  else{const price=parseFloat(val)||0;TIERS[tier][code]=price;saveTierPriceToDb(tier,code,price);}
}
function deleteProduct(code){
  if(!confirm('Remove this product?'))return;
  PRODUCTS=PRODUCTS.filter(p=>p.code!==code);
  deleteProductFromDb(code);
  renderProductManager();
}
function addProduct(){
  const code=prompt('Product code (e.g. DR008):');if(!code)return;
  const name=prompt('Product name:');if(!name)return;
  const cat=prompt('Category:');if(!cat)return;
  const unit=prompt('Unit (Case/Pack/Each/Roll):')||'Each';
  const p={code:code.toUpperCase().trim(),name,cat,unit,retail:0,wholesale:0,short:''};
  PRODUCTS.push(p);
  saveProductToDb(p);
  renderProductManager();
}
function exportProductsCSV(){
  const tierNames=Object.keys(TIERS);
  const rows=[['Code','Name','Category','Unit','Retail £','Wholesale £','Shorthand',...tierNames.map(t=>t+' £')]];
  PRODUCTS.forEach(p=>rows.push([p.code,p.name,p.cat,p.unit,p.retail.toFixed(2),p.wholesale.toFixed(2),p.short||'',...tierNames.map(t=>TIERS[t][p.code]!==undefined?TIERS[t][p.code].toFixed(2):'')]));
  downloadCSV(rows,'products.csv');
}
function importProductsCSV(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async ev=>{
    try{
      const rows=parseCSVText(ev.target.result);
      const codeCol=Object.keys(rows[0]).find(k=>k.includes('code')||k.includes('stock'))||Object.keys(rows[0])[0];
      const nameCol=Object.keys(rows[0]).find(k=>k.includes('desc')||k.includes('name'))||Object.keys(rows[0])[1];
      const priceCol=Object.keys(rows[0]).find(k=>k.includes('sale')||k.includes('retail')||k.includes('price'));
      let added=0,updated=0;
      const toSave=[];
      rows.forEach(r=>{
        const code=(r[codeCol]||'').toUpperCase().trim(),name=r[nameCol]||'';
        if(!code||!name)return;
        const existing=PRODUCTS.find(p=>p.code===code);
        if(existing){existing.name=name;if(priceCol&&r[priceCol])existing.retail=parseFloat(r[priceCol])||existing.retail;updated++;toSave.push(existing);}
        else{const np={code,name,cat:'Imported',unit:'Each',retail:parseFloat(r[priceCol])||0,wholesale:0,short:''};PRODUCTS.push(np);added++;toSave.push(np);}
      });
      showMsg('products-msg',`Saving ${toSave.length} products…`,'success');
      for(const p of toSave) await saveProductToDb(p);
      showMsg('products-msg',`${added} added, ${updated} updated. Set categories, wholesale prices and shorthands below.`,'success');
      renderProductManager();
    }catch(err){showMsg('products-msg','Could not read file.','error');}
  };
  reader.readAsText(file);e.target.value='';
}

// ── CUSTOMER MANAGER ──────────────────────────────────────────────────────────
function renderCustomerManager(){
  const tierNames=Object.keys(TIERS);
  document.getElementById('cm-grid').innerHTML=CUSTOMERS.map((c,ci)=>{
    const overrideRows=Object.entries(c.overrides||{}).map(([code,price])=>{
      const p=PRODUCTS.find(x=>x.code===code);
      return `<div class="override-row">
        <span style="font-size:12px;color:var(--text2)">${p?p.name:code}</span>
        <input type="number" step="0.01" value="${price.toFixed(2)}" oninput="updateOverride(${ci},'${code}',this.value)">
        <button onclick="removeOverride(${ci},'${code}')" style="background:none;border:none;cursor:pointer;color:#9a9a97;font-size:14px;line-height:1"><i class="ti ti-x"></i></button>
      </div>`;
    }).join('');
    return `<div class="cm-card">
      <div class="cm-name"><i class="ti ti-building-store" style="color:#9a9a97;font-size:16px"></i>${c.name}
        <button onclick="removeCustomer(${ci})" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#9a9a97;font-size:14px"><i class="ti ti-trash"></i></button>
      </div>
      <div class="cm-field"><label>Notes / special instructions</label>
        <textarea oninput="updateCustNote(${ci},this.value)" placeholder="e.g. Takes greaseproof cut to 12&quot;">${c.notes||''}</textarea>
      </div>
      <div class="cm-field"><label>Price tier</label>
        <select onchange="updateCustTier(${ci},this.value)">
          <option value="">No tier assigned</option>
          ${tierNames.map(t=>`<option value="${t}"${c.tier===t?' selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="cm-field"><label>Fallback price (used when tier has no price set for an item)</label>
        <select onchange="updateCustFallback(${ci},this.value)">
          <option value="Retail"${(c.fallback||'Retail')==='Retail'?' selected':''}>Retail</option>
          <option value="Wholesale"${c.fallback==='Wholesale'?' selected':''}>Wholesale</option>
        </select>
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9a9a97;margin-bottom:6px">Per-product overrides</div>
        <div id="ov-${ci}">${overrideRows}</div>
        <button class="cm-add-btn" onclick="addOverridePrompt(${ci})"><i class="ti ti-plus" style="font-size:11px"></i> Add override</button>
      </div>
    </div>`;
  }).join('');
}
function updateCustNote(i,val){CUSTOMERS[i].notes=val;scheduleSave();}
function updateCustTier(i,val){CUSTOMERS[i].tier=val;scheduleSave();}
function updateCustFallback(i,val){CUSTOMERS[i].fallback=val;scheduleSave();}
function updateOverride(i,code,val){if(!CUSTOMERS[i].overrides)CUSTOMERS[i].overrides={};const price=parseFloat(val)||0;CUSTOMERS[i].overrides[code]=price;saveOverrideToDb(custIdByName[CUSTOMERS[i].name],code,price);}
function removeOverride(i,code){delete CUSTOMERS[i].overrides[code];deleteOverrideFromDb(custIdByName[CUSTOMERS[i].name],code);renderCustomerManager();}
function addOverridePrompt(i){
  const codes=PRODUCTS.map(p=>`${p.code} – ${p.name}`).join('\n');
  const code=prompt('Enter product code:\n\n'+codes);if(!code)return;
  const p=PRODUCTS.find(x=>x.code===code.toUpperCase().trim());
  if(!p){alert('Product not found.');return;}
  const price=parseFloat(prompt(`Override price for ${p.name}:`));
  if(isNaN(price))return;
  if(!CUSTOMERS[i].overrides)CUSTOMERS[i].overrides={};
  CUSTOMERS[i].overrides[p.code]=price;
  saveOverrideToDb(custIdByName[CUSTOMERS[i].name],p.code,price);
  renderCustomerManager();
}
function addCustomer(){
  const name=prompt('Customer name:');if(!name)return;
  if(CUSTOMERS.find(c=>c.name.toLowerCase()===name.toLowerCase())){alert('Customer already exists.');return;}
  const c={name,notes:'',tier:'',overrides:{}};
  CUSTOMERS.push(c);
  saveCustomerToDb(c).then(()=>{populateCustDropdown();renderCustomerManager();});
}
function removeCustomer(i){
  if(!confirm(`Remove ${CUSTOMERS[i].name}?`))return;
  const id=CUSTOMERS[i].id;
  CUSTOMERS.splice(i,1);
  deleteCustomerFromDb(id);
  populateCustDropdown();renderCustomerManager();
}
function exportCustomersCSV(){
  const rows=[['Customer Name','Notes','Price Tier','Product Code','Product Name','Override Price']];
  CUSTOMERS.forEach(c=>{
    if(!Object.keys(c.overrides||{}).length){rows.push([c.name,c.notes||'',c.tier||'','','','']);}
    else{Object.entries(c.overrides).forEach(([code,price],i)=>{const p=PRODUCTS.find(x=>x.code===code);rows.push([i===0?c.name:'',i===0?c.notes||'':'',i===0?c.tier||'':'',code,p?p.name:'',price.toFixed(2)]);});}
  });
  downloadCSV(rows,'customers.csv');
}
function importCustomersCSV(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async ev=>{
    try{
      const rows=parseCSVText(ev.target.result);
      const nameCol=Object.keys(rows[0]).find(k=>k.includes('name')||k.includes('account')||k.includes('customer'))||Object.keys(rows[0])[0];
      let added=0,skipped=0;
      const toSave=[];
      rows.forEach(r=>{
        const name=(r[nameCol]||'').trim();if(!name)return;
        if(CUSTOMERS.find(c=>c.name.toLowerCase()===name.toLowerCase())){skipped++;return;}
        const c={name,notes:'',tier:'',overrides:{}};
        CUSTOMERS.push(c);toSave.push(c);added++;
      });
      showMsg('customers-msg',`Saving ${toSave.length} customers…`,'success');
      for(const c of toSave) await saveCustomerToDb(c);
      populateCustDropdown();
      showMsg('customers-msg',`${added} added, ${skipped} already existed (left unchanged).`,'success');
      renderCustomerManager();
    }catch(err){showMsg('customers-msg','Could not read file.','error');}
  };
  reader.readAsText(file);e.target.value='';
}

// ── TIER MANAGER ──────────────────────────────────────────────────────────────
function renderTierManager(){
  const tierNames=Object.keys(TIERS);
  if(!tierNames.length){document.getElementById('tier-grid').innerHTML='<div class="no-items">No price tiers yet. Add one above.</div>';return;}
  document.getElementById('tier-grid').innerHTML=tierNames.map(t=>{
    const custCount=CUSTOMERS.filter(c=>c.tier===t).length;
    const productRows=PRODUCTS.map(p=>`
      <div class="tier-product-row">
        <span style="color:var(--text2)">${p.name} <span style="color:var(--text3);font-size:11px">(${p.short||p.code})</span></span>
        <input type="number" step="0.01" value="${TIERS[t][p.code]!==undefined?TIERS[t][p.code]:''}" placeholder="—"
          oninput="updateTierPrice('${t}','${p.code}',this.value)">
      </div>`).join('');
    return `<div class="tier-card">
      <div class="tier-card-head">
        <div>
          <input class="tier-name-input" value="${t}" onblur="renameTier('${t}',this.value)">
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${custCount} customer${custCount!==1?'s':''}</div>
        </div>
        <button onclick="deleteTier('${t}')" style="background:none;border:none;cursor:pointer;color:#9a9a97;font-size:16px"><i class="ti ti-trash"></i></button>
      </div>
      <div style="max-height:300px;overflow-y:auto">${productRows}</div>
    </div>`;
  }).join('');
}
async function addTier(){
  const name=prompt('Tier name (e.g. Trade A, Catering, Wholesale Plus):');if(!name)return;
  if(TIERS[name]){alert('Tier already exists.');return;}
  TIERS[name]={};
  await createTierInDb(name);
  renderTierManager();
  if(document.getElementById('tab-customers').style.display!=='none')renderCustomerManager();
  if(document.getElementById('tab-products').style.display!=='none')renderProductManager();
}
async function deleteTier(name){
  if(!confirm(`Delete tier "${name}"?\n\nCustomers assigned to it will have their tier cleared.`))return;
  delete TIERS[name];
  const affected=CUSTOMERS.filter(c=>c.tier===name);
  affected.forEach(c=>c.tier='');
  await deleteTierFromDb(name);
  for(const c of affected) await saveCustomerToDb(c);
  renderTierManager();
}
async function renameTier(oldName,newName){
  newName=newName.trim();
  if(!newName||newName===oldName)return;
  if(TIERS[newName]){alert('A tier with that name already exists.');return;}
  TIERS[newName]=TIERS[oldName];delete TIERS[oldName];
  CUSTOMERS.forEach(c=>{if(c.tier===oldName)c.tier=newName;});
  await renameTierInDb(oldName,newName);
  renderTierManager();
}

// ── CSV UTILS ─────────────────────────────────────────────────────────────────
function parseCSVText(text){
  const lines=text.trim().split('\n');
  const headers=lines[0].split(',').map(h=>h.replace(/^"|"$/g,'').trim().toLowerCase());
  return lines.slice(1).filter(l=>l.trim()).map(line=>{
    const vals=[];let cur='',inQ=false;
    for(let i=0;i<line.length;i++){if(line[i]==='"'){inQ=!inQ;}else if(line[i]===','&&!inQ){vals.push(cur.trim());cur='';}else cur+=line[i];}
    vals.push(cur.trim());
    const row={};headers.forEach((h,i)=>row[h]=(vals[i]||'').replace(/^"|"$/g,'').trim());return row;
  });
}
function downloadCSV(rows,filename){
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();
}
function showMsg(id,msg,type){
  const el=document.getElementById(id);if(!el)return;
  el.innerHTML=`<div class="msg-box msg-${type}"><i class="ti ti-${type==='success'?'check':'alert-triangle'}"></i>${msg}</div>`;
  setTimeout(()=>{el.innerHTML='';},6000);
}

// ── INIT ──────────────────────────────────────────────────────────────────────
function setDefaultDate(){const t=new Date();t.setDate(t.getDate()+1);document.getElementById('del-date').value=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;}

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-toggle-btn');
  if(btn) btn.innerHTML = theme==='dark' ? '<i class="ti ti-sun"></i>' : '<i class="ti ti-moon"></i>';
}
function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme')==='dark' ? 'dark' : 'light';
  const next = current==='dark' ? 'light' : 'dark';
  applyTheme(next);
  try{ localStorage.setItem('wh_theme', next); }catch(e){}
}
function initTheme(){
  let saved = null;
  try{ saved = localStorage.getItem('wh_theme'); }catch(e){}
  if(!saved){
    saved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(saved);
}

async function init(){
  initTheme();
  setDefaultDate();
  addLine(false);
  await loadData();
  populateCustDropdown();
  updateBadges();
}
init();
