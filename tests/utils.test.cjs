const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserContext } = require('./helpers/browser-context.cjs');

test('locked vault blocks secrets that remain in form controls', () => {
  const browser = createBrowserContext({
    apiKey: { value: 'dom-youtube-secret' },
    aiKey: { value: 'dom-ai-secret' },
    aiProvider: { value: 'llm7' }
  });
  browser.context.Vault = {
    exists: () => true,
    isUnlocked: () => false,
    snapshot: () => null
  };
  browser.runScript('js/utils.js');

  assert.equal(browser.evaluate('getYTKey()'), '');
  assert.equal(browser.evaluate('getAIKey("llm7")'), '');
  assert.equal(browser.evaluate('JSON.stringify(getAIKeysMap())'), '{}');
});

test('optional provider tokens are retained in the key map', () => {
  const browser = createBrowserContext();
  browser.runScript('js/utils.js');

  const llm7 = JSON.parse(browser.evaluate(
    'JSON.stringify(updateAIKeysMap({ gemini: "g" }, "llm7", "token-123"))'
  ));
  assert.deepEqual(llm7, { gemini: 'g', llm7: 'token-123' });

  const providerIds = JSON.parse(browser.evaluate('JSON.stringify(Object.keys(AI_PROVIDERS).sort())'));
  assert.deepEqual(providerIds, ['gemini', 'huggingface', 'llm7', 'openrouter']);
});
