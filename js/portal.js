const content = document.getElementById('content');
const nav = document.getElementById('nav');
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const modalHost = document.getElementById('modalHost');
const toastHost = document.getElementById('toastHost');
let me = null;
let selectedMethod = null;
let methodsCache = [];
let currentAdminAccounts = [];
let depositPollTimer = null;
let currentDepositRequest = null;

const NAV = {
  ADMIN: [
    ['home','⌂','Home'],['agents','A','Agents'],['users','U','Users'],['transactions','↻','Transactions'],['methods','◇','Payment Methods'],['support','◎','Support'],['security','◈','Security'],['audit','≡','Audit Log']
  ],
  AGENT: [
    ['home','⌂','Home'],['deposit','+','Deposit'],['transactions','↻','Transactions'],['users','U','Users'],['support','◎','Support'],['security','◈','Security']
  ],
  USER: [
    ['home','⌂','Home'],['deposit','+','Deposit'],['transactions','↻','Transactions'],['employees','E','Employees'],['support','◎','Support'],['security','◈','Security']
  ],
  EMPLOYEE: [
    ['home','⌂','Home'],['deposit','+','Deposit'],['transactions','↻','Transactions'],['support','◎','Support'],['security','◈','Security']
  ]
};

function toast(message, bad=false){
  const el=document.createElement('div');el.className='toast'+(bad?' bad':'');el.textContent=message;toastHost.appendChild(el);setTimeout(()=>el.remove(),3500);
}
function pageHead(title, subtitle=''){return `<div class="page-head"><h1 class="page-title">${escapeHtml(title)}</h1><p class="page-subtitle">${escapeHtml(subtitle)}</p></div>`}
function statusPill(status){const s=String(status||'').toUpperCase();const cls=['SUCCEEDED','ACTIVE','OPEN'].includes(s)?'good':['PENDING','PROCESSING','CREATED'].includes(s)?'warn':['FAILED','REJECTED','SUSPENDED','CLOSED','EXPIRED'].includes(s)?'bad':'blue';return `<span class="pill ${cls}">${escapeHtml(s)}</span>`}
function dateFmt(v){try{return new Date(v).toLocaleString()}catch{return v||''}}
function activeView(){return (location.hash||'#home').slice(1)}
function setMenuOpen(open){
  sidebar.classList.toggle('open', open);
  sidebarBackdrop?.classList.toggle('open', open);
  document.body.classList.toggle('menu-open', open);
  document.getElementById('menuBtn')?.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function closeMenu(){setMenuOpen(false)}
function openModal(html){modalHost.innerHTML=`<div class="modal-backdrop" id="modalBg"><div class="modal">${html}</div></div>`;document.getElementById('modalBg').addEventListener('click',e=>{if(e.target.id==='modalBg')closeModal()})}
function closeModal(){modalHost.innerHTML=''}
window.closeModal=closeModal;

async function loadMe(){
  try{const data=await api('/api/auth/me');me=data.user}catch(e){location.href='login.html';return false}
  document.getElementById('signedUser').textContent=me.username;
  document.getElementById('roleBadge').textContent=me.role;
  document.getElementById('avatar').textContent=(me.displayName||me.username||'SP').slice(0,2).toUpperCase();
  return true;
}

function renderNav(){
  nav.innerHTML=(NAV[me.role]||[]).map(([view,ico,label])=>`<button class="nav-btn" data-view="${view}"><span class="nav-ico">${ico}</span>${label}</button>`).join('');
  syncNav();
}
function syncNav(){const v=activeView();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v))}

nav.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(!b)return;location.hash=b.dataset.view;closeMenu()});
document.querySelector('.sidebar-bottom').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b){location.hash=b.dataset.view;closeMenu()}});
document.getElementById('menuBtn').setAttribute('aria-expanded','false');
document.getElementById('menuBtn').onclick=()=>setMenuOpen(!sidebar.classList.contains('open'));
sidebarBackdrop?.addEventListener('click',closeMenu);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();if(document.querySelector('.modal-backdrop'))closeModal()}});
window.addEventListener('resize',()=>{if(window.innerWidth>720)closeMenu()});

document.getElementById('logoutBtn').onclick=()=>{
  closeMenu();
  openModal(`<div class="confirm-modal"><div class="confirm-icon" aria-hidden="true">↪</div><h3>Log out of SenkuPayout?</h3><p>Your current session will end on this device. You can sign back in at any time with your assigned account.</p><div class="confirm-actions"><button id="cancelLogout" type="button" class="btn btn-outline">Stay signed in</button><button id="confirmLogout" type="button" class="btn btn-danger">Yes, log out</button></div></div>`);
  document.getElementById('cancelLogout').onclick=closeModal;
  document.getElementById('confirmLogout').onclick=async()=>{
    closeModal();
    showSessionTransition('Signing you out', 'Closing your session securely…');
    try{
      await Promise.all([
        api('/api/auth/logout',{method:'POST'}).catch(()=>null),
        new Promise(resolve=>setTimeout(resolve,560))
      ]);
    }finally{
      window.senkuAuth.clear();
      location.href='login.html';
    }
  };
};

function txTable(rows, admin=false){
  if(!rows?.length)return '<div class="notice">No transactions yet.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Date</th>${admin?'<th>Account</th>':''}<th>Type</th><th>Method</th><th>Amount</th><th>Fee</th><th>Net</th><th>Status</th><th>Reference</th></tr></thead><tbody>${rows.map(t=>`<tr><td>${escapeHtml(dateFmt(t.createdAt))}</td>${admin?`<td><strong>${escapeHtml(t.owner?.username||'—')}</strong><div class="tiny muted">${escapeHtml(t.owner?.role||'')}</div></td>`:''}<td>${escapeHtml(t.type)}</td><td>${escapeHtml(t.method||'—')}</td><td>${moneyFmt(t.amount)}</td><td>${moneyFmt(t.fee)}</td><td>${moneyFmt(t.net)}</td><td>${statusPill(t.status)}</td><td class="tiny">${escapeHtml(t.reference)}</td></tr>`).join('')}</tbody></table></div>`;
}

