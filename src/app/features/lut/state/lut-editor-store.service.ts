import { afterNextRender, computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { validateEditorDocument } from '@features/lut/engine/editor-transform';
import { LUT_PRESETS, LutPreset } from '@features/lut/engine/presets';
import {
  cloneEditorDocument,
  createEditorDocument,
  CurveChannel,
  EditorDownload,
  IDENTITY_CURVE,
  LutEditorDocument,
  LutEditorSettings,
} from '@features/lut/models/lut-editor.model';
import { Lut3D } from '@features/lut/models/lut.model';
import {
  DEFAULT_LUT_SETTINGS,
  LutPreview,
  LutSource,
} from '@features/lut/models/lut-workspace.model';
import { LutEditorService } from '@features/lut/services/lut-editor.service';
import { LutService } from '@features/lut/services/lut.service';

const HISTORY_LIMIT = 40;

@Injectable()
export class LutEditorStore {
  private readonly service = inject(LutEditorService);
  private readonly images = inject(LutService);
  readonly document = signal(createEditorDocument());
  readonly source = signal<LutSource | null>(null);
  readonly originalPreviewUrl = signal<string | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly bakedLut = signal<Lut3D | null>(null);
  readonly loading = signal(false);
  readonly baseLoading = signal(false);
  readonly baking = signal(false);
  readonly previewing = signal(false);
  readonly exporting = signal(false);
  readonly error = signal<string | null>(null);
  private readonly past = signal<LutEditorDocument[]>([]);
  private readonly future = signal<LutEditorDocument[]>([]);
  private readonly gestureStart = signal<LutEditorDocument | null>(null);
  readonly canUndo = computed(() => this.gestureStart() !== null || this.past().length > 0);
  readonly canRedo = computed(() => this.future().length > 0 && this.gestureStart() === null);
  readonly basePreset = computed<LutPreset | 'custom'>(() => {
    const base = this.document().base;
    return base
      ? (LUT_PRESETS.find((preset) => preset.name === base.title)?.id ?? 'custom')
      : 'original';
  });
  private sourceRevision = 0;
  private loadRevision = 0;
  private bakeRevision = 0;
  private previewRevision = 0;
  private exportRevision = 0;
  private loadKind?: 'base' | 'project';
  private loadController?: AbortController;
  private bakeController?: AbortController;
  private previewController?: AbortController;
  private exportController?: AbortController;
  private bakeTimer?: ReturnType<typeof setTimeout>;
  private readonly downloads = new Map<'cube' | 'project' | 'image', EditorDownload>();
  private destroyed = false;

  constructor() {
    afterNextRender(() => {
      if (this.destroyed) return;
      if (!this.baking() && !this.bakedLut()) this.scheduleBake();
      if (!this.source() && !this.loading()) void this.useDemo();
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.sourceRevision++;
      this.cancelDocumentLoad();
      this.cancelBake();
      this.cancelPreview();
      this.invalidateExports();
      this.clearPreviews();
      const source = this.source();
      if (source) this.images.release(source);
    });
  }

  update(patch: Partial<LutEditorSettings>): void {
    if (this.destroyed) return;
    const next = cloneEditorDocument(this.document());
    next.settings = { ...next.settings, ...patch };
    if (!this.valid(next)) return;
    if (JSON.stringify(next.settings) === JSON.stringify(this.document().settings)) return;
    if (this.loadKind === 'project') this.cancelDocumentLoad();
    if (!this.gestureStart()) this.gestureStart.set(cloneEditorDocument(this.document()));
    this.future.set([]);
    this.document.set(cloneEditorDocument(next));
    this.changed();
  }

  commit(): void {
    const start = this.gestureStart();
    if (!start) return;
    this.gestureStart.set(null);
    if (JSON.stringify(start.settings) !== JSON.stringify(this.document().settings))
      this.pushPast(start);
  }

  updateCurve(channel: CurveChannel, points: number[]): void {
    this.update({ curves: { ...this.document().settings.curves, [channel]: [...points] } });
  }

  resetCurve(channel: CurveChannel): void {
    this.commit();
    this.updateCurve(channel, [...IDENTITY_CURVE]);
    this.commit();
  }

  resetSettings(): void {
    this.cancelDocumentLoad();
    this.replaceDocument({ ...this.document(), settings: createEditorDocument().settings });
  }

  rename(name: string): void {
    const clean =
      name
        .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
        .trim()
        .slice(0, 80) || 'My LUT';
    this.replaceDocument({ ...this.document(), name: clean });
  }

  setSize(size: 33 | 65): void {
    this.replaceDocument({ ...this.document(), size });
  }

  undo(): void {
    if (this.destroyed) return;
    this.cancelDocumentLoad();
    this.commit();
    const previous = this.past().at(-1);
    if (!previous) return;
    this.future.set(
      [cloneEditorDocument(this.document()), ...this.future()].slice(0, HISTORY_LIMIT),
    );
    this.past.update((entries) => entries.slice(0, -1));
    this.document.set(cloneEditorDocument(previous));
    this.changed();
  }

  redo(): void {
    if (this.destroyed || this.gestureStart()) return;
    this.cancelDocumentLoad();
    const next = this.future()[0];
    if (!next) return;
    this.pushPast(cloneEditorDocument(this.document()));
    this.future.update((entries) => entries.slice(1));
    this.document.set(cloneEditorDocument(next));
    this.changed();
  }

  async selectBase(preset: LutPreset): Promise<void> {
    if (this.destroyed) return;
    if (preset === 'original') {
      this.cancelDocumentLoad();
      this.replaceDocument({ ...this.document(), base: null });
      return;
    }
    await this.loadDocument(
      'base',
      async (signal) => ({
        ...this.document(),
        base: await this.images.loadPreset(preset, signal),
      }),
      true,
    );
  }

  async loadBase(file: File): Promise<void> {
    await this.loadDocument(
      'base',
      async () => ({ ...this.document(), base: await this.images.loadLut(file) }),
      true,
    );
  }

  async loadProject(file: File): Promise<void> {
    await this.loadDocument('project', () => this.service.loadProject(file));
  }

  async loadImage(file: File): Promise<void> {
    await this.loadSource(() => this.images.load(file));
  }

  async useDemo(): Promise<void> {
    await this.loadSource(() => this.images.loadDemo());
  }

  async exportCube(): Promise<EditorDownload | null> {
    const lut = this.bakedLut();
    if (!lut || !this.canExport()) return null;
    this.commit();
    this.error.set(null);
    this.exporting.set(true);
    const revision = ++this.exportRevision;
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (revision !== this.exportRevision || this.destroyed) return null;
      return this.keepDownload('cube', this.service.cubeBlob(lut), `${this.stem()}.cube`);
    } catch (error) {
      if (revision === this.exportRevision && !this.destroyed) this.error.set(this.message(error));
      return null;
    } finally {
      if (revision === this.exportRevision && !this.destroyed) this.exporting.set(false);
    }
  }

  exportProject(): EditorDownload | null {
    if (this.destroyed || this.baseLoading()) return null;
    this.commit();
    this.error.set(null);
    try {
      return this.keepDownload(
        'project',
        this.service.projectBlob(this.document()),
        `${this.stem()}.lut-project.json`,
      );
    } catch (error) {
      this.error.set(this.message(error));
      return null;
    }
  }

  async exportImage(): Promise<EditorDownload | null> {
    const source = this.source();
    const lut = this.bakedLut();
    if (!source || !lut || this.loading() || !this.canExport()) return null;
    this.commit();
    this.error.set(null);
    const revision = ++this.exportRevision;
    const controller = new AbortController();
    this.exportController = controller;
    this.exporting.set(true);
    try {
      const result = await this.images.export(
        source,
        lut,
        { ...DEFAULT_LUT_SETTINGS, intensity: 100, format: 'png' },
        controller.signal,
      );
      if (revision !== this.exportRevision || controller.signal.aborted || this.destroyed) {
        URL.revokeObjectURL(result.url);
        return null;
      }
      return this.rememberDownload('image', {
        url: result.url,
        name: `${this.stem()}.png`,
        bytes: result.bytes,
      });
    } catch (error) {
      if (revision === this.exportRevision && !controller.signal.aborted && !this.destroyed)
        this.error.set(this.message(error));
      return null;
    } finally {
      if (revision === this.exportRevision && !this.destroyed) {
        this.exporting.set(false);
        this.exportController = undefined;
      }
    }
  }

  private canExport(): boolean {
    return !this.destroyed && !this.baseLoading() && !this.baking() && !this.exporting();
  }

  private replaceDocument(next: LutEditorDocument): void {
    if (this.destroyed || !this.valid(next)) return;
    this.commit();
    const current = this.document();
    if (
      current.base === next.base &&
      current.name === next.name &&
      current.size === next.size &&
      JSON.stringify(current.settings) === JSON.stringify(next.settings)
    )
      return;
    if (this.loadKind === 'project') this.cancelDocumentLoad();
    this.pushPast(cloneEditorDocument(current));
    this.future.set([]);
    this.document.set(cloneEditorDocument(next));
    this.changed();
  }

  private valid(document: LutEditorDocument): boolean {
    try {
      validateEditorDocument(document);
      return true;
    } catch (error) {
      this.error.set(this.message(error));
      return false;
    }
  }

  private pushPast(document: LutEditorDocument): void {
    this.past.update((entries) => [...entries, document].slice(-HISTORY_LIMIT));
  }

  private changed(): void {
    this.error.set(null);
    this.invalidateExports();
    this.scheduleBake();
  }

  private async loadDocument(
    kind: 'base' | 'project',
    load: (signal: AbortSignal) => Promise<LutEditorDocument>,
    baseOnly = false,
  ): Promise<void> {
    if (this.destroyed) return;
    this.cancelDocumentLoad();
    const revision = this.loadRevision;
    const controller = new AbortController();
    this.loadController = controller;
    this.loadKind = kind;
    this.baseLoading.set(true);
    this.error.set(null);
    this.invalidateExports();
    try {
      const document = await load(controller.signal);
      if (revision !== this.loadRevision || controller.signal.aborted || this.destroyed) return;
      // Ordinary color changes made during a base download remain the latest settings.
      const next = baseOnly ? { ...this.document(), base: document.base } : document;
      this.loadKind = undefined;
      this.replaceDocument(next);
    } catch (error) {
      if (revision === this.loadRevision && !controller.signal.aborted && !this.destroyed)
        this.error.set(this.message(error));
    } finally {
      if (revision === this.loadRevision && !this.destroyed) {
        this.baseLoading.set(false);
        this.loadController = undefined;
        this.loadKind = undefined;
      }
    }
  }

  private cancelDocumentLoad(): void {
    this.loadRevision++;
    this.loadController?.abort();
    this.loadController = undefined;
    this.loadKind = undefined;
    this.baseLoading.set(false);
  }

  private async loadSource(load: () => Promise<LutSource>): Promise<void> {
    if (this.destroyed) return;
    const revision = ++this.sourceRevision;
    this.loading.set(true);
    this.error.set(null);
    this.invalidateExports();
    try {
      const source = await load();
      if (revision !== this.sourceRevision || this.destroyed) {
        this.images.release(source);
        return;
      }
      this.cancelPreview();
      this.clearPreviews();
      const previous = this.source();
      this.source.set(source);
      if (previous) this.images.release(previous);
      if (this.bakedLut() && !this.baking()) this.schedulePreview();
      else if (!this.baking()) this.scheduleBake();
    } catch (error) {
      if (revision === this.sourceRevision && !this.destroyed) this.error.set(this.message(error));
    } finally {
      if (revision === this.sourceRevision && !this.destroyed) this.loading.set(false);
    }
  }

  private scheduleBake(): void {
    this.cancelBake();
    this.cancelPreview();
    if (this.destroyed) return;
    this.bakedLut.set(null);
    this.baking.set(true);
    const revision = this.bakeRevision;
    const document = cloneEditorDocument(this.document());
    this.bakeTimer = setTimeout(() => {
      this.bakeTimer = undefined;
      void this.runBake(document, revision);
    }, 100);
  }

  private async runBake(document: LutEditorDocument, revision: number): Promise<void> {
    const controller = new AbortController();
    this.bakeController = controller;
    try {
      const lut = await this.service.bake(document, controller.signal);
      if (revision !== this.bakeRevision || controller.signal.aborted || this.destroyed) return;
      this.bakedLut.set(lut);
      this.baking.set(false);
      this.schedulePreview();
    } catch (error) {
      if (revision === this.bakeRevision && !controller.signal.aborted && !this.destroyed)
        this.error.set(this.message(error));
    } finally {
      if (revision === this.bakeRevision && !this.destroyed) {
        this.baking.set(false);
        this.bakeController = undefined;
      }
    }
  }

  private cancelBake(): void {
    this.bakeRevision++;
    this.bakeController?.abort();
    this.bakeController = undefined;
    if (this.bakeTimer !== undefined) clearTimeout(this.bakeTimer);
    this.bakeTimer = undefined;
    this.baking.set(false);
  }

  private schedulePreview(): void {
    this.cancelPreview();
    const source = this.source();
    const lut = this.bakedLut();
    if (!source || !lut || this.baking() || this.destroyed) return;
    this.previewing.set(true);
    void this.runPreview(source, lut, this.previewRevision);
  }

  private async runPreview(source: LutSource, lut: Lut3D, revision: number): Promise<void> {
    const controller = new AbortController();
    this.previewController = controller;
    try {
      const preview = await this.images.preview(source, lut, 100, controller.signal);
      if (revision !== this.previewRevision || controller.signal.aborted || this.destroyed) {
        this.releasePreview(preview);
        return;
      }
      this.clearPreviews();
      this.originalPreviewUrl.set(preview.originalUrl);
      this.previewUrl.set(preview.url);
    } catch (error) {
      if (revision === this.previewRevision && !controller.signal.aborted && !this.destroyed)
        this.error.set(this.message(error));
    } finally {
      if (revision === this.previewRevision && !this.destroyed) {
        this.previewing.set(false);
        this.previewController = undefined;
      }
    }
  }

  private cancelPreview(): void {
    this.previewRevision++;
    this.previewController?.abort();
    this.previewController = undefined;
    this.previewing.set(false);
  }

  private clearPreviews(): void {
    const original = this.originalPreviewUrl();
    const preview = this.previewUrl();
    if (original) URL.revokeObjectURL(original);
    if (preview && preview !== original) URL.revokeObjectURL(preview);
    this.originalPreviewUrl.set(null);
    this.previewUrl.set(null);
  }

  private releasePreview(preview: LutPreview): void {
    URL.revokeObjectURL(preview.originalUrl);
    if (preview.url !== preview.originalUrl) URL.revokeObjectURL(preview.url);
  }

  private invalidateExports(): void {
    this.exportRevision++;
    this.exportController?.abort();
    this.exportController = undefined;
    this.exporting.set(false);
    for (const download of this.downloads.values()) URL.revokeObjectURL(download.url);
    this.downloads.clear();
  }

  private keepDownload(
    kind: 'cube' | 'project' | 'image',
    blob: Blob,
    name: string,
  ): EditorDownload {
    return this.rememberDownload(kind, { url: URL.createObjectURL(blob), name, bytes: blob.size });
  }

  private rememberDownload(
    kind: 'cube' | 'project' | 'image',
    download: EditorDownload,
  ): EditorDownload {
    const previous = this.downloads.get(kind);
    if (previous) URL.revokeObjectURL(previous.url);
    this.downloads.set(kind, download);
    return download;
  }

  private stem(): string {
    return (
      this.document()
        .name.replace(/[^\p{L}\p{N}_-]/gu, '-')
        .slice(0, 80) || 'My-LUT'
    );
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  }
}
