import { ImageSource } from '@shared/images/models/image-source.model';
import { ImageDimensions } from '@shared/images/models/image-dimensions.model';

export interface ConversionSource extends ImageSource<ImageBitmap | HTMLImageElement> {
  bytes: number;
}
export interface ConversionResult extends ImageDimensions {
  url: string;
  name: string;
  bytes: number;
}