async function renderHome(){
  if(me.role==='ADMIN')return renderAdminHome();
  const d=await api('/api/finance/dashboard');
  content.innerHTML=`${pageHead(`Good ${new Date().getHours()<12?'morning':new Date().getHours()<18?'afternoon':'evening'}, ${me.displayName||me.username}`,'Your SenkuPayout overview.')}
  <div class="balance-grid"><section class="blue-hero"><div class="tiny" style="opacity:.8;font-weight:800">AVAILABLE BALANCE</div><div class="amount-large">${moneyFmt(d.wallet.available)}</div><div class="quick-actions">${(NAV[me.role]||[]).filter(x=>['deposit','transactions'].includes(x[0])).map(([v,i,l])=>`<button class="quick" data-go="${v}"><div style="font-size:20px">${i}</div><strong>${l}</strong></button>`).join('')}</div></section><div class="stat-stack"><div class="card stat-card"><div class="stat-label">Pending</div><div class="stat-value">${d.pendingCount}</div></div><div class="card stat-card"><div class="stat-label">This month</div><div class="stat-value">${moneyFmt(d.thisMonth)}</div></div></div></div>
  <section class="card card-pad" style="margin-top:18px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><div><div class="section-title">Recent activity</div><div class="small muted">Latest balance activity</div></div><button class="btn btn-outline btn-sm" data-go="transactions">See all →</button></div>${txTable(d.recent)}</section>`;
  content.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>location.hash=b.dataset.go);
}

async function renderAdminHome(){
  const d=await api('/api/admin/dashboard');
  content.innerHTML=`${pageHead('Admin dashboard','Manage SenkuPayout accounts, transactions and operations.')}
  <div class="grid4"><div class="card stat-card"><div class="stat-label">Agents</div><div class="stat-value">${d.agents}</div></div><div class="card stat-card"><div class="stat-label">Users</div><div class="stat-value">${d.users}</div></div><div class="card stat-card"><div class="stat-label">Pending deposits</div><div class="stat-value">${d.pendingDeposits}</div></div><div class="card stat-card"><div class="stat-label">Approved deposits</div><div class="stat-value">${d.approvedDeposits}</div></div></div>
  <div class="grid3" style="margin-top:14px"><div class="card stat-card"><div class="stat-label">Month volume</div><div class="stat-value">${moneyFmt(d.monthVolume)}</div></div><div class="card stat-card"><div class="stat-label">Agent commissions</div><div class="stat-value">${moneyFmt(d.agentCommissions)}</div></div><div class="card stat-card"><div class="stat-label">Estimated platform revenue</div><div class="stat-value">${moneyFmt(d.estimatedPlatformRevenue)}</div></div></div>
  <section class="card card-pad" style="margin-top:18px"><div class="section-title" style="margin-bottom:14px">Recent transactions</div>${txTable(d.recent,true)}</section>`;
}

