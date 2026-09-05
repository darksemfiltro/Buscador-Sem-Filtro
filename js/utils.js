// ============ UTILS ============

// Real API limits
const API_LIMITS = {
  yt: { daily: 10000, costSearch: 100, costList: 1, costTrending: 1 },
  gemini: { daily: 250, rpm: 15 },
  openrouter: { daily: 50, rpm: 20 } // 50/day for <10 credits, 1000/day for 10+
};

const COUNTRIES = [
  { code:'BR', name:'Brasil', flag:'🇧🇷', lang:'pt' },
  { code:'US', name:'Estados Unidos', flag:'🇺🇸', lang:'en' },
  { code:'GB', name:'Reino Unido', flag:'🇬🇧', lang:'en' },
  { code:'ES', name:'Espanha', flag:'🇪🇸', lang:'es' },
  { code:'MX', name:'México', flag:'🇲🇽', lang:'es' },
  { code:'AR', name:'Argentina', flag:'🇦🇷', lang:'es' },
  { code:'CO', name:'Colômbia', flag:'🇨🇴', lang:'es' },
  { code:'PT', name:'Portugal', flag:'🇵🇹', lang:'pt' },
  { code:'FR', name:'França', flag:'🇫🇷', lang:'fr' },
  { code:'DE', name:'Alemanha', flag:'🇩🇪', lang:'de' },
  { code:'IT', name:'Itália', flag:'🇮🇹', lang:'it' },
  { code:'JP', name:'Japão', flag:'🇯🇵', lang:'ja' },
  { code:'KR', name:'Coreia do Sul', flag:'🇰🇷', lang:'ko' },
  { code:'IN', name:'Índia', flag:'🇮🇳', lang:'hi' },
  { code:'CA', name:'Canadá', flag:'🇨🇦', lang:'en' },
  { code:'AU', name:'Austrália', flag:'🇦🇺', lang:'en' },
  { code:'RU', name:'Rússia', flag:'🇷🇺', lang:'ru' },
  { code:'CL', name:'Chile', flag:'🇨🇱', lang:'es' },
  { code:'PE', name:'Peru', flag:'🇵🇪', lang:'es' },
  { code:'PH', name:'Filipinas', flag:'🇵🇭', lang:'en' },
  { code:'NG', name:'Nigéria', flag:'🇳🇬', lang:'en' },
  { code:'ZA', name:'África do Sul', flag:'🇿🇦', lang:'en' },
  { code:'TR', name:'Turquia', flag:'🇹🇷', lang:'tr' },
  { code:'ID', name:'Indonésia', flag:'🇮🇩', lang:'id' },
  { code:'TH', name:'Tailândia', flag:'🇹🇭', lang:'th' },
  { code:'PL', name:'Polônia', flag:'🇵🇱', lang:'pl' },
  { code:'RO', name:'Romênia', flag:'🇷🇴', lang:'ro' },
  { code:'BG', name:'Bulgária', flag:'🇧🇬', lang:'bg' },
  { code:'HU', name:'Hungria', flag:'🇭🇺', lang:'hu' },
  { code:'NL', name:'Holanda', flag:'🇳🇱', lang:'nl' },
  { code:'SA', name:'Arábia Saudita', flag:'🇸🇦', lang:'ar' },
  { code:'AE', name:'Emirados Árabes', flag:'🇦🇪', lang:'ar' },
  { code:'VN', name:'Vietnã', flag:'🇻🇳', lang:'vi' },
];

const YT_CATEGORIES = [
  { id:'0', name:'Todos' },
  { id:'1', name:'Filme e Animação' },
  { id:'2', name:'Veículos' },
  { id:'10', name:'Música' },
  { id:'15', name:'Animais' },
  { id:'17', name:'Esportes' },
  { id:'19', name:'Viagem e Eventos' },
  { id:'20', name:'Jogos' },
  { id:'22', name:'Pessoas e Blogs' },
  { id:'23', name:'Comédia' },
  { id:'24', name:'Entretenimento' },
  { id:'25', name:'Notícias e Política' },
  { id:'26', name:'Instrução e Estilo' },
  { id:'27', name:'Educação' },
  { id:'28', name:'Ciência e Tecnologia' },
];

