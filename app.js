// ── DEFAULT DATA ──────────────────────────────────────────────────────────────
const DEFAULT_PRODUCTS=[
  {code:"DR001",name:"Coca-Cola 330ml Case (24)",cat:"Soft Drinks",unit:"Case",retail:18.00,wholesale:14.50,short:"C"},
  {code:"DR002",name:"Pepsi 330ml Case (24)",cat:"Soft Drinks",unit:"Case",retail:17.50,wholesale:14.00,short:"P"},
  {code:"DR003",name:"Still Water 500ml Case (24)",cat:"Soft Drinks",unit:"Case",retail:8.00,wholesale:6.00,short:"W"},
  {code:"DR004",name:"Orange Juice 1L Case (12)",cat:"Soft Drinks",unit:"Case",retail:14.00,wholesale:11.00,short:"OJ"},
  {code:"DR005",name:"Energy Drink 250ml Case (24)",cat:"Soft Drinks",unit:"Case",retail:22.00,wholesale:17.50,short:"ED"},
  {code:"DR006",name:"Lemonade 330ml Case (24)",cat:"Soft Drinks",unit:"Case",retail:16.50,wholesale:13.00,short:"L"},
  {code:"PK001",name:'Food Bag 10" Pack (100)',cat:"Packaging",unit:"Pack",retail:9.00,wholesale:7.20,short:"FB10"},
  {code:"PK002",name:'Food Bag 14" Pack (100)',cat:"Packaging",unit:"Pack",retail:11.00,wholesale:8.80,short:"FB14"},
  {code:"PK003",name:"Clear Container 500ml x50",cat:"Packaging",unit:"Pack",retail:12.50,wholesale:10.00,short:"CC"},
  {code:"PK004",name:'Foil Tray 8" x50',cat:"Packaging",unit:"Pack",retail:15.00,wholesale:12.00,short:"FT"},
  {code:"PK005",name:"Greaseproof Paper Roll",cat:"Packaging",unit:"Roll",retail:8.00,wholesale:6.00,short:"GP"},
  {code:"PK006",name:"Takeaway Box Large x50",cat:"Packaging",unit:"Pack",retail:14.00,wholesale:11.20,short:"TBL"},
  {code:"CL001",name:"Washing-Up Liquid 5L",cat:"Cleaning",unit:"Each",retail:6.50,wholesale:5.00,short:"WUL"},
  {code:"CL002",name:"Hand Soap 5L",cat:"Cleaning",unit:"Each",retail:7.00,wholesale:5.50,short:"HS"},
  {code:"DY001",name:"Napkins 1-ply x500",cat:"Dry Goods",unit:"Pack",retail:4.00,wholesale:3.20,short:"1ply"},
  {code:"DY002",name:"Napkins 2-ply x500",cat:"Dry Goods",unit:"Pack",retail:4.50,wholesale:3.60,short:"2ply"},
  {code:"DY003",name:"Disposable Cups 8oz x50",cat:"Dry Goods",unit:"Pack",retail:5.00,wholesale:4.00,short:"DC"},
  {code:"DY004",name:"Wooden Cutlery Set x100",cat:"Dry Goods",unit:"Pack",retail:6.00,wholesale:4.80,short:"WC"},
  {code:"DY005",name:"Paper Straws x250",cat:"Dry Goods",unit:"Pack",retail:3.50,wholesale:2.80,short:"PS"},
];
const DEFAULT_CUSTOMERS=[
  {name:"Joe's Diner",notes:"Takes greaseproof cut to 12\" width.",tier:"Tier A",overrides:{"DR001":13.00,"PK001":6.50}},
  {name:"Smith's Café",notes:"",tier:"Tier B",overrides:{"DR003":5.50}},
  {name:"City Takeaway",notes:"",tier:"Tier A",overrides:{"PK003":9.00}},
  {name:"Quick Bites",notes:"",tier:"Tier B",overrides:{}},
  {name:"The Corner Shop",notes:"",tier:"Retail",overrides:{}},
  {name:"Sunrise Foods",notes:"Greaseproof cut to 10\" — invoice at standard GP rate.",tier:"Tier A",overrides:{}},
];
// Tiers: name → {productCode: price}
const DEFAULT_TIERS={
  "Tier A":{"DR001":13.50,"DR002":13.00,"DR003":5.80,"PK001":6.80,"PK002":8.50},
  "Tier B":{"DR001":14.00,"DR003":6.00},
  "Retail":{},
};
const ROUTES=["Brian","Chris","Ian","John","Mike","Misc","Nick","Steve"];

