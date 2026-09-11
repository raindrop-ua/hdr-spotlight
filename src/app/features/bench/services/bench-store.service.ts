import { SourceImage } from '@features/bench/models/source-image.model';
import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import {
  DEFAULT_SETTINGS,
  EncodeResult,
  EncodeSettings,
} from '@features/bench/models/bench.models';
import { ImageEncoderService } from '@features/bench/services/image-encoder.service';

@Injectable()
export class BenchStore implements OnDestroy {
  private readonly encoder = inject(ImageEncoderService);
  private generation = 0;
  private controller?: AbortController;
  readonly source = signal<SourceImage | null>(null);
  readonly result = signal<EncodeResult | null>(null);
  readonly settings = signal<EncodeSettings>({ ...DEFAULT_SETTINGS });
  readonly loading = signal(false);
  readonly encoding = signal(false);
  readonly error = signal('');
  readonly busy = computed(() => this.loading() || this.encoding());

  async load(file: File): Promise<void> {
    const version = ++this.generation;
    this.controller?.abort();
    this.encoding.set(false);
    this.loading.set(true);
    this.error.set('');
    try {
      const source = await this.encoder.load(file);
      if (version !== this.generation) {
        URL.revokeObjectURL(source.url);
        return;
      }
      this.clearResult();
      const previous = this.source();
      if (previous) URL.revokeObjectURL(previous.url);
      this.source.set(source);
    } catch (error) {
      if (version === this.generation) this.error.set(this.message(error));
    } finally {
      if (version === this.generation) this.loading.set(false);
    }
  }

  update(patch: Partial<EncodeSettings>): void {
    this.controller?.abort();
    this.encoding.set(false);
    this.settings.update((current) => ({ ...current, ...patch }));
    this.clearResult();
    this.error.set('');
  }

  reset(): void {
    this.update({ ...DEFAULT_SETTINGS });
  }

  async encode(): Promise<void> {
    const source = this.source();
    if (!source || this.busy()) return;
    const controller = new AbortController();
    this.controller = controller;
    this.encoding.set(true);
    this.error.set('');
    try {
      const result = await this.encoder.encode(source, { ...this.settings() }, controller.signal);
      if (controller.signal.aborted) {
        this.release(result);
        return;
      }
      this.clearResult();
      this.result.set(result);
    } catch (error) {
      if (!controller.signal.aborted) this.error.set(this.message(error));
    } finally {
      if (this.controller === controller) this.encoding.set(false);
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  }

  private release(result: EncodeResult): void {
    URL.revokeObjectURL(result.jpegUrl);
    URL.revokeObjectURL(result.pngUrl);
  }

  private clearResult(): void {
    const result = this.result();
    if (result) this.release(result);
    this.result.set(null);
  }

  ngOnDestroy(): void {
    ++this.generation;
    this.controller?.abort();
    this.clearResult();
    const source = this.source();
    if (source) URL.revokeObjectURL(source.url);
  }
}
