import { ImageDimensions } from './image-dimensions.model';

export interface ImageSource<
  T extends CanvasImageSource = HTMLImageElement,
> extends ImageDimensions {
  name: string;
  url: string;
  image: T;
}