// ── STATE ─────────────────────────────────────────────────────────────────────
let PRODUCTS=[],CUSTOMERS=[],TIERS={};
let lines=[],savedOrders=[],lineIdCounter=0;
let activeDD=null,ddHighlight=-1;
let activeRouteDay=null,activeRoute=null,pickedState={},deliveredRoutes={};
let activeCat='All';
let saveTimer=null;
let PRICE_TIERS=[];

// ── SUPABASE CONNECTION ──────────────────────────────────────────────────────
const SUPABASE_URL = 'https://fcxtwaqrrrghysupbulz.supabase.co/rest/v1';
const SUPABASE_KEY = 'sb_publishable_ri54UxsPSzwPq2b2fAnO0A_YaY1Q8qQ';

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

// ── LOAD ALL DATA FROM SUPABASE ──────────────────────────────────────────────
async function loadData(){
  showSaveStatus('Loading…');
  try{
    const [prodRows, priceRows, custRows, orderRows, orderLineRows] = await Promise.all([
      sbGet('Products', '?select=*&order=code'),
      sbGet('Prices', '?select=*'),
      sbGet('Customers', '?select=*&order=AccountName'),
      sbGet('Orders', '?select=*&order=CreatedAt'),
      sbGet('order_lines', '?select=*')
    ]);

    // Products — merge with Prices by code
    PRODUCTS = prodRows.map(p=>{
      const pr = priceRows.find(x=>x.code===p.code) || {};
      return {
        code:p.code, name:p.name, short:p.shorthand||'',
        retail:Number(pr.retail_price)||0, wholesale:Number(pr.wholesale_price)||0,
        prices:pr  // store full price row for tier lookups
      };
    });

    // Store all price tier column names (everything except code, retail_price, wholesale_price)
    if(priceRows.length > 0){
      const skip = ['code','retail_price','wholesale_price'];
      PRICE_TIERS = Object.keys(priceRows[0]).filter(k=>!skip.includes(k));
    }

    // Customers
    CUSTOMERS = custRows.map(c=>({
      accountNumber:c.AccountNumber, name:c.AccountName,
      tier:c.PriceTier||'', defaultRoute:c.Route||''
    }));

    // Orders + lines
    savedOrders = orderRows.map(o=>{
      const oLines = orderLineRows.filter(l=>Number(l.OrderId)===Number(o.id)).map(l=>({
        productCode:l.ProductCode, productName:l.ProductName||l.ProductCode,
        qty:Number(l.Qty), price:Number(l.Price)
      }));
      return {
        dbId:Number(o.id), cust:o.AccountNumber, type:o.OrderType||'Custom',
        driver:o.Route, delDate:(o.DeliveryDate||'').slice(0,10), total:Number(o.Total),
        items:oLines.reduce((a,l)=>a+l.qty,0),
        deliveryNotes:o.DeliveryNotes||'', lines:oLines
      };
    });

    // Resolve customer names for display
    savedOrders.forEach(o=>{
      const c = CUSTOMERS.find(x=>x.accountNumber===o.cust);
      o.custName = c ? c.name : o.cust;
      o.custTier = c ? c.tier : '';
    });

    pickedState = {}; deliveredRoutes = {};
    showSaveStatus('Loaded');
  } catch(e){
    console.error(e);
    showSaveStatus('Could not load — check connection', true);
    PRODUCTS = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
    CUSTOMERS = [];
  }
}

