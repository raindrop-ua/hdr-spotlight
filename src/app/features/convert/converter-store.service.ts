import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  ConversionSettings,
  DEFAULT_CONVERSION,
  dimensionsError,
  linkedDimensions,
  targetDimensions,
} from './conversion';
import { ConversionResult, ConversionSource, ConverterService } from './converter.service';

@Injectable()
export class ConverterStore {
  private readonly converter = inject(ConverterService);
  readonly source = signal<ConversionSource | null>(null);
  readonly result = signal<ConversionResult | null>(null);
  readonly settings = signal<ConversionSettings>({ ...DEFAULT_CONVERSION });
  readonly loading = signal(false);
  readonly converting = signal(false);
  readonly error = signal('');
  readonly dimensions = computed(() =>
    targetDimensions(this.source() ?? this.settings(), this.settings()),
  );
  readonly sizeError = computed(() => dimensionsError(this.dimensions()));
  readonly lossy = computed(() => ['jpeg', 'webp'].includes(this.settings().format));
  private revision = 0;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.revision++;
      const source = this.source();
      if (source) this.converter.release(source);
      this.clearResult();
    });
  }

  async load(file: File): Promise<void> {
    const revision = ++this.revision;
    this.loading.set(true);
    this.converting.set(false);
    this.error.set('');
    this.clearResult();
    const previous = this.source();
    this.source.set(null);
    if (previous) this.converter.release(previous);
    try {
      const source = await this.converter.load(file);
      if (revision !== this.revision || this.destroyed) {
        this.converter.release(source);
        return;
      }
      this.source.set(source);
      this.settings.update((settings) => ({
        ...settings,
        width: source.width,
        height: source.height,
      }));
    } catch (error) {
      if (revision === this.revision) this.error.set(this.message(error));
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }

  update(patch: Partial<ConversionSettings>): void {
    this.settings.update((settings) => ({ ...settings, ...patch }));
    this.revision++;
    this.converting.set(false);
    this.error.set('');
    this.clearResult();
  }

  dimension(side: 'width' | 'height', value: number): void {
    const source = this.source();
    this.update(
      this.settings().locked && source ? linkedDimensions(source, side, value) : { [side]: value },
    );
  }

  lock(locked: boolean): void {
    const source = this.source();
    this.update({
      locked,
      ...(locked && source ? linkedDimensions(source, 'width', this.settings().width) : {}),
    });
  }

  async convert(): Promise<void> {
    const source = this.source();
    if (!source || this.loading() || this.converting() || this.sizeError()) return;
    const revision = ++this.revision;
    this.converting.set(true);
    this.error.set('');
    this.clearResult();
    try {
      const result = await this.converter.convert(source, { ...this.settings() });
      if (revision !== this.revision || this.destroyed) URL.revokeObjectURL(result.url);
      else this.result.set(result);
    } catch (error) {
      if (revision === this.revision) this.error.set(this.message(error));
    } finally {
      if (revision === this.revision) this.converting.set(false);
    }
  }

  private clearResult(): void {
    const result = this.result();
    if (result) URL.revokeObjectURL(result.url);
    this.result.set(null);
  }
  private message(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Something went wrong. Please try another image.';
  }
}
