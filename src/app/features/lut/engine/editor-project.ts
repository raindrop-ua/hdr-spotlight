import type { Lut3D } from '@features/lut/models/lut.model';
import { cloneEditorDocument, type LutEditorDocument } from '@features/lut/models/lut-editor.model';
import { MAX_LUT_SIZE } from './cube';
import { validateFloatLut } from './float-lut-sampler';
import { validateEditorDocument } from './editor-transform';

export const MAX_EDITOR_PROJECT_BYTES = 32 * 1024 * 1024;
export const EDITOR_PROJECT_TYPE = 'hdr-spotlight-lut-project';

function title(value: string): string {
  return (
    value
      .replace(/["\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
      .trim()
      .slice(0, 80) || 'My LUT'
  );
}

export function serializeCube(lut: Lut3D): string {
  validateFloatLut(lut);
  const lines = [
    '# HDR Spotlight LUT Editor. Encoded sRGB input and output.',
    `TITLE "${title(lut.title)}"`,
    `LUT_3D_SIZE ${lut.size}`,
    `DOMAIN_MIN ${lut.domainMin.join(' ')}`,
    `DOMAIN_MAX ${lut.domainMax.join(' ')}`,
  ];
  for (let index = 0; index < lut.values.length; index += 3) {
    lines.push(
      `${lut.values[index].toFixed(8)} ${lut.values[index + 1].toFixed(8)} ${lut.values[index + 2].toFixed(8)}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

export function serializeEditorProject(document: LutEditorDocument): string {
  validateEditorDocument(document);
  const copy = cloneEditorDocument(document);
  const text = JSON.stringify({
    type: EDITOR_PROJECT_TYPE,
    version: 1,
    workingSpace: 'srgb',
    name: copy.name,
    size: copy.size,
    settings: copy.settings,
    base: copy.base
      ? {
          title: copy.base.title.slice(0, 512),
          size: copy.base.size,
          domainMin: copy.base.domainMin,
          domainMax: copy.base.domainMax,
          values: Array.from(copy.base.values),
        }
      : null,
  });
  if (text.length > MAX_EDITOR_PROJECT_BYTES)
    throw new Error('This project exceeds the 32 MB project limit.');
  return text;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid LUT editor project structure.');
  return value as Record<string, unknown>;
}

function readBase(value: unknown): Lut3D | null {
  if (value === null) return null;
  const base = record(value);
  const size = base['size'];
  const values = base['values'];
  if (
    typeof size !== 'number' ||
    !Number.isInteger(size) ||
    size < 2 ||
    size > MAX_LUT_SIZE ||
    typeof base['title'] !== 'string' ||
    base['title'].length > 512 ||
    !Array.isArray(values) ||
    values.length !== size ** 3 * 3 ||
    values.some(
      (value) =>
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        !Number.isFinite(Math.fround(value)),
    )
  )
    throw new Error('The project contains an invalid or oversized base LUT.');
  // Validate domains before allocating the bounded typed table.
  const minimum = base['domainMin'];
  const maximum = base['domainMax'];
  if (
    !Array.isArray(minimum) ||
    !Array.isArray(maximum) ||
    minimum.length !== 3 ||
    maximum.length !== 3 ||
    minimum.some(
      (value, channel) =>
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        typeof maximum[channel] !== 'number' ||
        !Number.isFinite(maximum[channel]) ||
        value >= maximum[channel] ||
        !Number.isFinite(maximum[channel] - value) ||
        !Number.isFinite(1 / (maximum[channel] - value)),
    )
  ) {
    throw new Error('The project contains an invalid base LUT input domain.');
  }
  return {
    title: base['title'],
    size,
    domainMin: [...minimum] as [number, number, number],
    domainMax: [...maximum] as [number, number, number],
    values: new Float32Array(values),
  };
}

export function parseEditorProject(text: string): LutEditorDocument {
  if (typeof text !== 'string' || text.length > MAX_EDITOR_PROJECT_BYTES)
    throw new Error('Choose a project smaller than 32 MB.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('This file is not a valid LUT editor project.');
  }
  const project = record(parsed);
  if (
    project['type'] !== EDITOR_PROJECT_TYPE ||
    project['version'] !== 1 ||
    project['workingSpace'] !== 'srgb'
  ) {
    throw new Error('Choose a version 1 HDR Spotlight sRGB LUT editor project.');
  }
  const document: LutEditorDocument = {
    name: project['name'] as string,
    size: project['size'] as 33 | 65,
    settings: project['settings'] as LutEditorDocument['settings'],
    base: readBase(project['base']),
  };
  validateEditorDocument(document);
  return cloneEditorDocument(document);
}
