import { Service } from '@angular/core';
import { bakeEditorLut, validateEditorDocument } from '@features/lut/engine/editor-transform';
import {
  parseEditorProject,
  serializeCube,
  serializeEditorProject,
} from '@features/lut/engine/editor-project';
import { LutEditorDocument } from '@features/lut/models/lut-editor.model';
import { Lut3D } from '@features/lut/models/lut.model';

const MAX_PROJECT_BYTES = 32 * 1024 * 1024;

@Service()
export class LutEditorService {
  async bake(document: LutEditorDocument, signal: AbortSignal): Promise<Lut3D> {
    signal.throwIfAborted();
    validateEditorDocument(document);
    let worker: Worker | undefined;
    if (typeof Worker !== 'undefined') {
      try {
        worker = new Worker(new URL('../engine/editor.worker', import.meta.url), {
          type: 'module',
        });
      } catch {
        // A blocked worker can still use the same pure color transform.
      }
    }
    if (worker) {
      const running = worker;
      return new Promise((resolve, reject) => {
        const clean = () => {
          running.terminate();
          signal.removeEventListener('abort', abort);
        };
        const abort = () => {
          clean();
          reject(new DOMException('LUT generation cancelled', 'AbortError'));
        };
        signal.addEventListener('abort', abort, { once: true });
        running.onmessage = ({ data }: MessageEvent<{ lut: Lut3D } | { error: string }>) => {
          clean();
          if (signal.aborted) reject(new DOMException('LUT generation cancelled', 'AbortError'));
          else if ('error' in data) reject(new Error(data.error));
          else resolve(data.lut);
        };
        running.onerror = () => {
          clean();
          reject(new Error('LUT worker failed. Reload and try again.'));
        };
        try {
          // Keep the immutable base buffer available for history and project saving.
          running.postMessage({ document });
        } catch (error) {
          clean();
          reject(error);
        }
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    signal.throwIfAborted();
    const lut = bakeEditorLut(document);
    signal.throwIfAborted();
    return lut;
  }

  async loadProject(file: File): Promise<LutEditorDocument> {
    if (!/\.json$/i.test(file.name)) throw new Error('Choose a LUT editor project in JSON format.');
    if (file.size > MAX_PROJECT_BYTES) throw new Error('Choose a project smaller than 32 MB.');
    return parseEditorProject(await file.text());
  }

  cubeBlob(lut: Lut3D): Blob {
    return new Blob([serializeCube(lut)], { type: 'text/plain;charset=utf-8' });
  }

  projectBlob(document: LutEditorDocument): Blob {
    return new Blob([serializeEditorProject(document)], { type: 'application/json' });
  }
}