const DEPOSIT_PRESETS = [10,20,30,40,50,100,200,500,1000];
function depositAmountForPreset(method, nominal) {
  const allowed = method?.allowedAmounts || [];
  if (allowed.includes(nominal)) return nominal;
  const near = Number((nominal - 0.01).toFixed(2));
  return allowed.includes(near) ? near : null;
}
function depositStatusText(status){
  return ({CREATED:'Preparing your payment',PENDING:'Awaiting payment',PROCESSING:'Checking payment',SUCCEEDED:'Payment confirmed',REJECTED:'Payment rejected',EXPIRED:'Payment expired',FAILED:'Payment failed'})[status] || status;
}
function clearDepositPolling(){if(depositPollTimer){clearInterval(depositPollTimer);depositPollTimer=null}}
function showDepositTracking(info){
  const panel = document.getElementById('depositStatusPanel');
  if(!panel)return;
  const t=info.transaction||{};const ref=t.reference||'';
  const status=String(t.status||'PENDING');const done=['SUCCEEDED','REJECTED','EXPIRED','FAILED'].includes(status);
  const oldLink=info.checkoutUrl||t.metadata?.checkoutUrl||'';
  const checkoutUrl=(()=>{try{const u=new URL(oldLink);return u.protocol==='https:'?u.href:null}catch{return null}})();
  const tag=info.tag||t.metadata?.tag||'';
  const email=info.tagEmail||t.metadata?.tagEmail||'';
  const expiry=info.expiresAt||t.metadata?.expiresAt;
  panel.innerHTML=`<div class="card card-pad payment-tracker"><div class="tiny muted">PAYMENT REFERENCE · ${escapeHtml(ref)}</div><h2 style="margin:10px 0">${escapeHtml(depositStatusText(status))}</h2><p class="small muted" id="depositStatusMsg">${status==='SUCCEEDED'?'Your deposit has been confirmed by BytePayout. The credited balance is now available.':status==='PENDING'||status==='CREATED'?'The backend checks BytePayout for confirmation. Keep this page open or return later to view the status.':'This deposit is closed. Please start a new deposit if you still want to pay.'}</p>${!done ? `<div class="payment-actions">${checkoutUrl?`<a class="btn btn-primary" href="${escapeHtml(checkoutUrl)}" target="_blank" rel="noopener noreferrer">Open payment checkout ↗</a><button type="button" class="btn btn-outline" id="copyPaymentLink">Copy payment link</button>`:''}${tag?`<div class="notice">Payment tag: <strong>${escapeHtml(tag)}</strong></div>`:''}${email?`<div class="notice">Payment email: <strong>${escapeHtml(email)}</strong></div>`:''}</div>`:''}${expiry?`<p class="tiny muted">Provider expiration: ${escapeHtml(dateFmt(expiry))}</p>`:''}<div class="small muted">Amount: ${moneyFmt(t.amount)} · Method: ${escapeHtml(t.method||'—')} · Status: <strong>${escapeHtml(status)}</strong></div><div class="payment-actions"><button type="button" class="btn btn-outline" id="newDepositBtn">New deposit</button></div></div>`;
  const copy=panel.querySelector('#copyPaymentLink');if(copy)copy.onclick=async()=>{try{await navigator.clipboard.writeText(checkoutUrl);toast('Payment link copied.')}catch{toast('Unable to copy. Open the checkout link instead.',true)}};
  panel.querySelector('#newDepositBtn').onclick=()=>{clearDepositPolling();sessionStorage.removeItem('senku_deposit_reference');currentDepositRequest=null;renderDeposit()};
  if(done){clearDepositPolling();sessionStorage.removeItem('senku_deposit_reference')}
}
async function trackDeposit(reference){
  if(activeView()!=='deposit')return;
  try{
    const result=await api(`/api/finance/deposits/${encodeURIComponent(reference)}/status`);
    if(!document.getElementById('depositStatusPanel'))return;
    showDepositTracking(result);
    if(!result.providerChecked && result.transaction?.status!=='SUCCEEDED'){
      const hint=document.getElementById('depositStatusMsg');
      if(hint)hint.textContent='Still awaiting confirmation. The provider status check is temporarily unavailable; no payment will be marked successful without verification.';
    }
  }catch(error){if(error.status===404){clearDepositPolling();sessionStorage.removeItem('senku_deposit_reference')}else console.warn('Deposit status polling:',error.message)}
}
function beginDepositTracking(info){
  clearDepositPolling();sessionStorage.setItem('senku_deposit_reference',info.transaction.reference);
  showDepositTracking(info);
  if(['SUCCEEDED','EXPIRED','REJECTED','FAILED'].includes(info.transaction.status))return;
  depositPollTimer=setInterval(()=>{if(!document.hidden)trackDeposit(info.transaction.reference)},8000);
}
async function renderDeposit(){
  clearDepositPolling();
  const [m,w]=await Promise.all([api('/api/finance/methods'),api('/api/finance/wallet')]);
  methodsCache=m.methods;selectedMethod=methodsCache[0]?.code||null;
  content.innerHTML=`${pageHead('Add funds','Generate a BytePayout deposit link and track its confirmation.')}
  <div class="soft-hero" style="margin-bottom:14px"><div class="tiny muted" style="font-weight:900">STEP 1 · CREATE PAYMENT</div><h2 style="margin:8px 0 0">Choose method & amount</h2></div>
  <div class="grid2"><section class="card card-pad"><div class="label" style="margin-bottom:11px">PAYMENT METHOD</div><div id="methodGrid" class="method-grid">${methodsCache.map((x,i)=>`<button class="method-card ${i===0?'active':''}" data-method="${x.code}"><strong>${escapeHtml(x.label)}</strong><span>${(me.depositFeeBps||x.feeBps)/100}% fee</span></button>`).join('')}</div>
  <form id="depositForm" class="stack" style="margin-top:18px"><div class="label">QUICK AMOUNTS</div><div class="deposit-amounts" id="depositPresets"></div><label class="field"><span class="label">Other amount (USD)</span><input id="depAmount" class="input" type="number" min="0.01" step="0.01" value="10" required></label><div class="small muted" id="allowedAmountInfo"></div><button id="createDepositBtn" class="btn btn-primary btn-block">Generate payment link</button></form></section>
  <aside class="card card-pad"><div class="label">LIVE SUMMARY</div><div class="live-summary" style="margin-top:16px"><span>You send</span><strong id="depSend">$10.00</strong><span>Fee</span><span id="depFee">—</span><span>Balance credited</span><span id="depNet" style="color:var(--blue);font-weight:800">—</span><span>Balance now</span><span>${moneyFmt(w.wallet.available)}</span></div></aside></div>
  <div id="depositStatusPanel" style="margin-top:16px"></div>`;
  const methodGrid=content.querySelector('#methodGrid'),amountInput=content.querySelector('#depAmount'),presetRoot=content.querySelector('#depositPresets');
  const form=content.querySelector('#depositForm'),submit=content.querySelector('#createDepositBtn');
  function update(){
    const amt=Number(amountInput.value||0),method=methodsCache.find(x=>x.code===selectedMethod);
    const fee=amt*(me.depositFeeBps||method?.feeBps||0)/10000;
    content.querySelector('#depSend').textContent=moneyFmt(amt);
    content.querySelector('#depFee').textContent=moneyFmt(fee);
    content.querySelector('#depNet').textContent=moneyFmt(Math.max(0,amt-fee));
    const valid=method?.allowedAmounts?.includes(amt) && amt>=method.minAmount && amt<=method.maxAmount;
    submit.disabled=!valid;
    content.querySelector('#allowedAmountInfo').textContent=valid?'Exact supported amount.':'Only exact supported amounts work for this method. Options: '+(method?.allowedAmounts||[]).join(', ')+' USD. $500 and $1,000 are unavailable.';
    presetRoot.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',Number(b.dataset.value)===amt));
  }
  function refreshPresets(){
    const method=methodsCache.find(x=>x.code===selectedMethod);
    presetRoot.innerHTML=DEPOSIT_PRESETS.map(n=>{
      const actual=depositAmountForPreset(method,n),valid=actual!==null&&actual>=method.minAmount&&actual<=method.maxAmount;
      return `<button type="button" class="amount-preset" data-preset="${n}" data-value="${actual??''}" ${valid?'':'disabled'}><strong>${moneyFmt(n)}</strong>${valid&&actual!==n?`<span>Charge ${moneyFmt(actual)}</span>`:!valid?'<span>Unavailable</span>':''}</button>`;
    }).join('');
    presetRoot.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{if(b.disabled)return;amountInput.value=b.dataset.value;currentDepositRequest=null;update()});
    update();
  }
  methodGrid.onclick=e=>{const b=e.target.closest('[data-method]');if(!b)return;selectedMethod=b.dataset.method;methodGrid.querySelectorAll('.method-card').forEach(x=>x.classList.toggle('active',x===b));const method=methodsCache.find(x=>x.code===selectedMethod);amountInput.value=depositAmountForPreset(method,10)??method.allowedAmounts[0]??'';currentDepositRequest=null;refreshPresets()};
  amountInput.oninput=()=>{currentDepositRequest=null;update()};
  refreshPresets();
  form.onsubmit=async e=>{
    e.preventDefault();if(submit.disabled)return;
    const amount=Number(amountInput.value),method=selectedMethod, fingerprint=method+':'+amount;
    if(!currentDepositRequest||currentDepositRequest.fingerprint!==fingerprint){currentDepositRequest={fingerprint,key:crypto.randomUUID()}}
    submit.disabled=true;submit.textContent='Creating payment…';
    try{
      const d=await api('/api/finance/deposits',{method:'POST',body:{amount,method,requestKey:currentDepositRequest.key}});
      beginDepositTracking(d);trackDeposit(d.transaction.reference);
      toast('Payment generated. Open the checkout link to pay.');
    }catch(error){toast(error.message,true)}finally{submit.textContent='Generate payment link';update()}
  };
  const returnRef=new URLSearchParams(location.search).get('deposit_ref');
  const savedRef=sessionStorage.getItem('senku_deposit_reference')||returnRef;
  if(savedRef&&/^DEP-[A-Z0-9-]{10,60}$/.test(savedRef)){
    sessionStorage.setItem('senku_deposit_reference',savedRef);
    if(returnRef){const cleanUrl=new URL(location.href);cleanUrl.searchParams.delete('deposit_ref');history.replaceState(null,'',cleanUrl.pathname+cleanUrl.search+cleanUrl.hash)}
    beginDepositTracking({transaction:{reference:savedRef,status:'PENDING',method:'',amount:0}});
    trackDeposit(savedRef);
  }
}

