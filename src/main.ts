import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Platform, requestUrl, Setting, TFile } from 'obsidian';
import { Decoration, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { OpenGraphMetadata, parseOpenGraph } from './opengraph';

declare const require: ((name: string) => any) | undefined;
interface Settings { attachmentFolder: string; refreshAfterDays: number; }
const DEFAULTS: Settings = { attachmentFolder: '_link-previews', refreshAfterDays: 30 };
const MARKER = 'link-previews:screenshot';
const hash = (input: string) => { let h = 2166136261; for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619); return (h >>> 0).toString(16).padStart(8, '0'); };
const urlFromLine = (line: string) => line.match(/https?:\/\/[^\s)>]+/i)?.[0].replace(/[.,;]+$/, '') ?? null;
const markerFor = (url: string, image: string) => `<!-- ${MARKER}\nurl=${url}\nimage=${image}\ncaptured=${new Date().toISOString()}\n-->`;
function markerInfo(content: string, url: string): { image: string; captured: number } | null {
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`<!-- ${MARKER}\\nurl=${escaped}\\nimage=([^\\n]+)\\ncaptured=([^\\n]+)\\n-->`));
  if (!match) return null;
  const captured = Date.parse(match[2]);
  return { image: match[1], captured: Number.isFinite(captured) ? captured : 0 };
}

class PreviewWidget extends WidgetType {
  constructor(private readonly plugin: LinkPreviewsPlugin, private readonly url: string, private readonly file: TFile | null) { super(); }
  eq(other: PreviewWidget) { return other.url === this.url; }
  toDOM() {
    const el = document.createElement('div'); el.className = 'link-preview-card link-preview-live';
    const title = document.createElement('a'); title.className = 'link-preview-title'; title.href = this.url; title.textContent = 'Webpage preview'; el.appendChild(title);
    void this.plugin.populateLiveCard(el, this.url, this.file);
    return el;
  }
  ignoreEvent() { return false; }
}

class LivePreviewPreviews {
  decorations: any;
  constructor(private readonly view: EditorView, private readonly plugin: LinkPreviewsPlugin) { this.decorations = this.build(); }
  update(update: ViewUpdate) { if (update.docChanged || update.viewportChanged || update.selectionSet) this.decorations = this.build(); }
  build() {
    const builder = new RangeSetBuilder<any>();
    for (const { from, to } of this.view.visibleRanges) {
      const text = this.view.state.sliceDoc(from, to);
      const re = /https?:\/\/[^\s)>]+/gi; let match: RegExpExecArray | null;
      while ((match = re.exec(text))) {
        const url = match[0].replace(/[.,;]+$/, ''); const pos = from + match.index + url.length;
        builder.add(pos, pos, Decoration.widget({ widget: new PreviewWidget(this.plugin, url, null), side: 1 }));
      }
    }
    return builder.finish();
  }
}

