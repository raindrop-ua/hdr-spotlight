import { Format } from '@features/converter/models/conversion-format';

export interface ConversionSettings {
  format: Format;
  quality: number;
  resize: boolean;
  width: number;
  height: number;
  locked: boolean;
  iconSize: number;
  background: string;
}