async function renderWithdraw(){
  const w=await api('/api/finance/wallet');
  content.innerHTML=`${pageHead('Withdraw','Move your available balance to a crypto wallet or bank destination.')}
  <section class="soft-hero"><div class="grid2" style="align-items:center"><div><div class="tiny muted" style="font-weight:900">AVAILABLE</div><div class="amount-large" style="color:var(--blue)">${moneyFmt(w.wallet.available)}</div></div><div><div class="tiny muted">WITHDRAWAL</div><h2>Move funds to your destination</h2><p class="small muted">Requests are held from your balance until admin approval or rejection.</p></div></div></section><section class="card card-pad" style="margin-top:16px"><form id="withdrawForm" class="grid2"><label class="field"><span class="label">Amount (USD)</span><input id="wdAmount" class="input" type="number" min="10" step="0.01" required></label><label class="field"><span class="label">Wallet / bank destination</span><input id="wdDest" class="input" placeholder="Wallet address or payout destination" required></label><div style="grid-column:1/-1"><button class="btn btn-primary">Create withdrawal</button></div></form></section>`;
  withdrawForm.onsubmit=async e=>{e.preventDefault();try{await api('/api/finance/withdrawals',{method:'POST',body:{amount:Number(wdAmount.value),destination:wdDest.value}});toast('Withdrawal request created.');renderWithdraw()}catch(err){toast(err.message,true)}};
}

async function renderCashout(){
  const w=await api('/api/finance/wallet');
  content.innerHTML=`${pageHead('Player cashout','Send funds to a player destination from your balance.')}
  <section class="soft-hero"><div class="grid2"><div><div class="tiny muted">BALANCE</div><div class="amount-large" style="color:var(--blue)">${moneyFmt(w.wallet.available)}</div></div><div><div class="tiny muted">PLAYER CASHOUT</div><h2>Pay players in seconds</h2><p class="small muted">$1.00 flat platform fee · $30 minimum · Chime or PayPal in this starter configuration.</p></div></div></section><section class="card card-pad" style="margin-top:16px"><form id="cashoutForm" class="grid3"><label class="field"><span class="label">Amount</span><input id="coAmount" class="input" type="number" min="30" step="0.01" required></label><label class="field"><span class="label">Method</span><select id="coMethod" class="select"><option value="chime">Chime</option><option value="paypal">PayPal</option></select></label><label class="field"><span class="label">Player tag / destination</span><input id="coDest" class="input" required></label><div style="grid-column:1/-1"><button class="btn btn-primary">New cashout</button></div></form></section>`;
  cashoutForm.onsubmit=async e=>{e.preventDefault();try{await api('/api/finance/cashouts',{method:'POST',body:{amount:Number(coAmount.value),method:coMethod.value,destination:coDest.value}});toast('Cashout request created.');renderCashout()}catch(err){toast(err.message,true)}};
}

async function renderRecharge(){
  content.innerHTML=`${pageHead('Recharge','Top up your SenkuPayout balance with USDT.')}
  <section class="card card-pad"><h3>Recharge your SenkuPayout balance</h3><p class="small muted">Fee: $5 for amounts under $300, $10 for $300 and above. Minimum $100 · Maximum $10,000.</p><form id="rechargeForm" class="stack" style="margin-top:18px"><label class="field"><span class="label">Amount (USD)</span><input id="rcAmount" class="input" type="number" min="100" max="10000" step="0.01" value="100"></label><div class="method-grid"><label class="method-card"><strong>USDT TRC-20</strong><span>Tron</span><input type="radio" name="network" value="TRC20" checked></label><label class="method-card"><strong>USDT BEP-20</strong><span>BNB Chain</span><input type="radio" name="network" value="BEP20"></label><label class="method-card"><strong>USDT ERC-20</strong><span>Ethereum</span><input type="radio" name="network" value="ERC20"></label></div><button class="btn btn-primary btn-block">Generate payment address</button></form></section>`;
  rechargeForm.onsubmit=async e=>{e.preventDefault();const network=new FormData(rechargeForm).get('network');try{const d=await api('/api/finance/recharges',{method:'POST',body:{amount:Number(rcAmount.value),network}});location.href=d.checkoutUrl}catch(err){toast(err.message,true)}};
}

async function renderTransactions(){
  const endpoint=me.role==='ADMIN'?'/api/finance/admin/transactions':'/api/finance/transactions';
  const d=await api(endpoint);
  content.innerHTML=`${pageHead('Transactions','Every deposit and commission in one place.')}<section class="soft-hero" style="margin-bottom:16px"><div class="tiny muted">TRANSACTIONS</div><h2 style="margin:7px 0">Your payment history</h2><p class="small muted">Records are generated by the backend, not the browser.</p></section><section class="card card-pad">${txTable(d.transactions,me.role==='ADMIN')}</section>`;
}

