import { concatBytes, embedICCProfile, embedPNGCICP } from './container';
import { CICP } from './icc';

const png = (): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=',
    ),
    (ch) => ch.charCodeAt(0),
  );
const scan = new Uint8Array([255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 4, 5, 255, 0, 6, 255, 217]);
const jpeg = (...segments: Uint8Array[]): Uint8Array<ArrayBuffer> =>
  concatBytes([new Uint8Array([255, 216]), ...segments, scan]);
const profile = new Uint8Array([1, 2, 3]);

describe('PNG metadata boundaries', () => {
  it('replaces existing and duplicate cICP chunks and preserves other bytes', () => {
    const source = png();
    const first = embedPNGCICP(source, { ...CICP, transferCharacteristics: 18 });
    const duplicate = concatBytes([
      first.subarray(0, 49),
      first.subarray(33, 49),
      first.subarray(49),
    ]);
    const expected = embedPNGCICP(source, CICP);
    expect(embedPNGCICP(first, CICP)).toEqual(expected);
    expect(embedPNGCICP(duplicate, CICP)).toEqual(expected);
    expect(embedPNGCICP(expected, CICP)).toEqual(expected);
    expect(expected.subarray(49)).toEqual(source.subarray(33));
  });

  it('supports input views with a nonzero byte offset', () => {
    const source = png();
    const padded = concatBytes([new Uint8Array(7), source, new Uint8Array(3)]);
    expect(embedPNGCICP(padded.subarray(7, 7 + source.length), CICP)).toEqual(
      embedPNGCICP(source, CICP),
    );
  });

  it('rejects a truncated stream at every byte boundary', () => {
    const source = png();
    for (let end = 0; end < source.length; end++) {
      expect(() => embedPNGCICP(source.subarray(0, end), CICP)).toThrow();
    }
  });

  it('rejects invalid signatures, lengths, chunk order and trailing bytes', () => {
    const signature = png();
    signature[0] = 0;
    const huge = png();
    new DataView(huge.buffer).setUint32(8, 0xffffffff);
    const ihdr = png();
    ihdr[15] = 0;
    const duplicate = concatBytes([png().subarray(0, 33), png().subarray(8)]);
    const noData = concatBytes([png().subarray(0, 33), png().subarray(-12)]);
    const trailing = concatBytes([png(), new Uint8Array([0])]);
    for (const invalid of [signature, huge, ihdr, duplicate, noData, trailing]) {
      expect(() => embedPNGCICP(invalid, CICP)).toThrow();
    }
  });

  it.each([
    { colorPrimaries: -1 },
    { transferCharacteristics: 256 },
    { colorPrimaries: 1.5 },
    { transferCharacteristics: NaN },
    { matrixCoefficients: 1 },
    { videoFullRangeFlag: 2 },
  ])('rejects code points that cannot be represented by PNG cICP: %j', (patch) => {
    expect(() => embedPNGCICP(png(), { ...CICP, ...patch })).toThrow(RangeError);
  });
});

describe('JPEG metadata boundaries', () => {
  it('preserves fill bytes, standalone markers, JFIF and scan data', () => {
    const jfif = new Uint8Array([255, 255, 224, 0, 4, 4, 2]);
    const standalone = new Uint8Array([255, 1]);
    const source = jpeg(jfif, standalone);
    const output = embedICCProfile(source, profile);
    expect(output.subarray(0, 2 + jfif.length + standalone.length)).toEqual(
      source.subarray(0, 2 + jfif.length + standalone.length),
    );
    expect(output.subarray(-scan.length)).toEqual(scan);
    expect(embedICCProfile(output, profile)).toEqual(output);
  });

  it.each([
    [255, 216],
    [255, 216, 255],
    [255, 216, 0],
    [255, 216, 255, 225],
    [255, 216, 255, 225, 0],
    [255, 216, 255, 225, 0, 1],
    [255, 216, 255, 225, 255, 255],
    [255, 216, 255, 0],
    [255, 216, 255, 217],
  ])('rejects malformed JPEG headers: %j', (...bytes) => {
    expect(() => embedICCProfile(new Uint8Array(bytes), profile)).toThrow();
  });

  it('rejects a truncated scan header and missing end marker', () => {
    const source = jpeg();
    expect(() => embedICCProfile(source.subarray(0, 7), profile)).toThrow();
    expect(() => embedICCProfile(source.subarray(0, -2), profile)).toThrow();
  });

  it('splits a large ICC profile with correct sequence numbers and lengths', () => {
    const icc = new Uint8Array(70000);
    for (let i = 0; i < icc.length; i++) icc[i] = i & 255;
    const output = embedICCProfile(jpeg(), icc);
    const view = new DataView(output.buffer);
    const chunks: Uint8Array[] = [];
    let offset = 2;
    for (let sequence = 1; sequence <= 2; sequence++) {
      expect(Array.from(output.subarray(offset, offset + 2))).toEqual([255, 226]);
      const length = view.getUint16(offset + 2);
      expect(output[offset + 16]).toBe(sequence);
      expect(output[offset + 17]).toBe(2);
      chunks.push(output.subarray(offset + 18, offset + 2 + length));
      offset += 2 + length;
    }
    expect(concatBytes(chunks)).toEqual(icc);
    expect(output.subarray(offset)).toEqual(scan);
    expect(() => embedICCProfile(jpeg(), new Uint8Array())).toThrow(RangeError);
    expect(() => embedICCProfile(jpeg(), new Uint8Array(65519 * 255 + 1))).toThrow(RangeError);
  });
});
