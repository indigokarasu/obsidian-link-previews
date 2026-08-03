import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Platform, requestUrl, Setting, TFile } from 'obsidian';
import { OpenGraphMetadata, parseOpenGraph } from './opengraph';

declare const require: ((name: string) => any) | undefined;
interface Settings { rendererEndpoint: string; attachmentFolder: string; }
const DEFAULTS: Settings = { rendererEndpoint: 'http://127.0.0.1:8765', attachmentFolder: '_link-previews' };
const MARKER = 'link-previews:screenshot';
const hash = (input: string) => { let h = 2166136261; for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619); return (h >>> 0).toString(16).padStart(8, '0'); };
const urlFromLine = (line: string) => line.match(/https?:\/\/[^\s)>]+/i)?.[0].replace(/[.,;]+$/, '') ?? null;
const markerFor = (url: string, image: string) => `<!-- ${MARKER}\nurl=${url}\nimage=${image}\ncaptured=${new Date().toISOString()}\n-->`;
function markerImage(content: string, url: string): string | null {
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return content.match(new RegExp(`<!-- ${MARKER}\\nurl=${escaped}\\nimage=([^\\n]+)`))?.[1] ?? null;
}

export default class LinkPreviewsPlugin extends Plugin {
  settings!: Settings;
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.addSettingTab(new LinkPreviewSettings(this.app, this));
    this.addCommand({ id: 'enrich-url-screenshot', name: 'Enrich URL with webpage screenshot', editorCallback: (editor, view) => void this.enrich(editor, view as MarkdownView) });
    this.addCommand({ id: 'refresh-url-screenshot', name: 'Refresh URL screenshot', editorCallback: (editor, view) => void this.enrich(editor, view as MarkdownView, true) });
    this.addCommand({ id: 'test-screenshot-helper', name: 'Test screenshot helper connection', callback: () => void this.testHelper() });
    this.registerMarkdownPostProcessor((el, ctx) => this.renderCards(el, ctx));
  }

  private async enrich(editor: Editor, view: MarkdownView, refresh = false) {
    if (Platform.isMobile) { new Notice('Screenshot capture is available on Obsidian Desktop only.'); return; }
    const url = urlFromLine(editor.getLine(editor.getCursor().line));
    if (!url) { new Notice('Place the cursor on a line containing an HTTP(S) URL.'); return; }
    const imagePath = `${this.settings.attachmentFolder}/${hash(url)}.png`;
    try {
      const data = await this.capturePage(url);
      await this.app.vault.createFolder(this.settings.attachmentFolder).catch(() => undefined);
      const existing = this.app.vault.getAbstractFileByPath(imagePath);
      if (existing instanceof TFile) await this.app.vault.modifyBinary(existing, data); else await this.app.vault.createBinary(imagePath, data);
      if (!editor.getValue().includes(markerFor(url, imagePath))) editor.replaceRange(`\n\n![Webpage preview](${imagePath})\n${markerFor(url, imagePath)}\n`, { line: editor.getCursor().line + 1, ch: 0 });
      new Notice(refresh ? 'Screenshot refreshed.' : 'Screenshot saved to the vault.');
    } catch (error) { new Notice(`Screenshot unavailable: ${error instanceof Error ? error.message : 'Desktop capture is not supported in this runtime.'}`); }
  }

  private async testHelper() { try { const r = await requestUrl({ url: `${this.settings.rendererEndpoint.replace(/\/$/, '')}/health`, method: 'GET' }); if (r.status < 200 || r.status >= 300) throw new Error(`helper returned ${r.status}`); new Notice('Screenshot helper is reachable.'); } catch (e) { new Notice(`Screenshot helper unavailable. Start helper/server.mjs separately. ${e instanceof Error ? e.message : 'connection error'}`); } }
  private async capturePage(url: string): Promise<ArrayBuffer> {
    const response = await requestUrl({ url: `${this.settings.rendererEndpoint.replace(/\/$/, '')}/screenshot`, method: 'POST', body: JSON.stringify({ url }), headers: { 'content-type': 'application/json' } });
    if (response.status < 200 || response.status >= 300) throw new Error(`renderer returned ${response.status}`);
    return response.arrayBuffer;
  }

  private async renderCards(el: HTMLElement, ctx: any) {
    const file = ctx.sourcePath ? this.app.vault.getAbstractFileByPath(ctx.sourcePath) : null;
    const source = file instanceof TFile ? await this.app.vault.read(file) : '';
    for (const anchor of Array.from(el.querySelectorAll('a.external-link[href], a.internal-link[href^="http"]')) as HTMLAnchorElement[]) {
      const url = anchor.href;
      const image = markerImage(source, url);
      if (image && this.app.vault.getAbstractFileByPath(image) instanceof TFile) { this.card(anchor, url, image); continue; }
      void this.fetchOg(url).then(meta => this.card(anchor, url, undefined, meta)).catch(() => undefined);
    }
  }
  private async fetchOg(url: string): Promise<OpenGraphMetadata> { const response = await requestUrl({ url, method: 'GET' }); return parseOpenGraph(response.text, url); }
  private card(anchor: HTMLAnchorElement, url: string, image?: string, meta?: OpenGraphMetadata) {
    if (anchor.parentElement?.querySelector('.link-preview-card')) return;
    const card = anchor.parentElement?.createDiv({ cls: 'link-preview-card' }); if (!card) return;
    card.createEl('a', { text: meta?.title || 'Webpage preview', href: url, cls: 'link-preview-title' });
    if (image) { const file = this.app.vault.getAbstractFileByPath(image); if (file instanceof TFile) card.createEl('img', { attr: { src: this.app.vault.getResourcePath(file), alt: 'Webpage screenshot' } }); }
    else if (meta?.image) card.createEl('img', { attr: { src: meta.image, alt: '' } });
    if (meta?.description) card.createEl('p', { text: meta.description, cls: 'link-preview-description' });
  }
}
class LinkPreviewSettings extends PluginSettingTab {
  constructor(app: App, private plugin: LinkPreviewsPlugin) { super(app, plugin); }
  display() { this.containerEl.empty(); this.containerEl.createEl('h2', { text: 'Link Previews' }); new Setting(this.containerEl).setName('Screenshot helper endpoint').setDesc('Optional helper; the plugin does not start it. Start helper/server.mjs separately, then use Test screenshot helper connection. Desktop only.').addText(t => t.setValue(this.plugin.settings.rendererEndpoint).onChange(async value => { this.plugin.settings.rendererEndpoint = value.trim(); await this.plugin.saveData(this.plugin.settings); })); new Setting(this.containerEl).setName('Attachment folder').setDesc('Vault folder for durable desktop screenshots; mobile only consumes these files.').addText(t => t.setValue(this.plugin.settings.attachmentFolder).onChange(async value => { this.plugin.settings.attachmentFolder = value.trim() || DEFAULTS.attachmentFolder; await this.plugin.saveData(this.plugin.settings); })); }
}