function accountForm(role, agents=[]){
  const agentCreatingUser = role==='USER' && me.role==='AGENT';
  const defaultUserFee = agentCreatingUser ? (Number(me.depositFeeBps||0) + Number(me.commissionBps||0)) : 1700;
  const minimumUserFee = agentCreatingUser ? Number(me.depositFeeBps||0) : 0;
  const feeHint = agentCreatingUser
    ? `<div class="small muted">Minimum ${(minimumUserFee/100).toFixed(2)}%. Your commission on a user's successful deposit is that user's Deposit Fee minus your Deposit Fee. The default starts at ${((defaultUserFee)/100).toFixed(2)}%.</div>`
    : '';

  return `<form id="accountCreateForm" class="stack"><div class="grid2"><label class="field"><span class="label">Username</span><input name="username" class="input" required minlength="3"></label><label class="field"><span class="label">Display name</span><input name="displayName" class="input"></label><label class="field"><span class="label">Temporary password</span><input name="password" type="password" class="input" required minlength="8"></label><label class="field"><span class="label">Deposit fee (basis points)</span><input name="depositFeeBps" type="number" class="input" value="${defaultUserFee}" min="${minimumUserFee}" max="9000">${feeHint}</label>${role==='AGENT'?`<label class="field"><span class="label">Agent commission (basis points)</span><input name="commissionBps" type="number" class="input" value="300" min="0" max="9000"><div class="small muted">Example: Deposit Fee 1500 + Commission 200 makes the default user fee 1700.</div></label>`:''}${role==='USER'&&me.role==='ADMIN'?`<label class="field"><span class="label">Assign to agent (optional)</span><select name="agentId" class="select"><option value="">Direct user</option>${agents.map(a=>`<option value="${a.id}" data-deposit-fee="${a.depositFeeBps||0}" data-commission="${a.commissionBps||0}">${escapeHtml(a.username)} · ${(a.depositFeeBps||0)/100}% fee</option>`).join('')}</select></label>`:''}</div><button class="btn btn-primary">Create ${role.toLowerCase()}</button><div class="small muted">New accounts must change their temporary password after signing in.</div></form>`;
}

async function renderAgents(){
  const d=await api('/api/accounts/admin/agents');
  currentAdminAccounts = d.agents;
  content.innerHTML=`${pageHead('Agents','Only admin can create agents. Agents can create users, but cannot create other agents.')}<section class="card card-pad"><div class="section-title">Create agent</div><div style="margin-top:14px">${accountForm('AGENT')}</div></section><section class="card card-pad" style="margin-top:16px"><div class="section-title" style="margin-bottom:14px">Agents</div>${accountTable(d.agents,true)}</section>`;
  wireAccountCreate('/api/accounts/admin/agents');wireAccountActions();
}

async function renderUsers(){
  if(me.role==='AGENT'){
    const d=await api('/api/accounts/agent/users');
    content.innerHTML=`${pageHead('Users',`Your Deposit Fee is ${(me.depositFeeBps||0)/100}% and Commission is ${(me.commissionBps||0)/100}%. A user's fee cannot be lower than your Deposit Fee. Your actual commission on each successful user deposit is User Deposit Fee minus your Deposit Fee.`)}<section class="card card-pad"><div class="section-title">Create user</div><div style="margin-top:14px">${accountForm('USER')}</div></section><section class="card card-pad" style="margin-top:16px"><div class="section-title" style="margin-bottom:14px">My users</div>${accountTable(d.users,false)}</section>`;
    wireAccountCreate('/api/accounts/agent/users');return;
  }
  const [u,a]=await Promise.all([api('/api/accounts/admin/users'),api('/api/accounts/admin/agents')]);
  currentAdminAccounts = u.users;
  content.innerHTML=`${pageHead('Users','Admin can create/manage users and view each user’s employee accounts from Manage.')}<section class="card card-pad"><div class="section-title">Create user</div><div style="margin-top:14px">${accountForm('USER',a.agents)}</div></section><section class="card card-pad" style="margin-top:16px"><div class="section-title" style="margin-bottom:14px">Users</div>${accountTable(u.users,true)}</section>`;
  wireAccountCreate('/api/accounts/admin/users');wireAccountActions();
}

