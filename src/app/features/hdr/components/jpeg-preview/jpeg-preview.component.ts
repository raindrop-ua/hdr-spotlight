import {
  Component,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { EncodeResult, JpegExport } from '@features/hdr/models/bench.models';
import { ImageSource } from '@shared/images/models/image-source.model';
import { ImageEncoderService } from '@features/hdr/services/image-encoder.service';

@Component({
  selector: 'app-jpeg-preview',
  imports: [DecimalPipe],
  templateUrl: './jpeg-preview.component.html',
  styleUrl: './jpeg-preview.component.css',
})
export class JpegPreview implements OnDestroy {
  readonly result = input.required<EncodeResult>();
  readonly source = input.required<ImageSource>();
  readonly applied = output<JpegExport>();
  private readonly encoder = inject(ImageEncoderService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private session?: AbortController;
  private request?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private prepared?: ReturnType<ImageEncoderService['prepareJpeg']>;
  protected readonly candidate = signal<JpegExport | null>(null);
  protected readonly quality = signal(100);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly zoom = signal<0 | 0.5 | 1>(0);

  protected open(): void {
    this.quality.set(this.result().settings.jpegQuality);
    this.releaseCandidate();
    this.zoom.set(0);
    this.error.set('');
    this.session = new AbortController();
    this.dialog().nativeElement.showModal();
  }

  protected change(event: Event): void {
    const quality = Number((event.target as HTMLInputElement).value);
    this.quality.set(quality);
    clearTimeout(this.timer);
    this.request?.abort();
    this.error.set('');
    if (quality === (this.candidate()?.quality ?? this.result().settings.jpegQuality)) {
      this.busy.set(false);
      return;
    }
    this.busy.set(true);
    const request = new AbortController();
    this.request = request;
    this.timer = setTimeout(() => void this.refresh(quality, request), 250);
  }

  private async refresh(quality: number, request: AbortController): Promise<void> {
    try {
      this.prepared ??= this.encoder.prepareJpeg(
        this.source(),
        this.result().settings,
        this.session!.signal,
      );
      const encode = await this.prepared;
      request.signal.throwIfAborted();
      const jpeg = await encode(quality, request.signal);
      if (request.signal.aborted) {
        URL.revokeObjectURL(jpeg.url);
        return;
      }
      this.releaseCandidate();
      this.candidate.set(jpeg);
    } catch (error) {
      if (!request.signal.aborted) {
        this.prepared = undefined;
        this.error.set(
          error instanceof Error ? error.message : 'Could not update the preview. Try again.',
        );
      }
    } finally {
      if (this.request === request) this.busy.set(false);
    }
  }

  protected apply(): void {
    if (this.busy() || this.error()) return;
    const candidate = this.candidate();
    this.candidate.set(null); // Ownership of this URL passes to BenchStore.
    this.close();
    if (candidate) this.applied.emit(candidate);
  }

  protected close(): void {
    this.dialog().nativeElement.close();
    this.cleanup();
  }

  protected cancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  protected cleanup(): void {
    clearTimeout(this.timer);
    this.session?.abort();
    this.request?.abort();
    this.request = undefined;
    this.prepared = undefined;
    // Keep the last preview mounted for the CSS exit transition.
    this.busy.set(false);
  }

  private releaseCandidate(): void {
    const candidate = this.candidate();
    if (candidate) URL.revokeObjectURL(candidate.url);
    this.candidate.set(null);
  }

  ngOnDestroy(): void {
    this.cleanup();
    this.releaseCandidate();
  }
}