// ── SAVE HELPERS ─────────────────────────────────────────────────────────────
async function saveProductToDb(p){
  try{
    await sbUpsert('Products', [{code:p.code, name:p.name, shorthand:p.short}]);
    showSaveStatus('Saved');
  }catch(e){console.error(e);showSaveStatus('Save failed',true);}
}
async function savePriceToDb(code, field, value){
  try{
    const body = {code};
    body[field] = value===''||value===null ? null : parseFloat(value)||0;
    await sbUpsert('Prices', [body]);
    showSaveStatus('Saved');
  }catch(e){console.error(e);showSaveStatus('Save failed',true);}
}
async function deleteProductFromDb(code){
  try{
    await sbDelete('Products', `?code=eq.${encodeURIComponent(code)}`);
    await sbDelete('Prices', `?code=eq.${encodeURIComponent(code)}`);
    showSaveStatus('Saved');
  }catch(e){console.error(e);showSaveStatus('Delete failed',true);}
}
async function saveCustomerToDb(c){
  try{
    await sbUpsert('Customers', [{
      AccountNumber:c.accountNumber, AccountName:c.name,
      PriceTier:c.tier||null, Route:c.defaultRoute||null
    }]);
    showSaveStatus('Saved');
  }catch(e){console.error(e);showSaveStatus('Save failed',true);}
}
async function deleteCustomerFromDb(accountNumber){
  try{
    await sbDelete('Customers', `?AccountNumber=eq.${encodeURIComponent(accountNumber)}`);
    showSaveStatus('Saved');
  }catch(e){console.error(e);showSaveStatus('Delete failed',true);}
}
async function saveOrderToDb(order){
  try{
    const cust = CUSTOMERS.find(x=>x.name===order.custName||x.accountNumber===order.cust);
    const accNum = cust ? cust.accountNumber : order.cust;
    const rows = await sbInsert('Orders', [{
      AccountNumber:accNum, Route:order.driver, DeliveryDate:order.delDate,
      Total:order.total, DeliveryNotes:order.deliveryNotes||'',
      OrderType:order.type
    }]);
    const dbId = rows[0].id;
    order.dbId = dbId;
    const lineRows = order.lines.map(l=>({
      OrderId:dbId, ProductCode:l.productCode,
      Qty:l.qty, Price:l.price
    }));
    if(lineRows.length) await sbInsert('order_lines', lineRows);
    showSaveStatus('Saved');
  }catch(e){console.error(e);showSaveStatus('Save failed',true);}
}
async function updateOrderInDb(order){
  try{
    const cust = CUSTOMERS.find(x=>x.name===order.custName||x.accountNumber===order.cust);
    const accNum = cust ? cust.accountNumber : order.cust;
    await sbUpdate('Orders', `?id=eq.${order.dbId}`, {
      AccountNumber:accNum, Route:order.driver, DeliveryDate:order.delDate,
      Total:order.total, DeliveryNotes:order.deliveryNotes||'',
      OrderType:order.type
    });
    await sbDelete('order_lines', `?OrderId=eq.${order.dbId}`);
    const lineRows = order.lines.map(l=>({
      OrderId:order.dbId, ProductCode:l.productCode,
      Qty:l.qty, Price:l.price
    }));
    if(lineRows.length) await sbInsert('order_lines', lineRows);
    showSaveStatus('Saved');
  }catch(e){console.error(e);showSaveStatus('Save failed',true);}
}
async function deleteOrderFromDb(dbId){
  try{ await sbDelete('Orders', `?id=eq.${dbId}`); showSaveStatus('Saved'); }
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

// ── GENERIC SAVE (for customer field edits that still call scheduleSave) ──────
function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(async ()=>{
    for(const c of CUSTOMERS) await saveCustomerToDb(c);
    showSaveStatus('Saved');
  },800);
}

// ── PRICING LOGIC ─────────────────────────────────────────────────────────────
function getPrice(code,type,custName){
  const p=PRODUCTS.find(x=>x.code===code);if(!p)return 0;
  if(type==='Retail')return p.retail;
  if(type==='Wholesale')return p.wholesale;
  // Custom (tier-based):
  // Look up the customer's tier, then find that column in the Prices row
  const c=CUSTOMERS.find(x=>x.name===custName);
  if(c&&c.tier&&p.prices&&p.prices[c.tier]!==undefined&&p.prices[c.tier]!==null){
    return Number(p.prices[c.tier]);
  }
  // Fallback to retail
  return p.retail;
}

