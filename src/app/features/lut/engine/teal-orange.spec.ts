import { applyLut } from './apply-lut';
import { adjustLutSaturation, createTealOrangeLut } from './teal-orange';
import type { Lut3D } from '@features/lut/models/lut.model';

const lut = createTealOrangeLut();

function transform(rgb: number[], intensity = 100, alpha = 173): number[] {
  const image = { width: 1, height: 1, data: new Uint8ClampedArray([...rgb, alpha]) };
  applyLut(image, lut, intensity);
  return Array.from(image.data);
}

// Orange samples have r > g > b, so this measures their position in that hue sector.
const orangeHue = ([r, g, b]: number[]): number => ((g - b) / (r - b)) * 60;

const luma = (rgb: ArrayLike<number>): number =>
  rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;

function colorTable(rgb: number[]): Lut3D {
  return {
    title: 'Saturation reference',
    size: 2,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    values: new Float32Array(Array.from({ length: 8 }, () => rgb).flat()),
  };
}

describe('LUT saturation tuning', () => {
  it('scales chroma by 95% or 110% while retaining encoded luma', () => {
    const original = colorTable([0.3, 0.4, 0.6]);
    const center = luma(original.values);
    for (const factor of [0.95, 1.1]) {
      const tuned = adjustLutSaturation(original, factor);
      expect(luma(tuned.values)).toBeCloseTo(center, 7);
      for (let channel = 0; channel < 3; channel++) {
        expect((tuned.values[channel] - center) / (original.values[channel] - center)).toBeCloseTo(
          factor,
          6,
        );
      }
    }
  });

  it('uses a shared gamut limit to retain hue rather than clipping individual channels', () => {
    const original = colorTable([0.9, 0.2, 0.1]);
    const tuned = adjustLutSaturation(original, 2);
    const center = luma(original.values);
    const effective = (tuned.values[0] - center) / (original.values[0] - center);
    expect(effective).toBeGreaterThan(1);
    expect(effective).toBeLessThan(2);
    expect(luma(tuned.values)).toBeCloseTo(center, 7);
    expect(Math.max(...tuned.values)).toBe(1);
    for (let channel = 0; channel < 3; channel++) {
      expect((tuned.values[channel] - center) / (original.values[channel] - center)).toBeCloseTo(
        effective,
        6,
      );
    }
    expect(tuned.values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(
      true,
    );
  });

  it('preserves neutrals, table metadata and the original input buffer', () => {
    for (const value of [0, 0.25, 0.5, 1]) {
      const original = colorTable([value, value, value]);
      const before = original.values.slice();
      const tuned = adjustLutSaturation(original, 1.1);
      expect(tuned).toMatchObject({
        title: original.title,
        size: original.size,
        domainMin: original.domainMin,
        domainMax: original.domainMax,
      });
      expect(tuned.values).not.toBe(original.values);
      expect(tuned.values).toEqual(before);
      expect(original.values).toEqual(before);
    }
  });

  it('rejects invalid saturation factors and incomplete or non-SDR tables', () => {
    const original = colorTable([0.3, 0.4, 0.6]);
    for (const factor of [-1, NaN, Infinity]) {
      expect(() => adjustLutSaturation(original, factor)).toThrow('saturation');
    }
    for (const values of [
      new Float32Array(3),
      new Float32Array(24).fill(NaN),
      new Float32Array(24).fill(1.1),
    ]) {
      expect(() => adjustLutSaturation({ ...original, values }, 0.95)).toThrow('SDR');
    }
  });

  it('defaults the Hollywood recipe to 10% more chroma without changing its luma', () => {
    const baseline = createTealOrangeLut(1);
    const tuned = createTealOrangeLut();
    // Moderate gray/tinted samples have room for the requested full 10% increase.
    for (const node of [8, 16, 24]) {
      const offset = (node + node * 33 + node * 33 ** 2) * 3;
      const rgb = baseline.values.slice(offset, offset + 3);
      const adjusted = tuned.values.slice(offset, offset + 3);
      const center = luma(rgb);
      expect(luma(adjusted)).toBeCloseTo(center, 7);
      expect(
        (Math.max(...adjusted) - Math.min(...adjusted)) / (Math.max(...rgb) - Math.min(...rgb)),
      ).toBeCloseTo(1.1, 5);
    }
  });
});

describe('original teal and orange creative look', () => {
  it('provides a bounded 33-point table with untouched black and white endpoints', () => {
    expect(lut.size).toBe(33);
    expect(lut.values).toHaveLength(33 ** 3 * 3);
    expect(lut.values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(
      true,
    );
    expect(transform([0, 0, 0])).toEqual([0, 0, 0, 173]);
    expect(transform([255, 255, 255])).toEqual([255, 255, 255, 173]);
    for (const value of [3, 252]) {
      const graded = transform([value, value, value]).slice(0, 3);
      expect(Math.max(...graded) - Math.min(...graded)).toBeLessThanOrEqual(3);
    }
  });

  it('separates cool shadows from warm light while retaining shadow detail', () => {
    const [shadowR, shadowG, shadowB] = transform([60, 60, 60]);
    const [lightR, lightG, lightB] = transform([190, 190, 190]);
    expect(shadowG - shadowR).toBeGreaterThan(5);
    expect(shadowB - shadowR).toBeGreaterThan(9);
    expect(shadowR).toBeGreaterThan(35);
    expect(lightR).toBeGreaterThan(lightG);
    expect(lightG - lightB).toBeGreaterThan(7);
    expect(lightR).toBeLessThan(220);
  });

  it('keeps orange hues recognizable across darker and lighter warm colors', () => {
    for (const original of [
      [110, 70, 45],
      [190, 136, 102],
      [230, 188, 160],
    ]) {
      const graded = transform(original);
      expect(graded[0]).toBeGreaterThan(graded[1]);
      expect(graded[1]).toBeGreaterThan(graded[2]);
      expect(Math.abs(orangeHue(graded) - orangeHue(original))).toBeLessThan(10);
    }
  });

  it('keeps the interpolated 256-step grayscale luminance monotonic', () => {
    let previous = -1;
    for (let code = 0; code <= 255; code++) {
      const [r, g, b] = transform([code, code, code]);
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      expect(luma).toBeGreaterThanOrEqual(previous);
      previous = luma;
    }
  });

  it('lets intensity soften the look while retaining the original alpha', () => {
    const original = [60, 60, 60];
    const bypass = transform(original, 0, 91);
    const half = transform(original, 50, 91);
    const full = transform(original, 100, 91);
    expect(bypass).toEqual([...original, 91]);
    expect(half).not.toEqual(bypass);
    expect(half).not.toEqual(full);
    for (let channel = 0; channel < 3; channel++) {
      expect(Math.abs(half[channel] - (original[channel] + full[channel]) / 2)).toBeLessThanOrEqual(
        1,
      );
    }
    expect(half[3]).toBe(91);
    expect(full[3]).toBe(91);
  });
});