function accountTable(rows,adminActions){
  if(!rows?.length)return '<div class="notice">No accounts yet.</div>';
  const showBalance=me.role==='ADMIN';
  const commissionText=u=>{
    if(u.role==='AGENT')return `${(u.commissionBps||0)/100}%`;
    if(u.role==='USER'&&u.agent)return `${Math.max(0,(u.depositFeeBps||0)-(u.agent.depositFeeBps||0))/100}%`;
    if(u.role==='USER'&&me.role==='AGENT')return `${Math.max(0,(u.depositFeeBps||0)-(me.depositFeeBps||0))/100}%`;
    return '—';
  };
  return `<div class="table-wrap"><table><thead><tr><th>Username</th><th>Role</th><th>Status</th>${showBalance?'<th>Available</th>':''}<th>Deposit fee</th><th>Commission</th><th>Created</th>${adminActions?'<th>Actions</th>':''}</tr></thead><tbody>${rows.map(u=>`<tr><td><strong>${escapeHtml(u.username)}</strong><div class="tiny muted">${escapeHtml(u.displayName||'')}</div></td><td>${u.role}</td><td>${statusPill(u.status)}</td>${showBalance?`<td>${moneyFmt(u.wallet?.available||0)}</td>`:''}<td>${(u.depositFeeBps||0)/100}%</td><td>${commissionText(u)}</td><td>${escapeHtml(dateFmt(u.createdAt))}</td>${adminActions?`<td><div class="row-actions"><button class="btn btn-outline btn-sm" data-manage-id="${u.id}">Manage</button><button class="btn btn-outline btn-sm" data-status-id="${u.id}" data-status-next="${u.status==='ACTIVE'?'SUSPENDED':'ACTIVE'}">${u.status==='ACTIVE'?'Suspend':'Activate'}</button></div></td>`:''}</tr>`).join('')}</tbody></table></div>`;
}
function wireAccountCreate(endpoint){
  const f=document.getElementById('accountCreateForm');if(!f)return;
  const agentSelect=f.elements.agentId;
  const feeInput=f.elements.depositFeeBps;
  if(agentSelect&&feeInput){
    agentSelect.onchange=()=>{
      const option=agentSelect.selectedOptions[0];
      if(!option?.value){feeInput.min='0';feeInput.value='1700';return;}
      const agentFee=Number(option.dataset.depositFee||0);
      const commission=Number(option.dataset.commission||0);
      feeInput.min=String(agentFee);
      feeInput.value=String(agentFee+commission);
    };
  }
  f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f);const body=Object.fromEntries(fd.entries());body.depositFeeBps=Number(body.depositFeeBps||1700);if(body.commissionBps!==undefined)body.commissionBps=Number(body.commissionBps||0);if(!body.agentId)delete body.agentId;try{await api(endpoint,{method:'POST',body});toast('Account created.');renderCurrent()}catch(err){toast(err.message,true)}};
}
function wireAccountActions(){
  content.querySelectorAll('[data-status-id]').forEach(b=>b.onclick=async()=>{try{await api(`/api/accounts/admin/accounts/${b.dataset.statusId}/status`,{method:'PATCH',body:{status:b.dataset.statusNext}});toast('Account status updated.');renderCurrent()}catch(err){toast(err.message,true)}});
  content.querySelectorAll('[data-manage-id]').forEach(b=>b.onclick=()=>showAccountManage(b.dataset.manageId));
}
async function showAccountManage(id){
  const u=currentAdminAccounts.find(x=>x.id===id);if(!u)return;
  let employeeData=null;
  if(u.role==='USER'){
    try{employeeData=await api(`/api/accounts/admin/users/${u.id}/employees`)}catch(err){toast(err.message,true);return}
  }
  const employeeSection=u.role==='USER'?`<hr style="border:0;border-top:1px solid var(--line)"><div><div class="section-title">Employees (${employeeData?.user?.employeeCount??u.employeeCount??0})</div><p class="small muted">Read-only view. Admin can see employee usernames but cannot manage employee accounts or their balances.</p>${employeeData?.employees?.length?`<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Username</th><th>Display name</th><th>Status</th><th>Created</th></tr></thead><tbody>${employeeData.employees.map(e=>`<tr><td><strong>${escapeHtml(e.username)}</strong></td><td>${escapeHtml(e.displayName||'—')}</td><td>${statusPill(e.status)}</td><td>${escapeHtml(dateFmt(e.createdAt))}</td></tr>`).join('')}</tbody></table></div>`:'<div class="notice" style="margin-top:10px">This user has no employees.</div>'}</div>`:'';
  openModal(`<h3>Manage ${escapeHtml(u.username)}</h3><p class="small muted">Change account pricing, adjust this Agent/User balance with an audit note, or assign a temporary password.${u.role==='USER'?' Employee accounts are shown below as read-only.':''}</p><div class="stack"><form id="feeManage" class="grid2"><label class="field"><span class="label">Deposit fee BPS</span><input name="depositFeeBps" type="number" class="input" value="${u.depositFeeBps||0}"></label><label class="field"><span class="label">Commission BPS</span><input name="commissionBps" type="number" class="input" value="${u.commissionBps||0}" ${u.role==='AGENT'?'':'disabled'}></label><button class="btn btn-primary">Save pricing</button></form><hr style="border:0;border-top:1px solid var(--line)"><form id="balanceManage" class="stack"><label class="field"><span class="label">Balance adjustment (+ credit / - debit)</span><input name="amount" type="number" step="0.01" class="input" placeholder="Example: 50 or -20" required></label><label class="field"><span class="label">Audit note</span><input name="note" class="input" placeholder="Reason for adjustment" required></label><button class="btn btn-outline">Apply balance adjustment</button></form><hr style="border:0;border-top:1px solid var(--line)"><form id="resetManage" class="stack"><label class="field"><span class="label">New temporary password</span><input name="password" type="password" minlength="8" class="input" required></label><button class="btn btn-danger">Reset password</button></form>${employeeSection}<button class="btn btn-outline" onclick="closeModal()">Close</button></div>`);
  const feeForm=document.getElementById('feeManage');
  const balanceForm=document.getElementById('balanceManage');
  const resetForm=document.getElementById('resetManage');
  feeForm.onsubmit=async e=>{e.preventDefault();const fd=new FormData(feeForm);const body={depositFeeBps:Number(fd.get('depositFeeBps'))};if(u.role==='AGENT')body.commissionBps=Number(fd.get('commissionBps'));try{await api(`/api/accounts/admin/accounts/${u.id}/fees`,{method:'PATCH',body});toast('Pricing updated.');closeModal();renderCurrent()}catch(err){toast(err.message,true)}};
  balanceForm.onsubmit=async e=>{e.preventDefault();const fd=new FormData(balanceForm);try{await api('/api/finance/admin/adjust-balance',{method:'POST',body:{userId:u.id,amount:Number(fd.get('amount')),note:fd.get('note')}});toast('Balance adjusted.');closeModal();renderCurrent()}catch(err){toast(err.message,true)}};
  resetForm.onsubmit=async e=>{e.preventDefault();try{await api(`/api/accounts/admin/accounts/${u.id}/reset-password`,{method:'POST',body:{password:new FormData(resetForm).get('password')}});toast('Temporary password set.');closeModal()}catch(err){toast(err.message,true)}};
}

async function renderEmployees(){
  const d=await api('/api/accounts/employees');
  content.innerHTML=`${pageHead('Employees','Create limited login accounts for your staff. Agent accounts see Users here instead.')}<section class="card card-pad"><div class="section-title">Add employee</div><p class="small muted">Employees can create deposits and use their limited staff dashboard, but cannot create player cashouts, withdraw, recharge, create users or manage account settings.</p><form id="empForm" class="grid3" style="margin-top:14px"><label class="field"><span class="label">Username</span><input name="username" class="input" required></label><label class="field"><span class="label">Password</span><input name="password" type="password" class="input" minlength="8" required></label><label class="field"><span class="label">Display name</span><input name="displayName" class="input"></label><button class="btn btn-primary">Create employee</button></form></section><section class="card card-pad" style="margin-top:16px"><div class="section-title" style="margin-bottom:14px">Active employees</div>${accountTable(d.employees,false)}</section>`;
  empForm.onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(empForm).entries());body.depositFeeBps=me.depositFeeBps||1700;try{await api('/api/accounts/employees',{method:'POST',body});toast('Employee created.');renderEmployees()}catch(err){toast(err.message,true)}};
}

