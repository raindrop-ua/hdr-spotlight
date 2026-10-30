import { inject, Service } from '@angular/core';
import { createLutTransform } from '@features/lut/engine/apply-lut';
import { parseCube } from '@features/lut/engine/cube';
import { createPresetLut, LUT_PRESETS, LutPreset } from '@features/lut/engine/presets';
import { Lut3D, LutPixels } from '@features/lut/models/lut.model';
import {
  LutPreview,
  LutResult,
  LutSettings,
  LutSource,
} from '@features/lut/models/lut-workspace.model';
import { MAX_IMAGE_FILE_BYTES } from '@shared/images/constants/image-limits';
import { dimensionsError } from '@shared/images/utils/image-geometry';
import { WebpEncoderService } from '@shared/images/services/webp-encoder.service';

@Service()
export class LutService {
  private readonly webpEncoder = inject(WebpEncoderService);
  private readonly presetCache = new Map<LutPreset, Lut3D>();

  async loadPreset(preset: Exclude<LutPreset, 'original'>, signal: AbortSignal): Promise<Lut3D> {
    signal.throwIfAborted();
    if (preset === 'warm' || preset === 'cool' || preset === 'soft') {
      return createPresetLut(preset);
    }
    const definition = LUT_PRESETS.find((item) => item.id === preset);
    if (!definition?.asset) throw new Error('Unknown LUT preset.');
    const cached = this.presetCache.get(preset);
    if (cached) return cached;
    const response = await fetch(definition.asset, { signal });
    signal.throwIfAborted();
    if (!response.ok) throw new Error(`Could not load ${definition.name}. Please try again.`);
    const text = await response.text();
    signal.throwIfAborted();
    const lut = { ...parseCube(text, definition.name), title: definition.name };
    this.presetCache.set(preset, lut);
    return lut;
  }

  async load(file: File): Promise<LutSource> {
    if (!/\.(png|jpe?g|webp)$/i.test(file.name) && !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      throw new Error('Choose a PNG, JPEG or WebP image.');
    }
    if (file.size > MAX_IMAGE_FILE_BYTES) throw new Error('Choose an image smaller than 32 MB.');
    const url = URL.createObjectURL(file);
    let image: ImageBitmap | HTMLImageElement | undefined;
    try {
      try {
        image = await createImageBitmap(file);
      } catch {
        const element = new Image();
        element.src = url;
        await element.decode();
        image = element;
      }
      const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
      const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
      const error = dimensionsError({ width, height });
      if (error) throw new Error(error);
      return { image, url, name: file.name, width, height, bytes: file.size, demo: false };
    } catch (error) {
      URL.revokeObjectURL(url);
      if (image && 'close' in image) image.close();
      if (error instanceof DOMException || error instanceof ReferenceError) {
        throw new Error('Could not read this image. Try another PNG, JPEG or WebP.', {
          cause: error,
        });
      }
      throw error;
    }
  }

  async loadDemo(): Promise<LutSource> {
    const image = new Image();
    image.src = '/images/lut-demo.jpg';
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const error = dimensionsError({ width, height });
    if (error) throw new Error(error);
    return {
      image,
      url: image.src,
      name: 'Neutral still life.jpg',
      width,
      height,
      bytes: 0,
      demo: true,
    };
  }

  release(source: LutSource): void {
    if (!source.demo) URL.revokeObjectURL(source.url);
    if ('close' in source.image) source.image.close();
  }

  async loadLut(file: File): Promise<Lut3D> {
    if (!/\.cube$/i.test(file.name)) throw new Error('Choose a 3D LUT in .cube format.');
    if (file.size > 16 * 1024 * 1024) throw new Error('Choose a LUT smaller than 16 MB.');
    return parseCube(await file.text(), file.name.replace(/\.cube$/i, ''));
  }

  async preview(
    source: LutSource,
    lut: Lut3D | null,
    intensity: number,
    signal: AbortSignal,
  ): Promise<LutPreview> {
    signal.throwIfAborted();
    const scale = Math.min(1, 1200 / Math.max(source.width, source.height));
    const { canvas, context } = this.canvas(
      source,
      Math.max(1, Math.round(source.width * scale)),
      Math.max(1, Math.round(source.height * scale)),
    );
    const original = await this.blob(canvas, 'image/png');
    signal.throwIfAborted();
    if (lut && intensity > 0) {
      const image = await this.transform(
        context.getImageData(0, 0, canvas.width, canvas.height),
        lut,
        intensity,
        signal,
      );
      context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
    }
    signal.throwIfAborted();
    const processed = lut && intensity > 0 ? await this.blob(canvas, 'image/png') : original;
    signal.throwIfAborted();
    const originalUrl = URL.createObjectURL(original);
    return {
      originalUrl,
      url: processed === original ? originalUrl : URL.createObjectURL(processed),
    };
  }

