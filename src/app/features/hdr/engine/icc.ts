// Build a BT.2020/PQ display profile with both sampled tone curves and explicit CICP signaling.
import { pqEOTF } from './color';
import type { Cicp } from '@features/hdr/models/bench.models';

type XYZ = readonly [x: number, y: number, z: number];
type FourBytes = readonly [number, number, number, number];
type TagSignature =
  'desc' | 'cicp' | 'wtpt' | 'rXYZ' | 'gXYZ' | 'bXYZ' | 'rTRC' | 'gTRC' | 'bTRC' | 'cprt';
type ProfileTag = readonly [signature: TagSignature, bytes: readonly number[]];
type TagLocation = readonly [offset: number, size: number];

const TRC_SAMPLES = 1024;

// BT.2020 colorants adapted from D65 to the ICC D50 connection space.
const COLORANTS = {
  rXYZ: [0.673515, 0.279059, -0.001932],
  gXYZ: [0.165697, 0.675318, 0.029978],
  bXYZ: [0.125083, 0.045623, 0.797059],
} as const satisfies Record<'rXYZ' | 'gXYZ' | 'bXYZ', XYZ>;
const D50: XYZ = [0.9642, 1.0, 0.82491];

// BT.2020 primaries, ST 2084 transfer, RGB matrix and full-range code values.
export const CICP = Object.freeze({
  colorPrimaries: 9,
  transferCharacteristics: 16,
  matrixCoefficients: 0,
  videoFullRangeFlag: 1,
} as const satisfies Cicp);

export const PROFILE_DESCRIPTION = 'Rec2020 Gamut with PQ Transfer';

const sig = (s: string): FourBytes => [
  s.charCodeAt(0),
  s.charCodeAt(1),
  s.charCodeAt(2),
  s.charCodeAt(3),
];
// ICC integers are big-endian; signed fixed-point values retain their two's-complement bits.
const u32 = (n: number): FourBytes => [
  (n >>> 24) & 255,
  (n >>> 16) & 255,
  (n >>> 8) & 255,
  n & 255,
];
const s15Fixed16 = (x: number): FourBytes => u32(Math.round(x * 65536) >>> 0);

function xyzType([x, y, z]: XYZ): number[] {
  return [...sig('XYZ '), 0, 0, 0, 0, ...s15Fixed16(x), ...s15Fixed16(y), ...s15Fixed16(z)];
}

function mlucType(text: string): number[] {
  // One en-US record; text starts after the 16-byte header and 12-byte record.
  const utf16: number[] = [];
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    utf16.push((c >> 8) & 255, c & 255);
  }
  return [
    ...sig('mluc'),
    0,
    0,
    0,
    0,
    ...u32(1),
    ...u32(12),
    ...sig('enUS'),
    ...u32(utf16.length),
    ...u32(28),
    ...utf16,
  ];
}

function curvTypePQ(samples: number = TRC_SAMPLES): number[] {
  const out = [...sig('curv'), 0, 0, 0, 0, ...u32(samples)];
  for (let i = 0; i < samples; i++) {
    const y = Math.min(1, Math.max(0, pqEOTF(i / (samples - 1))));
    const v = Math.round(y * 65535);
    out.push((v >> 8) & 255, v & 255);
  }
  return out;
}

function cicpType(): number[] {
  return [
    ...sig('cicp'),
    0,
    0,
    0,
    0,
    CICP.colorPrimaries,
    CICP.transferCharacteristics,
    CICP.matrixCoefficients,
    CICP.videoFullRangeFlag,
  ];
}

export function buildICCProfile(): Uint8Array<ArrayBuffer> {
  const trc = curvTypePQ();

  const tags: readonly ProfileTag[] = [
    ['desc', mlucType(PROFILE_DESCRIPTION)],
    ['cicp', cicpType()],
    ['wtpt', xyzType(D50)],
    ['rXYZ', xyzType(COLORANTS.rXYZ)],
    ['gXYZ', xyzType(COLORANTS.gXYZ)],
    ['bXYZ', xyzType(COLORANTS.bXYZ)],
    ['rTRC', trc],
    ['gTRC', trc],
    ['bTRC', trc],
    ['cprt', mlucType('Public Domain')],
  ];

  const count = tags.length;
  const headerAndTable = 128 + 4 + count * 12;
  const bodyStart = headerAndTable + ((4 - (headerAndTable % 4)) % 4);

  const table: number[] = [];
  const body: number[] = [];
  const shared = new Map<TagSignature | 'trc', TagLocation>();

  for (const [name, data] of tags) {
    // The three TRC tags are identical; the spec lets them share one offset.
    const key: TagSignature | 'trc' = name.endsWith('TRC') ? 'trc' : name;
    let entry = shared.get(key);
    if (!entry) {
      entry = [bodyStart + body.length, data.length];
      body.push(...data);
      // Tag sizes exclude padding; the next payload must start on a 4-byte boundary.
      while (body.length % 4) body.push(0);
      shared.set(key, entry);
    }
    table.push(...sig(name), ...u32(entry[0]), ...u32(entry[1]));
  }

  const total = bodyStart + body.length;
  const header = new Array<number>(128).fill(0);
  const put = (offset: number, bytes: readonly number[]): void =>
    bytes.forEach((b, i) => {
      header[offset + i] = b;
    });

  put(0, u32(total));
  put(8, [0x04, 0x40, 0, 0]); // v4.4 — the version that defines `cicp`
  put(12, sig('mntr')); // display device class
  put(16, sig('RGB '));
  put(20, sig('XYZ '));
  put(24, [0x07, 0xea, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0]); // fixed date, for byte-stable output
  put(36, sig('acsp'));
  put(64, u32(0)); // perceptual rendering intent
  put(68, [...s15Fixed16(D50[0]), ...s15Fixed16(D50[1]), ...s15Fixed16(D50[2])]);

  const pad = new Array<number>(bodyStart - headerAndTable).fill(0);
  return new Uint8Array([...header, ...u32(count), ...table, ...pad, ...body]);
}
