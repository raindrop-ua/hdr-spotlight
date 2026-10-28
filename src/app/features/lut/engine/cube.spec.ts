import { MAX_CUBE_TEXT_LENGTH, parseCube } from './cube';

const identity = ['0 0 0', '1 0 0', '0 1 0', '1 1 0', '0 0 1', '1 0 1', '0 1 1', '1 1 1'].join(
  '\n',
);

describe('3D .cube parsing', () => {
  it('reads red-fast RGB rows with BOM, CRLF, scientific values and quoted comments', () => {
    const lut = parseCube(
      `\uFEFF# generated test\r\nTITLE "Neutral # 1" # outside comment\r\nLUT_3D_SIZE 2\r\nDOMAIN_MIN -1 0 0\r\nDOMAIN_MAX 1 2 1\r\n${identity.replace('1 0 0', '1e0 .0 +0.0')}`,
    );
    expect(lut.title).toBe('Neutral # 1');
    expect(lut.size).toBe(2);
    expect(lut.domainMin).toEqual([-1, 0, 0]);
    expect(lut.domainMax).toEqual([1, 2, 1]);
    expect(Array.from(lut.values.slice(0, 12))).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]);
  });

  it('uses the filename title and default 0–1 domain when optional headers are absent', () => {
    const lut = parseCube(`LUT_3D_SIZE 2\n${identity}`, 'My look');
    expect(lut.title).toBe('My look');
    expect(lut.domainMin).toEqual([0, 0, 0]);
    expect(lut.domainMax).toEqual([1, 1, 1]);
  });

  it('retains finite out-of-range table values for final SDR clamping', () => {
    const lut = parseCube(`LUT_3D_SIZE 2\n${identity.replace('0 0 0', '-0.1 1.1 2')}`);
    expect(lut.values[0]).toBeCloseTo(-0.1);
    expect(lut.values[2]).toBe(2);
  });

  it('rejects unsupported 1D, shaper and range variants explicitly', () => {
    for (const directive of ['LUT_1D_SIZE 2', 'LUT_3D_INPUT_RANGE 0 1', 'LUT_1D_INPUT_RANGE 0 1']) {
      expect(() => parseCube(`${directive}\nLUT_3D_SIZE 2\n${identity}`)).toThrow(/supported|3D/);
    }
  });

  it('rejects missing, incomplete, extra and malformed table data', () => {
    for (const text of [
      '',
      identity,
      'LUT_3D_SIZE 2',
      `LUT_3D_SIZE 2\n${identity}\n0 0 0`,
      `LUT_3D_SIZE 2\n${identity.replace('1 1 1', '1 1')}`,
      `LUT_3D_SIZE 2\n${identity.replace('1 1 1', '1 1 Infinity')}`,
      `LUT_3D_SIZE 2\n${identity.replace('1 1 1', '1 1 1e40')}`,
      `LUT_3D_SIZE 2\n${identity.replace('1 1 1', '1 1 0x01')}`,
    ]) {
      expect(() => parseCube(text)).toThrow();
    }
  });

  it('rejects oversized LUTs, duplicate declarations and invalid domains', () => {
    for (const header of [
      'LUT_3D_SIZE 1',
      'LUT_3D_SIZE 66',
      'LUT_3D_SIZE 2.5',
      'LUT_3D_SIZE 2\nLUT_3D_SIZE 2',
      'LUT_3D_SIZE 2\nDOMAIN_MIN 0 1 0\nDOMAIN_MAX 1 1 1',
      'LUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1e-320 1 1',
      'LUT_3D_SIZE 2\nTITLE broken',
    ]) {
      expect(() => parseCube(`${header}\n${identity}`)).toThrow();
    }
    expect(() => parseCube('#'.repeat(MAX_CUBE_TEXT_LENGTH + 1))).toThrow('16 MB');
    expect(() => parseCube(`LUT_3D_SIZE 2\n${identity}\nDOMAIN_MIN 0 0 0`)).toThrow('before');
  });
});
