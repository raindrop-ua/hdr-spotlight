import { codeToNits, nitsToCode, pqEOTF, pqOETF, stopsToNits } from '@features/bench/engine/color';
import { encodeToPQ } from '@features/bench/engine/encoder';
import { embedICCProfile, embedPNGCICP, crc32 } from '@features/bench/engine/container';
import { buildICCProfile, CICP } from '@features/bench/engine/icc';

const text = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');

describe('HDR encoding', () => {
  it('round-trips absolute luminance through ST 2084', () => {
    for (const nits of [0, 203, 1000, 3030, 10000]) {
      expect(pqEOTF(pqOETF(nits / 10000)) * 10000).toBeCloseTo(nits, 5);
    }
    expect(stopsToNits(0)).toBe(203);
    expect(stopsToNits(3)).toBe(1624);
  });

  it('boosts neutral whites while keeping black black and reporting coverage', () => {
    const image = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]),
    };
    const stats = encodeToPQ(image, { stops: 3, mode: 'whites', threshold: 0.85, dither: false });
    expect(Array.from(image.data.slice(0, 3))).toEqual([
      nitsToCode(1624),
      nitsToCode(1624),
      nitsToCode(1624),
    ]);
    expect(Array.from(image.data.slice(4, 8))).toEqual([0, 0, 0, 255]);
    expect(stats.litFraction).toBe(0.5);
    expect(stats.clippedFraction).toBe(0);
    expect(stats.peakNits).toBeCloseTo(1624, 1);
  });

  it('does not lift saturated colors in whites mode', () => {
    const original = { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) };
    const boosted = { ...original, data: original.data.slice() };
    encodeToPQ(original, { stops: 0, mode: 'all', threshold: 0.85, dither: false });
    encodeToPQ(boosted, { stops: 4, mode: 'whites', threshold: 0.85, dither: false });
    expect(boosted.data).toEqual(original.data);
  });

  it('lifts bright tints in bright mode but not in whites mode', () => {
    const tint = new Uint8ClampedArray([255, 255, 120, 255]);
    const whites = { width: 1, height: 1, data: tint.slice() };
    const bright = { width: 1, height: 1, data: tint.slice() };
    const options = { stops: 3, threshold: 0.85, dither: false };
    const whiteStats = encodeToPQ(whites, { ...options, mode: 'whites' });
    const brightStats = encodeToPQ(bright, { ...options, mode: 'bright' });
    expect(brightStats.peakNits).toBeGreaterThan(whiteStats.peakNits * 4);
  });

  it('preserves every alpha value without changing the PQ transform of RGB', () => {
    const data = new Uint8ClampedArray([255, 255, 255, 0, 255, 255, 255, 128, 255, 255, 255, 255]);
    const transparent = { width: 3, height: 1, data: data.slice() };
    const opaque = { ...transparent, data: data.slice() };
    const options = { stops: 3, mode: 'all' as const, threshold: 0.85, dither: false };
    const stats = encodeToPQ(transparent, { ...options, preserveTransparency: true });
    encodeToPQ(opaque, options);
    for (let i = 0; i < data.length; i += 4) {
      expect(transparent.data[i + 3]).toBe(data[i + 3]);
      expect(transparent.data.slice(i, i + 3)).toEqual(opaque.data.slice(i, i + 3));
      expect(opaque.data[i + 3]).toBe(255);
    }
    expect(stats.litFraction).toBeCloseTo((1 + 128 / 255) / 3, 8);
  });

  it('ignores invisible RGB in peak and clipping measurements', () => {
    const image = { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 0]) };
    const stats = encodeToPQ(image, {
      stops: 8,
      mode: 'all',
      threshold: 0.85,
      preserveTransparency: true,
    });
    expect(stats).toEqual({ peakNits: 0, litFraction: 0, clippedFraction: 0 });
    expect(image.data[3]).toBe(0);
  });

  it('clamps extreme highlights and reports clipping', () => {
    const image = { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) };
    const stats = encodeToPQ(image, { stops: 8, mode: 'all', threshold: 0.85, dither: false });
    expect(stats.clippedFraction).toBe(1);
    expect(codeToNits(image.data[0])).toBeCloseTo(10000, 3);
  });
});

describe('HDR metadata', () => {
  it('builds a valid ICC header and CICP 9/16/0/1 tag', () => {
    const profile = buildICCProfile();
    const view = new DataView(profile.buffer);
    expect(view.getUint32(0)).toBe(profile.length);
    expect(Array.from(profile.slice(8, 12))).toEqual([4, 64, 0, 0]);
    expect(text(profile.slice(36, 40))).toBe('acsp');
    const count = view.getUint32(128);
    let found = false;
    for (let i = 0; i < count; i++) {
      const row = 132 + i * 12;
      if (text(profile.slice(row, row + 4)) === 'cicp') {
        const offset = view.getUint32(row + 4);
        expect(Array.from(profile.slice(offset + 8, offset + 12))).toEqual([9, 16, 0, 1]);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('replaces foreign JPEG metadata, embeds ICC once and preserves scan bytes', () => {
    const scan = new Uint8Array([255, 218, 0, 2, 1, 2, 3, 255, 217]);
    const jpeg = new Uint8Array([
      255,
      216,
      255,
      225,
      0,
      4,
      88,
      89,
      255,
      226,
      0,
      4,
      90,
      90,
      ...scan,
    ]);
    const profile = buildICCProfile();
    const output = embedICCProfile(jpeg, profile);
    expect(output.slice(-scan.length)).toEqual(scan);
    expect(text(output).match(/ICC_PROFILE/g)?.length).toBe(1);
    expect(embedICCProfile(output, profile)).toEqual(output);
    expect(() => embedICCProfile(new Uint8Array([0, 1]), profile)).toThrow('Not a JPEG');
  });

  it('writes PNG CICP after IHDR with a correct CRC and preserves other bytes', () => {
    const png = new Uint8Array([
      137,
      80,
      78,
      71,
      13,
      10,
      26,
      10,
      0,
      0,
      0,
      13,
      73,
      72,
      68,
      82,
      ...new Array(17).fill(0),
      7,
      8,
      9,
    ]);
    const output = embedPNGCICP(png, CICP);
    expect(output.slice(0, 33)).toEqual(png.slice(0, 33));
    expect(text(output.slice(37, 41))).toBe('cICP');
    expect(Array.from(output.slice(41, 45))).toEqual([9, 16, 0, 1]);
    expect(new DataView(output.buffer).getUint32(45)).toBe(crc32(output.slice(37, 45)));
    expect(output.slice(49)).toEqual(png.slice(33));
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});
