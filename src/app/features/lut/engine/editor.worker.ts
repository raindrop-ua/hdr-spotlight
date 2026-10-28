/// <reference lib="webworker" />
import type { LutEditorDocument } from '@features/lut/models/lut-editor.model';
import { bakeEditorLut } from './editor-transform';

addEventListener('message', ({ data }: MessageEvent<{ document: LutEditorDocument }>): void => {
  try {
    const lut = bakeEditorLut(data.document);
    postMessage({ lut }, [lut.values.buffer]);
  } catch (error: unknown) {
    postMessage({ error: error instanceof Error ? error.message : 'Could not build this LUT.' });
  }
});
