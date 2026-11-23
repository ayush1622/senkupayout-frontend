// Public checkout: no account login, no credentials, and no server API key.
// All account ownership and payment amounts are validated by the backend.
(() => {
  'use strict';
  const base = String(window.SENKU_CONFIG?.API_BASE || '').replace(/\/$/, '');
  const params = new URLSearchParams(location.search);
  const code = params.get('code') || '';
  const $ = id => document.getElementById(id);
  const fmt = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n || 0));
  const escape = s => String(s ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const validHttps = s => { try { const u = new URL(s); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
  const presets = [10,20,30,40,50,100,200,500,1000];
  let methods = [], selected = '', currentRequest = null, activeDeposit = null, statusTimer = null;
  const storageKey = `senkupayout_public_${code}`;
  const requestKey = `senkupayout_public_request_${code}`;

  async function api(path,options={}) {
    if (!base || base.includes('REPLACE-WITH-YOUR-RENDER-SERVICE')) throw new Error('The payment service is not configured. Contact the recipient.');
    const response = await fetch(base + path,{
      method:options.method || 'GET',
      headers:{'Content-Type':'application/json'},
      ...(options.body ? {body:JSON.stringify(options.body)} : {}),
      cache:'no-store'
    });
    const payload = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(payload.error || `Payment service returned ${response.status}.`);
    return payload;
  }
  function errorMessage(message) { $('publicError').textContent=message; $('publicError').classList.remove('hidden'); }
  function clearError() { $('publicError').classList.add('hidden'); }
  function selectedMethod() {return methods.find(x=>x.code===selected)}
  function presetAmount(method,nominal) {
    const arr = method?.allowedAmounts || [];
    if(arr.includes(nominal)) return nominal;
    const slightlyLess = Number((nominal-.01).toFixed(2));
    return arr.includes(slightlyLess) ? slightlyLess : null;
  }
  function validAmount() {
    const n=Number($('publicAmount').value);
    const m=selectedMethod();
    return Number.isFinite(n) && m?.allowedAmounts?.includes(n) && n>=m.minAmount && n<=m.maxAmount;
  }
  function update() {
    const n=Number($('publicAmount').value||0),m=selectedMethod(),feeBps=m?.feeBps || 0;
    // Use the same round-half-up behavior as the server for positive USD amounts.
    const fee=Math.round((n*feeBps/10000 + Number.EPSILON)*100)/100;
    $('publicGross').textContent=fmt(n);
    $('publicFee').textContent=fmt(fee);
    $('publicNet').textContent=fmt(Math.max(0, n-fee));
    $('publicCreate').disabled=!validAmount();
    $('publicAllowed').textContent=validAmount()?'This amount is supported for the selected method.':
      `Only exact supported amounts work. Options: ${(m?.allowedAmounts||[]).map(fmt).join(', ') || 'None'}. $500 and $1,000 are not supported.`;
    $('publicPresets').querySelectorAll('[data-amount]').forEach(b=>b.classList.toggle('active',Number(b.dataset.amount)===n));
  }
  function renderPresets() {
    const m=selectedMethod();
    $('publicPresets').innerHTML=presets.map(n=>{
      const actual=presetAmount(m,n),valid=actual!==null&&actual>=m.minAmount&&actual<=m.maxAmount;
      return `<button type="button" class="amount-preset" data-amount="${actual ?? ''}" ${valid?'':'disabled'}><strong>${fmt(n)}</strong><span>${!valid?'Unavailable':actual!==n?`Charge ${fmt(actual)}`:'Available'}</span></button>`;
    }).join('');
    $('publicPresets').querySelectorAll('[data-amount]').forEach(b=>b.onclick=()=>{
      if(!b.disabled) {$('publicAmount').value=b.dataset.amount;currentRequest=null;sessionStorage.removeItem(requestKey);update();}
    });
    update();
  }
  function chooseMethod(method) {
    selected=method;
    $('publicMethods').querySelectorAll('[data-method]').forEach(b=>b.classList.toggle('active',b.dataset.method===selected));
    const m=selectedMethod();
    $('publicAmount').value=presetAmount(m,10) ?? m?.allowedAmounts?.[0] ?? '';
    currentRequest=null;sessionStorage.removeItem(requestKey);
    renderPresets();
  }
  function renderMethods() {
    $('publicMethods').innerHTML=methods.map(m=>`<button type="button" data-method="${escape(m.code)}" class="method-card"><strong>${escape(m.label)}</strong><span>${(m.feeBps/100).toFixed(2)}% account fee</span></button>`).join('');
    $('publicMethods').querySelectorAll('[data-method]').forEach(b=>b.onclick=()=>chooseMethod(b.dataset.method));
    if(methods.length) chooseMethod(methods[0].code);
    $('publicFormArea').classList.remove('hidden');
  }
  function persist() {if(activeDeposit)sessionStorage.setItem(storageKey,JSON.stringify(activeDeposit))}
  function showTracking() {
    if(!activeDeposit) return;
    const info=activeDeposit;
    const status=String(info.status||'PENDING');
    const finished=['SUCCEEDED','FAILED','EXPIRED','REJECTED'].includes(status);
    const text={CREATED:'Preparing payment',PENDING:'Awaiting payment',PROCESSING:'Checking payment',SUCCEEDED:'Payment confirmed',FAILED:'Payment failed',EXPIRED:'Payment expired',REJECTED:'Payment rejected'};
    const checkout=validHttps(info.checkoutUrl);
    $('publicFormArea').classList.add('hidden');
    $('publicTracking').classList.remove('hidden');
    $('publicTracking').innerHTML=`<div class="card public-tracker">
      <div class="label">DEPOSIT REFERENCE</div><div class="small muted" style="overflow-wrap:anywhere;margin-top:5px">${escape(info.reference)}</div>
      <h2 class="${status==='SUCCEEDED'?'public-success':'public-processing'}">${escape(text[status]||status)}</h2>
      <p class="small muted">${finished ? status==='SUCCEEDED'?'BytePayout has confirmed the payment. The recipient account will reflect the verified credit.':'This checkout is closed. You can create another payment if needed.' : 'Use the provider checkout link to pay. This page checks payment status without requiring a SenkuPayout login.'}</p>
      <p class="small muted">Amount: <strong>${fmt(info.amount)}</strong> · Method: <strong>${escape(info.method)}</strong></p>
      ${!finished?`<div class="payment-actions">${checkout?`<a class="btn btn-primary" href="${escape(checkout)}" target="_blank" rel="noopener noreferrer">Open payment checkout ↗</a><button type="button" class="btn btn-outline" id="copyGuestCheckout">Copy checkout link</button>`:''}</div>
      ${info.tag?`<div class="notice">Payment tag: <strong>${escape(info.tag)}</strong></div>`:''}
      ${info.tagEmail?`<div class="notice">Payment email: <strong>${escape(info.tagEmail)}</strong></div>`:''}
      `:''}
      ${info.expiresAt?`<p class="small muted">Provider expiration: ${escape(new Date(info.expiresAt).toLocaleString())}</p>`:''}
      <div class="payment-actions"><button type="button" id="publicNewPayment" class="btn btn-outline">Create another deposit</button></div>
      </div>`;
    $('publicTracking').querySelector('#publicNewPayment').onclick=()=>{
      stopStatus();activeDeposit=null;sessionStorage.removeItem(storageKey);sessionStorage.removeItem(requestKey);
      $('publicTracking').classList.add('hidden');$('publicFormArea').classList.remove('hidden');clearError();update();
    };
    const copy=$('copyGuestCheckout');if(copy) copy.onclick=async()=>{
      try{await navigator.clipboard.writeText(checkout);copy.textContent='Copied!';}
      catch{errorMessage('Copy failed. Please open the checkout link instead.');}
    };
    if(finished) stopStatus();
  }
  function stopStatus(){if(statusTimer){clearInterval(statusTimer);statusTimer=null;}}
  async function statusCheck() {
    if(!activeDeposit?.reference || !activeDeposit?.access) return;
    try {
      const result=await api(`/api/public/deposits/${encodeURIComponent(activeDeposit.reference)}/status`,{method:'POST',body:{access:activeDeposit.access}});
      activeDeposit={...activeDeposit,status:result.transaction.status};persist();showTracking();
    }catch(err){console.warn('Payment confirmation temporarily unavailable:',err.message)}
  }
  function startStatus() {
    stopStatus();statusCheck();
    if(!['SUCCEEDED','FAILED','REJECTED','EXPIRED'].includes(activeDeposit?.status)) {
      statusTimer=setInterval(()=>{if(!document.hidden)statusCheck()},15000);
    }
  }
  async function createCheckout() {
    clearError();if(!validAmount())return;
    const amount=Number($('publicAmount').value),method=selected;
    const finger=`${method}:${amount}`;
    let saved=null;try{saved=JSON.parse(sessionStorage.getItem(requestKey)||'null')}catch{}
    if(!saved || saved.finger!==finger) saved={finger,access:crypto.randomUUID()};
    sessionStorage.setItem(requestKey,JSON.stringify(saved));
    const button=$('publicCreate');button.disabled=true;button.textContent='Generating checkout…';
    try{
      const result=await api(`/api/public/pay/${encodeURIComponent(code)}/deposits`,{method:'POST',body:{amount,method,requestKey:saved.access}});
      activeDeposit={access:saved.access,reference:result.transaction.reference,method,amount,
        status:result.transaction.status,checkoutUrl:result.checkoutUrl,tag:result.tag,tagEmail:result.tagEmail,expiresAt:result.expiresAt};
      persist();showTracking();startStatus();
    }catch(err){errorMessage(err.message);}
    finally{button.textContent='Generate payment link';update()}
  }
  async function initialize() {
    if(!/^[A-Za-z0-9_-]{32,80}$/.test(code))return errorMessage('This public payment link is invalid. Ask the recipient to share a new link.');
    try {
      const result=await api(`/api/public/pay/${encodeURIComponent(code)}`);
      methods=Array.isArray(result.methods)?result.methods:[];
      $('publicTitle').textContent=`Pay ${result.account?.displayName || 'recipient'}`;
      $('publicSubtitle').textContent='Generate a deposit checkout without signing in. Your payment will be credited to this recipient after verification.';
      if(!methods.length) return errorMessage('This recipient has no available deposit methods right now.');
      renderMethods();
      $('publicAmount').addEventListener('input',()=>{currentRequest=null;update()});
      $('publicCreate').onclick=createCheckout;
      try{activeDeposit=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}
      const fromReturn=params.get('deposit_ref');
      if(activeDeposit?.access && activeDeposit?.reference && (!fromReturn || activeDeposit.reference===fromReturn)) {
        showTracking();startStatus();
      } else if(fromReturn) {
        errorMessage('Payment return detected. Status is available in the browser where the checkout was created. The recipient will receive verified payment updates automatically.');
      }
      if(fromReturn) {params.delete('deposit_ref');history.replaceState(null,'',`${location.pathname}?${params.toString()}`)}
    }catch(err){errorMessage(err.message)}
  }
  initialize();
})();
