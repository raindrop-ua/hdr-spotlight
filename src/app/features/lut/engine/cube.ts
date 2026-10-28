import type { Lut3D } from '@features/lut/models/lut.model';

export const MAX_CUBE_TEXT_LENGTH = 16 * 1024 * 1024;
export const MAX_LUT_SIZE = 65;

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function numbers(tokens: string[], line: number): [number, number, number] {
  if (tokens.length !== 3 || tokens.some((token) => !NUMBER.test(token))) {
    throw new Error(`Invalid RGB values on LUT line ${line}.`);
  }
  const values = tokens.map(Number);
  if (values.some((value) => !Number.isFinite(value) || !Number.isFinite(Math.fround(value)))) {
    throw new Error(`Non-finite RGB values on LUT line ${line}.`);
  }
  return values as [number, number, number];
}

function withoutComment(line: string): string {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    if (line[i] === '#' && !quoted) return line.slice(0, i).trim();
  }
  return line.trim();
}

/** Read the supported 3D-only Adobe/IRIDAS .cube subset without guessing color spaces. */
export function parseCube(text: string, fallbackTitle = 'Custom LUT'): Lut3D {
  if (text.length > MAX_CUBE_TEXT_LENGTH) throw new Error('Choose a LUT smaller than 16 MB.');
  if (!text.trim()) throw new Error('This LUT file is empty.');

  let title = fallbackTitle;
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  let values: Float32Array<ArrayBuffer> | undefined;
  let offset = 0;
  const headers = new Set<string>();
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = withoutComment(lines[i]);
    if (!line) continue;
    const tokens = line.split(/\s+/);
    const keyword = tokens[0];
    if (/^[A-Za-z_]/.test(keyword)) {
      if (keyword === 'LUT_1D_SIZE') {
        throw new Error('Use a 3D .cube LUT. 1D and combined shaper LUTs are not supported yet.');
      }
      if (!['TITLE', 'LUT_3D_SIZE', 'DOMAIN_MIN', 'DOMAIN_MAX'].includes(keyword)) {
        throw new Error(
          `Unsupported LUT directive: ${keyword}. Use a 3D .cube LUT with DOMAIN_MIN/MAX.`,
        );
      }
      if (offset > 0) throw new Error('LUT headers must appear before the RGB table.');
      if (headers.has(keyword)) throw new Error(`Duplicate LUT directive: ${keyword}.`);
      headers.add(keyword);
      if (keyword === 'TITLE') {
        const match = /^TITLE\s+"([^"\r\n]*)"$/.exec(line);
        if (!match) throw new Error('The LUT title must be enclosed in double quotes.');
        title = match[1].trim() || fallbackTitle;
      } else if (keyword === 'LUT_3D_SIZE') {
        if (tokens.length !== 2 || !/^\d+$/.test(tokens[1])) {
          throw new Error('The LUT must declare a whole-number LUT_3D_SIZE.');
        }
        size = Number(tokens[1]);
        if (size < 2 || size > MAX_LUT_SIZE) {
          throw new Error(`Use a 3D LUT with 2–${MAX_LUT_SIZE} points per channel.`);
        }
        values = new Float32Array(size ** 3 * 3);
      } else if (keyword === 'DOMAIN_MIN') {
        domainMin = numbers(tokens.slice(1), i + 1);
      } else {
        domainMax = numbers(tokens.slice(1), i + 1);
      }
      continue;
    }

    if (!values) throw new Error('Declare LUT_3D_SIZE before the RGB table.');
    if (offset >= values.length)
      throw new Error('The LUT contains more RGB rows than its declared size.');
    const rgb = numbers(tokens, i + 1);
    values.set(rgb, offset);
    offset += 3;
  }

  if (!values) throw new Error('This file does not contain a 3D .cube LUT.');
  if (offset !== values.length) {
    throw new Error(`The LUT needs ${size ** 3} RGB rows; found ${offset / 3}.`);
  }
  if (
    domainMin.some(
      (minimum, channel) =>
        minimum >= domainMax[channel] || !Number.isFinite(1 / (domainMax[channel] - minimum)),
    )
  ) {
    throw new Error('Each DOMAIN_MAX value must be greater than DOMAIN_MIN.');
  }
  return { title, size, domainMin, domainMax, values };
}