// Quota tracker (dynamic, resets daily)
const quota = {
  _key: 'bsf_quota',
  _load() {
    const d = JSON.parse(localStorage.getItem(this._key) || '{}');
    const today = new Date().toDateString();
    if (d.date !== today) return { date: today, yt: 0, ai: 0 };
    return d;
  },
  _save(d) { localStorage.setItem(this._key, JSON.stringify(d)); },
  add(type, units = 1) {
    const d = this._load();
    d[type] = (d[type] || 0) + units;
    this._save(d);
    this.render();
  },
  get() { return this._load(); },
  render() {
    const d = this._load();
    const ytPct = Math.min((d.yt / API_LIMITS.yt.daily) * 100, 100);
    const aiPct = Math.min((d.ai / 100) * 100, 100);
    const ytBar = document.getElementById('ytBar');
    const aiBar = document.getElementById('aiBar');
    if (ytBar) ytBar.style.width = ytPct + '%';
    if (aiBar) aiBar.style.width = aiPct + '%';
    const ytUsed = document.getElementById('ytUsed');
    const aiUsed = document.getElementById('aiUsed');
    if (ytUsed) ytUsed.textContent = d.yt || 0;
    if (aiUsed) aiUsed.textContent = d.ai || 0;
  }
};

// ============ AI PROVIDERS ============
const AI_PROVIDERS = {
  gemini: {
    name: 'Gemini (Google)',
    keyLabel: 'Chave API Gemini — ai.google.dev',
    freeInfo: '<a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--primary)">Crie sua chave aqui</a>. Lista carregada ao vivo via /v1beta/models; abaixo o fallback offline.',
    models: [
      { id:'gemini-3.8-flash', name:'Gemini 3.8 Flash', free:true },
      { id:'gemini-3.7-flash', name:'Gemini 3.7 Flash', free:true },
    ],
    endpoint: (model, key) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    buildBody: (prompt) => ({ contents:[{parts:[{text:prompt}]}] }),
    parseResp: (d) => d.candidates?.[0]?.content?.parts?.[0]?.text || '',
    auth: 'query', // key goes in URL
    videoUrl: true, // aceita fileData com URL do YouTube (multimodal)
  },
  openrouter: {
    name: 'OpenRouter',
    keyLabel: 'Chave API OpenRouter — openrouter.ai/keys',
    freeInfo: '<a href="https://openrouter.ai/keys" target="_blank" style="color:var(--primary)">Crie sua chave aqui</a>. Somente modelos com sufixo ":free" para evitar cobranca. Limites free: 50 req/dia (1000/dia com $10+ em créditos), ~20 req/min em :free.',
    // fallback gerado em 2026-09-03 via GET https://openrouter.ai/api/v1/models (top :free reais; lista ao vivo prevalece)
    models: [
      { id:'nvidia/nemotron-3-super-120b-a12b:free', name:'Nemotron 3 Super 120B', free:true },
      { id:'minimax/minimax-m2.7:free', name:'MiniMax M2.7', free:true },
      { id:'minimax/minimax-m3:free', name:'MiniMax M3', free:true },
      { id:'nvidia/nemotron-3-ultra-550b-a55b:free', name:'Nemotron 3 Ultra 550B', free:true },
      { id:'z-ai/glm-5.2:free', name:'GLM 5.2', free:true },
      { id:'google/gemma-4-26b-a4b-it:free', name:'Gemma 4 26B', free:true },
      { id:'google/gemma-4-31b-it:free', name:'Gemma 4 31B', free:true },
      { id:'liquid/lfm-2.5-2.6b:free', name:'LFM 2.5 2.6B', free:true },
      { id:'inclusionai/ling-3.0-flash-fin:free', name:'Ling 3.0 Flash', free:true },
      { id:'dots-studio/dots-3-note-preview:free', name:'Dots 3 Note Preview', free:true },
    ],
    endpoint: () => 'https://openrouter.ai/api/v1/chat/completions',
    buildBody: (prompt, model) => ({ model, messages:[{role:'user',content:prompt}], max_tokens:4000 }),
    parseResp: (d) => d.choices?.[0]?.message?.content || '',
    auth: 'bearer',
    extraHeaders: { 'HTTP-Referer':'https://buscasemfiltro.app', 'X-Title':'Busca Sem Filtro' },
  },
  huggingface: {
    name: 'Hugging Face',
    keyLabel: 'Token HF — huggingface.co/settings/tokens',
    freeInfo: 'Serverless inference gratuito. <a href="https://huggingface.co/settings/tokens" target="_blank" style="color:var(--primary)">Crie um token</a> com permissao "Make calls to Inference Providers".',
    models: [
      { id:'meta-llama/Llama-3.3-70B-Instruct', name:'Llama 3.3 70B', free:true },
      { id:'Qwen/Qwen2.5-72B-Instruct', name:'Qwen 2.5 72B', free:true },
      { id:'mistralai/Mistral-Small-24B-Instruct-2501', name:'Mistral Small 24B', free:true },
      { id:'google/gemma-3-27b-it', name:'Gemma 3 27B', free:true },
    ],
    endpoint: () => 'https://router.huggingface.co/v1/chat/completions',
    buildBody: (prompt, model) => ({ model, messages:[{role:'user',content:prompt}], stream:false }),
    parseResp: (d) => d.choices?.[0]?.message?.content || '',
    auth: 'bearer',
  },
  nvidia: {
    name: 'NVIDIA NIM',
    keyLabel: 'NVIDIA API Key — build.nvidia.com',
    freeInfo: '1000 creditos gratis. <a href="https://build.nvidia.com/explore/discover" target="_blank" style="color:var(--primary)">Crie sua chave aqui</a>.',
    models: [
      { id:'meta/llama-3.3-70b-instruct', name:'Llama 3.3 70B', free:true },
      { id:'meta/llama-3.1-8b-instruct', name:'Llama 3.1 8B', free:true },
      { id:'mistralai/mistral-small-24b-instruct-2501', name:'Mistral Small 24B', free:true },
      { id:'deepseek-ai/deepseek-r1', name:'DeepSeek R1', free:true },
      { id:'google/gemma-3-27b-it', name:'Gemma 3 27B', free:true },
    ],
    endpoint: () => 'https://integrate.api.nvidia.com/v1/chat/completions',
    buildBody: (prompt, model) => ({ model, messages:[{role:'user',content:prompt}], max_tokens:4000 }),
    parseResp: (d) => d.choices?.[0]?.message?.content || '',
    auth: 'bearer',
  },
  ollama_cloud: {
    name: 'Ollama (Cloud)',
    keyLabel: 'Chave API Ollama Cloud — ollama.com/settings/keys',
    freeInfo: 'Utilizar a api do <a href="https://docs.ollama.com/cloud" target="_blank" style="color:var(--primary)">Ollama Cloud</a>. Lista ao vivo via ollama.com/v1/models, filtrada p/ modelos Free.',
    // fallback gerado em 2026-09-03 via GET https://ollama.com/v1/models (só Free retos da lista oficial)
    models: [
      { id:'gemma4:31b', name:'Gemma 4 31B', free:true },
      { id:'gpt-oss:120b', name:'GPT-OSS 120B', free:true },
      { id:'gpt-oss:20b', name:'GPT-OSS 20B', free:true },
      { id:'nemotron-3-nano:30b', name:'Nemotron 3 Nano 30B', free:true },
      { id:'nemotron-3-super', name:'Nemotron 3 Super', free:true },
      { id:'nemotron-3-ultra', name:'Nemotron 3 Ultra', free:true },
    ],
    endpoint: () => 'https://ollama.com/v1/chat/completions',
    buildBody: (prompt, model) => ({ model, messages:[{role:'user',content:prompt}], stream:false }),
    parseResp: (d) => d.choices?.[0]?.message?.content || '',
    auth: 'bearer',
  },
  llm7: {
    name: 'LLM7.io (Gratis)',
    keyLabel: 'Chave API llm7 (opcional; libera modelos Pro) — cole o token',
    freeInfo: '100% gratuito, sem cadastro. 30 req/min anonimo, 120 req/min com token gratis. Lista ao vivo com todos os modelos; fallback só com os validados via health-check.',
    // fallback gerado em 2026-09-03: só modelos que RESPONDERAM ao health-check
    // POST /v1/chat/completions (44 testados; image/video e 401/402 excluídos)
    models: [
      { id:'codestral-latest', name:'Codestral', free:true },
      { id:'gpt-oss', name:'GPT-OSS', free:true },
      { id:'minimax-m2.7', name:'MiniMax M2.7', free:true },
      { id:'mistral-Nemo-Instruct-2407', name:'Mistral Nemo', free:true },
    ],
    endpoint: () => 'https://api.llm7.io/v1/chat/completions',
    buildBody: (prompt, model) => ({ model, messages:[{role:'user',content:prompt}], max_tokens:4000 }),
    parseResp: (d) => d.choices?.[0]?.message?.content || '',
    auth: 'none',
    optionalKey: true, // sem key = anônimo; com key salva, envia Authorization
  },
};