export default class LinkPreviewsPlugin extends Plugin {
  settings!: Settings;
  private captures = new Map<string, Promise<string>>();
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.addSettingTab(new LinkPreviewSettings(this.app, this));
    this.addCommand({ id: 'enrich-url-screenshot', name: 'Enrich URL with webpage screenshot', editorCallback: (editor, view) => void this.enrich(editor, view as MarkdownView) });
    this.addCommand({ id: 'refresh-url-screenshot', name: 'Refresh URL screenshot', editorCallback: (editor, view) => void this.enrich(editor, view as MarkdownView, true) });
    this.registerMarkdownPostProcessor((el, ctx) => this.renderCards(el, ctx));
    const plugin = this;
    this.registerEditorExtension(ViewPlugin.fromClass(class extends LivePreviewPreviews {
      constructor(view: EditorView) { super(view, plugin); }
    }));
  }

  private async enrich(editor: Editor, view: MarkdownView, refresh = false) {
    if (Platform.isMobile) { new Notice('Screenshot capture is available on Obsidian Desktop only.'); return; }
    const url = urlFromLine(editor.getLine(editor.getCursor().line));
    if (!url) { new Notice('Place the cursor on a line containing an HTTP(S) URL.'); return; }
    try { await this.captureAndPersist(url, view.file, refresh); new Notice(refresh ? 'Screenshot refreshed.' : 'Screenshot saved to the vault.'); }
    catch (error) { new Notice(`Screenshot unavailable: ${error instanceof Error ? error.message : 'Desktop capture is not supported in this runtime.'}`); }
  }

  private async captureAndPersist(url: string, note: TFile | null, refresh = false): Promise<string> {
    if (Platform.isMobile) throw new Error('Desktop capture is not supported on mobile');
    const existing = note ? markerInfo(await this.app.vault.read(note), url) : null;
    const imagePath = existing?.image || `${this.settings.attachmentFolder}/${hash(url)}.png`;
    if (!refresh && existing && this.app.vault.getAbstractFileByPath(imagePath) instanceof TFile && (this.settings.refreshAfterDays <= 0 || Date.now() - existing.captured < this.settings.refreshAfterDays * 86400000)) return imagePath;
    const pending = this.captures.get(url);
    if (pending) return pending;
    const job = (async () => {
      const data = await this.capturePage(url);
      await this.app.vault.createFolder(this.settings.attachmentFolder).catch(() => undefined);
      const file = this.app.vault.getAbstractFileByPath(imagePath);
      if (file instanceof TFile) await this.app.vault.modifyBinary(file, data); else await this.app.vault.createBinary(imagePath, data);
      if (note) await this.app.vault.process(note, content => markerInfo(content, url) ? content : `${content.trimEnd()}\n\n![Webpage preview](${imagePath})\n${markerFor(url, imagePath)}\n`);
      return imagePath;
    })();
    this.captures.set(url, job);
    try { return await job; } finally { this.captures.delete(url); }
  }

  private async capturePage(url: string): Promise<ArrayBuffer> {
    const electron = typeof require === 'function' ? require('electron') : null;
    const BrowserWindow = electron?.BrowserWindow;
    if (!BrowserWindow) throw new Error('Obsidian did not expose the desktop capture API');
    const win = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    try { await win.loadURL(url, { timeout: 20000 }); await new Promise(resolve => setTimeout(resolve, 1200)); const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1200, height: 800 }); return image.toPNG().buffer; }
    finally { if (!win.isDestroyed()) win.destroy(); }
  }

  private async renderCards(el: HTMLElement, ctx: any) {
    const file = ctx.sourcePath ? this.app.vault.getAbstractFileByPath(ctx.sourcePath) : null;
    const source = file instanceof TFile ? await this.app.vault.read(file) : '';
    for (const anchor of Array.from(el.querySelectorAll('a.external-link[href], a.internal-link[href^="http"]')) as HTMLAnchorElement[]) {
      const url = anchor.href;
      const info = markerInfo(source, url);
      if (info && this.app.vault.getAbstractFileByPath(info.image) instanceof TFile) { this.card(anchor, url, info.image); continue; }
      void this.fetchOg(url).then(meta => this.card(anchor, url, undefined, meta)).catch(() => this.card(anchor, url));
      if (!Platform.isMobile && file instanceof TFile) void this.captureAndPersist(url, file).then(image => this.replaceCard(anchor, url, image)).catch(() => undefined);
    }
  }
  async populateLiveCard(el: HTMLElement, url: string, file: TFile | null) {
    try {
      const meta = await this.fetchOg(url);
      const title = el.querySelector('.link-preview-title') as HTMLAnchorElement | null;
      if (title) title.textContent = meta.title || 'Webpage preview';
      if (meta.description) el.createEl('p', { text: meta.description, cls: 'link-preview-description' });
      const note = file || this.app.workspace.getActiveViewOfType(MarkdownView)?.file || null;
      if (!Platform.isMobile && note) {
        const image = await this.captureAndPersist(url, note);
        const imageFile = this.app.vault.getAbstractFileByPath(image);
        if (imageFile instanceof TFile) el.createEl('img', { attr: { src: this.app.vault.getResourcePath(imageFile), alt: 'Webpage screenshot' } });
      } else if (meta.image) el.createEl('img', { attr: { src: meta.image, alt: '' } });
    } catch { /* The link remains usable when metadata/capture is unavailable. */ }
  }

  private async fetchOg(url: string): Promise<OpenGraphMetadata> { const response = await requestUrl({ url, method: 'GET' }); return parseOpenGraph(response.text, url); }
  private replaceCard(anchor: HTMLAnchorElement, url: string, image: string) { const card = anchor.parentElement?.querySelector('.link-preview-card'); if (card) { card.empty(); this.card(anchor, url, image); } }
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
  display() { this.containerEl.empty(); this.containerEl.createEl('h2', { text: 'Link Previews' }); new Setting(this.containerEl).setName('Attachment folder').setDesc('Vault folder for durable desktop screenshots; mobile only consumes these files.').addText(t => t.setValue(this.plugin.settings.attachmentFolder).onChange(async value => { this.plugin.settings.attachmentFolder = value.trim() || DEFAULTS.attachmentFolder; await this.plugin.saveData(this.plugin.settings); })); new Setting(this.containerEl).setName('Refresh screenshots after days').setDesc('Automatically recapture stale screenshots on desktop note open. Set 0 to keep them indefinitely.').addText(t => t.setValue(String(this.plugin.settings.refreshAfterDays)).onChange(async value => { const days = Number(value); this.plugin.settings.refreshAfterDays = Number.isFinite(days) && days >= 0 ? days : DEFAULTS.refreshAfterDays; await this.plugin.saveData(this.plugin.settings); })); }
}
