const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserContext } = require('./helpers/browser-context.cjs');

test('Vault migrates legacy secrets, encrypts them and emits a lock event', async () => {
  const browser = createBrowserContext();
  const { localStorage } = browser.context;
  localStorage.setItem('bsf_ytKey', 'yt-secret');
  localStorage.setItem('bsf_aiKeys', JSON.stringify({ gemini: 'ai-secret' }));
  localStorage.setItem('bsf_aiProvider', 'gemini');
  localStorage.setItem('bsf_aiModels', JSON.stringify({ gemini: 'gemini-test' }));

  browser.runScript('js/vault.js');
  let lockEvents = 0;
  browser.context.addEventListener('bsf:vault-locked', () => { lockEvents++; });

  await browser.context.Vault.unlock('senha-forte');
  assert.deepEqual(JSON.parse(JSON.stringify(browser.context.Vault.snapshot())), {
    ytKey: 'yt-secret',
    aiKeys: { gemini: 'ai-secret' },
    aiModels: { gemini: 'gemini-test' },
    aiProvider: 'gemini'
  });
  assert.equal(localStorage.getItem('bsf_ytKey'), null);
  assert.equal(localStorage.getItem('bsf_aiKeys'), null);

  const encrypted = localStorage.getItem('bsf_vault_v1');
  assert.ok(encrypted);
  assert.equal(encrypted.includes('yt-secret'), false);
  assert.equal(encrypted.includes('ai-secret'), false);

  browser.context.Vault.lock();
  assert.equal(lockEvents, 1);
  assert.equal(browser.context.Vault.snapshot(), null);
  await assert.rejects(() => browser.context.Vault.unlock('senha-errada'), /Senha incorreta/);
  await browser.context.Vault.unlock('senha-forte');
  assert.equal(browser.context.Vault.snapshot().ytKey, 'yt-secret');
  browser.context.Vault.lock();
});
