/**
 * Builds a "Rec2020 Gamut with PQ Transfer" ICC v4.4 display profile.
 *
 * Two things make this work where a plain PQ profile fails:
 *
 *  1. The `cicp` tag (ICC v4.4, ICC.1:2022). Without it, a color manager sees
 *     an ordinary tone curve, applies it, reads ~0.3, and paints mid-grey — the
 *     "dim, badly rendered result" the W3C HDR report describes. With it,
 *     Blink's color library recognizes BT.2020 + ST 2084 and switches the
 *     image to an HDR pipeline.
 *  2. It is an ICC profile at all. LinkedIn's re-encode discards gain maps,
 *     MPF segments, and XMP, but preserves color management — so the HDR has
 *     to travel inside the profile, or it does not travel.
 *
 * Verified byte-for-byte against an Apple-generated profile pulled from a live
 * glowing logo: same description, same CICP values, same colorants to four
 * decimal places. Apple ships an A2B0/B2A0 LUT pipeline where this uses TRC
 * curves, which is why theirs is ~9 KB and this is ~2.5 KB.
 */

import { pqEOTF } from './color';

const TRC_SAMPLES = 1024;

/** BT.2020 primaries, Bradford-adapted to the D50 profile connection space. */
const COLORANTS = {
  rXYZ: [0.673515, 0.279059, -0.001932],
  gXYZ: [0.165697, 0.675318, 0.029978],
  bXYZ: [0.125083, 0.045623, 0.797059],
};
const D50 = [0.9642, 1.0, 0.82491];

/** CICP code points: BT.2020 primaries / ST 2084 / RGB / full range. */
export const CICP = Object.freeze({
  colorPrimaries: 9,
  transferCharacteristics: 16,
  matrixCoefficients: 0,
  videoFullRangeFlag: 1,
});

export const PROFILE_DESCRIPTION = 'Rec2020 Gamut with PQ Transfer';

const sig = (s: string) => [s.charCodeAt(0), s.charCodeAt(1), s.charCodeAt(2), s.charCodeAt(3)];
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const s15Fixed16 = (x: number) => u32(Math.round(x * 65536) >>> 0);

function xyzType([x, y, z]: number[]) {
  return [...sig('XYZ '), 0, 0, 0, 0, ...s15Fixed16(x), ...s15Fixed16(y), ...s15Fixed16(z)];
}

function mlucType(text: string) {
  const utf16 = [];
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

function curvTypePQ(samples = TRC_SAMPLES) {
  const out = [...sig('curv'), 0, 0, 0, 0, ...u32(samples)];
  for (let i = 0; i < samples; i++) {
    const y = Math.min(1, Math.max(0, pqEOTF(i / (samples - 1))));
    const v = Math.round(y * 65535);
    out.push((v >> 8) & 255, v & 255);
  }
  return out;
}

function cicpType() {
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

/**
 * @returns {Uint8Array} a complete ICC profile ready to embed.
 */
export function buildICCProfile() {
  const trc = curvTypePQ();

  const tags: [string, number[]][] = [
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

  const table = [];
  const body = [];
  const shared = new Map<string, number[]>();

  for (const [name, data] of tags) {
    // The three TRC tags are identical; the spec lets them share one offset.
    const key = name.endsWith('TRC') ? 'trc' : name;
    let entry = shared.get(key);
    if (!entry) {
      entry = [bodyStart + body.length, data.length];
      body.push(...data);
      while (body.length % 4) body.push(0);
      shared.set(key, entry);
    }
    table.push(...sig(name), ...u32(entry[0]), ...u32(entry[1]));
  }

  const total = bodyStart + body.length;
  const header = new Array(128).fill(0);
  const put = (offset: number, bytes: number[]) =>
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

  const pad = new Array(bodyStart - headerAndTable).fill(0);
  return new Uint8Array([...header, ...u32(count), ...table, ...pad, ...body]);
}
