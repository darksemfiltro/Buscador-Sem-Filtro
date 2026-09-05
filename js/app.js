// ============ APP — Main Logic ============
let searchResults = [];
let histData = { channel: null, videos: [] };
let lastModalText = '';
let lastModalTitle = '';

document.addEventListener('DOMContentLoaded', () => {
  initKeys();
  initNav();
  initModal();
  initCursorGlow();
  initBgCanvas();
  initTabs();
  quota.render();
});

// ---- CURSOR GLOW ----
function initCursorGlow() {
  const g = document.getElementById('cursorGlow');
  document.addEventListener('mousemove', e => { g.style.left = e.clientX+'px'; g.style.top = e.clientY+'px'; });
}

// ---- BG CANVAS ----
function initBgCanvas() {
  const c = document.getElementById('bgCanvas');
  const ctx = c.getContext('2d');
  let w, h, dots = [];
  function resize() { w = c.width = innerWidth; h = c.height = innerHeight; }
  resize();
  window.addEventListener('resize', resize);
  for (let i = 0; i < 40; i++) {
    dots.push({ x: Math.random()*w, y: Math.random()*h, vx: (Math.random()-0.5)*0.3, vy: (Math.random()-0.5)*0.3, r: Math.random()*1.2+0.3 });
  }
  function draw() {
    ctx.clearRect(0,0,w,h);
    dots.forEach(d => {
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0 || d.x > w) d.vx *= -1;
      if (d.y < 0 || d.y > h) d.vy *= -1;
      ctx.fillStyle = 'rgba(34,211,180,0.15)';
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI*2); ctx.fill();
    });
    for (let i = 0; i < dots.length; i++) {
      for (let j = i+1; j < dots.length; j++) {
        const dx = dots[i].x - dots[j].x, dy = dots[i].y - dots[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 150) {
          ctx.strokeStyle = `rgba(34,211,180,${0.08*(1-dist/150)})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(dots[i].x, dots[i].y); ctx.lineTo(dots[j].x, dots[j].y); ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// Global Enter Key Handler for Forms
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      const parentRow = e.target.closest('.input-row') || e.target.closest('.filters-row');
      if (parentRow) {
        const btn = parentRow.querySelector('.btn-action');
        if (btn) {
          e.preventDefault();
          btn.click();
        }
      }
    }
  }
});

// ---- KEYS ----
function initKeys() {
  if (window.__bsfKeysInit) return; // idempotente: ignora 2º disparo de DOMContentLoaded
  window.__bsfKeysInit = true;
  const ytIn = document.getElementById('apiKey');
  const aiIn = document.getElementById('aiKey');
  const provSel = document.getElementById('aiProvider');
  const modelSel = document.getElementById('aiModel');
  const modelField = document.getElementById('modelField');
  const warn = document.getElementById('keysWarning');
  const hint = document.getElementById('providerHint');
  const keyLabel = document.getElementById('aiKeyLabel');

  // Populate provider dropdown from AI_PROVIDERS (idempotente: ignora 2º init)
  const customOrder = ['llm7', 'openrouter', 'huggingface', 'gemini', 'ollama_cloud', 'nvidia'];
  if (provSel.options.length === 0) {
  Object.entries(AI_PROVIDERS).sort((a,b) => {
    let ia = customOrder.indexOf(a[0]); let ib = customOrder.indexOf(b[0]);
    if(ia===-1) ia=999; if(ib===-1) ib=999;
    return ia - ib;
  }).forEach(([id, prov]) => {
    const o = document.createElement('option');
    o.value = id; o.textContent = prov.name;
    provSel.appendChild(o);
  });
  }

  let aiKeysMap = getAIKeysMap();
  const oldSingleKey = localStorage.getItem('bsf_aiKey') || '';
  const oldProvider = localStorage.getItem('bsf_aiProvider') || 'llm7';
  if (oldSingleKey && !aiKeysMap[oldProvider]) {
    aiKeysMap[oldProvider] = oldSingleKey;
    localStorage.setItem('bsf_aiKeys', JSON.stringify(aiKeysMap));
  }

  // Restore saved values (cofre primeiro, legacy como fallback)
  function restoreInputs() {
    let snap = null;
    try { if (window.Vault && Vault.isUnlocked()) snap = Vault.snapshot(); } catch (e) {}
    ytIn.value = (snap && snap.ytKey) || localStorage.getItem('bsf_ytKey') || '';
    provSel.value = (snap && snap.aiProvider) || localStorage.getItem('bsf_aiProvider') || 'llm7';
  }
  restoreInputs();
  try {
    if (window.Vault && !Vault.exists() && (localStorage.getItem('bsf_ytKey') || localStorage.getItem('bsf_aiKeys') || localStorage.getItem('bsf_aiKey'))) {
      setTimeout(() => { try { toast('Migre seu cofre: clique Salvar e crie a senha mestra.', 'error'); } catch (e) {} }, 600);
    } else if (window.Vault && Vault.exists() && !Vault.isUnlocked()) {
      // Cofre existe e está bloqueado: pede a senha e restaura ao desbloquear.
      setTimeout(async () => {
        try {
          if (await Vault.ensureUnlocked()) { restoreInputs(); await updateProvider({ force: true }); }
        } catch (e) {}
      }, 600);
    }
  } catch (e) {}

  // ---- Modelos dinâmicos (ModelRegistry) + combobox pesquisável ----
  let modelItems = [];   // lista cheia do provider atual
  let modelReq = 0;      // guarda contra race ao trocar de provider
  const countEl = document.getElementById('modelCount');
  const refreshBtn = document.getElementById('btnRefreshModels');

  function toRegShape(m) {
    return { id: m.id, name: m.name || m.id, free: m.free !== false, context: 0, pricing: '', updated: '' };
  }
  function hardcodedItems(pid) {
    const p = AI_PROVIDERS[pid];
    return ((p && p.models) || []).map(toRegShape);
  }
  function fmtCtx(n) {
    n = parseInt(n) || 0;
    if (n >= 1000) return Math.round(n / 1000) + 'k';
    return String(n);
  }
  function renderModelOptions(keepValue) {
    const items = window.ModelRegistry ? ModelRegistry.filterItems(modelItems, '') : modelItems.slice();
    const prev = keepValue || modelSel.value || getStoredAIModel(provSel.value);
    modelSel.innerHTML = '';
    items.forEach(m => {
      const o = document.createElement('option');
      o.value = m.id;
      const short = String(m.id).split('/').pop();
      o.textContent = (m.free ? '[FREE] ' : '') + ((m.name && m.name !== m.id) ? m.name + ' · ' + short : m.id);
      let tip = m.id;
      if (m.context) tip += ' · ctx ' + fmtCtx(m.context);
      if (m.pricing) tip += ' · ' + m.pricing;
      o.title = tip;
      modelSel.appendChild(o);
    });
    if (prev && Array.from(modelSel.options).some(o => o.value === prev)) {
      modelSel.value = prev;
    } else if (modelSel.options.length > 0) {
      modelSel.value = modelSel.options[0].value;
    }
    if (countEl) {
      let ts = 0;
      try { ts = ModelRegistry.cacheTs(provSel.value); } catch (e) {}
      const hhmm = ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
      countEl.textContent = items.length + ' de ' + modelItems.length + ' modelos • atualizados ' + hhmm;
    }
  }

  // Populate models for selected provider (mesma assinatura; dinâmica por dentro)
  async function updateProvider(opts) {
    opts = opts || {};
    const prov = AI_PROVIDERS[provSel.value];
    if (!prov) return;
    const my = ++modelReq;

    aiKeysMap = getAIKeysMap();
    aiIn.value = aiKeysMap[provSel.value] || '';

    // Update key label and hint
    keyLabel.textContent = prov.keyLabel.split(' — ')[0];
    hint.innerHTML = prov.freeInfo;

    // Always show model field
    modelField.style.display = 'flex';
    // llm7 tem key opcional: campo visível mesmo com auth 'none'
    const needKey = prov.auth !== 'none' || !!prov.optionalKey;
    aiIn.closest('.key-field').style.display = needKey ? 'flex' : 'none';
    aiIn.placeholder = provSel.value === 'llm7' ? 'Token llm7 (opcional)...' : 'Chave da API...';
    aiIn.type = 'password';

    // Render imediato com fallback (select nunca vazio), depois lista ao vivo
    modelItems = hardcodedItems(provSel.value);
    renderModelOptions(getStoredAIModel(provSel.value));
    if (!window.ModelRegistry) return;
    try {
      const live = await ModelRegistry.list(provSel.value, { force: !!opts.force });
      if (my !== modelReq) return;
      if (live && live.length) {
        modelItems = live;
        renderModelOptions(modelSel.value);
      }
    } catch (e) { /* registry já deu toast de fallback */ }
  }
  provSel.addEventListener('change', () => updateProvider());
  if (refreshBtn) refreshBtn.addEventListener('click', async () => {
    refreshBtn.classList.add('bsf-spin');
    try { await updateProvider({ force: true }); }
    finally { refreshBtn.classList.remove('bsf-spin'); }
  });
  updateProvider();

  function checkWarning() { warn.classList.toggle('hidden', !!ytIn.value.trim()); }
  checkWarning();
  ytIn.addEventListener('input', checkWarning);
  aiIn.addEventListener('input', checkWarning);
  document.getElementById('toggleYtVis').onclick = () => { ytIn.type = ytIn.type === 'password' ? 'text' : 'password'; };
  document.getElementById('toggleAiVis').onclick = () => { aiIn.type = aiIn.type === 'password' ? 'text' : 'password'; };

  document.getElementById('btnClearCache').onclick = () => {
    if (confirm('Tem certeza que deseja apagar o cofre, as chaves e o cache de modelos? (favoritos mantidos)')) {
      try { if (window.Vault) Vault.clearAll(); } catch (e) {}
      toast('Cofre e cache limpos! A página será recarregada.');
      setTimeout(() => location.reload(), 1500);
    }
  };

  document.getElementById('btnSaveKeys').onclick = async () => {
    try {
      if (window.Vault && !await Vault.ensureUnlocked()) return;
    } catch (e) { toast('Falha no cofre: ' + e.message, 'error'); return; }
    const providerId = provSel.value;
    const prov = AI_PROVIDERS[providerId];
    const keyVal = aiIn.value.trim();
    aiKeysMap = getAIKeysMap();
    if (prov && prov.auth === 'none') delete aiKeysMap[providerId];
    else aiKeysMap[providerId] = keyVal;
    let modelMap = {};
    try {
      if (window.Vault && Vault.isUnlocked()) modelMap = Vault.snapshot().aiModels || {};
      else modelMap = JSON.parse(localStorage.getItem('bsf_aiModels') || '{}') || {};
    } catch(e) {}
    modelMap[providerId] = resolveProviderModel(providerId, modelSel.value);
    const payload = { ytKey: ytIn.value.trim(), aiKeys: aiKeysMap, aiModels: modelMap, aiProvider: providerId };
    try {
      if (window.Vault && Vault.isUnlocked()) {
        await Vault.saveAll(payload);
      } else {
        // sem WebCrypto: legacy em plaintext
        localStorage.setItem('bsf_ytKey', payload.ytKey);
        localStorage.setItem('bsf_aiKeys', JSON.stringify(aiKeysMap));
        localStorage.setItem('bsf_aiProvider', providerId);
        localStorage.setItem('bsf_aiModel', modelMap[providerId]);
        localStorage.setItem('bsf_aiModels', JSON.stringify(modelMap));
      }
    } catch (e) { toast('Falha ao salvar: ' + e.message, 'error'); return; }
    aiIn.value = aiKeysMap[providerId] || '';
    checkWarning();

    if (providerId === 'gemini') {
      await updateProvider({ force: true }); // key nova: ignora fallback cacheado
    }

    toast('Chaves salvas no cofre!', 'success');
  };
  document.getElementById('btnTestKeys').onclick = async () => {
    try {
      if (window.Vault && !Vault.isUnlocked() && !await Vault.ensureUnlocked()) return;
    } catch (e) { toast('Falha no cofre: ' + e.message, 'error'); return; }
    let ytKey = getYTKey();
    if (!ytKey) return toast('Insira a chave do YouTube primeiro.');
    modalLoading('Testando conexões...');
    try {
      updateLoadMsg('Testando YouTube API...');
      const resYt = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&id=UC_x5XG1OV2P6uZZ5FSM9Ttw&key=${ytKey}`);
      if (!resYt.ok) throw new Error('Falha no YouTube API. Verifique a chave.');
      
      updateLoadMsg('Testando provedor de IA...');
      const model = getSelectedModel();
      if (!model) throw new Error('Nenhum modelo de IA selecionado.');
      
      const provider = getAIProvider();
      if (provider === 'ollama_cloud') {
        const prov = AI_PROVIDERS.ollama_cloud;
        const url = prov.endpoint();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAIKey() },
            body: JSON.stringify({ model, messages:[{role:'user',content:'OK'}], max_tokens:10 }),
            signal: controller.signal
          });
          clearTimeout(timeout);
          if (!res.ok) {
            const err = await res.json().catch(()=>({}));
            throw new Error('Ollama Cloud erro ' + res.status + ': ' + (err.error?.message || res.statusText));
          }
        } catch(e) {
          clearTimeout(timeout);
          if (e.name === 'AbortError') {
            throw new Error('Ollama Cloud nao respondeu em 30s. Verifique sua chave de API e Conexão com cloud.ollama.com');
          }
          throw e;
        }
      } else {
        await callAI('OK');
      }
      
      closeModal();
      toast('Tudo funcionando perfeitamente!', 'success');
    } catch(e) {
      modalError('Falha no Teste', e.message);
    }
  };
}

