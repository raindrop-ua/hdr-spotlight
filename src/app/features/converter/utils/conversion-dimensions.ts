import { ImageDimensions } from '@shared/images/models/image-dimensions.model';
import { ConversionSettings } from '@features/converter/models/conversion-settings.model';

export function targetDimensions(
  source: ImageDimensions,
  settings: ConversionSettings,
): ImageDimensions {
  if (settings.format === 'ico') return { width: settings.iconSize, height: settings.iconSize };
  return settings.resize ? { width: settings.width, height: settings.height } : source;
}