// Time helpers
function todayStr() { return new Date().toISOString().split('T')[0]; }
function weekAgoStr() { const d=new Date(); d.setDate(d.getDate()-7); return d.toISOString().split('T')[0]; }
function daysAgoStr(days) { const d=new Date(); d.setDate(d.getDate()-days); return d.toISOString().split('T')[0]; }
function monthsAgoStr(months) { const d=new Date(); d.setMonth(d.getMonth()-months); return d.toISOString().split('T')[0]; }
function yearsAgoStr(years) { const d=new Date(); d.setFullYear(d.getFullYear()-years); return d.toISOString().split('T')[0]; }

function getDurationSec(iso) {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1])||0)*3600 + (parseInt(m[2])||0)*60 + (parseInt(m[3])||0);
}
function fmtTime(s) {
  if (!s) return '--';
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if (h) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}
function fmtNum(n) {
  n = parseInt(n)||0;
  if (n>=1e9) return (n/1e9).toFixed(1)+'B';
  if (n>=1e6) return (n/1e6).toFixed(1)+'M';
  if (n>=1e3) return (n/1e3).toFixed(1)+'K';
  return n.toLocaleString('pt-BR');
}
function fmtFull(n) { return (parseInt(n)||0).toLocaleString('pt-BR'); }
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
}
function timeAgo(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime())/1000);
  if (diff<60) return 'agora';
  if (diff<3600) return Math.floor(diff/60)+'min';
  if (diff<86400) return Math.floor(diff/3600)+'h';
  if (diff<604800) return Math.floor(diff/86400)+'d';
  if (diff<2592000) return Math.floor(diff/604800)+'sem';
  return fmtDate(iso);
}
function calcEng(v, l, c) {
  v=parseInt(v)||0; l=parseInt(l)||0; c=parseInt(c)||0;
  return v ? parseFloat((((l+c)/v)*100).toFixed(2)) : 0;
}
function engCls(r) { return r>=4?'eng-hi':r>=2?'eng-mid':'eng-lo'; }