// ---- NAV ----
let trendingLoaded = false;
let currentTrendVideos = []; // filtered view
function initNav() {
  const mainNav = document.getElementById('mainNav');
  const overlay = document.getElementById('mobileMenuOverlay');
  document.getElementById('btnMobileNav')?.addEventListener('click', () => {
    mainNav.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open');
  });
  if (overlay) {
    overlay.addEventListener('click', () => {
      mainNav.classList.remove('open');
      overlay.classList.remove('open');
    });
  }

  document.querySelectorAll('.nav-btn[data-tab]').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn[data-tab]').forEach(x => x.classList.remove('active'));
      document.querySelectorAll(`.nav-btn[data-tab="${b.dataset.tab}"]`).forEach(x => x.classList.add('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('tab-'+b.dataset.tab)?.classList.add('active');
      
      if (mainNav.classList.contains('open')) {
        mainNav.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
      }
      
      // Auto-load trending on first click
      if (b.dataset.tab === 'trending' && !trendingLoaded) {
        trendingLoaded = true;
        if (typeof triggerTrendingAutoLoad === 'function') triggerTrendingAutoLoad();
      }
    });
  });
}

// ---- MODAL ----
function initModal() {
  document.getElementById('modalClose').onclick = closeModal;
  document.getElementById('modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
  document.getElementById('btnCopyModal').onclick = () => { if (lastModalText) copyText(lastModalText); };
  document.getElementById('btnPdfModal').onclick = () => { if (lastModalText) makePDF(lastModalTitle, md2html(lastModalText)); };
}
let isAiLoading = false;

function openModal(title, rawText) {
  lastModalTitle = title; lastModalText = rawText;
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = md2html(rawText);
  document.getElementById('modal').classList.add('open');
}
function closeModal() { isAiLoading = false; document.getElementById('modal').classList.remove('open'); }
function modalLoading(msg) {
  if (isAiLoading) return false;
  isAiLoading = true;
  document.getElementById('modal').classList.add('open');
  document.getElementById('modalTitle').textContent = 'Processando...';
  document.getElementById('modalBody').innerHTML = `<div class="loading-box"><div class="spinner lg"></div><p id="loadMsg">${msg}</p></div>`;
  return true;
}
function updateLoadMsg(msg) {
  const el = document.getElementById('loadMsg');
  if (el) el.textContent = msg;
}
function modalError(title, msg) {
  isAiLoading = false;
  document.getElementById('modal').classList.add('open');
  document.getElementById('modalTitle').textContent = title;
  // Escape HTML and convert newlines to <br> for readability
  const safeMsg = msg.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  document.getElementById('modalBody').innerHTML = `<div style="padding:20px"><div style="padding:14px;background:var(--red-dim);border-left:3px solid var(--red);border-radius:8px;margin-bottom:12px"><p style="color:var(--red);font-size:14px;font-weight:600;margin-bottom:6px">${title}</p><p style="color:var(--text);font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word">${safeMsg}</p></div>${window.location.protocol==='file:'?'<div style="padding:14px;background:var(--secondary-dim);border-left:3px solid var(--secondary);border-radius:8px;margin-top:10px"><p style="color:var(--secondary);font-size:13px;font-weight:600;margin-bottom:4px">Dica: Use servidor local</p><p style="color:var(--text);font-size:12px;line-height:1.6">Abrir o arquivo diretamente (file://) pode bloquear chamadas de API. Execute: <code style="background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px">npx serve .</code> na pasta e acesse via http://localhost</p></div>':''}</div>`;
}

// ============ HELPERS ============
function setupFormatToggle(container, toggleId) {
  container.querySelectorAll('#'+toggleId+' .format-opt').forEach(o => {
    o.onclick = () => {
      container.querySelectorAll('#'+toggleId+' .format-opt').forEach(x => x.classList.remove('active'));
      o.classList.add('active');
    };
  });
}

function getFormatFilter(toggleId) {
  return document.querySelector('#'+toggleId+' .format-opt.active')?.dataset.v || 'all';
}

function filterByFormat(vids, fmt) {
  if (fmt === 'short') return vids.filter(v => v.isShort);
  if (fmt === 'long') return vids.filter(v => !v.isShort);
  return vids;
}

// ============ TAB INIT ============
function initTabs() {
  initCanal();
  initVideo();
  initComparar();
  initHistorico();
  initPesquisa();
  initTrending();
  initFavoritos();
  initExportar();
}

// ---- CANAL ----
function initCanal() {
  const el = document.getElementById('tab-canal');
  el.innerHTML = `<div class="card"><div class="input-row">
    <div class="field" style="flex:3"><label>Canal (ID, @handle ou URL)</label><input type="text" id="inCanal" placeholder="@DarkSemFiltro..."></div>
    <div class="field" style="flex:0"><label>&nbsp;</label><button class="btn-action" id="btnCanal">Analisar</button></div>
  </div><div id="outCanal"></div></div>`;
  const doCanal = async () => {
    const v = document.getElementById('inCanal').value.trim();
    if (!v) return toast('Digite o canal!');
    const out = document.getElementById('outCanal');
    showLoad(out, 'Buscando canal...');
    try {
      const id = await resolveChannelId(v);
      const ch = await fetchChannel(id);
      renderCanal(ch, out);
    } catch(e) { showErr(out, e.message); }
  };
  document.getElementById('btnCanal').onclick = doCanal;
  document.getElementById('inCanal').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doCanal(); } });
}

