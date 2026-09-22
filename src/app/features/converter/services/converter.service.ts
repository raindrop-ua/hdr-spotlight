import { inject, Injectable } from '@angular/core';
import { ConversionSettings } from '@features/converter/models/conversion-settings.model';
import { ConversionSource, ConversionResult } from '@features/converter/models/conversion.models';
import { FORMATS } from '@features/converter/models/conversion-format';
import { targetDimensions } from '@features/converter/utils/conversion-dimensions';
import { dimensionsError, imagePlacement } from '@shared/images/utils/image-geometry';
import { ICON_SIZES, packIco } from '@shared/images/codecs/ico';
import { packBmp } from '@shared/images/codecs/bmp';
import { MAX_IMAGE_FILE_BYTES } from '@shared/images/constants/image-limits';
import { WebpEncoderService } from '@shared/images/services/webp-encoder.service';

@Injectable({ providedIn: 'root' })
export class ConverterService {
  private readonly webpEncoder = inject(WebpEncoderService);

  async load(file: File): Promise<ConversionSource> {
    if (
      !/\.(png|jpe?g|webp|gif|bmp|ico|avif|svg)$/i.test(file.name) &&
      !/^image\/(png|jpeg|webp|gif|bmp|x-ms-bmp|x-icon|vnd.microsoft.icon|avif|svg\+xml)$/.test(
        file.type,
      )
    )
      throw new Error('Choose a PNG, JPEG, WebP, GIF, BMP, ICO, AVIF or SVG image.');
    if (file.size > MAX_IMAGE_FILE_BYTES) throw new Error('Choose an image smaller than 32 MB.');
    const url = URL.createObjectURL(file);
    let image: ImageBitmap | HTMLImageElement | undefined;
    try {
      // ImageBitmap freezes animated inputs to a single frame.
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
      return { image, url, name: file.name, bytes: file.size, width, height };
    } catch (error) {
      URL.revokeObjectURL(url);
      if (image && 'close' in image) image.close();
      if (error instanceof DOMException || error instanceof ReferenceError)
        throw new Error(
          'This image could not be decoded. Try another file or a format supported by your browser.',
          { cause: error },
        );
      throw error;
    }
  }

  release(source: ConversionSource): void {
    URL.revokeObjectURL(source.url);
    if ('close' in source.image) source.image.close();
  }

  async convert(source: ConversionSource, settings: ConversionSettings): Promise<ConversionResult> {
    const { width, height } = targetDimensions(source, settings);
    const error = dimensionsError({ width, height });
    if (error) throw new Error(error);
    if (!Number.isFinite(settings.quality) || settings.quality < 1 || settings.quality > 100)
      throw new Error('Quality must be between 1 and 100.');
    if (settings.format === 'ico' && !ICON_SIZES.includes(settings.iconSize))
      throw new Error('Choose a supported icon size.');
    const format = FORMATS.find((item) => item.id === settings.format)!;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not create an image canvas.');
    try {
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      if (settings.format === 'jpeg' || settings.format === 'bmp') {
        context.fillStyle = settings.background;
        context.fillRect(0, 0, width, height);
      }
      if (settings.format === 'ico') {
        const placement = imagePlacement(source, { width, height }, true);
        context.drawImage(
          source.image,
          placement.x,
          placement.y,
          placement.width,
          placement.height,
        );
      } else context.drawImage(source.image, 0, 0, width, height);
      let blob: Blob;
      if (settings.format === 'bmp') blob = packBmp(context.getImageData(0, 0, width, height));
      else if (settings.format === 'ico') {
        const png = await this.blob(canvas, 'image/png');
        blob = packIco(new Uint8Array(await png.arrayBuffer()), width);
      } else {
        blob = await this.blob(canvas, format.mime, settings.quality / 100);
        if (settings.format === 'webp' && blob.type !== format.mime) {
          blob = await this.webpEncoder.encode(
            context.getImageData(0, 0, width, height),
            settings.quality,
          );
        }
        if (blob.type !== format.mime)
          throw new Error(`Your browser cannot export ${format.label}. Choose another format.`);
      }
      const stem = source.name.replace(/\.[^.]+$/, '').slice(0, 100) || 'image';
      return {
        url: URL.createObjectURL(blob),
        name: `${stem}-converted.${format.extension}`,
        bytes: blob.size,
        width,
        height,
      };
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  private blob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error('Could not encode this image. Try a smaller output size.')),
        mime,
        quality,
      ),
    );
  }
}
