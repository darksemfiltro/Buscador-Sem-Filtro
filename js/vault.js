// ============ VAULT — cofre de chaves no frontend (WebCrypto, sem backend) ============
// PBKDF2(SHA-256, 210k, salt 16B) -> AES-GCM 256. Chave só em memória, auto-lock 15min.
// Disco: localStorage bsf_vault_v1 = {salt, iv, ct} com JSON {ytKey, aiKeys, aiModels, aiProvider}.
// Migração única: lê bsf_ytKey/bsf_aiKeys/... em plaintext -> cifra -> apaga (mantém favs/quota).
// Nunca console.log de key; em tela, mascarar via Vault.mask().
(function () {
  'use strict';

  var LS_KEY = 'bsf_vault_v1';
  var LOCK_MS = 15 * 60 * 1000;
  var LEGACY_KEYS = ['bsf_ytKey', 'bsf_aiKeys', 'bsf_aiKey', 'bsf_aiModels', 'bsf_aiModel', 'bsf_aiProvider'];
  var _key = null;   // CryptoKey, só em memória
  var _data = null;  // {ytKey, aiKeys, aiModels, aiProvider} descriptografado
  var _timer = null;
  var _migratedToast = false;

  function te() { return new TextEncoder(); }
  function td() { return new TextDecoder(); }
  function b64e(buf) {
    var b = new Uint8Array(buf);
    var s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function b64d(s) {
    var bin = atob(s);
    var b = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  }

  async function derive(password, salt) {
    var base = await crypto.subtle.importKey('raw', te().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: 210000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }

  function readLegacy() {
    var d = { ytKey: '', aiKeys: {}, aiModels: {}, aiProvider: 'llm7' };
    try {
      d.ytKey = localStorage.getItem('bsf_ytKey') || '';
      var m = JSON.parse(localStorage.getItem('bsf_aiKeys') || '{}');
      if (m && typeof m === 'object') d.aiKeys = m;
      var single = localStorage.getItem('bsf_aiKey') || '';
      var oldProv = localStorage.getItem('bsf_aiProvider') || 'llm7';
      if (single && !d.aiKeys[oldProv]) d.aiKeys[oldProv] = single;
      var mm = JSON.parse(localStorage.getItem('bsf_aiModels') || '{}');
      if (mm && typeof mm === 'object') d.aiModels = mm;
      var sm = localStorage.getItem('bsf_aiModel') || '';
      if (sm && !d.aiModels[oldProv]) d.aiModels[oldProv] = sm;
      d.aiProvider = oldProv;
    } catch (e) {}
    return d;
  }

  function wipeLegacy() {
    LEGACY_KEYS.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
  }

  async function persist() {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, _key, te().encode(JSON.stringify(_data)));
    var wrap = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    localStorage.setItem(LS_KEY, JSON.stringify({ salt: wrap.salt, iv: b64e(iv), ct: b64e(ct) }));
  }

  function armLock() {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(function () { lock(); }, LOCK_MS);
    if (_timer && _timer.unref) _timer.unref(); // node: não prender o processo (no browser é no-op)
  }

  function lock() {
    _key = null;
    _data = null;
    if (_timer) { clearTimeout(_timer); _timer = null; }
  }

  function exists() {
    try { return !!localStorage.getItem(LS_KEY); } catch (e) { return false; }
  }
  function isUnlocked() { return !!_key; }

  // Desbloqueia (ou cria, migrando o legacy uma vez). Erro => senha incorreta.
  async function unlock(password) {
    if (!password) throw new Error('Informe a senha mestra.');
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) {}
    if (!raw) {
      var salt = crypto.getRandomValues(new Uint8Array(16));
      _key = await derive(password, salt);
      _data = readLegacy();
      localStorage.setItem(LS_KEY, JSON.stringify({ salt: b64e(salt), iv: '', ct: '' }));
      await persist();
      wipeLegacy();
    } else {
      var wrap = JSON.parse(raw);
      _key = await derive(password, b64d(wrap.salt));
      try {
        var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(wrap.iv) }, _key, b64d(wrap.ct));
        _data = JSON.parse(td().decode(pt));
      } catch (e) {
        _key = null;
        _data = null;
        throw new Error('Senha incorreta.');
      }
    }
    armLock();
    return true;
  }

  async function saveAll(patch) {
    if (!isUnlocked()) throw new Error('Cofre bloqueado.');
    _data = Object.assign({}, _data, patch);
    await persist();
    armLock();
  }

  function snapshot() {
    return _data ? { ytKey: _data.ytKey || '', aiKeys: _data.aiKeys || {}, aiModels: _data.aiModels || {}, aiProvider: _data.aiProvider || 'llm7' } : null;
  }

  // Apaga cofre + legacy + cache de modelos (mantém favs/quota). Usado por Limpar Cache.
  function clearAll() {
    lock();
    try {
      localStorage.removeItem(LS_KEY);
      wipeLegacy();
      Object.keys(localStorage).filter(function (k) { return k.indexOf('bsf_models_') === 0; })
        .forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
  }

  function mask(k) {
    k = String(k || '');
    if (k.length <= 8) return k ? '••••' : '';
    return k.slice(0, 3) + '…' + k.slice(-4);
  }

  // Modal de senha reaproveitando .modal-overlay/.modal-box/input/.btn-save do tema.
  // resolve(true) desbloqueado, resolve(false) cancelado.
  function ensureUnlocked() {
    if (isUnlocked()) return Promise.resolve(true);
    var isNew = !exists();
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.className = 'modal-overlay open';
      ov.id = 'bsfVaultModal';
      ov.innerHTML =
        '<div class="modal-box" style="max-width:420px">' +
          '<div class="modal-header"><h2>' + (isNew ? 'Criar cofre de chaves' : 'Desbloquear cofre') + '</h2></div>' +
          '<div class="modal-body">' +
            '<p style="font-size:13px;color:var(--text-dim);margin-bottom:12px">' +
              (isNew
                ? 'Crie uma <b>senha mestra</b>. Suas chaves serão cifradas (AES-GCM) neste navegador. Sem a senha, ninguém lê o cofre.'
                : 'Digite sua <b>senha mestra</b> para descriptografar as chaves (auto-lock em 15 min).') +
            '</p>' +
            '<div class="key-field" style="margin-bottom:10px"><label>Senha mestra</label>' +
              '<input type="password" id="bsfVaultPw" autocomplete="off" placeholder="••••••••"></div>' +
            (isNew ? '<div class="key-field" style="margin-bottom:12px"><label>Confirmar senha</label>' +
              '<input type="password" id="bsfVaultPw2" autocomplete="off" placeholder="••••••••"></div>' : '') +
            '<p id="bsfVaultErr" style="display:none;font-size:12px;color:var(--red);margin-bottom:8px"></p>' +
            '<div style="display:flex;gap:8px;justify-content:flex-end">' +
              '<button class="btn-action outline" id="bsfVaultCancel">Cancelar</button>' +
              '<button class="btn-save" id="bsfVaultOk">' + (isNew ? 'Criar e cifrar' : 'Desbloquear') + '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      var pw = ov.querySelector('#bsfVaultPw');
      var pw2 = ov.querySelector('#bsfVaultPw2');
      var err = ov.querySelector('#bsfVaultErr');
      function fail(m) { err.textContent = m; err.style.display = 'block'; }
      function done(v) { ov.remove(); resolve(v); }
      ov.querySelector('#bsfVaultCancel').onclick = function () { done(false); };
      ov.addEventListener('click', function (e) { if (e.target === ov) done(false); });
      async function ok() {
        err.style.display = 'none';
        try {
          if (isNew && pw.value !== (pw2 && pw2.value)) return fail('As senhas não conferem.');
          if ((pw.value || '').length < 4) return fail('Senha muito curta (mín. 4 caracteres).');
          ov.querySelector('#bsfVaultOk').textContent = 'Aguarde…';
          await unlock(pw.value);
          try { if (typeof toast === 'function') toast(isNew ? 'Cofre criado e chaves cifradas!' : 'Cofre desbloqueado!', 'success'); } catch (e) {}
          done(true);
        } catch (e) {
          ov.querySelector('#bsfVaultOk').textContent = isNew ? 'Criar e cifrar' : 'Desbloquear';
          fail(e.message || 'Falha ao desbloquear.');
        }
      }
      ov.querySelector('#bsfVaultOk').onclick = ok;
      pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok(); });
      setTimeout(function () { try { pw.focus(); } catch (e) {} }, 50);
    });
  }

  function migrateToast() {
    if (_migratedToast) return;
    _migratedToast = true;
    try { if (typeof toast === 'function') toast('Cofre bloqueado — des/crie a senha mestra para usar as chaves.', 'error'); } catch (e) {}
  }

  window.Vault = {
    exists: exists,
    isUnlocked: isUnlocked,
    unlock: unlock,
    lock: lock,
    saveAll: saveAll,
    snapshot: snapshot,
    clearAll: clearAll,
    mask: mask,
    ensureUnlocked: ensureUnlocked,
    migrateToast: migrateToast
  };
})();
