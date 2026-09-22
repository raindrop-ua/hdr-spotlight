import { ConversionSettings } from '@features/converter/models/conversion-settings.model';

export const DEFAULT_CONVERSION: ConversionSettings = {
  format: 'webp',
  quality: 85,
  resize: false,
  width: 1024,
  height: 1024,
  locked: true,
  iconSize: 256,
  background: '#ffffff',
};
