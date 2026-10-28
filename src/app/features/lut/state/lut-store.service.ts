import { afterNextRender, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { createPresetLut, LutPreset } from '@features/lut/engine/presets';
import { Lut3D } from '@features/lut/models/lut.model';
import {
  DEFAULT_LUT_SETTINGS,
  LutPreview,
  LutResult,
  LutSettings,
  LutSource,
} from '@features/lut/models/lut-workspace.model';
import { LutService } from '@features/lut/services/lut.service';

@Injectable()
export class LutStore {
  private readonly service = inject(LutService);
  readonly source = signal<LutSource | null>(null);
  readonly lut = signal<Lut3D | null>(null);
  readonly preset = signal<LutPreset | 'custom'>('original');
  readonly settings = signal<LutSettings>({ ...DEFAULT_LUT_SETTINGS });
  readonly originalPreviewUrl = signal<string | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly previewing = signal(false);
  readonly loading = signal(false);
  readonly lutLoading = signal(false);
  readonly exporting = signal(false);
  readonly error = signal<string | null>(null);
  readonly result = signal<LutResult | null>(null);
  private sourceRevision = 0;
  private lutRevision = 0;
  private previewRevision = 0;
  private exportRevision = 0;
  private previewController?: AbortController;
  private exportController?: AbortController;
  private previewTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  constructor() {
    afterNextRender(() => {
      if (!this.source() && !this.loading() && !this.destroyed) void this.useDemo();
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.sourceRevision++;
      this.lutRevision++;
      this.cancelPreview();
      this.invalidateExport();
      this.clearPreviews();
      const source = this.source();
      if (source) this.service.release(source);
    });
  }

  async loadImage(file: File): Promise<void> {
    await this.loadSource(() => this.service.load(file));
  }

  async useDemo(): Promise<void> {
    await this.loadSource(() => this.service.loadDemo());
  }

  async loadLut(file: File): Promise<void> {
    const revision = ++this.lutRevision;
    this.lutLoading.set(true);
    this.error.set(null);
    this.invalidateExport();
    try {
      const lut = await this.service.loadLut(file);
      if (revision !== this.lutRevision || this.destroyed) return;
      this.lut.set(lut);
      this.preset.set('custom');
      this.schedulePreview();
    } catch (error) {
      if (revision === this.lutRevision && !this.destroyed) this.error.set(this.message(error));
    } finally {
      if (revision === this.lutRevision && !this.destroyed) this.lutLoading.set(false);
    }
  }

  selectPreset(preset: LutPreset): void {
    this.lutRevision++;
    this.lutLoading.set(false);
    this.error.set(null);
    this.preset.set(preset);
    this.lut.set(preset === 'original' ? null : createPresetLut(preset));
    this.invalidateExport();
    this.schedulePreview();
  }

  update(patch: Partial<LutSettings>): void {
    const current = this.settings();
    const settings = { ...current, ...patch };
    if (!Number.isFinite(settings.intensity) || !Number.isFinite(settings.quality)) return;
    settings.intensity = Math.min(100, Math.max(0, settings.intensity));
    settings.quality = Math.round(Math.min(100, Math.max(1, settings.quality)));
    this.settings.set(settings);
    this.error.set(null);
    this.invalidateExport();
    if (settings.intensity !== current.intensity) this.schedulePreview();
  }

  async export(): Promise<void> {
    const source = this.source();
    if (!source || this.loading() || this.lutLoading() || this.exporting() || this.destroyed)
      return;
    this.invalidateExport();
    const revision = this.exportRevision;
    const controller = new AbortController();
    this.exportController = controller;
    this.exporting.set(true);
    this.error.set(null);
    try {
      const result = await this.service.export(
        source,
        this.lut(),
        { ...this.settings() },
        controller.signal,
      );
      if (revision !== this.exportRevision || controller.signal.aborted || this.destroyed) {
        URL.revokeObjectURL(result.url);
      } else this.result.set(result);
    } catch (error) {
      if (revision === this.exportRevision && !controller.signal.aborted && !this.destroyed) {
        this.error.set(this.message(error));
      }
    } finally {
      if (revision === this.exportRevision && !this.destroyed) this.exporting.set(false);
    }
  }

  private async loadSource(load: () => Promise<LutSource>): Promise<void> {
    const revision = ++this.sourceRevision;
    this.loading.set(true);
    this.error.set(null);
    this.invalidateExport();
    try {
      const source = await load();
      if (revision !== this.sourceRevision || this.destroyed) {
        this.service.release(source);
        return;
      }
      this.cancelPreview();
      this.clearPreviews();
      const previous = this.source();
      this.source.set(source);
      if (previous) this.service.release(previous);
      this.schedulePreview();
    } catch (error) {
      if (revision === this.sourceRevision && !this.destroyed) this.error.set(this.message(error));
    } finally {
      if (revision === this.sourceRevision && !this.destroyed) this.loading.set(false);
    }
  }

  private schedulePreview(): void {
    this.cancelPreview();
    const source = this.source();
    if (!source || this.destroyed) return;
    this.previewing.set(true);
    const revision = this.previewRevision;
    this.previewTimer = setTimeout(() => {
      this.previewTimer = undefined;
      void this.renderPreview(source, revision);
    }, 100);
  }

  private async renderPreview(source: LutSource, revision: number): Promise<void> {
    const controller = new AbortController();
    this.previewController = controller;
    try {
      const preview = await this.service.preview(
        source,
        this.lut(),
        this.settings().intensity,
        controller.signal,
      );
      if (revision !== this.previewRevision || controller.signal.aborted || this.destroyed) {
        this.releasePreview(preview);
        return;
      }
      this.clearPreviews();
      this.originalPreviewUrl.set(preview.originalUrl);
      this.previewUrl.set(preview.url);
    } catch (error) {
      if (revision === this.previewRevision && !controller.signal.aborted && !this.destroyed) {
        this.error.set(this.message(error));
      }
    } finally {
      if (revision === this.previewRevision && !this.destroyed) this.previewing.set(false);
    }
  }

  private cancelPreview(): void {
    this.previewRevision++;
    this.previewController?.abort();
    this.previewController = undefined;
    if (this.previewTimer !== undefined) clearTimeout(this.previewTimer);
    this.previewTimer = undefined;
    this.previewing.set(false);
  }

  private invalidateExport(): void {
    this.exportRevision++;
    this.exportController?.abort();
    this.exportController = undefined;
    this.exporting.set(false);
    const result = this.result();
    if (result) URL.revokeObjectURL(result.url);
    this.result.set(null);
  }

  private clearPreviews(): void {
    const originalUrl = this.originalPreviewUrl();
    const url = this.previewUrl();
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (url && url !== originalUrl) URL.revokeObjectURL(url);
    this.originalPreviewUrl.set(null);
    this.previewUrl.set(null);
  }

  private releasePreview(preview: LutPreview): void {
    URL.revokeObjectURL(preview.originalUrl);
    if (preview.url !== preview.originalUrl) URL.revokeObjectURL(preview.url);
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  }
}
