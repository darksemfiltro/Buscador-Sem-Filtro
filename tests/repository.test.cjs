const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('index loads local scripts in dependency order and references existing assets', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = Array.from(html.matchAll(/<script[^>]+src="([^"]+)"/g), (match) => match[1]);
  const localScripts = scripts.filter((source) => !/^https?:/.test(source));
  assert.deepEqual(localScripts, [
    'js/utils.js',
    'js/vault.js',
    'js/models.js',
    'js/api.js',
    'js/ai.js',
    'js/pdf.js',
    'js/app.js'
  ]);

  const localAssets = Array.from(
    html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g),
    (match) => match[1]
  ).filter((source) => !/^(?:https?:|data:|#)/.test(source));
  for (const asset of localAssets) {
    assert.equal(fs.existsSync(path.join(root, asset)), true, `missing local asset: ${asset}`);
  }
});

test('index has unique element IDs', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, []);
});

test('browser-incompatible provider endpoints and stale Ollama guide stay removed', () => {
  const source = [
    fs.readFileSync(path.join(root, 'js', 'utils.js'), 'utf8'),
    fs.readFileSync(path.join(root, 'js', 'models.js'), 'utf8')
  ].join('\n');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

  assert.equal(source.includes('integrate.api.nvidia.com'), false);
  assert.equal(source.includes('ollama.com/v1'), false);
  assert.equal(readme.includes('GUIA_OLLAMA.md'), false);
  assert.equal(fs.existsSync(path.join(root, 'GUIA_OLLAMA.md')), false);
});
