import Module from 'node:module';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const Plugin = class { constructor(app) { this.app = app; } loadData() { return Promise.resolve({}); } saveData() { return Promise.resolve(); } addCommand() {} addSettingTab() {} register() {} registerEvent() {} registerMarkdownPostProcessor() {} };
class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = { empty() {}, createEl() {} }; } }
class TFile {}
const obsidian = { Plugin, PluginSettingTab, TFile, App: class {}, Editor: class {}, MarkdownView: class {}, Notice: class {}, Platform: { isMobile: false }, Setting: class { constructor() {} }, requestUrl: async () => ({ text: '', headers: {} }) };
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) { if (request === 'obsidian') return obsidian; if (request === 'electron') return {}; return originalLoad.call(this, request, parent, isMain); };
(async () => {
  try {
    const pluginModule = require('../main.js');
    const PluginClass = pluginModule.default;
    assert.equal(typeof PluginClass, 'function', 'main.js must export a default plugin class');
    assert.ok(PluginClass.prototype instanceof Plugin, 'default export must extend Obsidian Plugin');
    const app = { workspace: { getLeavesOfType: () => [], on: () => () => {} }, vault: {}, fileManager: {} };
    const instance = new PluginClass(app);
    assert.equal(typeof instance.onload, 'function');
    await instance.onload();
    console.log('runtime smoke test passed (controlled Obsidian/Electron mocks; no GUI coverage)');
  } finally { Module._load = originalLoad; }
})().catch(error => { console.error(error); process.exitCode = 1; });