function renderCanal(ch, el) {
  const vpv = ch.vids ? Math.round(ch.views/ch.vids) : 0;
  const vpw = calcVidsPerWeek(ch.vids, ch.created);
  const subViewRate = ch.views > 0 ? ((ch.subs / ch.views) * 100).toFixed(2) : '0';
  el.innerHTML = `
    <div class="ch-header">
      ${ch.bannerUrl ? `<img src="${ch.bannerUrl}" style="width:100%;height:80px;object-fit:cover;border-radius:var(--r) var(--r) 0 0;margin:-16px -16px 12px;display:block" alt="banner">` : ''}
      <div style="position:relative">
        <img src="${ch.avatar}" class="ch-avatar" alt="${ch.title}" style="border-radius:50%;width:72px;height:72px;object-fit:cover;border:2px solid var(--border)">
      </div>
      <div class="ch-info" style="flex:1">
        <h2 style="font-size:18px;margin-bottom:2px">${ch.title}</h2>
        <div class="ch-handle" style="font-size:12px">${ch.url || ch.id}</div>
        <div class="ch-line">${ch.country || 'N/A'} · Criado em ${fmtDate(ch.created)} · ${vpw} vídeos/semana</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
        <a href="https://www.youtube.com/${ch.url || ('channel/'+ch.id)}" target="_blank" class="btn-action outline small">Acessar canal</a>
        <button class="btn-action ghost small fav-toggle ${favs.has(ch.id)?'is-favorited':''}" data-fav-id="${ch.id}" data-off-text="Favoritar" data-on-text="Favoritado" onclick="toggleFav('${ch.id}','${ch.title.replace(/'/g,"\\'")}','canal', this)">${favs.has(ch.id)?'Favoritado':'Favoritar'}</button>
      </div>
    </div>
    <div class="stats-row">
      <div class="stat-box" style="border-left:3px solid #22d3b4"><span class="stat-val">${fmtNum(ch.subs)}</span><span class="stat-lbl">Inscritos</span></div>
      <div class="stat-box" style="border-left:3px solid #6366f1"><span class="stat-val">${fmtNum(ch.views)}</span><span class="stat-lbl">Views Totais</span></div>
      <div class="stat-box" style="border-left:3px solid #10b981"><span class="stat-val">${fmtNum(ch.vids)}</span><span class="stat-lbl">Vídeos</span></div>
      <div class="stat-box" style="border-left:3px solid #f59e0b"><span class="stat-val">${fmtNum(vpv)}</span><span class="stat-lbl">Views/Video</span></div>
      <div class="stat-box" style="border-left:3px solid #ec4899"><span class="stat-val">${vpw}</span><span class="stat-lbl">Vids/Semana</span></div>
      <div class="stat-box" style="border-left:3px solid #06b6d4"><span class="stat-val">${subViewRate}%</span><span class="stat-lbl">Taxa Sub/View</span></div>
    </div>
    ${ch.desc ? `<div style="position:relative;margin-top:12px"><div class="ch-desc" id="chDesc">${ch.desc}</div>${copyBtnHtmlData('chDesc','Copiar Descrição')}</div>` : ''}
    <div style="margin-top:14px">
      <label style="font-size:10px;color:var(--text-dim);font-weight:700;text-transform:uppercase;display:block;margin-bottom:5px">Contexto adicional (opcional) — adicione seu prompt aqui</label>
      <textarea id="chContext" placeholder="Ex: Quero criar um canal parecido no nicho de..." style="height:60px"></textarea>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:24px;justify-content:center">
      <button class="btn-action bsf-report-btn" style="padding:14px 28px;font-size:15px">Gerar Dossiê de Canal com IA</button>
    </div>`;

  el.querySelectorAll('.bsf-report-btn').forEach(btn => {
    btn.onclick = async () => {
    const ctx = document.getElementById('chContext')?.value || '';
    const newWin = window.open('', '_blank');
    if (newWin) {
      newWin.document.write('<html style="background:#09090b;color:#a1a1aa"><head><title>Processando...</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif">Gerando relatório com IA, por favor aguarde...</body></html>');
      newWin.document.close();
    }
    
    if (!modalLoading('Conectando com IA...')) { if (newWin) newWin.close(); return; }
    try {
      updateLoadMsg('Enviando dados do canal para análise...');
      const t = await aiChannelAnalysis(ch, ctx);
      if (!t || !t.trim()) throw new Error('A IA retornou uma resposta vazia. Tente novamente ou troque o modelo.');
      updateLoadMsg('Formatando relatório...');
      closeModal();
      openReportPage('analise: '+ch.title, `${fmtNum(ch.subs)} subs · ${fmtNum(ch.views)} views · ${vpw} vids/sem`, md2html(t), ctx, newWin);
    } catch(e) { 
        if (newWin && !newWin.closed) newWin.close();
        modalError('Erro na análise IA', e.message || 'Erro desconhecido. Verifique sua chave de API e Conexão com cloud.ollama.com.'); 
    }
    };
  });
}

// ---- VIDEO ----
function initVideo() {
  const el = document.getElementById('tab-video');
  el.innerHTML = `<div class="card"><div class="input-row">
    <div class="field" style="flex:3"><label>Video (URL ou ID)</label><input type="text" id="inVideo" placeholder="https://youtube.com/watch?v=... ou shorts/..."></div>
    <div class="field" style="flex:0"><label>&nbsp;</label><button class="btn-action" id="btnVideo">Buscar</button></div>
  </div><div id="outVideo"></div></div>`;
  const doVideo = async () => {
    const v = document.getElementById('inVideo').value.trim();
    if (!v) return toast('Cole a URL!');
    const out = document.getElementById('outVideo');
    showLoad(out, 'Buscando video...');
    try { const vid = await fetchVideo(v); renderVideo(vid, out); } catch(e) { showErr(out, e.message); }
  };
  document.getElementById('btnVideo').onclick = doVideo;
  document.getElementById('inVideo').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doVideo(); } });
}

function renderVideo(v, el) {
  const ec = engCls(v.eng);
  const tagsHtml = v.tags.length ? v.tags.map(t=>`<span class="tag">${t}</span>`).join('') : '<span class="tag">Sem tags</span>';
  el.innerHTML = `
    <div style="position:relative;text-align:center;margin-bottom:16px">
      <img src="${v.thumb}" style="width:100%;max-width:580px;border-radius:var(--r);box-shadow:var(--shadow)" alt="${v.title}">
      <button class="btn-action small" style="position:absolute;bottom:12px;right:calc(50% - 280px);transform:translateX(0);padding:6px 10px;font-size:11px;white-space:nowrap;background:rgba(12,12,16,0.8);color:#fff;backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,0.1);border-radius:20px" onclick="downloadBestThumb('${v.id}','${v.title.replace(/'/g,"\\'")}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Baixar Capa
      </button>
    </div>
    <h2 style="font-size:16px;font-weight:700;margin-bottom:6px">${v.title}</h2>
    <p style="font-size:12px;color:var(--text-dim);margin-bottom:14px">${v.channel} · ${fmtDate(v.published)} · ${v.durStr} · ${v.isShort?'SHORT':'Longo'} · ${v.definition.toUpperCase()} ${v.caption?'· Legenda':''}</p>
    <div class="stats-row">
      <div class="stat-box" style="border-left:3px solid #ef4444"><span class="stat-val">${fmtNum(v.views)}</span><span class="stat-lbl">Views</span></div>
      <div class="stat-box" style="border-left:3px solid #22d3b4"><span class="stat-val">${fmtNum(v.likes)}</span><span class="stat-lbl">Likes</span></div>
      <div class="stat-box" style="border-left:3px solid #6366f1"><span class="stat-val">${fmtNum(v.comments)}</span><span class="stat-lbl">comentários</span></div>  
      <div class="stat-box" style="border-left:3px solid #f59e0b"><span class="stat-val ${ec}">${v.eng}%</span><span class="stat-lbl">Engajamento</span></div>
    </div>
    <div style="margin:12px 0">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><label style="font-size:10px;color:var(--text-dim);font-weight:700;text-transform:uppercase">Tags</label>${copyBtnHtmlData('vidTags','Copiar tags')}</div>
      <div class="tags-row" id="vidTags">${tagsHtml}</div>
    </div>
    ${v.desc ? `<div style="margin:12px 0"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><label style="font-size:10px;color:var(--text-dim);font-weight:700;text-transform:uppercase">Descrição</label>${copyBtnHtmlData('vidDesc','Copiar')}</div><div class="ch-desc" id="vidDesc">${v.desc.replace(/\n/g,'<br>')}</div></div>` : ''}
    <div style="margin-top:14px">
      <label style="font-size:10px;color:var(--text-dim);font-weight:700;text-transform:uppercase;display:block;margin-bottom:5px">Contexto (opcional)</label>
      <textarea id="vidContext" placeholder="Ex: Quero entender a estrutura desse video para replicar..." style="height:60px"></textarea>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;justify-content:center">
      <button class="btn-action outline small fav-toggle ${favs.has(v.id)?'is-favorited':''}" data-fav-id="${v.id}" data-off-text="Favoritar Vídeo" data-on-text="Favoritado" onclick="toggleFav('${v.id}','${v.title.replace(/'/g,"\\'")}','video', this)">${favs.has(v.id)?'Favoritado':'Favoritar Vídeo'}</button>
      <button class="btn-action bsf-report-btn">Gerar Engenharia Reversa com IA</button>
    </div>`;

  el.querySelectorAll('.bsf-report-btn').forEach(btn => {
    btn.onclick = async () => {
    const ctx = document.getElementById('vidContext')?.value || '';
    const newWin = window.open('', '_blank');
    if (newWin) {
      newWin.document.write('<html style="background:#09090b;color:#a1a1aa"><head><title>Processando...</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif">Gerando relatório com IA, por favor aguarde...</body></html>');
      newWin.document.close();
    }

    if (!modalLoading('Conectando com IA...')) { if(newWin) newWin.close(); return; }
    try {
      updateLoadMsg('Buscando transcricao do video...');
      const transcript = window.fetchVideoTranscript ? await window.fetchVideoTranscript(v.id) : '';
      
      updateLoadMsg('Enviando dados do video para análise...');
      const t = await aiVideoAnalysis(v, ctx, transcript);
      if (!t || !t.trim()) throw new Error('A IA retornou uma resposta vazia. Tente novamente ou troque o modelo.');
      updateLoadMsg('Formatando relatório...');
      closeModal();
      openReportPage('análise: '+v.title, `${fmtNum(v.views)} views · ${v.eng}% eng · ${v.durStr}`, md2html(t), ctx, newWin);
    } catch(e) { 
        if (newWin && !newWin.closed) newWin.close();
        modalError('Erro na análise IA', e.message || 'Erro desconhecido. Verifique sua chave de API e Conexão com cloud.ollama.com.'); 
    }
  };
  });
}

window.downloadBestThumb = async function(videoId, rawTitle='thumbnail') {
  const title = (rawTitle || 'thumbnail').replace(/[\\/:*?"<>|]/g, '').trim() || 'thumbnail';
  const candidates = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default'];
  const pickBest = () => new Promise((resolve) => {
    let idx = 0;
    const next = () => {
      if (idx >= candidates.length) return resolve(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
      const quality = candidates[idx++];
      const url = `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth >= 320) resolve(url);
        else next();
      };
      img.onerror = next;
      img.src = url;
    };
    next();
  });

  try {
    const bestUrl = await pickBest();
    const res = await fetch(bestUrl);
    if (!res.ok) throw new Error('Falha ao baixar thumbnail');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `thumb_${title}_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      toast('Thumbnail baixada!', 'success');
      URL.revokeObjectURL(a.href);
    }, 100);
  } catch(e) {
    window.open(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, '_blank');
    toast('Não foi possível baixar automaticamente. Abrindo imagem.', 'info');
  }
};

// ---- COMPARAR ----
function initComparar() {
  const el = document.getElementById('tab-comparar');
  el.innerHTML = `<div class="card"><div class="input-row">
    <div class="field"><label>Canal A</label><input type="text" id="inCmpA" placeholder="@canalA"></div>
    <div class="field"><label>Canal B</label><input type="text" id="inCmpB" placeholder="@canalB"></div>
    <div class="field" style="flex:0"><label>&nbsp;</label><button class="btn-action" id="btnCmp">Comparar</button></div>
  </div><div id="outCmp"></div></div>`;
  const doCmp = async () => {
    const a = document.getElementById('inCmpA').value.trim();
    const b = document.getElementById('inCmpB').value.trim();
    if (!a||!b) return toast('Preencha ambos!');
    const out = document.getElementById('outCmp');
    showLoad(out, 'Carregando dados...');
    try {
      const [idA,idB] = await Promise.all([resolveChannelId(a), resolveChannelId(b)]);
      const [chA,chB] = await Promise.all([fetchChannel(idA), fetchChannel(idB)]);
      const [hA,hB] = await Promise.all([
        fetchChannelVideos(idA, 10).catch(()=>({channel:chA,videos:[]})),
        fetchChannelVideos(idB, 10).catch(()=>({channel:chB,videos:[]}))
      ]);
      renderCompare(chA, chB, hA.videos, hB.videos, out);
    } catch(e) { showErr(out, e.message); }
  };
  document.getElementById('btnCmp').onclick = doCmp;
  document.getElementById('inCmpA').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doCmp(); } });
  document.getElementById('inCmpB').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doCmp(); } });
}

