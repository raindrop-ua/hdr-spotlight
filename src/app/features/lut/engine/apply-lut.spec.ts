import type { Lut3D, LutPixels } from '@features/lut/models/lut.model';
import { applyLut, createLutTransform } from './apply-lut';
import { createPresetLut } from './presets';

function table(map: (r: number, g: number, b: number) => number[]): Lut3D {
  const rows: number[] = [];
  for (let b = 0; b <= 1; b++) {
    for (let g = 0; g <= 1; g++) {
      for (let r = 0; r <= 1; r++) rows.push(...map(r, g, b));
    }
  }
  return {
    title: 'Test',
    size: 2,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    values: new Float32Array(rows),
  };
}

const image = (data: number[]): LutPixels => ({
  width: data.length / 4,
  height: 1,
  data: new Uint8ClampedArray(data),
});

describe('SDR 3D LUT application', () => {
  it('keeps all identity RGB values and alpha levels byte-exact', () => {
    const original: number[] = [];
    for (let value = 0; value < 256; value++) {
      original.push(value, (value * 37) % 256, (value * 71) % 256, value);
    }
    const pixels = image(original);
    applyLut(
      pixels,
      table((r, g, b) => [r, g, b]),
      100,
    );
    expect(Array.from(pixels.data)).toEqual(original);
  });

  it('maps channels in red-fast table order, including cube boundaries', () => {
    const pixels = image([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 255, 255, 255, 1]);
    applyLut(
      pixels,
      table((r, g, b) => [b, r, g]),
      100,
    );
    expect(Array.from(pixels.data)).toEqual([
      0, 255, 0, 255, 0, 0, 255, 128, 255, 0, 0, 0, 255, 255, 255, 1,
    ]);
  });

  it('uses tetrahedral rather than trilinear interpolation in every tetrahedron', () => {
    const corners = table((r, g, b) => [r * g * b, r * g * b, r * g * b]);
    for (const rgb of [
      [204, 153, 51],
      [204, 51, 153],
      [153, 51, 204],
      [51, 153, 204],
      [51, 204, 153],
      [153, 204, 51],
      [128, 128, 128],
    ]) {
      const pixels = image([...rgb, 100]);
      applyLut(pixels, corners, 100);
      const minimum = Math.min(...rgb);
      expect(Array.from(pixels.data)).toEqual([minimum, minimum, minimum, 100]);
    }
  });

  it('blends intensity with original encoded sRGB and preserves alpha', () => {
    const pixels = image([10, 80, 180, 42]);
    const white = table(() => [1, 1, 1]);
    applyLut(pixels, white, 0);
    expect(Array.from(pixels.data)).toEqual([10, 80, 180, 42]);
    applyLut(pixels, white, 50);
    expect(Array.from(pixels.data)).toEqual([133, 168, 218, 42]);
  });

  it('normalizes each declared domain and clamps inputs outside its boundaries', () => {
    const lut = table((r, g, b) => [r, g, b]);
    lut.domainMin = [0.2, -1, 0];
    lut.domainMax = [0.8, 1, 2];
    const pixels = image([0, 0, 255, 128, 255, 255, 0, 0]);
    applyLut(pixels, lut, 100);
    expect(Array.from(pixels.data)).toEqual([0, 128, 128, 128, 255, 255, 0, 0]);
  });

  it('clamps finite LUT output to the SDR range', () => {
    const pixels = image([20, 20, 20, 255]);
    applyLut(
      pixels,
      table(() => [-0.2, 0.5, 1.2]),
      100,
    );
    expect(Array.from(pixels.data)).toEqual([0, 128, 255, 255]);
  });

  it('matches whole-image processing when a prepared transform is reused for strips', () => {
    const source = image([80, 140, 220, 50, 200, 10, 100, 100, 0, 255, 128, 255]);
    const whole = { ...source, data: source.data.slice() };
    const lut = createPresetLut('soft');
    applyLut(whole, lut, 72);
    const transform = createLutTransform(lut, 72);
    for (let pixel = 0; pixel < source.data.length; pixel += 4) {
      transform({ width: 1, height: 1, data: source.data.subarray(pixel, pixel + 4) });
    }
    expect(source.data).toEqual(whole.data);
    expect(() => transform({ width: 2, height: 1, data: new Uint8ClampedArray(4) })).toThrow(
      'RGBA',
    );
    expect(() => createLutTransform(lut, NaN)).toThrow('intensity');
  });

  it('rejects invalid buffers, dimensions, intensity, tables and domains before mutation', () => {
    const identity = table((r, g, b) => [r, g, b]);
    for (const intensity of [-1, 101, NaN, Infinity]) {
      expect(() => applyLut(image([0, 0, 0, 255]), identity, intensity)).toThrow('intensity');
    }
    for (const pixels of [
      { width: 0, height: 1, data: new Uint8ClampedArray() },
      { width: 1.5, height: 1, data: new Uint8ClampedArray(6) },
      { width: 1, height: 1, data: new Uint8ClampedArray(3) },
      { width: 16385, height: 1, data: new Uint8ClampedArray(16385 * 4) },
    ]) {
      expect(() => applyLut(pixels, identity, 100)).toThrow('RGBA');
    }
    for (const lut of [
      { ...identity, size: 66 },
      { ...identity, values: new Float32Array(3) },
      { ...identity, values: new Float32Array(identity.values).fill(NaN) },
      { ...identity, domainMax: [0, 1, 1] as const },
      { ...identity, domainMin: [NaN, 0, 0] as const },
    ]) {
      expect(() => applyLut(image([0, 0, 0, 255]), lut, 100)).toThrow('3D LUT');
    }
  });

  it('provides bounded, distinct built-in looks that retain alpha', () => {
    const outputs = new Set<string>();
    for (const preset of ['warm', 'cool', 'soft'] as const) {
      const lut = createPresetLut(preset);
      const pixels = image([150, 140, 130, 192]);
      applyLut(pixels, lut, 100);
      expect(pixels.data[3]).toBe(192);
      expect(lut.values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(
        true,
      );
      outputs.add(Array.from(pixels.data).join(','));
    }
    expect(outputs.size).toBe(3);
  });
});
