const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

class MemoryStorage {
  constructor() {
    this.data = Object.create(null);
  }

  get length() {
    return Object.keys(this.data).length;
  }

  getItem(key) {
    return Object.hasOwn(this.data, key) ? this.data[key] : null;
  }

  setItem(key, value) {
    this.data[key] = String(value);
  }

  removeItem(key) {
    delete this.data[key];
  }

  clear() {
    this.data = Object.create(null);
  }

  key(index) {
    return Object.keys(this.data)[index] || null;
  }
}

function createBrowserContext(initialElements = {}) {
  const elements = {};
  for (const [id, value] of Object.entries(initialElements)) {
    elements[id] = typeof value === 'object' ? value : { value };
  }

  const listeners = new Map();
  const context = {
    AbortController,
    clearTimeout,
    console: { log() {}, warn() {}, error() {} },
    crypto: webcrypto,
    document: {
      getElementById(id) {
        return elements[id] || null;
      }
    },
    localStorage: new MemoryStorage(),
    navigator: {},
    setTimeout,
    TextDecoder,
    TextEncoder,
    URL,
    atob(value) {
      return Buffer.from(value, 'base64').toString('binary');
    },
    btoa(value) {
      return Buffer.from(value, 'binary').toString('base64');
    }
  };

  context.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  context.addEventListener = (type, handler) => {
    const handlers = listeners.get(type) || [];
    handlers.push(handler);
    listeners.set(type, handlers);
  };
  context.dispatchEvent = (event) => {
    for (const handler of listeners.get(event.type) || []) handler.call(context, event);
    return true;
  };
  context.window = context;
  context.globalThis = context;

  vm.createContext(context);

  return {
    context,
    elements,
    evaluate(source) {
      return vm.runInContext(source, context);
    },
    runScript(relativePath) {
      const filename = path.join(path.resolve(__dirname, '..', '..'), relativePath);
      return vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
    }
  };
}

module.exports = { MemoryStorage, createBrowserContext };