async function renderPayouts(){
  const d=await api('/api/finance/admin/transactions');const rows=d.transactions.filter(t=>['WITHDRAWAL','CASHOUT'].includes(t.type));
  content.innerHTML=`${pageHead('Payouts','Approve or reject pending withdrawals and player cashouts.')}<section class="card card-pad">${rows.length?`<div class="table-wrap"><table><thead><tr><th>Account</th><th>Type</th><th>Amount</th><th>Net payout</th><th>Destination</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>${rows.map(t=>`<tr><td>${escapeHtml(t.owner?.username||'')}</td><td>${t.type}</td><td>${moneyFmt(t.amount)}</td><td>${moneyFmt(t.net)}</td><td>${escapeHtml(t.destination||'—')}</td><td>${statusPill(t.status)}</td><td>${escapeHtml(dateFmt(t.createdAt))}</td><td>${t.status==='PENDING'?`<div class="row-actions"><button class="btn btn-good btn-sm" data-approve="${t.id}">Approve</button><button class="btn btn-danger btn-sm" data-reject="${t.id}">Reject</button></div>`:'—'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="notice">No payout records.</div>'}</section>`;
  content.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>payoutAction(b.dataset.approve,'approve'));content.querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>payoutAction(b.dataset.reject,'reject'));
}
async function payoutAction(id,action){try{await api(`/api/finance/admin/payouts/${id}/${action}`,{method:'POST'});toast(`Payout ${action}d.`);renderPayouts()}catch(err){toast(err.message,true)}}

async function renderMethods(){
  const d=await api('/api/finance/admin/payment-methods');
  content.innerHTML=`${pageHead('Payment methods','Enable methods and control method limits. User-specific deposit fee can be controlled on each account.')}<div class="stack">${d.methods.map(m=>`<form class="card card-pad methodEdit" data-id="${m.id}"><div class="grid4"><label class="field"><span class="label">Label</span><input name="label" class="input" value="${escapeHtml(m.label)}"></label><label class="field"><span class="label">Fee BPS</span><input name="feeBps" type="number" class="input" value="${m.feeBps}"></label><label class="field"><span class="label">Min amount</span><input name="minAmount" type="number" step="0.01" class="input" value="${m.minAmount}"></label><label class="field"><span class="label">Max amount</span><input name="maxAmount" type="number" step="0.01" class="input" value="${m.maxAmount}"></label></div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:13px"><label class="small"><input name="enabled" type="checkbox" ${m.enabled?'checked':''}> Enabled</label><button class="btn btn-primary btn-sm">Save ${escapeHtml(m.code)}</button></div></form>`).join('')}</div>`;
  content.querySelectorAll('.methodEdit').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f);const body={label:fd.get('label'),feeBps:Number(fd.get('feeBps')),minAmount:Number(fd.get('minAmount')),maxAmount:Number(fd.get('maxAmount')),enabled:f.elements.enabled.checked};try{await api(`/api/finance/admin/payment-methods/${f.dataset.id}`,{method:'PATCH',body});toast('Payment method saved.')}catch(err){toast(err.message,true)}})
}

async function renderSupport(){
  const d=await api('/api/support/tickets');
  const first=d.tickets[0];
  content.innerHTML=`${pageHead('Support',me.role==='ADMIN'?'Review and reply to account tickets.':'Open a ticket and keep the conversation in one place.')}
  ${me.role!=='ADMIN'?`<section class="card card-pad" style="margin-bottom:16px"><div class="section-title">New support ticket</div><form id="ticketForm" class="grid2" style="margin-top:12px"><label class="field"><span class="label">Subject</span><input name="subject" class="input" required></label><label class="field"><span class="label">Message</span><input name="message" class="input" required></label><button class="btn btn-primary">Open ticket</button></form></section>`:''}
  <div class="grid2"><section class="card card-pad"><div class="section-title">Tickets</div><div class="stack" style="margin-top:12px">${d.tickets.length?d.tickets.map(t=>`<button class="btn btn-outline" data-ticket="${t.id}" style="justify-content:space-between"><span>${escapeHtml(t.subject)}${me.role==='ADMIN'?` · ${escapeHtml(t.owner?.username||'')}`:''}</span>${statusPill(t.status)}</button>`).join(''):'<div class="notice">No tickets yet.</div>'}</div></section><section class="card card-pad" id="threadPane">${first?threadHtml(first):'<div class="notice">Select a ticket.</div>'}</section></div>`;
  if(document.getElementById('ticketForm'))ticketForm.onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(ticketForm).entries());try{await api('/api/support/tickets',{method:'POST',body});toast('Ticket opened.');renderSupport()}catch(err){toast(err.message,true)}};
  content.querySelectorAll('[data-ticket]').forEach(b=>b.onclick=()=>{const t=d.tickets.find(x=>x.id===b.dataset.ticket);document.getElementById('threadPane').innerHTML=threadHtml(t);wireThread(t)});if(first)wireThread(first);
}
function threadHtml(t){return `<div style="display:flex;justify-content:space-between;align-items:center"><div><div class="section-title">${escapeHtml(t.subject)}</div><div class="tiny muted">${escapeHtml(t.owner?.username||'')} · ${escapeHtml(t.status)}</div></div>${me.role==='ADMIN'?`<button class="btn btn-outline btn-sm" id="toggleTicket">${t.status==='OPEN'?'Close':'Reopen'}</button>`:''}</div><div class="support-thread" style="margin-top:12px">${t.messages.map(m=>`<div class="message ${m.senderId===me.id?'mine':'other'}">${escapeHtml(m.message)}<div class="message-meta">${escapeHtml(m.sender?.username||'')} · ${escapeHtml(dateFmt(m.createdAt))}</div></div>`).join('')}</div><form id="replyForm" style="display:flex;gap:8px;margin-top:10px"><input name="message" class="input" placeholder="Type a message..." required><button class="btn btn-primary">Send</button></form>`}
function wireThread(t){const f=document.getElementById('replyForm');if(f)f.onsubmit=async e=>{e.preventDefault();try{await api(`/api/support/tickets/${t.id}/messages`,{method:'POST',body:{message:new FormData(f).get('message')}});renderSupport()}catch(err){toast(err.message,true)}};const tb=document.getElementById('toggleTicket');if(tb)tb.onclick=async()=>{try{await api(`/api/support/tickets/${t.id}/status`,{method:'PATCH',body:{status:t.status==='OPEN'?'CLOSED':'OPEN'}});renderSupport()}catch(err){toast(err.message,true)}}}

