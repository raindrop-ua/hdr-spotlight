import type { Cicp } from '../models/bench.models';

/**
 * Container surgery.
 *
 * Canvas gives us pixels in a JPEG or PNG wrapper but no way to choose what
 * metadata rides along, so we rewrite the segment stream by hand.
 */

/** Concatenate byte arrays without spreading them as function arguments. */
export function concatBytes(parts: Uint8Array[]) {
  let length = 0;
  for (const p of parts) length += p.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const ICC_MARKER = [0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00];
const MAX_ICC_CHUNK = 65519; // 65533 segment limit minus the 14-byte ICC header

function iccSegments(icc: Uint8Array) {
  const chunks = Math.ceil(icc.length / MAX_ICC_CHUNK) || 1;
  const parts = [];
  for (let i = 0; i < chunks; i++) {
    const slice = icc.subarray(i * MAX_ICC_CHUNK, (i + 1) * MAX_ICC_CHUNK);
    const length = slice.length + 16;
    parts.push(
      new Uint8Array([0xff, 0xe2, (length >> 8) & 255, length & 255, ...ICC_MARKER, i + 1, chunks]),
      slice,
    );
  }
  return parts;
}

/**
 * Rewrite a JPEG so it carries exactly one ICC profile and nothing else.
 *
 * EXIF (APP1) and any existing ICC (APP2) are dropped: the reference file we
 * reverse-engineered had a single ICC segment and no XMP at all, and stray
 * metadata only gives a downstream re-encoder more to disagree about.
 *
 * @param {Uint8Array} jpeg
 * @param {Uint8Array} icc
 * @returns {Uint8Array}
 */
export function embedICCProfile(jpeg: Uint8Array, icc: Uint8Array) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Not a JPEG stream');

  const segments = iccSegments(icc);
  const parts: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  let inserted = false;

  const insert = () => {
    if (!inserted) {
      parts.push(...segments);
      inserted = true;
    }
  };

  let i = 2;
  while (i < jpeg.length) {
    if (jpeg[i] !== 0xff) break;
    const marker = jpeg[i + 1];

    // Standalone markers carry no payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }

    // Start of scan: everything from here is entropy-coded data.
    if (marker === 0xda) {
      insert();
      parts.push(jpeg.subarray(i));
      return concatBytes(parts);
    }

    const length = (jpeg[i + 2] << 8) | jpeg[i + 3];
    if (marker === 0xe0) {
      parts.push(jpeg.subarray(i, i + 2 + length)); // keep JFIF
    } else if (marker === 0xe1 || marker === 0xe2) {
      // drop EXIF, XMP and any foreign profile
    } else {
      insert();
      parts.push(jpeg.subarray(i, i + 2 + length));
    }
    i += 2 + length;
  }

  insert();
  return concatBytes(parts);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Insert a PNG `cICP` chunk directly after IHDR.
 *
 * PNG Third Edition signals color space with code points rather than a
 * profile, and browsers implement that path more consistently than ICC-in-JPEG.
 * We use it for the control file: same pixels, better odds of rendering, so a
 * flat-looking JPEG can be diagnosed as a viewer limitation rather than a bad
 * encoding.
 *
 * @param {Uint8Array} png
 * @param {{colorPrimaries:number,transferCharacteristics:number,matrixCoefficients:number,videoFullRangeFlag:number}} cicp
 */
export function embedPNGCICP(png: Uint8Array, cicp: Cicp) {
  const ihdrLength = ((png[8] << 24) | (png[9] << 16) | (png[10] << 8) | png[11]) >>> 0;
  const insertAt = 8 + 12 + ihdrLength;

  const payload = new Uint8Array([
    0x63,
    0x49,
    0x43,
    0x50, // 'cICP'
    cicp.colorPrimaries,
    cicp.transferCharacteristics,
    cicp.matrixCoefficients,
    cicp.videoFullRangeFlag,
  ]);

  const chunk = new Uint8Array(16);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 4);
  chunk.set(payload, 4);
  view.setUint32(12, crc32(payload));

  return concatBytes([png.subarray(0, insertAt), chunk, png.subarray(insertAt)]);
}

/** Base64 data URL, chunked so large images don't blow the argument limit. */
export function toDataURL(bytes: Uint8Array, mimeType: string) {
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}