function getPriceLabel(code,type,custName){
  if(type==='Retail')return 'Retail';
  if(type==='Wholesale')return 'Wholesale';
  const c=CUSTOMERS.find(x=>x.name===custName);
  if(c&&c.tier&&PRODUCTS.find(x=>x.code===code)?.prices?.[c.tier]!==undefined&&PRODUCTS.find(x=>x.code===code)?.prices?.[c.tier]!==null) return c.tier;
  return 'Retail';
}

function getShort(code){const p=PRODUCTS.find(x=>x.code===code);return p?.short||code;}
function getCust(name){return CUSTOMERS.find(c=>c.name===name)||{name,accountNumber:'',tier:'',defaultRoute:''};}

// ── TAB SWITCHING ─────────────────────────────────────────────────────────────
function switchTab(t){
  ['entry','routes','log','products','customers'].forEach(n=>{document.getElementById('tab-'+n).style.display=n===t?'':'none';});
  document.querySelectorAll('.tab').forEach((b,i)=>b.classList.toggle('active',['entry','routes','log','products','customers'][i]===t));
  if(t==='routes')renderRouteTab();
  if(t==='log')renderLog();
  if(t==='products')renderProductManager();
  if(t==='customers')renderCustomerManager();
}

// ── CUSTOMER DROPDOWN ─────────────────────────────────────────────────────────
function populateCustDropdown(){
  // No longer a <select> — customer search is now type-to-search
}

// ── CUSTOMER SEARCH (order entry) ─────────────────────────────────────────────
let custDD=null,custDDHighlight=-1;

function onCustInput(val){
  closeCustDD();
  if(!val.trim())return;
  const m=CUSTOMERS.filter(c=>
    c.name.toLowerCase().includes(val.toLowerCase())||
    c.accountNumber.toLowerCase().includes(val.toLowerCase())
  ).slice(0,12);
  if(m.length)showCustDD(m,val);
}
function onCustFocus(val){if(val&&val.trim())onCustInput(val);}
function onCustBlur(){setTimeout(()=>closeCustDD(),150);}

function showCustDD(matches,query){
  closeCustDD();custDDHighlight=-1;
  const inp=document.getElementById('cust-input');if(!inp)return;
  const rect=inp.getBoundingClientRect();
  const dd=document.createElement('div');dd.className='dropdown';dd.id='cust-dd';
  dd.style.cssText=`top:${rect.bottom+window.scrollY+2}px;left:${rect.left+window.scrollX}px;width:${Math.max(rect.width,300)}px`;
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  dd.innerHTML=matches.map((c,i)=>{
    const hl=c.name.replace(new RegExp(`(${esc(query)})`,'gi'),'<strong>$1</strong>');
    const tierBadge=c.tier?`<span style="font-size:10px;color:var(--text3);margin-left:4px">${c.tier}</span>`:'';
    return `<div class="dd-item" onmousedown="selectCust('${c.name.replace(/'/g,"\\'")}')" onmouseover="custDDHighlight=${i};highlightCustDD()">
      <div><div class="dd-name">${hl}${tierBadge}</div><div class="dd-meta">${c.accountNumber}${c.defaultRoute?' · '+c.defaultRoute:''}</div></div>
    </div>`;
  }).join('');
  document.body.appendChild(dd);
  custDD={dd,matches};
}
function highlightCustDD(){if(!custDD)return;custDD.dd.querySelectorAll('.dd-item').forEach((el,i)=>{el.classList.toggle('highlighted',i===custDDHighlight);if(i===custDDHighlight)el.scrollIntoView({block:'nearest'});});}
function closeCustDD(){if(custDD?.dd)custDD.dd.remove();custDD=null;custDDHighlight=-1;}

function selectCust(name){
  closeCustDD();
  document.getElementById('cust-input').value=name;
  document.getElementById('cust-input').classList.add('filled');
  document.getElementById('cust-select').value=name;
  onCustChange();
}

