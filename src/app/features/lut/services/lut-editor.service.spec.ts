import { TestBed } from '@angular/core/testing';
import { createEditorDocument } from '@features/lut/models/lut-editor.model';
import { Lut3D } from '@features/lut/models/lut.model';
import { parseCube } from '@features/lut/engine/cube';
import { parseEditorProject } from '@features/lut/engine/editor-project';
import { LutEditorService } from './lut-editor.service';

describe('LUT editor browser orchestration', () => {
  let service: LutEditorService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [LutEditorService] });
    service = TestBed.inject(LutEditorService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('keeps the base table attached and terminates a worker when baking is cancelled', async () => {
    const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
    vi.stubGlobal(
      'Worker',
      vi.fn(function () {
        return worker;
      }),
    );
    const document = createEditorDocument();
    document.base = {
      title: 'Base',
      size: 2,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      values: new Float32Array(24),
    };
    const controller = new AbortController();
    const pending = service.bake(document, controller.signal);
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({ document });
    expect(document.base.values.byteLength).toBe(96);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('returns worker tables and handles worker-reported errors with cleanup', async () => {
    type WorkerResult = { lut: Lut3D } | { error: string };
    const workers: {
      postMessage: ReturnType<typeof vi.fn>;
      terminate: ReturnType<typeof vi.fn>;
      onmessage?: (event: MessageEvent<WorkerResult>) => void;
    }[] = [];
    vi.stubGlobal(
      'Worker',
      vi.fn(function () {
        const worker = { postMessage: vi.fn(), terminate: vi.fn() };
        workers.push(worker);
        return worker;
      }),
    );
    const pending = service.bake(createEditorDocument(), new AbortController().signal);
    const lut: Lut3D = {
      title: 'Baked',
      size: 2,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      values: new Float32Array(24),
    };
    workers[0].onmessage!({ data: { lut } } as MessageEvent<WorkerResult>);
    expect(await pending).toBe(lut);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    const failed = service.bake(createEditorDocument(), new AbortController().signal);
    workers[1].onmessage!({ data: { error: 'Invalid transform' } } as MessageEvent<WorkerResult>);
    await expect(failed).rejects.toThrow('Invalid transform');
    expect(workers[1].terminate).toHaveBeenCalledOnce();
  });

  it('uses the same pure bake when workers are unavailable and exports a round-trippable cube', async () => {
    vi.stubGlobal('Worker', undefined);
    const document = createEditorDocument();
    document.settings.saturation = 115;
    const lut = await service.bake(document, new AbortController().signal);
    const exported = service.cubeBlob(lut);
    const parsed = parseCube(await exported.text());
    expect(parsed.size).toBe(33);
    expect(parsed.title).toBe(document.name);
    expect(parsed.values.length).toBe(lut.values.length);
    expect(parsed.values[50]).toBeCloseTo(lut.values[50], 5);
  });

  it('exports and reloads a self-contained editable project and rejects oversized input early', async () => {
    const document = createEditorDocument();
    document.settings.curves.blue[2] = 0.65;
    document.base = {
      title: 'Embedded',
      size: 2,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      values: new Float32Array(24),
    };
    const text = await service.projectBlob(document).text();
    const imported = await service.loadProject({
      name: 'saved.lut-project.json',
      size: text.length,
      text: async () => text,
    } as File);
    expect(imported).toEqual(parseEditorProject(text));
    expect(imported.settings.curves.blue[2]).toBe(0.65);
    expect(imported.base?.values).toEqual(document.base.values);
    const read = vi.fn();
    await expect(
      service.loadProject({
        name: 'huge.json',
        size: 32 * 1024 * 1024 + 1,
        text: read,
      } as unknown as File),
    ).rejects.toThrow('32 MB');
    expect(read).not.toHaveBeenCalled();
  });
});