function calcVidsPerWeek(totalVids, createdAt) {
  if (!totalVids || !createdAt) return 0;
  const weeks = Math.max(1, (Date.now() - new Date(createdAt).getTime()) / (7*24*60*60*1000));
  return parseFloat((totalVids / weeks).toFixed(1));
}

function getYTKey() {
  const input = document.getElementById('apiKey')?.value.trim() || '';
  if (input) return input;
  try {
    if (window.Vault && Vault.isUnlocked()) {
      const s = Vault.snapshot();
      if (s && s.ytKey) return s.ytKey;
    }
  } catch (e) {}
  return localStorage.getItem('bsf_ytKey') || '';
}
function getAIProvider() {
  const sel = document.getElementById('aiProvider')?.value || '';
  if (sel) return sel;
  try {
    if (window.Vault && Vault.isUnlocked()) {
      const s = Vault.snapshot();
      if (s && s.aiProvider) return s.aiProvider;
    }
  } catch (e) {}
  return localStorage.getItem('bsf_aiProvider') || 'llm7';
}
function getAIKeysMap() {
  try {
    if (window.Vault && Vault.isUnlocked()) {
      const s = Vault.snapshot();
      if (s && s.aiKeys) return s.aiKeys;
    }
  } catch (e) {}
  try {
    const m = JSON.parse(localStorage.getItem('bsf_aiKeys') || '{}');
    if (m && typeof m === 'object') return m;
  } catch(e) {}
  return {};
}
function getAIKey(providerId = getAIProvider()) {
  const p = providerId || getAIProvider();
  const inputVal = document.getElementById('aiKey')?.value.trim() || '';
  if (inputVal) return inputVal;
  const map = getAIKeysMap();
  if (map[p]) return map[p];
  return localStorage.getItem('bsf_aiKey') || '';
}
function getStoredAIModel(providerId = getAIProvider()) {
  try {
    if (window.Vault && Vault.isUnlocked()) {
      const s = Vault.snapshot();
      if (s && s.aiModels && s.aiModels[providerId]) return s.aiModels[providerId];
    }
  } catch (e) {}
  const mapRaw = localStorage.getItem('bsf_aiModels');
  if (mapRaw) {
    try {
      const map = JSON.parse(mapRaw);
      if (map && typeof map === 'object' && map[providerId]) return map[providerId];
    } catch(e) {}
  }
  return localStorage.getItem('bsf_aiModel') || '';
}
function resolveProviderModel(providerId, rawModel) {
  const prov = AI_PROVIDERS[providerId];
  if (!prov) return '';
  const models = prov.models || [];
  if (!rawModel) return models.length ? models[0].id : '';
  // If model is in the hardcoded list, use it
  if (models.some(m => m.id === rawModel)) return rawModel;
  // If rawModel not in hardcoded list, it might be a dynamically loaded model
  // (e.g. from Ollama local server). Return it as-is.
  if (rawModel) return rawModel;
  return models.length ? models[0].id : '';
}