function onCustKey(e){
  if(!custDD){return;}
  if(e.key==='ArrowDown'){e.preventDefault();custDDHighlight=Math.min(custDDHighlight+1,custDD.matches.length-1);highlightCustDD();}
  else if(e.key==='ArrowUp'){e.preventDefault();custDDHighlight=Math.max(custDDHighlight-1,0);highlightCustDD();}
  else if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();const idx=custDDHighlight>=0?custDDHighlight:0;if(custDD.matches[idx])selectCust(custDD.matches[idx].name);}
  else if(e.key==='Escape')closeCustDD();
}

function onCustChange(){
  const name=document.getElementById('cust-select').value;
  const c=getCust(name);
  const bar=document.getElementById('cust-info-bar');
  const txt=document.getElementById('cust-info-text');
  const parts=[];
  if(c.tier)parts.push(`Price tier: ${c.tier}`);
  if(c.accountNumber)parts.push(`Account: ${c.accountNumber}`);
  if(parts.length){bar.style.display='block';txt.textContent=parts.join(' · ');}
  else bar.style.display='none';
  if(c.defaultRoute){
    const driverSel=document.getElementById('driver-select');
    if(!driverSel.value) driverSel.value=c.defaultRoute;
  }
  refreshLinePrices();
}

// ── CUSTOMER SEARCH (edit modal) ──────────────────────────────────────────────
let editCustDD=null,editCustDDHighlight=-1;

function onEditCustInput(val){
  closeEditCustDD();
  if(!val.trim())return;
  const m=CUSTOMERS.filter(c=>
    c.name.toLowerCase().includes(val.toLowerCase())||
    c.accountNumber.toLowerCase().includes(val.toLowerCase())
  ).slice(0,12);
  if(m.length)showEditCustDD(m,val);
}
function onEditCustFocus(val){if(val&&val.trim())onEditCustInput(val);}
function onEditCustBlur(){setTimeout(()=>closeEditCustDD(),150);}