  async export(
    source: LutSource,
    lut: Lut3D | null,
    settings: LutSettings,
    signal: AbortSignal,
  ): Promise<LutResult> {
    this.validateSettings(settings);
    signal.throwIfAborted();
    const { canvas, context } = this.canvas(source, source.width, source.height);
    if (lut && settings.intensity > 0) {
      const image = await this.transform(
        context.getImageData(0, 0, canvas.width, canvas.height),
        lut,
        settings.intensity,
        signal,
      );
      context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
    }
    signal.throwIfAborted();
    // Keep the selected JPEG background out of the creative LUT transform.
    if (settings.format === 'jpeg') {
      context.globalCompositeOperation = 'destination-over';
      context.fillStyle = settings.background;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.globalCompositeOperation = 'source-over';
    }
    const mime = `image/${settings.format}`;
    let blob = await this.blob(canvas, mime, settings.quality / 100);
    signal.throwIfAborted();
    if (settings.format === 'webp' && blob.type !== mime) {
      blob = await this.webpEncoder.encode(
        context.getImageData(0, 0, canvas.width, canvas.height),
        settings.quality,
      );
      signal.throwIfAborted();
    }
    if (blob.type !== mime) throw new Error('This output format is unavailable in your browser.');
    const stem =
      source.name
        .replace(/\.[^.]+$/, '')
        .replace(/[^\p{L}\p{N}_-]/gu, '-')
        .slice(0, 80) || 'image';
    return {
      url: URL.createObjectURL(blob),
      name: `${stem}-lut.${settings.format === 'jpeg' ? 'jpg' : settings.format}`,
      width: source.width,
      height: source.height,
      bytes: blob.size,
      format: settings.format,
    };
  }

  private canvas(source: LutSource, width: number, height: number) {
    const error = dimensionsError({ width, height });
    if (error) throw new Error(error);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
    if (!context) throw new Error('Your browser could not create an image canvas.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source.image, 0, 0, width, height);
    return { canvas, context };
  }

  private blob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Export failed. Try a smaller image.'))),
        type,
        quality,
      );
    });
  }

  private validateSettings(settings: LutSettings): void {
    if (!Number.isFinite(settings.intensity) || settings.intensity < 0 || settings.intensity > 100)
      throw new Error('LUT intensity must be between 0 and 100%.');
    if (!Number.isInteger(settings.quality) || settings.quality < 1 || settings.quality > 100)
      throw new Error('Quality must be a whole number between 1 and 100.');
    if (!['png', 'jpeg', 'webp'].includes(settings.format))
      throw new Error('Choose an output format.');
    if (!/^#[\da-f]{6}$/i.test(settings.background))
      throw new Error('Choose a valid background color.');
  }

  private async transform(
    image: LutPixels,
    lut: Lut3D,
    intensity: number,
    signal: AbortSignal,
  ): Promise<LutPixels> {
    signal.throwIfAborted();
    let worker: Worker | undefined;
    if (typeof Worker !== 'undefined') {
      try {
        worker = new Worker(new URL('../engine/lut.worker', import.meta.url), { type: 'module' });
      } catch {
        // A blocked or unavailable Worker can still use the same pixel engine in strips.
      }
    }
    if (worker) {
      const runningWorker = worker;
      return new Promise((resolve, reject) => {
        const clean = () => {
          runningWorker.terminate();
          signal.removeEventListener('abort', abort);
        };
        const abort = () => {
          clean();
          reject(new DOMException('Image processing cancelled', 'AbortError'));
        };
        signal.addEventListener('abort', abort, { once: true });
        runningWorker.onmessage = ({
          data,
        }: MessageEvent<{ image: LutPixels } | { error: string }>) => {
          clean();
          if ('error' in data) reject(new Error(data.error));
          else resolve(data.image);
        };
        runningWorker.onerror = () => {
          clean();
          reject(new Error('Image worker failed. Reload and try again.'));
        };
        try {
          runningWorker.postMessage({ image, lut, intensity }, [image.data.buffer]);
        } catch (error) {
          clean();
          reject(error);
        }
      });
    }
    const transform = createLutTransform(lut, intensity);
    for (let y = 0; y < image.height; y += 16) {
      signal.throwIfAborted();
      const height = Math.min(16, image.height - y);
      transform({
        width: image.width,
        height,
        data: image.data.subarray(y * image.width * 4, (y + height) * image.width * 4),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    signal.throwIfAborted();
    return image;
  }
}