function renderCompare(a, b, vidsA, vidsB, el) {
  a.vpv = a.vids ? Math.round(a.views/a.vids) : 0;
  b.vpv = b.vids ? Math.round(b.views/b.vids) : 0;
  a.subsPerVid = a.vids ? Math.round(a.subs/a.vids) : 0;
  b.subsPerVid = b.vids ? Math.round(b.subs/b.vids) : 0;
  a.vpw = calcVidsPerWeek(a.vids, a.created);
  b.vpw = calcVidsPerWeek(b.vids, b.created);

  function avgEng(vids) { return !vids.length ? 0 : parseFloat((vids.reduce((s,v)=>s+v.eng,0)/vids.length).toFixed(2)); }
  function avgViews(vids) { return !vids.length ? 0 : Math.round(vids.reduce((s,v)=>s+v.views,0)/vids.length); }
  function avgDur(vids) { return !vids.length ? 0 : Math.round(vids.reduce((s,v)=>s+v.durSec,0)/vids.length); }
  function shortsPct(vids) { return !vids.length ? 0 : Math.round((vids.filter(v=>v.isShort).length/vids.length)*100); }

  a.avgEng = avgEng(vidsA); b.avgEng = avgEng(vidsB);
  a.avgViews = avgViews(vidsA); b.avgViews = avgViews(vidsB);
  a.avgDur = avgDur(vidsA); b.avgDur = avgDur(vidsB);
  a.shortsPct = shortsPct(vidsA); b.shortsPct = shortsPct(vidsB);

  const metrics = [
    { label:'Inscritos', va:a.subs, vb:b.subs, fmt:fmtNum },
    { label:'Views Totais', va:a.views, vb:b.views, fmt:fmtNum },
    { label:'Videos', va:a.vids, vb:b.vids, fmt:fmtNum },
    { label:'Vids/Semana', va:a.vpw, vb:b.vpw, fmt:v=>v.toFixed?v.toFixed(1):v },
    { label:'Views/Video', va:a.vpv, vb:b.vpv, fmt:fmtNum },
    { label:'Subs/Video', va:a.subsPerVid, vb:b.subsPerVid, fmt:fmtNum },
    { label:'Eng. Media', va:a.avgEng, vb:b.avgEng, fmt:v=>v+'%' },
    { label:'Views Recentes (media)', va:a.avgViews, vb:b.avgViews, fmt:fmtNum },
    { label:'Duração Media', va:a.avgDur, vb:b.avgDur, fmt:fmtTime },
    { label:'% Shorts', va:a.shortsPct, vb:b.shortsPct, fmt:v=>v+'%' },
  ];

  let rowsHtml = metrics.map(m => {
    const wA = m.va > m.vb, wB = m.vb > m.va;
    return `<div class="cmp-row">
      <div class="cmp-val left ${wA?'winner':''}">${wA?'● ':''}${m.fmt(m.va)}</div>
      <div class="cmp-label">${m.label}</div>
      <div class="cmp-val ${wB?'winner':''}">${m.fmt(m.vb)}${wB?' ●':''}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="cmp-wrapper" style="margin-bottom:16px">
      <div class="cmp-side">
        <img src="${a.avatar}" class="ch-avatar" alt="${a.title}">
        <h3 style="margin-top:8px;font-size:14px">${a.title}</h3>
        <p style="font-size:11px;color:var(--text-dim)">${a.country} · ${a.vpw} vids/sem</p>
      </div>
      <div class="cmp-vs">VS</div>
      <div class="cmp-side">
        <img src="${b.avatar}" class="ch-avatar" alt="${b.title}">
        <h3 style="margin-top:8px;font-size:14px">${b.title}</h3>
        <p style="font-size:11px;color:var(--text-dim)">${b.country} · ${b.vpw} vids/sem</p>
      </div>
    </div>
    <div class="cmp-rows">${rowsHtml}</div>
    <div style="margin-top:16px">
      <label style="font-size:10px;color:var(--text-dim);font-weight:700;text-transform:uppercase;display:block;margin-bottom:5px">Contexto adicional (opcional) — adicione seu prompt aqui</label>
      <textarea id="cmpContext" placeholder="Ex: Qual deles é melhor para um canal faceless sobre finanças no Brasil?..." style="height:56px"></textarea>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;justify-content:center">
      <button class="btn-action bsf-report-btn" style="padding:14px 28px;font-size:15px">Gerar Batalha de Canais com IA</button>
    </div>`;

  el.querySelectorAll('.bsf-report-btn').forEach(btn => {
    btn.onclick = async () => {
    const newWin = window.open('', '_blank');
    if (newWin) {
      newWin.document.write('<html style="background:#09090b;color:#a1a1aa"><head><title>Processando...</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif">Gerando relatório com IA, por favor aguarde...</body></html>');
      newWin.document.close();
    }

    if (!modalLoading('Conectando com IA...')) { if(newWin) newWin.close(); return; }
    try {
      updateLoadMsg('Comparando canais com IA...');
      const ctx = document.getElementById('cmpContext')?.value || '';
      const t = await aiCompare(a, b, ctx);
      if (!t || !t.trim()) throw new Error('A IA retornou uma resposta vazia.');
      closeModal();
      openReportPage(`${a.title} vs ${b.title}`, 'Comparativo de canais', md2html(t), ctx, newWin);
    } catch(e) {
        if(newWin && !newWin.closed) newWin.close();
        modalError('Erro na comparacao IA', e.message || 'Erro desconhecido.');
    }
  };
  });
}

// ---- HISTORICO ----
function initHistorico() {
  const el = document.getElementById('tab-historico');
  el.innerHTML = `<div class="card">
    <div class="input-row">
      <div class="field" style="flex:3"><label>Canal</label><input type="text" id="inHist" placeholder="@canal ou ID"></div>
      <div class="field"><label>Formato</label>
        <div class="format-toggle" id="histFormat">
          <button class="format-opt active" data-v="all">Todos</button>
          <button class="format-opt" data-v="long">Longos</button>
          <button class="format-opt" data-v="short">Shorts</button>
        </div>
      </div>
      <div class="field" style="flex:0"><label>&nbsp;</label><button class="btn-action" id="btnHist">Carregar</button></div>
    </div>
    <div id="histPills" style="display:none;margin-top:12px"></div>
    <div id="histContextArea" style="display:none;margin-top:10px"></div>
    <div id="outHist"></div>
    <div id="histActsBot" style="display:none;margin-top:12px"></div>
  </div>`;
  setupFormatToggle(el, 'histFormat');

  // Re-filter on format change
  el.querySelectorAll('#histFormat .format-opt').forEach(o => {
    const orig = o.onclick;
    o.onclick = () => {
      el.querySelectorAll('#histFormat .format-opt').forEach(x => x.classList.remove('active'));
      o.classList.add('active');
      if (histData.videos.length) sortHist('recent');
    };
  });

  const doHist = async () => {
    const v = document.getElementById('inHist').value.trim();
    if (!v) return toast('Digite o canal!');
    const out = document.getElementById('outHist');
    showLoad(out, 'Carregando videos...');
    document.getElementById('histPills').style.display = 'none';
    document.getElementById('histActsTop').style.display = 'none';
    document.getElementById('histActsBot').style.display = 'none';
    try {
      const id = await resolveChannelId(v);
      const data = await fetchChannelVideos(id, 30);
      histData = data;
      sortHist('recent');
      showHistActions();
    } catch(e) { showErr(out, e.message); }
  };
  document.getElementById('btnHist').onclick = doHist;
  document.getElementById('inHist').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doHist(); } });
}

function sortHist(by) {
  const fmt = getFormatFilter('histFormat');
  let vids = filterByFormat([...histData.videos], fmt);

  const pills = document.getElementById('histPills');
  pills.style.display = 'block';
  pills.innerHTML = `<div class="pills">
    ${['recent','views','likes','eng'].map(k=>`<button class="pill ${by===k?'active':''}" data-s="${k}">${{recent:'Recentes',views:'Views',likes:'Likes',eng:'Engajamento'}[k]}</button>`).join('')}
  </div>`;
  pills.querySelectorAll('.pill').forEach(p => { p.onclick = () => sortHist(p.dataset.s); });

  switch(by) {
    case 'views': vids.sort((a,b)=>b.views-a.views); break;
    case 'likes': vids.sort((a,b)=>b.likes-a.likes); break;
    case 'eng': vids.sort((a,b)=>b.eng-a.eng); break;
    default: vids.sort((a,b)=>new Date(b.published)-new Date(a.published));
  }
  renderVList(vids, document.getElementById('outHist'));
}

function showHistActions() {
  const bot = document.getElementById('histActsBot');
  const ctxArea = document.getElementById('histContextArea');
  ctxArea.style.display = 'block';
  ctxArea.innerHTML = `<div>
    <label style="font-size:10px;color:var(--text-dim);font-weight:700;text-transform:uppercase;display:block;margin-bottom:5px">Contexto adicional (opcional) — adicione seu prompt aqui</label>
    <textarea id="histContext" placeholder="Ex: Meu canal é sobre fatos curiosos, me ajude a entender padrões..." style="height:56px"></textarea>
  </div>`;
  bot.style.display = 'flex'; bot.style.gap = '8px'; bot.style.flexWrap = 'wrap'; bot.style.justifyContent = 'center'; bot.style.margin = '16px 0';
  bot.innerHTML = `<button class="btn-action" style="padding:14px 28px;font-size:15px">Gerar Auditoria de Crescimento com IA</button>`;
  bot.querySelector('button').onclick = async () => {
    const newWin = window.open('', '_blank');
    if (newWin) {
      newWin.document.write('<html style="background:#09090b;color:#a1a1aa"><head><title>Processando...</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif">Gerando relatório com IA, por favor aguarde...</body></html>');
      newWin.document.close();
    }
    if (!modalLoading('Conectando com IA...')) { if(newWin) newWin.close(); return; }
    try {
      updateLoadMsg('Analisando performance de ' + histData.videos.length + ' vídeos...');
      const ctx = document.getElementById('histContext')?.value || '';
      const t = await aiHistory(histData.channel, histData.videos, ctx);
      if (!t || !t.trim()) throw new Error('A IA retornou uma resposta vazia.');
      closeModal();
      openReportPage('Performance: '+histData.channel.title, `${fmtNum(histData.channel.subs)} subs · ${calcVidsPerWeek(histData.channel.vids, histData.channel.created)} vids/sem`, md2html(t), ctx, newWin);
    } catch(e) {
      if(newWin && !newWin.closed) newWin.close();
      modalError('Erro na análise de performance', e.message || 'Erro desconhecido.');
    }
  };
}