async function renderSecurity(){
  content.innerHTML=`${pageHead('Security','Password and authenticator-based two-factor authentication.')}
  <div class="grid3"><section class="card card-pad"><div style="text-align:center"><div class="feature-icon" style="margin:auto">✓</div><h3>Two-Factor Authentication</h3><p class="small muted">${me.twoFactorEnabled?'2FA is enabled.':'Add an extra layer of security with an authenticator app.'}</p><button id="twofaBtn" class="btn ${me.twoFactorEnabled?'btn-danger':'btn-primary'} btn-block">${me.twoFactorEnabled?'Disable 2FA':'Enable 2FA'}</button></div></section><section class="card card-pad"><div class="section-title">Change Password</div><form id="passwordForm" class="stack" style="margin-top:15px"><input name="currentPassword" type="password" class="input" placeholder="Current password" required><input name="newPassword" type="password" class="input" minlength="8" placeholder="New password" required><button class="btn btn-primary">Update password</button></form></section><section class="card card-pad"><div class="section-title">Session</div><p class="small muted">Signed in as <strong>${escapeHtml(me.username)}</strong> with role <strong>${me.role}</strong>.</p><p class="small muted">Sessions are stored in an HttpOnly cookie. Provider API keys never enter the browser.</p></section></div>`;
  passwordForm.onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(passwordForm).entries());try{await api('/api/auth/change-password',{method:'POST',body});toast('Password changed.');me.mustChangePassword=false;passwordForm.reset()}catch(err){toast(err.message,true)}};
  twofaBtn.onclick=()=>me.twoFactorEnabled?showDisable2fa():start2fa();
}
async function start2fa(){try{const d=await api('/api/security/2fa/start',{method:'POST'});openModal(`<h3>Enable 2FA</h3><p class="small muted">In your authenticator app choose manual setup and enter this key:</p><div class="codebox">${escapeHtml(d.secret)}</div><form id="confirm2fa" class="stack" style="margin-top:14px"><input name="code" class="input" placeholder="6-digit authenticator code" required><button class="btn btn-primary">Confirm and enable</button><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button></form>`);confirm2fa.onsubmit=async e=>{e.preventDefault();try{await api('/api/security/2fa/confirm',{method:'POST',body:{code:new FormData(confirm2fa).get('code')}});toast('2FA enabled.');closeModal();await loadMe();renderSecurity()}catch(err){toast(err.message,true)}}}catch(err){toast(err.message,true)}}
function showDisable2fa(){openModal(`<h3>Disable 2FA</h3><form id="disable2fa" class="stack"><input name="password" type="password" class="input" placeholder="Password" required><input name="code" class="input" placeholder="Authenticator code" required><button class="btn btn-danger">Disable 2FA</button><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button></form>`);disable2fa.onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(disable2fa).entries());try{await api('/api/security/2fa/disable',{method:'POST',body});toast('2FA disabled.');closeModal();await loadMe();renderSecurity()}catch(err){toast(err.message,true)}}}

async function renderAudit(){const d=await api('/api/admin/audit');content.innerHTML=`${pageHead('Audit log','Recent administrative and security actions.')}<section class="card card-pad"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Actor</th><th>Action</th><th>Target</th><th>IP</th></tr></thead><tbody>${d.logs.map(x=>`<tr><td>${escapeHtml(dateFmt(x.createdAt))}</td><td>${escapeHtml(x.actor?.username||'system')}</td><td>${escapeHtml(x.action)}</td><td>${escapeHtml(x.target||'—')}</td><td>${escapeHtml(x.ip||'—')}</td></tr>`).join('')}</tbody></table></div></section>`}

function renderGuide(){
  content.innerHTML=`${pageHead('Guide','SenkuPayout role and transaction workflow reference.')}
  <div class="stack"><div class="guide-card"><h3>Account hierarchy</h3><div class="codebox">ADMIN\n├── AGENT\n│   ├── USER\n│   └── USER\n└── DIRECT USER\n    └── EMPLOYEE</div><p class="small muted">Only ADMIN can create AGENT accounts. AGENT can create USER accounts assigned to that agent and cannot view or manage those users’ balances. USER can create EMPLOYEE accounts. EMPLOYEE can create deposits for their parent user. Admin may view a User’s employees from the User Manage tab, but employee accounts are read-only for Admin. There is no public registration route.</p></div><div class="guide-card"><h3>Payment flow</h3><div class="codebox">Browser → SenkuPayout API → Provider adapter → Hosted checkout\nProvider confirmation/webhook → backend verification → transaction succeeds → wallet credit → optional agent commission</div></div><div class="guide-card"><h3>Gateway integration</h3><p class="small muted">BytePayout is integrated for real deposits. Configure BYTEPAYOUT_API_KEY and BYTEPAYOUT_WEBHOOK_SECRET on the backend, and verify deposit confirmations in the transaction screen. Payouts are disabled in this deposit-only deployment. The frontend continues calling only SenkuPayout.</p></div><div class="guide-card"><h3>No image assets</h3><p class="small muted">This project uses CSS, text and native browser UI only. There are no PNG/JPG/WebP image assets and no external font or icon package in the frontend.</p></div></div>`;
}

async function renderCurrent(){
  syncNav();const view=activeView();
  if(me.mustChangePassword && view!=='security'){location.hash='security';toast('Change your temporary password before continuing.');return;}
  content.innerHTML='<div class="notice">Loading…</div>';
  const allowed=(NAV[me.role]||[]).map(x=>x[0]).concat('guide');if(!allowed.includes(view)){location.hash='home';return}
  try{
    const map={home:renderHome,deposit:renderDeposit,withdraw:renderWithdraw,cashout:renderCashout,recharge:renderRecharge,transactions:renderTransactions,agents:renderAgents,users:renderUsers,employees:renderEmployees,payouts:renderPayouts,methods:renderMethods,support:renderSupport,security:renderSecurity,audit:renderAudit,guide:renderGuide};
    await map[view]();
  }catch(err){if(err.status===401){location.href='login.html';return}content.innerHTML=`${pageHead('Something went wrong')}<div class="notice bad">${escapeHtml(err.message)}</div>`}
}

window.addEventListener('hashchange',()=>{clearDepositPolling();renderCurrent()});
(async()=>{if(!await loadMe())return;renderNav();if(!location.hash)location.hash='home';else renderCurrent()})();
