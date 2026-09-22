import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WebpEncoderService {
  private ready?: Promise<unknown>;

  async encode(image: ImageData, quality: number): Promise<Blob> {
    const { default: encode, init } = await import('@jsquash/webp/encode');
    await (this.ready ??= init({
      locateFile: (path: string) => `/assets/codecs/${path}`,
    }).catch((error: unknown) => {
      this.ready = undefined;
      throw error;
    }));
    return new Blob([await encode(image, { quality })], { type: 'image/webp' });
  }
}