function renderVList(vids, el) {
  if (!vids.length) { showEmpty(el, 'Nenhum video', 'Nenhum video encontrado com esse filtro.'); return; }
  el.innerHTML = `<div class="v-list">${vids.map(v => {
    const ec = engCls(v.eng);
    return `<div class="v-item">
      <img src="${v.thumb}" class="v-thumb" alt="${v.title}">
      <div class="v-info">
        <h4><a href="https://youtube.com/watch?v=${v.id}" target="_blank">${v.title}</a></h4>
        <div class="v-meta"><span>${v.durStr}</span><span>${v.isShort?'SHORT':'Longo'}</span><span>${timeAgo(v.published)}</span></div>
      </div>
      <div class="v-stats">
        <div class="mini-stat"><span class="ms-val">${fmtNum(v.views)}</span><span class="ms-lbl">Views</span></div>
        <div class="mini-stat"><span class="ms-val">${fmtNum(v.likes)}</span><span class="ms-lbl">Likes</span></div>
        <div class="mini-stat"><span class="ms-val ${ec}">${v.eng}%</span><span class="ms-lbl">Eng</span></div>
      </div>
      <div style="display:flex;align-items:center">
        <button class="btn-action ghost small fav-toggle ${favs.has(v.id)?'is-favorited':''}" data-fav-id="${v.id}" data-off-text="Favoritar" data-on-text="Favoritado" onclick="toggleFav('${v.id}','${v.title.replace(/'/g,"\\'")}','video', this)">${favs.has(v.id)?'Favoritado':'Favoritar'}</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

// ---- PESQUISA ----
function initPesquisa() {
  const el = document.getElementById('tab-pesquisa');
  const cOpts = COUNTRIES.map(c=>`<option value="${c.code}">${c.flag} ${c.name}</option>`).join('');
  el.innerHTML = `<div class="card">
    <div class="input-row">
      <div class="field" style="flex:3"><label>Palavra-chave</label><input type="text" id="inSearch" placeholder="Ex: Psicologia obscura, Renda extra..." style="font-size:15px"></div>
      <div class="field" style="flex:0"><label>&nbsp;</label><button class="btn-action" id="btnSearch" style="padding:10px 28px">Buscar</button></div>
      <div class="field" style="flex:0"><label>&nbsp;</label><button class="btn-action" id="btnKwGenModal" style="padding:10px 14px; background:var(--primary); color:#fff; border:none; box-shadow:0 1px 16px var(--primary-dim)" title="Gerar ideias com IA"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg></button></div>
    </div>
    <div style="font-size:12px;color:var(--accent);background:rgba(34,211,180,0.08);border:1px solid rgba(34,211,180,0.2);padding:6px 10px;border-radius:6px;margin:8px 0 12px;display:inline-flex;align-items:center;gap:6px;width:auto;box-sizing:border-box">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <span><strong>Dica:</strong> deixe a palavra vazia para buscar apenas pelos filtros!</span>
    </div>
    <div class="filters-row">
      <div class="field"><label>Formato</label>
        <select id="searchFmtSelect">
          <option value="all">Todos</option>
          <option value="long">Vídeos Longos</option>
          <option value="short">Shorts</option>
        </select>
      </div>
      <div class="field"><label>Views Min. (Video)</label><input type="number" id="searchMinV" value="100000"></div>
      <div class="field"><label>Inscritos do Canal</label>
        <select id="searchSubs">
          <option value="all">Qualquer</option>
          <option value="0-1000">Até 1 mil</option>
          <option value="1000-2000">1 mil - 2 mil</option>
          <option value="2000-10000">2 mil - 10 mil</option>
          <option value="15000-50000">15 mil - 50 mil</option>
          <option value="50000-100000">50 mil - 100 mil</option>
          <option value="100000-300000">100 mil - 300 mil</option>
          <option value="300000-500000">300 mil - 500 mil</option>
          <option value="500000-1000000">500 mil - 1M</option>
          <option value="1000000-999999999">Mais de 1 Milhão</option>
        </select>
      </div>
      <div class="field"><label>Views do Canal</label>
        <select id="searchChViews">
          <option value="all">Qualquer</option>
          <option value="0-100000">Até 100 mil</option>
          <option value="100000-1000000">100 mil - 1 Milhão</option>
          <option value="1000000-10000000">1 M - 10 Milhões</option>
          <option value="10000000-50000000">10 M - 50 Milhões</option>
          <option value="50000000-99999999999">Mais de 50 Milhões</option>
        </select>
      </div>
      <div class="field"><label>Idioma</label>
        <select id="searchLang">
          <option value="">Qualquer</option>
          <option value="en">Inglês (EUA/UK)</option>
          <option value="es">Espanhol</option>
          <option value="pt">Português (BR)</option>
          <option value="fr">Francês</option>
          <option value="de">Alemão</option>
          <option value="it">Italiano</option>
          <option value="pl">Polonês</option>
          <option value="tr">Turco</option>
          <option value="ro">Romeno</option>
          <option value="hu">Húngaro</option>
          <option value="cs">Tcheco</option>
          <option value="bg">Búlgaro</option>
          <option value="sv">Sueco</option>
          <option value="nl">Holandês</option>
          <option value="ar">Árabe</option>
          <option value="hi">Hindi</option>
          <option value="vi">Vietnamita</option>
          <option value="th">Tailandês</option>
          <option value="id">Indonésio</option>
          <option value="ja">Japonês</option>
          <option value="ko">Coreano</option>
          <option value="ru">Russo</option>
          <option value="uk">Ucraniano</option>
        </select>
      </div>
      <div class="field"><label>Pais</label><select id="searchRegion"><option value="">Global</option>${cOpts}</select></div>
      <div class="field"><label>Duração</label>
        <select id="searchDurFilter">
          <option value="all">Qualquer</option>
          <option value="under5">Menos de 5 min</option>
          <option value="5to15">De 5 a 15 min</option>
          <option value="15to60">De 15 a 60 min</option>
          <option value="over60">Mais de 1 hora</option>
        </select>
      </div>
      <div class="field"><label>Apos</label><input type="date" id="searchAfter"></div>
      <div class="field"><label>Antes</label><input type="date" id="searchBefore"></div>
      <div class="field"><label>Qtd</label><input type="number" id="searchMax" value="30" max="50"></div>
    </div>
    <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap;align-items:center">
      <span style="font-size:11px;color:var(--text-dim);font-weight:700;text-transform:uppercase">Filtros Rápidos:</span>
      <div class="pills" id="quickDates" style="gap:4px">
        <button class="pill" type="button" data-d="3d">3 Dias</button>
        <button class="pill" type="button" data-d="5d">5 Dias</button>
        <button class="pill" type="button" data-d="1w">1 Sem</button>
        <button class="pill" type="button" data-d="2w">2 Sem</button>
        <button class="pill" type="button" data-d="1m">1 Mês</button>
        <button class="pill" type="button" data-d="3m">3 Meses</button>
        <button class="pill" type="button" data-d="1y">1 Ano</button>
      </div>
    </div>
  </div>
  <div class="card" style="margin-top:8px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div class="pills" id="searchPills">
        <button class="pill active" data-s="eng">Engajamento</button>
        <button class="pill" data-s="views">Views</button>
        <button class="pill" data-s="likes">Likes</button>
        <button class="pill" data-s="durSec">Duração</button>
      </div>
      <button class="btn-action ghost small" id="btnSearchPdf" style="display:none" onclick="exportSearchPdf()">Exportar PDF</button>
    </div>
    <div class="results-wrap"><table id="searchTable"><thead><tr><th>Conteudo</th><th>Metricas</th><th>Eng.</th><th>Acao</th></tr></thead><tbody></tbody></table></div>
  </div>`;

  document.getElementById('quickDates').querySelectorAll('.pill').forEach(p => {
    p.onclick = () => {
      document.getElementById('quickDates').querySelectorAll('.pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      const d = p.dataset.d;
      document.getElementById('searchBefore').value = todayStr();
      if (d === '3d') document.getElementById('searchAfter').value = daysAgoStr(3);
      if (d === '5d') document.getElementById('searchAfter').value = daysAgoStr(5);
      if (d === '1w') document.getElementById('searchAfter').value = weekAgoStr();
      if (d === '2w') document.getElementById('searchAfter').value = daysAgoStr(14);
      if (d === '1m') document.getElementById('searchAfter').value = monthsAgoStr(1);
      if (d === '3m') document.getElementById('searchAfter').value = monthsAgoStr(3);
      if (d === '1y') document.getElementById('searchAfter').value = yearsAgoStr(1);
    };
  });

  document.getElementById('btnSearch').onclick = doSearch;
  document.getElementById('inSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
  document.getElementById('btnSearchPdf').onclick = exportSearchPdf;
  
  // Keyword Modal specific logic
  if (document.getElementById('btnKwGenModal')) {
    document.getElementById('btnKwGenModal').onclick = () => { document.getElementById('kwModal').classList.add('open'); };
    document.getElementById('kwModalClose').onclick = () => { document.getElementById('kwModal').classList.remove('open'); };
    document.getElementById('kwModal').addEventListener('click', e => { if (e.target.id === 'kwModal') document.getElementById('kwModal').classList.remove('open'); });
    
    const KW_FOLDERS = {
      historia: ["The untold story of", "The dark history of", "What they didn't teach you about", "The mystery behind", "Lost empires", "Forgotten inventions"],
      musica: ["Dark academia playlist for writing", "Villain origin story playlist", "Music to plot revenge to", "Ethereal classical music", "Jazz for rainy nights"],
      estoicismo: ["Stoicism for modern chaos", "Marcus Aurelius quotes explained", "How to not care what people think", "Stoic daily routine", "Seneca on time"],
      criacao: ["How to start a faceless channel", "YouTube automation secrets", "Video editing tricks to hook viewers", "Monetize without showing your face", "Cash cow channels 2026"],
      psicologia: ["Dark psychology tricks", "How to read anyone instantly", "Manipulation tactics exposed", "Body language secrets", "The psychology of serial killers"],
      ia: ["AI tools you haven't heard of", "Use ChatGPT to make money", "AI automation agency", "The future of Artificial Intelligence", "Midjourney prompts for faceless"]
    };

    document.querySelectorAll('#kwCategories .pill').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#kwCategories .pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        
        const subContainer = document.getElementById('kwSubPills');
        subContainer.style.display = 'block';
        
        const cat = btn.dataset.cat;
        const list = KW_FOLDERS[cat] || [];
        
        subContainer.innerHTML = '<div class="pills" style="gap:6px">' + list.map(kw => `<button class="pill" style="border-radius:6px; font-weight:600" data-kw="${kw}">${kw}</button>`).join('') + '</div>';
        
        subContainer.querySelectorAll('.pill').forEach(p => {
          p.ondblclick = () => {
             document.getElementById('inSearch').value = p.dataset.kw;
             document.getElementById('kwModal').classList.remove('open');
             doSearch();
          };
          p.onclick = () => {
            const ideaInput = document.getElementById('kwAiIdea');
            if (ideaInput) ideaInput.value = p.dataset.kw;
          };
        });
      };
    });

    document.getElementById('btnAiKeywords').onclick = async () => {
      const idea = document.getElementById('kwAiIdea').value.trim();
      const niche = document.getElementById('kwAiNiche').value.trim();
      const lang = document.getElementById('kwAiLang').value;
      const country = document.getElementById('kwAiCountry').value;
      const resEl = document.getElementById('kwAiResult');
      
      if (isAiLoading) return;
      isAiLoading = true;
      resEl.style.display = 'block';
      resEl.innerHTML = '<div class="loading-box"><div class="spinner"></div><p style="margin-top:8px">Analisando tendências globais com IA...</p></div>';
      
      try {
        const t = await aiKeywords(idea, niche, lang, country);
        resEl.innerHTML = md2html(t) + `<div style="margin-top:16px"><button class="copy-btn" onclick="copyFromData('kwAiResult')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copiar Tudo</button></div>`;
      } catch(e) {
        resEl.innerHTML = '<div style="color:var(--red); padding:10px; background:var(--red-dim); border-radius:8px;">' + (e.message || 'Erro ao gerar recomendações.') + '</div>';
      } finally {
        isAiLoading = false;
      }
    };
  }
  document.getElementById('searchPills').querySelectorAll('.pill').forEach(p => {
    p.onclick = () => {
      document.getElementById('searchPills').querySelectorAll('.pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      sortSearch(p.dataset.s);
    };
  });
}

