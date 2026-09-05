const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserContext } = require('./helpers/browser-context.cjs');

test('ModelRegistry filters free OpenRouter models and reuses its cache', async () => {
  const browser = createBrowserContext();
  browser.context.AI_PROVIDERS = {
    openrouter: {
      models: [
        { id: 'fallback/good:free', name: 'Fallback Good', free: true },
        { id: 'fallback/lite:free', name: 'Fallback Lite', free: true }
      ]
    }
  };
  browser.context.getAIKey = () => '';
  let fetchCount = 0;
  browser.context.fetch = async () => {
    fetchCount++;
    return {
      ok: true,
      json: async () => ({
        data: [
          { id: 'vendor/alpha:free', name: 'Alpha Free', context_length: 8192 },
          { id: 'vendor/alpha-paid', name: 'Alpha Paid', context_length: 8192 },
          { id: 'vendor/beta:free', name: 'Beta Free', context_length: 4096 }
        ]
      })
    };
  };
  browser.runScript('js/models.js');

  const live = await browser.context.ModelRegistry.list('openrouter', { force: true });
  assert.deepEqual(Array.from(live, (item) => item.id), ['vendor/alpha:free', 'vendor/beta:free']);
  assert.deepEqual(
    Array.from(browser.context.ModelRegistry.filterItems(live, 'alpha free'), (item) => item.id),
    ['vendor/alpha:free']
  );
  assert.deepEqual(
    Array.from(browser.context.ModelRegistry.filterItems(live, 'beta :free'), (item) => item.id),
    ['vendor/beta:free']
  );

  await browser.context.ModelRegistry.list('openrouter');
  assert.equal(fetchCount, 1);

  browser.context.localStorage.removeItem('bsf_models_openrouter');
  browser.context.fetch = async () => { throw new TypeError('Failed to fetch'); };
  const fallback = await browser.context.ModelRegistry.list('openrouter', { force: true });
  assert.deepEqual(Array.from(fallback, (item) => item.id), ['fallback/good:free']);
});
