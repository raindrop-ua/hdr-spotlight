import { createEditorDocument, cloneEditorDocument } from '@features/lut/models/lut-editor.model';
import type { Lut3D } from '@features/lut/models/lut.model';
import { applyLut } from './apply-lut';
import { createFloatLutSampler } from './float-lut-sampler';
import { bakeEditorLut, evaluateCurve, validateEditorDocument } from './editor-transform';

function node(lut: Lut3D, r: number, g = r, b = r): number[] {
  const index = (r + g * lut.size + b * lut.size ** 2) * 3;
  return Array.from(lut.values.subarray(index, index + 3));
}

describe('SDR LUT editor float pipeline', () => {
  it('creates exact identity nodes at both supported export resolutions', () => {
    for (const size of [33, 65] as const) {
      const document = createEditorDocument();
      document.size = size;
      const lut = bakeEditorLut(document);
      expect(lut.values).toHaveLength(size ** 3 * 3);
      expect(node(lut, 0)).toEqual([0, 0, 0]);
      expect(node(lut, size - 1)).toEqual([1, 1, 1]);
      expect(node(lut, 1, 0, 0)).toEqual([1 / (size - 1), 0, 0]);
      expect(node(lut, 0, 1, 0)).toEqual([0, 1 / (size - 1), 0]);
      expect(node(lut, 0, 0, 1)).toEqual([0, 0, 1 / (size - 1)]);
    }
  });

  it('retains fractional base LUT nodes instead of passing through an 8-bit image', () => {
    const base = bakeEditorLut(createEditorDocument());
    for (let index = 0; index < base.values.length; index++) base.values[index] *= 0.9137;
    const document = createEditorDocument();
    document.base = base;
    expect(bakeEditorLut(document).values).toEqual(base.values);
    document.settings.baseIntensity = 0;
    expect(node(bakeEditorLut(document), 16)).toEqual([0.5, 0.5, 0.5]);
    document.settings.baseIntensity = 50;
    expect(node(bakeEditorLut(document), 16)[0]).toBeCloseTo((0.5 + base.values[16 * 3]) / 2, 6);
  });

  it('applies exposure in linear light and saturation around neutral gray', () => {
    const document = createEditorDocument();
    document.settings.exposure = 1;
    const brighter = node(bakeEditorLut(document), 8);
    expect(brighter[0]).toBeCloseTo(0.3521, 3);
    expect(brighter[1]).toBe(brighter[0]);
    expect(brighter[2]).toBe(brighter[0]);
    document.settings.exposure = 0;
    document.settings.saturation = 0;
    const neutral = node(bakeEditorLut(document), 24, 16, 8);
    expect(neutral[0]).toBeCloseTo(neutral[1], 7);
    expect(neutral[1]).toBeCloseTo(neutral[2], 7);
  });

  it('separates warm/cool controls, tonal hues and channel curves', () => {
    const document = createEditorDocument();
    document.settings.temperature = 100;
    const warm = node(bakeEditorLut(document), 16);
    expect(warm[0]).toBeGreaterThan(warm[1]);
    expect(warm[1]).toBeGreaterThan(warm[2]);
    document.settings.temperature = 0;
    document.settings.shadows = { hue: 190, saturation: 50 };
    const shadow = node(bakeEditorLut(document), 8);
    expect(shadow[2]).toBeGreaterThan(shadow[0]);
    document.settings.shadows.saturation = 0;
    document.settings.curves.red = [0, 0.0625, 0.25, 0.5625, 1];
    expect(node(bakeEditorLut(document), 16)).toEqual([0.25, 0.5, 0.5]);
  });

  it('keeps extreme supported settings finite and bounded and leaves source alpha intact', () => {
    const document = createEditorDocument();
    Object.assign(document.settings, {
      exposure: 3,
      contrast: 100,
      temperature: -100,
      tint: 100,
      saturation: 200,
    });
    document.settings.highlights = { hue: 360, saturation: 100 };
    document.settings.curves.master = [1, 0.2, 0.8, 0.1, 0];
    const lut = bakeEditorLut(document);
    expect(lut.values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(
      true,
    );
    const image = { width: 1, height: 1, data: new Uint8ClampedArray([93, 136, 177, 117]) };
    applyLut(image, lut, 100);
    expect(image.data[3]).toBe(117);
  });

  it('uses float tetrahedral sampling consistently with final image rendering and input domains', () => {
    const lut = bakeEditorLut(createEditorDocument());
    const output = new Float64Array(3);
    const sample = createFloatLutSampler(lut);
    for (const rgb of [
      [180, 90, 30],
      [180, 30, 90],
      [90, 30, 180],
      [30, 90, 180],
      [30, 180, 90],
      [90, 180, 30],
    ]) {
      sample(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, output);
      const image = { width: 1, height: 1, data: new Uint8ClampedArray([...rgb, 255]) };
      applyLut(image, lut, 100);
      expect(Array.from(image.data.slice(0, 3))).toEqual(
        Array.from(output, (value) => Math.round(value * 255)),
      );
    }
    lut.domainMin = [-1, 0, 0];
    lut.domainMax = [1, 2, 1];
    createFloatLutSampler(lut)(0, 1, 0.5, output);
    expect(Array.from(output)).toEqual([0.5, 0.5, 0.5]);
  });

  it('creates independent editable settings while sharing immutable base tables', () => {
    const original = createEditorDocument();
    original.base = bakeEditorLut(original);
    const copy = cloneEditorDocument(original);
    copy.settings.curves.master[2] = 0.8;
    copy.settings.shadows.saturation = 50;
    expect(original.settings.curves.master[2]).toBe(0.5);
    expect(original.settings.shadows.saturation).toBe(0);
    expect(copy.base).toBe(original.base);
  });

  it('rejects invalid settings before baking and sanitizes exported titles', () => {
    for (const patch of [{ exposure: 4 }, { contrast: Infinity }, { baseIntensity: -1 }]) {
      const document = createEditorDocument();
      Object.assign(document.settings, patch);
      expect(() => validateEditorDocument(document)).toThrow();
    }
    const document = createEditorDocument();
    document.settings.curves.master = [0, 1];
    expect(() => bakeEditorLut(document)).toThrow('five');
    const titled = createEditorDocument();
    titled.name = 'My "look"\nLUT_3D_SIZE 2';
    expect(bakeEditorLut(titled).title).not.toMatch(/["\n]/);
  });
});

describe('five point editor curves', () => {
  it('interpolates identity exactly, passes through nodes and preserves local extrema', () => {
    for (let i = 0; i <= 100; i++)
      expect(evaluateCurve([0, 0.25, 0.5, 0.75, 1], i / 100)).toBeCloseTo(i / 100, 12);
    const points = [0.1, 0.8, 0.2, 0.9, 0.4];
    for (let i = 0; i < points.length; i++)
      expect(evaluateCurve(points, i / 4)).toBeCloseTo(points[i], 12);
    for (let i = 0; i <= 400; i++) {
      const x = i / 400;
      const segment = Math.min(3, Math.floor(x * 4));
      const y = evaluateCurve(points, x);
      expect(y).toBeGreaterThanOrEqual(Math.min(points[segment], points[segment + 1]));
      expect(y).toBeLessThanOrEqual(Math.max(points[segment], points[segment + 1]));
    }
  });
});