async function doSearch() {
  const q = document.getElementById('inSearch').value.trim();
  const btn = document.getElementById('btnSearch');
  btn.innerHTML = '<span class="spinner"></span> Buscando...'; btn.disabled = true;
  document.querySelector('#searchTable tbody').innerHTML = '';
  document.getElementById('btnSearchPdf').style.display = 'flex';
  const fmt = document.getElementById('searchFmtSelect').value;
  try {
    // Default: last 7 days if no dates set, or if only one is set
    let afterVal = document.getElementById('searchAfter').value;
    let beforeVal = document.getElementById('searchBefore').value;
    if (!afterVal || !beforeVal) {
      afterVal = weekAgoStr();
      beforeVal = todayStr();
      document.getElementById('searchAfter').value = afterVal;
      document.getElementById('searchBefore').value = beforeVal;
      toast('Datas preenchidas automaticamente (Últimos 7 dias)', 'info');
    }
    const searchMax = parseInt(document.getElementById('searchMax').value)||30;
    const region = document.getElementById('searchRegion').value||undefined;
    const lang = document.getElementById('searchLang').value||undefined;
    const opts = {
      max: searchMax,
      region,
      lang,
      after: afterVal ? afterVal+'T00:00:00Z' : undefined,
      before: beforeVal ? beforeVal+'T23:59:59Z' : new Date().toISOString(),
      durFilter: fmt === 'all' ? undefined : fmt
    };
    let results = [];
    if (q) {
      results = await searchVideos(q, opts);
    } else {
      const fallbackRegion = region || 'US';
      const trending = await fetchTrending(fallbackRegion, Math.min(searchMax, 50));
      results = trending;
      toast('Sem palavra-chave: usando modo trending filtrado.', 'info');
    }
    const minV = parseInt(document.getElementById('searchMinV').value)||0;
    const durF = document.getElementById('searchDurFilter').value;
    const subsF = document.getElementById('searchSubs').value;
    const chViewsF = document.getElementById('searchChViews').value;
    
    searchResults = results.filter(v => {
      if (v.views < minV) return false;
      if (durF === 'under5' && v.durSec >= 300) return false;
      if (durF === '5to15' && (v.durSec < 300 || v.durSec > 900)) return false;
      if (durF === '15to60' && (v.durSec <= 900 || v.durSec > 3600)) return false;
      if (durF === 'over60' && v.durSec <= 3600) return false;
      
      if (subsF !== 'all' && v.subs !== undefined) {
        const [minSubs, maxSubs] = subsF.split('-').map(Number);
        if (v.subs < minSubs || v.subs > maxSubs) return false;
      }
      
      if (chViewsF !== 'all' && v.channelViews !== undefined) {
        const [minChV, maxChV] = chViewsF.split('-').map(Number);
        if (v.channelViews < minChV || v.channelViews > maxChV) return false;
      }
      return true;
    });
    
    // Apply extra format filter client-side
    searchResults = filterByFormat(searchResults, fmt);
    sortSearch('eng');
    
    if (searchResults.length) {
      document.getElementById('btnSearchPdf').style.display = 'flex';
    } else {
      document.querySelector('#searchTable tbody').innerHTML = '<tr><td colspan="4"><div class="empty-box"><h3>Nenhum resultado encontrado</h3><p>Tente ajustar os filtros (diminuir views mínimas, ampliar período de datas, etc.) ou mude a palavra-chave.</p></div></td></tr>';
    }
  } catch(e) { toast(e.message,'error'); }
  finally { btn.innerHTML = 'Buscar'; btn.disabled = false; }
}

function sortSearch(by) {
  searchResults.sort((a,b) => b[by] - a[by]);
  renderSearchTable();
}

