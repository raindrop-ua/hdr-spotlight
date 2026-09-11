import { SourceImage } from '@features/bench/models/source-image.model';
import { Service } from '@angular/core';
import { embedICCProfile, embedPNGCICP } from '@features/bench/engine/container';
import { encodeToPQ } from '@features/bench/engine/encoder';
import type {
  EncodeWorkerRequest,
  EncodeWorkerResponse,
  EncodeWorkerResult,
} from '@features/bench/engine/encoder-worker.models';
import { buildICCProfile, CICP } from '@features/bench/engine/icc';
import {
  EncodeResult,
  EncodeSettings,
  EncodeStats,
  PixelImage,
} from '@features/bench/models/bench.models';

const MAX_PIXELS = 16_777_216;

@Service()
export class ImageEncoderService {
  private readonly profile = buildICCProfile();

  async load(file: File): Promise<SourceImage> {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
      throw new Error('Choose a PNG, JPEG, WebP or SVG image.');
    }
    if (file.size > 32 * 1024 * 1024) throw new Error('Choose an image smaller than 32 MB.');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height)
        throw new Error('This image has no dimensions. Give the SVG a width and height.');
      if (width * height > MAX_PIXELS || Math.max(width, height) > 16384) {
        throw new Error('Image is too large. Use up to 16 megapixels and 16,384 pixels per side.');
      }
      return { image, url, width, height, name: file.name };
    } catch (error) {
      URL.revokeObjectURL(url);
      if (error instanceof DOMException)
        throw new Error('Could not read this image. Try another file.', { cause: error });
      throw error;
    }
  }

  async encode(
    source: SourceImage,
    settings: EncodeSettings,
    signal: AbortSignal,
  ): Promise<EncodeResult> {
    const width = settings.size || source.width;
    const height = settings.size || source.height;
    // Composite JPEG before the color transform; compositing PQ values would darken edges.
    const jpegRender = await this.render(
      source,
      { ...settings, preserveTransparency: false },
      signal,
    );
    const canvas = jpegRender.canvas;
    const jpegBlob = await this.blob(canvas, 'image/jpeg');
    signal.throwIfAborted();
    const jpeg = embedICCProfile(new Uint8Array(await jpegBlob.arrayBuffer()), this.profile);
    const pngRender = settings.preserveTransparency
      ? await this.render(source, settings, signal)
      : jpegRender;
    const pngBlob = await this.blob(pngRender.canvas, 'image/png');
    signal.throwIfAborted();
    const png = embedPNGCICP(new Uint8Array(await pngBlob.arrayBuffer()), CICP);
    signal.throwIfAborted();
    const name =
      source.name
        .replace(/\.[^.]+$/, '')
        .replace(/[^\p{L}\p{N}_-]/gu, '-')
        .slice(0, 80) || 'image';
    return {
      jpegUrl: URL.createObjectURL(new Blob([jpeg], { type: 'image/jpeg' })),
      pngUrl: URL.createObjectURL(new Blob([png], { type: 'image/png' })),
      width,
      height,
      bytes: settings.preserveTransparency ? png.length : jpeg.length,
      settings: { ...settings },
      stats: pngRender.stats,
      name: `${name}-hdr-${settings.stops.toFixed(1)}stops`,
    };
  }

  private async render(source: SourceImage, settings: EncodeSettings, signal: AbortSignal) {
    signal.throwIfAborted();
    const width = settings.size || source.width;
    const height = settings.size || source.height;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
    if (!ctx) throw new Error('Your browser could not create an image canvas.');
    if (!settings.preserveTransparency) {
      ctx.fillStyle = settings.background;
      ctx.fillRect(0, 0, width, height);
    }
    const scale = Math.min(width / source.width, height / source.height);
    const dw = source.width * scale;
    const dh = source.height * scale;
    ctx.drawImage(source.image, (width - dw) / 2, (height - dh) / 2, dw, dh);
    const transformed = await this.transform(
      ctx.getImageData(0, 0, width, height),
      settings,
      signal,
    );
    signal.throwIfAborted();
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(transformed.image.data), width, height),
      0,
      0,
    );
    return { canvas, stats: transformed.stats };
  }

  downloadProfile(): void {
    const url = URL.createObjectURL(
      new Blob([this.profile], { type: 'application/vnd.iccprofile' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Rec2020-PQ.icc';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private blob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => {
          if (blob && blob.type === type) resolve(blob);
          else reject(new Error('Export failed. Try a smaller output size.'));
        },
        type,
        1,
      ),
    );
  }

  private async transform(
    image: PixelImage,
    settings: EncodeSettings,
    signal: AbortSignal,
  ): Promise<EncodeWorkerResult> {
    signal.throwIfAborted();
    if (typeof Worker !== 'undefined') {
      const worker = new Worker(new URL('../engine/encoder.worker', import.meta.url), {
        type: 'module',
      });
      return new Promise((resolve, reject) => {
        const clean = () => {
          worker.terminate();
          signal.removeEventListener('abort', abort);
        };
        const abort = () => {
          clean();
          reject(new DOMException('Encoding cancelled', 'AbortError'));
        };
        signal.addEventListener('abort', abort, { once: true });
        worker.onmessage = ({ data }: MessageEvent<EncodeWorkerResponse>): void => {
          clean();
          if ('error' in data) reject(new Error(data.error));
          else resolve(data);
        };
        worker.onerror = () => {
          clean();
          reject(new Error('Image worker failed. Reload and try again.'));
        };
        worker.postMessage({ image, settings } satisfies EncodeWorkerRequest, [image.data.buffer]);
      });
    }
    // Yield between strips on browsers without workers. Strip height preserves the Bayer phase.
    const stats: EncodeStats = { peakNits: 0, litFraction: 0, clippedFraction: 0 };
    for (let y = 0; y < image.height; y += 16) {
      signal.throwIfAborted();
      const height = Math.min(16, image.height - y);
      const strip = {
        width: image.width,
        height,
        data: image.data.subarray(y * image.width * 4, (y + height) * image.width * 4),
      };
      const result = encodeToPQ(strip, settings);
      stats.peakNits = Math.max(stats.peakNits, result.peakNits);
      stats.litFraction += (result.litFraction * height) / image.height;
      stats.clippedFraction += (result.clippedFraction * height) / image.height;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return { image, stats };
  }
}
