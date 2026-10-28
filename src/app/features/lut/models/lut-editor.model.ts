import type { Lut3D } from './lut.model';

export type CurveChannel = 'master' | 'red' | 'green' | 'blue';
/** Five output values at input positions 0, .25, .5, .75 and 1. */
export type EditorCurves = Record<CurveChannel, number[]>;

export interface ToneSettings {
  hue: number;
  saturation: number;
}

export interface LutEditorSettings {
  baseIntensity: number;
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  shadows: ToneSettings;
  midtones: ToneSettings;
  highlights: ToneSettings;
  curves: EditorCurves;
}

export interface LutEditorDocument {
  name: string;
  size: 33 | 65;
  base: Lut3D | null;
  settings: LutEditorSettings;
}

export interface EditorDownload {
  url: string;
  name: string;
  bytes: number;
}

export const CURVE_CHANNELS: readonly CurveChannel[] = ['master', 'red', 'green', 'blue'];
export const IDENTITY_CURVE: readonly number[] = [0, 0.25, 0.5, 0.75, 1];

export function createEditorDocument(): LutEditorDocument {
  return {
    name: 'My LUT',
    size: 33,
    base: null,
    settings: {
      baseIntensity: 100,
      exposure: 0,
      contrast: 0,
      saturation: 100,
      temperature: 0,
      tint: 0,
      shadows: { hue: 190, saturation: 0 },
      midtones: { hue: 35, saturation: 0 },
      highlights: { hue: 45, saturation: 0 },
      curves: {
        master: [...IDENTITY_CURVE],
        red: [...IDENTITY_CURVE],
        green: [...IDENTITY_CURVE],
        blue: [...IDENTITY_CURVE],
      },
    },
  };
}

/** Base tables are immutable; history copies only editable settings. */
export function cloneEditorDocument(document: LutEditorDocument): LutEditorDocument {
  return {
    ...document,
    settings: {
      ...document.settings,
      shadows: { ...document.settings.shadows },
      midtones: { ...document.settings.midtones },
      highlights: { ...document.settings.highlights },
      curves: {
        master: [...document.settings.curves.master],
        red: [...document.settings.curves.red],
        green: [...document.settings.curves.green],
        blue: [...document.settings.curves.blue],
      },
    },
  };
}