function renderSearchTable() {
  const tb = document.querySelector('#searchTable tbody');
  tb.innerHTML = '';
  searchResults.forEach(v => {
    const ec = engCls(v.eng);
    const tagsArr = (v.tags || []).slice(0,3);
    const tags = tagsArr.map(t=>`<span class="tag">${t}</span>`).join('') + (v.tags && v.tags.length>3?`<span class="tag">+${v.tags.length-3}</span>`:'');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div class="vid-cell">
        <img src="${v.thumb}" class="vid-thumb" alt="">
        <div class="vid-d">
          <h3><a href="https://youtube.com/watch?v=${v.id}" target="_blank">${v.title}</a></h3>
          <div class="vid-sub">${v.channel} <span style="opacity:0.6">(${fmtNum(v.subs)} inscritos • ${fmtNum(v.channelViews)} views totais)</span> · ${v.durStr} · ${v.isShort?'SHORT':'Longo'}</div>
          <div class="vid-sub" style="margin-top:2px;font-size:11px;color:#a1a1aa">Publicado em: ${new Date(v.published).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric'})}</div>
          <div class="tags-row" style="margin-top:6px">${tags||'<span class="tag">Sem tags</span>'}</div>
        </div>
      </div></td>
      <td style="font-size:11px;color:var(--text-dim);white-space:nowrap">
        ${fmtFull(v.views)} views<br>${fmtFull(v.likes)} likes<br>${fmtFull(v.comments)} comments
      </td>
      <td><span style="font-size:18px;font-weight:800" class="${ec}">${v.eng}%</span></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-action small" onclick="analyzeSearchVid('${v.id}')">Gerar Análise IA</button>
        <button class="btn-action outline small fav-toggle ${favs.has(v.id)?'is-favorited':''}" data-fav-id="${v.id}" data-off-text="Favoritar" data-on-text="Favoritado" onclick="toggleFav('${v.id}','${v.title.replace(/'/g,"\\'")}','video', this)">${favs.has(v.id)?'Favoritado':'Favoritar'}</button>
      </td>`;
    tb.appendChild(tr);
  });
}

window.analyzeSearchVid = async function(id) {
  const v = searchResults.find(x=>x.id===id);
  if (!v) return;
  const newWin = window.open('', '_blank');
    if (newWin) {
      newWin.document.write('<html style="background:#09090b;color:#a1a1aa"><head><title>Processando...</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif">Gerando relatório com IA, por favor aguarde...</body></html>');
      newWin.document.close();
    }

  if (!modalLoading('Conectando com IA...')) { if(newWin) newWin.close(); return; }
  try {
    updateLoadMsg('Buscando dados completos do video...');
    const vid = await fetchVideo(id);
    
    updateLoadMsg('Buscando transcricao...');
    const transcript = window.fetchVideoTranscript ? await window.fetchVideoTranscript(id) : '';
    
    updateLoadMsg('Analisando com IA...');
    const t = await aiVideoAnalysis(vid, '', transcript);
    if (!t || !t.trim()) throw new Error('A IA retornou uma resposta vazia.');
    closeModal();
    openReportPage('análise: '+v.title, `${fmtNum(v.views)} views`, md2html(t), '', newWin);
  } catch(e) { 
    if(newWin && !newWin.closed) newWin.close();
    modalError('Erro na análise', e.message || 'Erro desconhecido.'); 
  }
};

function exportCSV() {
  if (!searchResults.length) return;
  let csv = "Titulo,Canal,Link,Views,Likes,comentários,Engajamento,duração,Tipo,Tags\n";
  searchResults.forEach(v => {
    csv += `"${v.title.replace(/"/g,'""')}","${v.channel}",https://youtube.com/watch?v=${v.id},${v.views},${v.likes},${v.comments},${v.eng},${v.durStr},${v.isShort?'Short':'Longo'},"${v.tags.join('; ')}"\n`;
  });
  const blob = new Blob([new Uint8Array([0xEF,0xBB,0xBF]),csv],{type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `BSF_Pesquisa_${Date.now()}.csv`;
  document.body.appendChild(a); 
  a.click(); 
  setTimeout(() => {
    document.body.removeChild(a);
    toast('CSV exportado!','success');
    URL.revokeObjectURL(a.href);
  }, 100);
}

window.exportSearchPdf = function() {
  if (!searchResults.length) return toast('Sem resultados para exportar.');
  const q = document.getElementById('inSearch')?.value?.trim();
  const filtros = [
    q ? `Busca: "${q}"` : 'Busca: (por filtros)',
    document.getElementById('searchRegion')?.value ? `País: ${document.getElementById('searchRegion').value}` : '',
    document.getElementById('searchLang')?.value ? `Idioma: ${document.getElementById('searchLang').value}` : '',
    document.getElementById('searchDurFilter')?.value !== 'all' ? `Duração: ${document.getElementById('searchDurFilter').value}` : '',
  ].filter(Boolean).join(' | ');

  const mdContent = [
    '## Resultado da Pesquisa Avançada',
    `**Filtros usados:** ${filtros}`,
    `**Total encontrado:** ${searchResults.length} vídeos`,
    '',
    ...searchResults.map((v, i) => [
      `### ${i+1}. ${v.title}`,
      `**Canal:** ${v.channel}`,
      `**Inscritos:** ${fmtNum(v.subs)} | **Views totais do canal:** ${fmtNum(v.channelViews)}`,
      `**Métricas do vídeo:** ${fmtNum(v.views)} views | ${fmtNum(v.likes)} likes | ${fmtNum(v.comments)} comentários | Engajamento: ${v.eng}%`,
      `**Duração:** ${v.durStr} | **Tipo:** ${v.isShort ? 'Short' : 'Vídeo Longo'}`,
      `**Publicado em:** ${new Date(v.published).toLocaleDateString('pt-BR')}`,
      `**Tags:** ${v.tags.join(', ') || 'Nenhuma'}`,
      `**Link:** https://youtube.com/watch?v=${v.id}`,
      ''
    ])
  ].join('\n');

  const newWin = window.open('', '_blank');
  if (newWin) {
    newWin.document.write('<html style="background:#09090b;color:#a1a1aa"><head><title>Gerando PDF...</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif">Gerando PDF, aguarde...</body></html>');
    newWin.document.close();
  }
  try {
    makePDF('Pesquisa Avançada - Busca Sem Filtro', md2html(mdContent), `${searchResults.length} vídeos encontrados`, 'BSF_Pesquisa_Avancada');
    if (newWin) setTimeout(() => { if (!newWin.closed) newWin.close(); }, 500);
    toast('PDF gerado!', 'success');
  } catch(e) {
    if (newWin && !newWin.closed) newWin.close();
    toast('Erro ao gerar PDF: ' + e.message, 'error');
  }
};

// ---- TRENDING ----
function initTrending() {
  const el = document.getElementById('tab-trending');
  const cOpts = COUNTRIES.map(c=>`<option value="${c.code}">${c.flag} ${c.name}</option>`).join('');
  const catOpts = YT_CATEGORIES.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  el.innerHTML = `<div class="card">
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px" id="tLang">
      <button class="pill" data-r="BR">PT-BR</button>
      <button class="pill active" data-r="US">EN-US</button>
      <button class="pill" data-r="ES">ES</button>
    </div>
    <div class="filters-row" style="margin-top:0">
      <div class="field"><label>Outro Pais</label><select id="tCountry"><option value="">Selecione...</option>${cOpts}</select></div>
      <div class="field"><label>Categoria</label><select id="tCat">${catOpts}</select></div>
      <div class="field"><label>Duração</label>
        <select id="tFmt">
          <option value="all">Todos</option>
          <option value="short">&lt; 1 min (Shorts)</option>
          <option value="u5">&lt; 5 min</option>
          <option value="o8">&gt; 8 min</option>
          <option value="o30">&gt; 30 min</option>
        </select>
      </div>
      <div class="field" style="flex:0"><label>&nbsp;</label><button class="btn-action" id="btnTrend">Carregar</button></div>
    </div>
  </div>
  </div>
  <div id="tActsTop" style="margin-top:8px;display:none;justify-content:center;width:100%"></div>
  <div class="card" style="margin-top:8px;display:none" id="tFilters">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">
      <div class="pills" id="tSort">
        <button class="pill active" data-s="views">Views</button>
        <button class="pill" data-s="eng">Engajamento</button>
        <button class="pill" data-s="published">Data</button>
      </div>
      <div class="pills" id="tOrder">
        <button class="pill active" data-o="desc">Maior</button>
        <button class="pill" data-o="asc">Menor</button>
      </div>
    </div>
  </div>
  <div id="outTrend" style="margin-top:8px"></div>
  <div id="trendContextArea" style="margin-top:10px;display:none">
    <div style="margin-bottom:6px">
      <label style="font-size:10px;color:var(--text-dim);font-weight:700;text-transform:uppercase">Contexto adicional (opcional) — adicione seu prompt aqui</label>
      <textarea id="trendContext" placeholder="Ex: Quero ideias para um canal faceless sobre finanças pessoais no Brasil..." style="height:56px;margin-top:4px"></textarea>
    </div>
  </div>
  <div id="tActs" style="margin-top:10px;display:none;justify-content:center"></div>`;

  let trendVideos = [];
  let trendLabel = '';

  async function loadTrend(region, label) {
    // Check if YouTube API key is configured
    const ytKey = getYTKey();
    if (!ytKey) {
      const out = document.getElementById('outTrend');
      out.innerHTML = `<div style="padding:24px;text-align:center">
        <div style="padding:16px;background:var(--red-dim);border:1px solid rgba(239,68,68,0.2);border-radius:10px;max-width:480px;margin:0 auto">
          <p style="color:var(--red);font-weight:600;margin-bottom:8px">Chave YouTube nao configurada</p>
          <p style="color:var(--text-dim);font-size:13px;line-height:1.6">Para carregar os videos em trending, insira sua <strong style="color:var(--text)">YouTube API Key</strong> no campo acima e clique em <strong style="color:var(--primary)">Salvar Chaves</strong>.</p>
          <p style="color:var(--text-dim);font-size:12px;margin-top:8px">Crie uma chave gratis em <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color:var(--primary)">Google Cloud Console</a></p>
        </div>
      </div>`;
      return;
    }
    trendLabel = label;
    const cat = document.getElementById('tCat').value;
    const out = document.getElementById('outTrend');
    showLoad(out, 'Carregando trending de '+label+'...');
    try {
      const raw = await fetchTrending(region, 50, cat);
      // Filter: only videos with >= 100K views
      trendVideos = raw.filter(v => v.views >= 100000);
      if (!trendVideos.length) {
        showEmpty(out, 'Nenhum video com 100K+ views', 'Os trends dessa regiao/categoria nao atingiram 100K views ainda.');
        return;
      }
      document.getElementById('tFilters').style.display = 'block';
      applyTrendSort();
      showTrendActions();
    } catch(e) { showErr(out, e.message); }
  }

  // Global function for nav auto-load
  window.triggerTrendingAutoLoad = () => loadTrend('US', 'EN-US');

  function applyTrendSort() {
    const sortBy = document.querySelector('#tSort .pill.active')?.dataset.s || 'views';
    const order = document.querySelector('#tOrder .pill.active')?.dataset.o || 'desc';
    const fmt = document.getElementById('tFmt').value;
    
    let filtered = trendVideos;
    if (fmt === 'short') filtered = filtered.filter(v => v.isShort);
    else if (fmt === 'u5') filtered = filtered.filter(v => v.durSec > 60 && v.durSec <= 300);
    else if (fmt === 'o8') filtered = filtered.filter(v => v.durSec >= 480);
    else if (fmt === 'o30') filtered = filtered.filter(v => v.durSec >= 1800);
    
    let sorted = [...filtered];
    if (sortBy === 'published') {
      sorted.sort((a,b) => order==='asc' ? new Date(b.published)-new Date(a.published) : new Date(a.published)-new Date(b.published));
    } else {
      sorted.sort((a,b) => order==='desc' ? b[sortBy]-a[sortBy] : a[sortBy]-b[sortBy]);
    }
    currentTrendVideos = sorted;
    renderTrendGrid(sorted, document.getElementById('outTrend'));
  }

  el.querySelectorAll('#tLang .pill').forEach(p => {
    p.onclick = () => {
      el.querySelectorAll('#tLang .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      document.getElementById('tCountry').value = '';
      loadTrend(p.dataset.r, p.dataset.r);
    };
  });
  document.getElementById('tFmt').addEventListener('change', () => {
    if (trendVideos.length > 0) applyTrendSort();
  });
  document.getElementById('btnTrend').onclick = () => {
    const sel = document.getElementById('tCountry');
    const code = sel.value;
    if (!code) return toast('Selecione um pais!');
    el.querySelectorAll('#tLang .pill').forEach(x=>x.classList.remove('active'));
    loadTrend(code, sel.options[sel.selectedIndex].text);
  };

  el.querySelectorAll('#tSort .pill').forEach(p => {
    p.onclick = () => { el.querySelectorAll('#tSort .pill').forEach(x=>x.classList.remove('active')); p.classList.add('active'); applyTrendSort(); };
  });
  el.querySelectorAll('#tOrder .pill').forEach(p => {
    p.onclick = () => { el.querySelectorAll('#tOrder .pill').forEach(x=>x.classList.remove('active')); p.classList.add('active'); applyTrendSort(); };
  });

  function showTrendActions() {
    const trendAction = async () => {
      const newWin = window.open('', '_blank');
      if (newWin) {
        newWin.document.write('<html style="background:#09090b;color:#a1a1aa"><head><title>Processando...</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif">Gerando relatório com IA, por favor aguarde...</body></html>');
        newWin.document.close();
      }
      if (!modalLoading('Conectando com IA...')) { if(newWin) newWin.close(); return; }
      try {
        updateLoadMsg('Analisando ' + currentTrendVideos.length + ' vídeos em alta...');
        const ctx = document.getElementById('trendContext')?.value || '';
        const t = await aiTrending(currentTrendVideos, trendLabel, ctx);
        if (!t || !t.trim()) throw new Error('A IA retornou uma resposta vazia.');
        closeModal();
        openReportPage('Trending: '+trendLabel, 'Análise de tendências', md2html(t), ctx, newWin);
      } catch(e) {
        if (newWin && !newWin.closed) newWin.close();
        modalError('Erro na análise de trends', e.message || 'Erro desconhecido.');
      }
    };
    // Only bottom button
    const el = document.getElementById('tActs');
    el.style.display = 'flex'; el.style.gap = '8px'; el.style.margin = '16px 0';
    el.innerHTML = `<button class="btn-action" id="btnAiTrend" style="padding:14px 28px;font-size:15px">🎯 Mapear Oportunidades Dark com IA</button>`;
    document.getElementById('btnAiTrend').onclick = trendAction;
    const ctxArea = document.getElementById('trendContextArea');
    if (ctxArea) ctxArea.style.display = 'block';
  }
}

function renderTrendGrid(vids, el) {
  if (!vids.length) { showEmpty(el, 'Nenhum trending', 'Sem resultados.'); return; }
  el.innerHTML = `<div class="t-grid">${vids.map((v,i)=>`
    <div class="t-card">
      <a href="https://youtube.com/watch?v=${v.id}" target="_blank">
      <div class="t-img-wrap">
        <img src="${v.thumb}" alt="${v.title}" onerror="this.style.display='none'">
        <span class="t-rank">#${i+1}</span>
        <span class="t-dur">${v.durStr}</span>
      </div>
      <div class="t-body">
        <h4>${v.title}</h4>
        <p class="t-meta">${v.channel}<br><span class="t-views">${fmtNum(v.views)} views</span> · ${fmtNum(v.likes)} likes · <span class="${engCls(v.eng)}">${v.eng}%</span> · ${timeAgo(v.published)}</p>
      </div>
      </a>
      <div style="padding:0 12px 12px">
        <button class="btn-action outline small fav-toggle ${favs.has(v.id)?'is-favorited':''}" data-fav-id="${v.id}" data-off-text="Favoritar Vídeo" data-on-text="Favoritado" style="width:100%" onclick="toggleFav('${v.id}','${v.title.replace(/'/g,"\\'")}','video', this)">${favs.has(v.id)?'Favoritado':'Favoritar Vídeo'}</button>
      </div>
    </div>`).join('')}</div>`;
}

// ---- FAVORITOS ----
function initFavoritos() { renderFavs(); }
function renderFavs() {
  const el = document.getElementById('tab-favoritos');
  const list = favs.all();
  if (!list.length) { el.innerHTML = `<div class="card"><div class="empty-box"><h3>Nenhum favorito</h3><p>Favorite canais e vídeos para acessar rapidamente.</p></div></div>`; return; }
  const chans = list.filter(f=>f.type==='canal');
  const vids = list.filter(f=>f.type==='video');
  el.innerHTML = `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <h3 style="font-size:14px">Favoritos (${list.length})</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-action ghost small" onclick="exportFavTxt()">Baixar TXT</button>
        <button class="btn-action ghost small" onclick="exportFavPdf()">Baixar PDF</button>
      </div>
    </div>
    <h4 style="font-size:12px;text-transform:uppercase;color:var(--text-dim);margin-bottom:8px">Canais Favoritados (${chans.length})</h4>
    ${chans.length ? chans.map(f=>`<div class="fav-item">
      <div><div class="fav-name">${f.name}</div><div class="fav-type">Canal · ${timeAgo(new Date(f.ts).toISOString())}</div></div>
      <div class="fav-actions">
        <button class="btn-action ghost small" onclick="openFav('${f.id}','${f.type}')">Abrir</button>
        <button class="btn-action ghost small" style="color:var(--red)" onclick="rmFav('${f.id}')">Remover</button>
      </div>
    </div>`).join('') : `<div class="empty-box" style="padding:18px 10px"><p>Nenhum canal favoritado.</p></div>`}
    <h4 style="font-size:12px;text-transform:uppercase;color:var(--text-dim);margin:14px 0 8px">Vídeos Favoritos (${vids.length})</h4>
    ${vids.length ? vids.map(f=>`<div class="fav-item" style="align-items:center;gap:12px">
      <img src="https://img.youtube.com/vi/${f.id}/mqdefault.jpg" style="width:80px;height:45px;object-fit:cover;border-radius:6px;flex-shrink:0" alt="${f.name}" onerror="this.style.display='none'">
      <div style="flex:1;min-width:0">
        <div class="fav-name" style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name}</div>
        <div class="fav-type">Vídeo · ${timeAgo(new Date(f.ts).toISOString())}</div>
      </div>
      <div class="fav-actions">
        <button class="btn-action ghost small" onclick="openFav('${f.id}','${f.type}')">Abrir</button>
        <button class="btn-action ghost small" style="color:var(--red)" onclick="rmFav('${f.id}')">Remover</button>
      </div>
    </div>`).join('') : `<div class="empty-box" style="padding:18px 10px"><p>Nenhum vídeo favoritado.</p></div>`}
  </div>`;
}