function showEditCustDD(matches,query){
  closeEditCustDD();editCustDDHighlight=-1;
  const inp=document.getElementById('edit-cust-input');if(!inp)return;
  const rect=inp.getBoundingClientRect();
  const dd=document.createElement('div');dd.className='dropdown';dd.id='edit-cust-dd';
  dd.style.cssText=`top:${rect.bottom+window.scrollY+2}px;left:${rect.left+window.scrollX}px;width:${Math.max(rect.width,300)}px`;
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  dd.innerHTML=matches.map((c,i)=>{
    const hl=c.name.replace(new RegExp(`(${esc(query)})`,'gi'),'<strong>$1</strong>');
    return `<div class="dd-item" onmousedown="selectEditCust('${c.name.replace(/'/g,"\\'")}')" onmouseover="editCustDDHighlight=${i};highlightEditCustDD()">
      <div><div class="dd-name">${hl}</div><div class="dd-meta">${c.accountNumber}</div></div>
    </div>`;
  }).join('');
  document.body.appendChild(dd);
  editCustDD={dd,matches};
}
function highlightEditCustDD(){if(!editCustDD)return;editCustDD.dd.querySelectorAll('.dd-item').forEach((el,i)=>{el.classList.toggle('highlighted',i===editCustDDHighlight);if(i===editCustDDHighlight)el.scrollIntoView({block:'nearest'});});}
function closeEditCustDD(){if(editCustDD?.dd)editCustDD.dd.remove();editCustDD=null;editCustDDHighlight=-1;}
function selectEditCust(name){
  closeEditCustDD();
  document.getElementById('edit-cust-input').value=name;
  document.getElementById('edit-cust-input').classList.add('filled');
  document.getElementById('edit-cust').value=name;
}
function onEditCustKey(e){
  if(!editCustDD)return;
  if(e.key==='ArrowDown'){e.preventDefault();editCustDDHighlight=Math.min(editCustDDHighlight+1,editCustDD.matches.length-1);highlightEditCustDD();}
  else if(e.key==='ArrowUp'){e.preventDefault();editCustDDHighlight=Math.max(editCustDDHighlight-1,0);highlightEditCustDD();}
  else if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();const idx=editCustDDHighlight>=0?editCustDDHighlight:0;if(editCustDD.matches[idx])selectEditCust(editCustDD.matches[idx].name);}
  else if(e.key==='Escape')closeEditCustDD();
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
      <div><div class="dd-name">${hl}${shortBadge}${lblBadge}</div><div class="dd-meta">${p.code}</div></div>
      <div class="dd-price">£${pr.toFixed(2)}</div></div>`;
  }).join('');
  document.body.appendChild(dd);activeDD={id,dd,matches};
}
function highlightDD(idx){ddHighlight=idx;if(!activeDD)return;activeDD.dd.querySelectorAll('.dd-item').forEach((el,i)=>{el.classList.toggle('highlighted',i===idx);if(i===idx)el.scrollIntoView({block:'nearest'});});}
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
  document.getElementById('cust-input').value='';
  document.getElementById('cust-input').classList.remove('filled');
  document.getElementById('cust-select').value='';
  document.getElementById('driver-select').value='';
  document.getElementById('type-select').value='Custom';
  document.getElementById('cust-info-bar').style.display='none';
  setDefaultDate();renderLines();
}

async function saveOrder(){
  const custName=document.getElementById('cust-select').value,type=document.getElementById('type-select').value;
  const driver=document.getElementById('driver-select').value,delDate=document.getElementById('del-date').value;
  const filled=lines.filter(l=>l.productCode&&l.qty);
  if(!custName){alert('Please select a customer.');return;}
  if(!driver){alert('Please assign a route.');return;}
  if(!delDate){alert('Please set a delivery date.');return;}
  if(!filled.length){alert('Add at least one product line.');return;}
  let total=0,items=0;filled.forEach(l=>{total+=l.qty*l.price;items+=l.qty;});
  const custObj=getCust(custName);
  const newOrder={
    cust:custObj.accountNumber||custName, custName:custObj.name, type, driver, delDate,
    lines:filled.map(l=>({...l})), total, items,
    deliveryNotes:'', custTier:custObj.tier||''
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
    if(!byCust[o.cust])byCust[o.cust]={cust:o.custName||o.cust,acctNum:o.cust,orders:[],mergedLines:{},total:0,items:0,custNotes:o.deliveryNotes||'',custTier:o.custTier||''};
    const bc=byCust[o.cust];bc.orders.push(o.dbId||'');bc.total+=o.total;bc.items+=o.items;
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
  const usedRoutes=[...new Set(dayOrders.map(o=>o.driver).filter(Boolean))];
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
    const custData=CUSTOMERS.find(x=>x.name===c.cust);
    const windowBadge=(custData&&custData.windowStart&&custData.windowEnd)?`<span style="display:inline-flex;align-items:center;gap:3px;background:var(--blue-bg);color:var(--blue-text);border:1px solid #93c5fd;border-radius:6px;font-size:10px;font-weight:500;padding:2px 7px;margin-top:4px"><i class="ti ti-clock" style="font-size:11px"></i>${custData.windowStart.slice(0,5)}–${custData.windowEnd.slice(0,5)}</span>`:'';
    const notesHtml=c.custNotes?`<div class="cust-notes-badge"><i class="ti ti-note" style="font-size:11px"></i>${c.custNotes}</div>`:'';
    return `<div class="cust-block">
      <div class="cust-header${done?' done':''}">
        <div><div class="cust-name">${done?'<i class="ti ti-check"></i> ':''}${c.cust}${tierBadge}</div>
        <div class="cust-meta">${ordersLabel} · ${c.items} items · £${c.total.toFixed(2)}</div>
        ${windowBadge}${notesHtml}</div>
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
  const usedRoutes=[...new Set(dayOrders.map(o=>o.driver).filter(Boolean))];
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
      rows.push(['SI',o.custName||o.cust,o.delDate,o.delDate,o.dbId||'',l.productCode,l.productName,l.qty,l.price.toFixed(2),'0.00','4000','T1','']);
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
        <span style="font-weight:500">#${o.dbId||'—'}</span>
        <span>${o.custName||o.cust}</span>
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

  // Set customer search input
  const custName = o.custName||o.cust;
  document.getElementById('edit-cust-input').value=custName;
  document.getElementById('edit-cust-input').classList.add('filled');
  document.getElementById('edit-cust').value=custName;

  document.getElementById('edit-type').value=o.type;
  document.getElementById('edit-date').value=o.delDate;
  document.getElementById('edit-driver').value=o.driver;
  document.getElementById('edit-modal-title').textContent=`Edit order — ${custName}`;

  renderEditLines();
  document.getElementById('edit-modal').style.display='flex';
}