// Toast
function toast(msg, type='') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity 0.3s'; setTimeout(()=>t.remove(),300); }, 3000);
}

// Loading / Empty / Error
function showLoad(el, msg='Carregando...') {
  el.innerHTML = `<div class="loading-box"><div class="spinner lg"></div><p>${msg}</p></div>`;
}
function showEmpty(el, title, desc) {
  el.innerHTML = `<div class="empty-box"><h3>${title}</h3><p>${desc}</p></div>`;
}
function showErr(el, msg) {
  el.innerHTML = `<div style="padding:16px;background:var(--red-dim);border-left:3px solid var(--red);border-radius:8px;margin:10px 0"><p style="color:var(--red);font-size:13px;font-weight:600">${msg}</p></div>`;
}

// Copy helper
function copyText(text) {
  navigator.clipboard.writeText(text).then(()=>toast('Copiado!','success')).catch(()=>toast('Erro ao copiar','error'));
}
function copyBtnHtmlData(dataId, label='Copiar') {
  return `<button class="copy-btn" onclick="copyFromData('${dataId}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> ${label}</button>`;
}
function copyFromData(id) {
  const el = document.getElementById(id);
  if (el) copyText(el.innerText || el.textContent);
}

// Favorites
const favs = {
  K: 'bsf_favs',
  all() { return JSON.parse(localStorage.getItem(this.K)||'[]'); },
  add(item) { const f=this.all(); if(!f.find(x=>x.id===item.id)){f.push({...item,ts:Date.now()});localStorage.setItem(this.K,JSON.stringify(f));} },
  rm(id) { localStorage.setItem(this.K,JSON.stringify(this.all().filter(x=>x.id!==id))); },
  has(id) { return this.all().some(x=>x.id===id); }
};

