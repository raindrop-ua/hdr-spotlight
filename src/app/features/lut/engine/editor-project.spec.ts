import { createEditorDocument } from '@features/lut/models/lut-editor.model';
import { parseCube } from './cube';
import { createFloatLutSampler } from './float-lut-sampler';
import { bakeEditorLut } from './editor-transform';
import {
  MAX_EDITOR_PROJECT_BYTES,
  parseEditorProject,
  serializeCube,
  serializeEditorProject,
} from './editor-project';

describe('LUT editor portable files', () => {
  it('roundtrips the complete project, including embedded base LUT and editable curves', () => {
    const document = createEditorDocument();
    document.base = bakeEditorLut(document);
    document.name = 'My cinematic look';
    document.settings.exposure = 0.3;
    document.settings.curves.blue[2] = 0.6;
    document.settings.highlights = { hue: 34, saturation: 15 };
    document.size = 65;
    const text = serializeEditorProject(document);
    const parsed = parseEditorProject(text);
    expect(parsed).toEqual(document);
    expect(parsed.base?.values).toBeInstanceOf(Float32Array);
    expect(parsed.settings.curves.blue).not.toBe(document.settings.curves.blue);
    expect(parsed.base?.values).not.toBe(document.base.values);
  });

  it('keeps exported and reparsed LUT samples consistent with the editor baked preview', () => {
    const document = createEditorDocument();
    document.settings.contrast = 20;
    document.settings.exposure = -0.4;
    document.settings.curves.master = [0.02, 0.22, 0.55, 0.82, 0.98];
    const lut = bakeEditorLut(document);
    const parsed = parseCube(serializeCube(lut));
    const actual = new Float64Array(3);
    const expected = new Float64Array(3);
    const sample = createFloatLutSampler(lut);
    const restored = createFloatLutSampler(parsed);
    for (const rgb of [
      [0.17, 0.38, 0.69],
      [0, 0, 0],
      [1, 1, 1],
      [0.82, 0.27, 0.56],
    ]) {
      sample(rgb[0], rgb[1], rgb[2], expected);
      restored(rgb[0], rgb[1], rgb[2], actual);
      for (let channel = 0; channel < 3; channel++)
        expect(actual[channel]).toBeCloseTo(expected[channel], 7);
    }
  });

  it('prevents title metadata from injecting headers or RGB rows', () => {
    const lut = bakeEditorLut(createEditorDocument());
    lut.title = 'Look"\nLUT_3D_SIZE 2\r\n0 0 0\u2028end';
    const text = serializeCube(lut);
    const parsed = parseCube(text);
    expect(parsed.size).toBe(33);
    expect(parsed.title).not.toMatch(/["\r\n\u2028]/);
    expect(text.match(/^LUT_3D_SIZE/gm)).toHaveLength(1);
  });

  it('rejects malformed, unsupported, oversized or invalid document settings', () => {
    const raw = JSON.parse(serializeEditorProject(createEditorDocument()));
    for (const project of [
      { ...raw, version: 2 },
      { ...raw, workingSpace: 'rec2020' },
      { ...raw, type: 'other-editor' },
      { ...raw, size: 64 },
      { ...raw, settings: { ...raw.settings, exposure: 4 } },
      { ...raw, settings: { ...raw.settings, curves: { ...raw.settings.curves, red: [0, 1] } } },
    ])
      expect(() => parseEditorProject(JSON.stringify(project))).toThrow();
    expect(() => parseEditorProject('{broken')).toThrow('valid');
    expect(() => parseEditorProject(' '.repeat(MAX_EDITOR_PROJECT_BYTES + 1))).toThrow('32 MB');
  });

  it('validates embedded table lengths, finite Float32 values and domains before use', () => {
    const document = createEditorDocument();
    document.base = { ...bakeEditorLut(document), size: 2, values: new Float32Array(24) };
    const raw = JSON.parse(serializeEditorProject(document));
    for (const base of [
      { ...raw.base, size: 66 },
      { ...raw.base, values: [0, 0, 0] },
      { ...raw.base, values: Array(24).fill('0') },
      { ...raw.base, values: Array(24).fill(1e40) },
      { ...raw.base, domainMin: [1, 0, 0] },
      { ...raw.base, domainMin: [0, 0, 0], domainMax: [1e-320, 1, 1] },
      { ...raw.base, domainMin: [-1e308, 0, 0], domainMax: [1e308, 1, 1] },
    ])
      expect(() => parseEditorProject(JSON.stringify({ ...raw, base }))).toThrow();
  });
});