function closeEditModal(){
  document.getElementById('edit-modal').style.display='none';
  closeEditDropdown();
  closeEditCustDD();
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
      <div><div class="dd-name">${hl}${sb}</div><div class="dd-meta">${p.code}</div></div>
      <div class="dd-price">£${pr.toFixed(2)}</div></div>`;
  }).join('');
  document.body.appendChild(dd);
  editActiveDD={id,dd,matches};
}
function highlightEditDD(idx){editDDHighlight=idx;if(!editActiveDD)return;editActiveDD.dd.querySelectorAll('.dd-item').forEach((el,i)=>{el.classList.toggle('highlighted',i===idx);if(i===idx)el.scrollIntoView({block:'nearest'});});}
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
  if(!confirm(`Delete order for ${o.custName||o.cust}?\n\nThis cannot be undone.`))return;
  savedOrders.splice(editOrderIdx,1);
  await deleteOrderFromDb(o.dbId);
  updateBadges();
  closeEditModal();
  renderLog();
  if(document.getElementById('tab-routes').style.display!=='none')renderRouteTab();
}

// ── PRODUCT MANAGER ───────────────────────────────────────────────────────────
function renderProductManager(){
  const cats=['All',...new Set(PRODUCTS.map(p=>p.prices?.category||'').filter(Boolean))];
  if(cats.length<=1){
    document.getElementById('cat-filter').innerHTML='';
  } else {
    document.getElementById('cat-filter').innerHTML=cats.map(c=>`<button class="cat-btn${c===activeCat?' active':''}" onclick="setCat('${c}')">${c}</button>`).join('');
  }
  const filtered=activeCat==='All'?PRODUCTS:PRODUCTS.filter(p=>(p.prices?.category||'')===activeCat);
  document.getElementById('pm-grid').innerHTML=filtered.map(p=>{
    return `<div class="pm-card" style="flex-direction:row;align-items:center;gap:10px;padding:10px 14px">
      <div style="min-width:180px;flex:2;margin-right:4px">
        <div class="pm-name">${p.name}</div>
        <div class="pm-code">${p.code}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        <div class="pm-field" style="width:72px;flex-shrink:0">
          <label>Shorthand</label>
          <input type="text" maxlength="8" value="${p.short||''}" placeholder="e.g. C"
            oninput="updateShort('${p.code}',this.value)"
            style="font-family:monospace;font-weight:600;text-transform:uppercase">
        </div>
        <div class="pm-field" style="width:88px;flex-shrink:0">
          <label>Retail £</label>
          <input type="number" step="0.01" value="${p.retail||''}" oninput="updatePrice('${p.code}','retail_price',this.value)">
        </div>
        <div class="pm-field" style="width:88px;flex-shrink:0">
          <label>Wholesale £</label>
          <input type="number" step="0.01" value="${p.wholesale||''}" oninput="updatePrice('${p.code}','wholesale_price',this.value)">
        </div>
      </div>
      <button onclick="deleteProduct('${p.code}')" style="background:none;border:none;cursor:pointer;color:#9a9a97;font-size:16px;padding:4px;flex-shrink:0;margin-left:4px"><i class="ti ti-trash"></i></button>
    </div>`;
  }).join('');
}
function setCat(c){activeCat=c;renderProductManager();}
function updateShort(code,val){const p=PRODUCTS.find(x=>x.code===code);if(p){p.short=val.toUpperCase().trim();saveProductToDb(p);}}
function updatePrice(code,field,val){
  const p=PRODUCTS.find(x=>x.code===code);
  if(!p)return;
  const numVal=parseFloat(val)||0;
  if(field==='retail_price') p.retail=numVal;
  else if(field==='wholesale_price') p.wholesale=numVal;
  if(p.prices) p.prices[field]=numVal;
  savePriceToDb(code,field,val);
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
  const p={code:code.toUpperCase().trim(),name,short:'',retail:0,wholesale:0,prices:{}};
  PRODUCTS.push(p);
  saveProductToDb(p);
  sbUpsert('Prices',[{code:p.code,retail_price:0,wholesale_price:0}]);
  renderProductManager();
}
function exportProductsCSV(){
  const rows=[['Code','Name','Shorthand','Retail','Wholesale']];
  PRODUCTS.forEach(p=>rows.push([p.code,p.name,p.short||'',p.retail,p.wholesale]));
  downloadCSV(rows,'products.csv');
}

// ── CUSTOMER MANAGER ──────────────────────────────────────────────────────────
function renderCustomerManager(){
  document.getElementById('cm-grid').innerHTML=CUSTOMERS.map((c,ci)=>{
    return `<div class="cm-card">
      <div class="cm-name"><i class="ti ti-building-store" style="color:#9a9a97;font-size:16px"></i>${c.name}
        <span style="font-size:11px;color:var(--text3);font-weight:400;margin-left:6px">${c.accountNumber}</span>
        <button onclick="removeCustomer(${ci})" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#9a9a97;font-size:14px"><i class="ti ti-trash"></i></button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="cm-field"><label>Price tier</label>
          <input type="text" value="${c.tier||''}" onchange="updateCustTier(${ci},this.value)" placeholder="e.g. wholesale_price_1">
        </div>
        <div class="cm-field"><label>Default route</label>
          <select onchange="updateCustRoute(${ci},this.value)">
            <option value="">— None —</option>
            <option value="Brian"${c.defaultRoute==='Brian'?' selected':''}>Brian</option>
            <option value="Chris"${c.defaultRoute==='Chris'?' selected':''}>Chris</option>
            <option value="Ian"${c.defaultRoute==='Ian'?' selected':''}>Ian</option>
            <option value="John"${c.defaultRoute==='John'?' selected':''}>John</option>
            <option value="Mike"${c.defaultRoute==='Mike'?' selected':''}>Mike</option>
            <option value="Misc"${c.defaultRoute==='Misc'?' selected':''}>Misc</option>
            <option value="Nick"${c.defaultRoute==='Nick'?' selected':''}>Nick</option>
            <option value="Steve"${c.defaultRoute==='Steve'?' selected':''}>Steve</option>
          </select>
        </div>
      </div>
    </div>`;
  }).join('');
}
function updateCustTier(i,val){CUSTOMERS[i].tier=val;saveCustomerToDb(CUSTOMERS[i]);}
function updateCustRoute(i,val){CUSTOMERS[i].defaultRoute=val;saveCustomerToDb(CUSTOMERS[i]);}
function addCustomer(){
  const name=prompt('Customer name:');if(!name)return;
  if(CUSTOMERS.find(c=>c.name.toLowerCase()===name.toLowerCase())){alert('Customer already exists.');return;}
  const accNum=prompt('Account number:');if(!accNum)return;
  const c={name,accountNumber:accNum,tier:'',defaultRoute:''};
  CUSTOMERS.push(c);
  saveCustomerToDb(c).then(()=>{populateCustDropdown();renderCustomerManager();});
}
function removeCustomer(i){
  if(!confirm(`Remove ${CUSTOMERS[i].name}?`))return;
  const accNum=CUSTOMERS[i].accountNumber;
  CUSTOMERS.splice(i,1);
  deleteCustomerFromDb(accNum);
  populateCustDropdown();renderCustomerManager();
}
function exportCustomersCSV(){
  const rows=[['AccountNumber','AccountName','PriceTier','Route']];
  CUSTOMERS.forEach(c=>rows.push([c.accountNumber,c.name,c.tier||'',c.defaultRoute||'']));
  downloadCSV(rows,'customers.csv');
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
function setDefaultDate(){const t=new Date();const day=t.getDay();if(day===5)t.setDate(t.getDate()+3);else if(day===6)t.setDate(t.getDate()+2);else t.setDate(t.getDate()+1);document.getElementById('del-date').value=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;}

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