window.openFav = function(id, type) {
  const tab = type === 'canal' ? 'canal' : 'video';
  document.querySelector(`[data-tab="${tab}"]`).click();
  setTimeout(() => {
    document.getElementById(tab === 'canal' ? 'inCanal' : 'inVideo').value = id;
    document.getElementById(tab === 'canal' ? 'btnCanal' : 'btnVideo').click();
  }, 100);
};
window.rmFav = function(id) { favs.rm(id); renderFavs(); toast('Removido!'); };
window.refreshFavButtons = function(targetId = null) {
  document.querySelectorAll('.fav-toggle[data-fav-id]').forEach(btn => {
    const id = btn.dataset.favId;
    if (targetId && id !== targetId) return;
    const active = favs.has(id);
    btn.textContent = active ? (btn.dataset.onText || 'Favoritado') : (btn.dataset.offText || 'Favoritar');
    btn.classList.toggle('is-favorited', active);
  });
};
window.toggleFav = function(id, name, type) {
  if (favs.has(id)) favs.rm(id); else favs.add({id,name,type});
  renderFavs();
  refreshFavButtons(id);
  toast(favs.has(id)?'Favoritado!':'Removido!','success');
};
window.exportFavTxt = function() {
  const list = favs.all();
  if (!list.length) return toast('Sem favoritos para exportar.');
  const chans = list.filter(f=>f.type==='canal');
  const vids = list.filter(f=>f.type==='video');
  let txt = `Busca Sem Filtro - Favoritos\nGerado em: ${new Date().toLocaleString('pt-BR')}\n\n`;
  txt += `CANAIS FAVORITADOS (${chans.length})\n`;
  txt += chans.map((f,i)=>`${i+1}. ${f.name}\n   https://youtube.com/channel/${f.id}`).join('\n') || 'Nenhum';
  txt += `\n\nVIDEOS FAVORITOS (${vids.length})\n`;
  txt += vids.map((f,i)=>`${i+1}. ${f.name}\n   https://youtube.com/watch?v=${f.id}`).join('\n') || 'Nenhum';
  const blob = new Blob([new Uint8Array([0xEF,0xBB,0xBF]), txt], {type:'text/plain;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `BSF_Favoritos_${Date.now()}.txt`;
  document.body.appendChild(a); 
  a.click(); 
  setTimeout(() => {
    document.body.removeChild(a);
    toast('TXT dos favoritos exportado!','success');
    URL.revokeObjectURL(a.href);
  }, 100);
};
window.exportFavPdf = function() {
  const list = favs.all();
  if (!list.length) return toast('Sem favoritos para exportar.');
  const chans = list.filter(f=>f.type==='canal');
  const vids = list.filter(f=>f.type==='video');
  const mdContent = [
    '## Meus Favoritos',
    `**Total:** ${list.length} itens (${chans.length} canais, ${vids.length} vídeos)`,
    '',
    ...(chans.length ? [
      '## Canais Favoritados',
      ...chans.map((f, i) => [
        `### ${i+1}. ${f.name}`,
        `🔗 https://youtube.com/channel/${f.id}`,
        `📅 Adicionado em: ${new Date(f.ts).toLocaleDateString('pt-BR')}`,
        ''
      ].join('\n'))
    ] : []),
    ...(vids.length ? [
      '## Vídeos Favoritos',
      ...vids.map((f, i) => [
        `### ${i+1}. ${f.name}`,
        `🔗 https://youtube.com/watch?v=${f.id}`,
        `🖼️ Thumbnail: https://img.youtube.com/vi/${f.id}/maxresdefault.jpg`,
        `📅 Adicionado em: ${new Date(f.ts).toLocaleDateString('pt-BR')}`,
        ''
      ].join('\n'))
    ] : [])
  ].join('\n');

  const newWin = window.open('', '_blank');
  if (newWin) {
    newWin.document.write('<html style="background:#09090b;color:#a1a1aa"><head><title>Gerando PDF...</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif">Gerando PDF, aguarde...</body></html>');
    newWin.document.close();
  }
  try {
    makePDF('Favoritos - Busca Sem Filtro', md2html(mdContent), `${list.length} itens salvos`, 'BSF_Favoritos');
    if (newWin) setTimeout(() => { if (!newWin.closed) newWin.close(); }, 500);
    toast('PDF gerado!', 'success');
  } catch(e) {
    if (newWin && !newWin.closed) newWin.close();
    toast('Erro ao gerar PDF: ' + e.message, 'error');
  }
};

// ---- EXPORTAR ----
function initExportar() {
  const el = document.getElementById('tab-exportar');
  el.innerHTML = `<div class="card">
    <h3 style="font-size:14px;margin-bottom:4px">Exportar PDF</h3>
    <p style="font-size:12px;color:var(--text-dim);margin-bottom:14px">Gere um PDF com análise IA completa de um canal.</p>
    <div class="input-row">
      <div class="field" style="flex:3"><label>Canal</label><input type="text" id="inExport" placeholder="@canal ou ID"></div>
      <div class="field" style="flex:0"><label>&nbsp;</label><button class="btn-action" id="btnExport">Gerar PDF</button></div>
    </div>
    <div id="outExport" style="margin-top:10px"></div>
  </div>`;
  const doExport = async () => {
    const v = document.getElementById('inExport').value.trim();
    if (!v) return toast('Digite o canal!');
    const newWin = window.open('', '_blank');
    if (newWin) {
      newWin.document.write('<html style="background:#09090b;color:#a1a1aa"><head><title>Processando...</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif">Gerando relatório com IA, por favor aguarde...</body></html>');
      newWin.document.close();
    }
    if (!modalLoading('Conectando com IA...')) { if(newWin) newWin.close(); return; }

    try {
      updateLoadMsg('Buscando canal...');
      const id = await resolveChannelId(v);
      const ch = await fetchChannel(id);
      
      updateLoadMsg('Gerando análise IA...');
      const text = await aiChannelAnalysis(ch);
      
      updateLoadMsg('Formatando relatório...');
      closeModal();
      openReportPage('análise Canal: '+ch.title, `${fmtNum(ch.subs)} subs · ${fmtNum(ch.views)} views`, md2html(text), '', newWin);
    } catch(e) { 
      if(newWin && !newWin.closed) newWin.close();
      modalError('Erro ao gerar relatório', e.message); 
    }
  };
  document.getElementById('btnExport').onclick = doExport;
  document.getElementById('inExport').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doExport(); } });
}