// Markdown -> HTML (rich)
function md2html(t) {
  if (!t) return '';
  t = t.replace(/^\s*```[a-z]*\s*\n/i, '');
  t = t.replace(/\n\s*```\s*$/i, '');
  t = t.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  const lines = t.split('\n');
  const processed = [];
  let inCodeBlock = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.trim().startsWith('```') && !line.trim().startsWith('``` ')) {
      inCodeBlock = !inCodeBlock;
      processed.push(line);
      continue;
    }
    if (!inCodeBlock) {
      line = line
        .replace(/^\s*####\s*(.*$)/,'<h4>$1</h4>')
        .replace(/^\s*###\s*(.*$)/,'<h3>$1</h3>')
        .replace(/^\s*##\s*(.*$)/,'<h2>$1</h2>')
        .replace(/^\s*#\s*(.*$)/,'<h1>$1</h1>')
        .replace(/\*\*\*(.*?)\*\*\*/g,'<strong><em>$1</em></strong>')
        .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
        .replace(/\*(.*?)\*/g,'<em>$1</em>')
        .replace(/^> (.*$)/,'<blockquote>$1</blockquote>')
        .replace(/^---$/,'<hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:16px 0">');
      if (line.match(/^(\<li\>|\<\/ul\>)/)) {
        line = '\n' + line;
      } else if (!line.startsWith('<') && line.trim() !== '') {
        line = '<p>' + line + '</p>';
      }
    }
    processed.push(line);
  }
  let html = processed.join('\n');
  html = html
    .replace(/\n- (.*)/g,'\n<li>$1</li>')
    .replace(/\n\* (.*)/g,'\n<li>$1</li>')
    .replace(/\n\d+\.\s+(.*)/g,'\n<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g,'<ul>$&</ul>')
    .replace(/\n/g,'<br>')
    .replace(/<\/(h[1-4]|blockquote|hr|ul)><br>/g,'</$1>')
    .replace(/<br><br><p>/g,'<br>')
    .replace(/<p><br>/g,'<p>')
    .replace(/<br><\/p>/g,'</p>')
    .replace(/<p><\/p>/g,'')
    .replace(/<br><br>/g,'<br>');
  return html;
}

// Open formatted report in new tab (with popup blocker detection)
function openReportPage(title, subtitle, htmlContent, userPrompt = '', preOpenedWindow = null) {
  const css = `
    :root {
      --bg: #09090b; --bg-card: #18181b; --bg-card-hover: #27272a;
      --border: rgba(255,255,255,0.08); --border-hi: rgba(255,255,255,0.15);
      --text: #f4f4f5; --text-dim: #a1a1aa;
      --accent: #10b981; --accent-dim: rgba(16, 185, 129, 0.15);
      --primary: #3b82f6; --primary-dim: rgba(59, 130, 246, 0.15);
      --r: 12px; --r-lg: 16px;
    }
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'Inter',system-ui,sans-serif;line-height:1.7;display:flex;min-height:100vh}
    
    /* Layout */
    .sidebar { width: 280px; background: var(--bg-card); border-right: 1px solid var(--border); padding: 24px 20px; position: sticky; top: 0; height: 100vh; overflow-y: auto; display: flex; flex-direction: column; flex-shrink: 0; }
    .main-content { flex: 1; padding: 40px 60px; max-width: 900px; margin: 0 auto; }
    
    /* Sidebar */
    .brand { font-size: 22px; font-weight: 900; margin-bottom: 32px; letter-spacing: -0.5px; background: linear-gradient(90deg, #10b981, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .nav-menu { display: flex; flex-direction: column; gap: 8px; flex: 1; }
    .nav-link { display: block; padding: 10px 14px; color: var(--text-dim); text-decoration: none; font-size: 14px; font-weight: 500; border-radius: 8px; transition: 0.2s; border-left: 3px solid transparent; }
    .nav-link:hover { background: var(--bg-card-hover); color: var(--text); }
    .nav-link.active { background: var(--accent-dim); color: var(--accent); border-left-color: var(--accent); }
    .sidebar-actions { margin-top: 32px; display: flex; flex-direction: column; gap: 12px; }
    
    /* Main Content Header */
    .report-header { margin-bottom: 40px; }
    .report-title { font-size: 32px; font-weight: 800; margin-bottom: 8px; line-height: 1.2; }
    .report-subtitle { font-size: 15px; color: var(--text-dim); display: flex; align-items: center; gap: 8px; }
    
    /* User Prompt */
    .user-prompt { background: var(--primary-dim); border: 1px solid rgba(59, 130, 246, 0.3); padding: 16px 20px; border-radius: var(--r); margin-bottom: 40px; }
    .user-prompt-label { font-size: 11px; text-transform: uppercase; font-weight: 700; color: var(--primary); margin-bottom: 6px; letter-spacing: 0.5px; }
    .user-prompt-text { font-size: 14px; color: #e2e8f0; font-style: italic; }
    
    /* Report Content Formatting */
    .rc section { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 32px; margin-bottom: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
    .rc h2 { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; }
    .rc h2::before { content: ''; display: block; width: 12px; height: 12px; background: var(--accent); border-radius: 50%; }
    .rc h3 { font-size: 16px; font-weight: 700; color: var(--accent); margin: 24px 0 12px; }
    .rc p { margin-bottom: 16px; color: #d4d4d8; }
    .rc strong { color: #fff; font-weight: 600; }
    .rc ul, .rc ol { margin: 12px 0 20px 24px; color: #d4d4d8; }
    .rc li { margin-bottom: 8px; }
    .rc table { width: 100%; border-collapse: collapse; margin: 20px 0; border-radius: 8px; overflow: hidden; }
    .rc th { background: rgba(255,255,255,0.05); padding: 12px 16px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); }
    .rc td { padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: 14px; }
    .rc blockquote { margin: 20px 0; padding: 16px 20px; background: rgba(255,255,255,0.03); border-left: 4px solid var(--primary); border-radius: 0 var(--r) var(--r) 0; font-style: italic; }
    
    /* Buttons */
    .btn { display: inline-flex; justify-content: center; align-items: center; gap: 8px; padding: 12px 20px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: 0.2s; width: 100%; font-family: inherit; }
    .btn-primary { background: var(--accent); color: #000; }
    .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
    .btn-outline { background: transparent; border: 1px solid var(--border-hi); color: var(--text); }
    .btn-outline:hover { background: rgba(255,255,255,0.05); }
    
    @media (max-width: 768px) {
      body { flex-direction: column; }
      .sidebar { width: 100%; height: auto; position: static; padding: 20px; border-right: none; border-bottom: 1px solid var(--border); }
      .main-content { padding: 24px 16px; }
      .rc section { padding: 20px; }
    }
    @media print {
      .sidebar { display: none !important; }
      .main-content { padding: 0; max-width: 100%; }
      .rc section { border: none; padding: 0; margin-bottom: 20px; box-shadow: none; break-inside: avoid; }
      body { background: #fff; color: #000; }
      .rc h2, .rc strong, .rc p { color: #000; }
    }
    ::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border-hi);border-radius:10px}
  `;
  
  const escaped = htmlContent.replace(/<\/script/gi, '<\\/script');
  
  const page = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>' + title + ' - Relatório IA</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>' + css + '</style></head><body>' +
    '<aside class="sidebar">' +
      '<div class="brand">Busca Sem Filtro</div>' +
      '<nav class="nav-menu" id="navMenu"></nav>' +
      '<div class="sidebar-actions">' +
        '<button class="btn btn-primary" onclick="window.print()">Salvar PDF / Imprimir</button>' +
        '<button class="btn btn-outline" onclick="copyAll()">Copiar Relatório</button>' +
      '</div>' +
    '</aside>' +
    '<main class="main-content">' +
      '<header class="report-header">' +
        '<h1 class="report-title">' + title + '</h1>' +
        '<p class="report-subtitle">' + subtitle + ' &bull; Gerado em ' + new Date().toLocaleDateString('pt-BR') + '</p>' +
      '</header>' +
      (userPrompt ? '<div class="user-prompt"><div class="user-prompt-label">Contexto do Usuário</div><div class="user-prompt-text">"' + userPrompt.replace(/"/g, '&quot;') + '"</div></div>' : '') +
      '<div class="rc" id="rc">' + escaped + '</div>' +
      '<footer style="margin-top:40px;padding:24px;text-align:center;font-size:13px;color:var(--text-dim);border-top:1px solid var(--border)">' +
        '<div style="display:flex;align-items:center;gap:12px;justify-content:center">' +
          '<span>Busca Sem Filtro v2.0</span><span style="opacity:0.5">&bull;</span><span>Criado por Dark Sem Filtro</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:16px;justify-content:center;margin-top:8px">' +
          '<a href="https://www.youtube.com/@DarkSemFiltro" target="_blank" style="color:var(--text-dim);text-decoration:none;display:flex;align-items:center;gap:4px"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>YouTube</a>' +
          '<a href="https://discord.gg/va64qDkEZR" target="_blank" style="color:var(--text-dim);text-decoration:none;display:flex;align-items:center;gap:4px"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/></svg>Discord</a>' +
        '</div>' +
      '</footer>' +
    '</main>' +
    '<script>' +
      'function copyAll(){var e=document.getElementById("rc");navigator.clipboard.writeText(e.innerText).then(function(){alert("Copiado com sucesso!")}).catch(function(){alert("Erro ao copiar")})};' +
      'document.addEventListener("DOMContentLoaded", function() {' +
        'var rc = document.getElementById("rc");' +
        'var headers = rc.querySelectorAll("h2, h3");' +
        'var navMenu = document.getElementById("navMenu");' +
        'var sections = [];' +
        'if (headers.length > 0) {' +
          'var currentSection = null;' +
          'var nodes = Array.from(rc.childNodes);' +
          'rc.innerHTML = "";' +
          'nodes.forEach(function(node) {' +
            'if (node.tagName === "H2" || node.tagName === "H3") {' +
              'if (currentSection) rc.appendChild(currentSection);' +
              'currentSection = document.createElement("section");' +
              'var id = "sec-" + Math.random().toString(36).substr(2, 9);' +
              'currentSection.id = id;' +
              'currentSection.appendChild(node);' +
              'sections.push({id: id, title: node.innerText});' +
            '} else if (currentSection) {' +
              'currentSection.appendChild(node);' +
            '} else {' +
              'rc.appendChild(node);' +
            '}' +
          '});' +
          'if (currentSection) rc.appendChild(currentSection);' +
          'sections.forEach(function(sec, index) {' +
            'var a = document.createElement("a");' +
            'a.href = "#" + sec.id;' +
            'a.className = "nav-link" + (index === 0 ? " active" : "");' +
            'a.innerText = sec.title;' +
            'a.onclick = function(e) {' +
              'document.querySelectorAll(".nav-link").forEach(function(l){l.classList.remove("active")});' +
              'a.classList.add("active");' +
            '};' +
            'navMenu.appendChild(a);' +
          '});' +
          'var observer = new IntersectionObserver(function(entries) {' +
            'entries.forEach(function(entry) {' +
              'if (entry.isIntersecting) {' +
                'document.querySelectorAll(".nav-link").forEach(function(l){l.classList.remove("active")});' +
                'var link = document.querySelector(".nav-link[href=\\\\"#" + entry.target.id + "\\\\"]");' +
                'if(link) link.classList.add("active");' +
              '}' +
            '});' +
          '}, { rootMargin: "-20% 0px -70% 0px" });' +
          'document.querySelectorAll(".rc section").forEach(function(sec) { observer.observe(sec); });' +
        '}' +
      '});' +
    '<\/script>' +
    '</body></html>';
  
  const blob = new Blob([page], {type: 'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);

  let newWin = preOpenedWindow;
  
  if (newWin && !newWin.closed) {
    try {
      newWin.document.open();
      newWin.document.write(page);
      newWin.document.close();
      newWin.focus();
    } catch(e) {
      window.open(url, '_blank');
    }
  } else {
    const w = window.open(url, '_blank');
    if (!w || w.closed || typeof w.closed === 'undefined') {
      toast('Popup bloqueado! Abrindo na mesma aba.', 'error');
      window.location.href = url;
    }
  }
}
