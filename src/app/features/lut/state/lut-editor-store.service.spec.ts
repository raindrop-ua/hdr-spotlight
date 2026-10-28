import { TestBed } from '@angular/core/testing';
import { createEditorDocument, LutEditorDocument } from '@features/lut/models/lut-editor.model';
import { Lut3D } from '@features/lut/models/lut.model';
import { LutPreview, LutResult, LutSource } from '@features/lut/models/lut-workspace.model';
import { LutEditorService } from '@features/lut/services/lut-editor.service';
import { LutService } from '@features/lut/services/lut.service';
import { LutEditorStore } from './lut-editor-store.service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const lut = (title = 'Base LUT'): Lut3D => ({
  title,
  size: 2,
  domainMin: [0, 0, 0],
  domainMax: [1, 1, 1],
  values: new Float32Array(24),
});
const source = (name: string): LutSource => ({
  name,
  url: `blob:${name}`,
  width: 600,
  height: 400,
  bytes: 100,
  demo: false,
  image: {} as ImageBitmap,
});

describe('LUT editor history and asynchronous lifecycle', () => {
  let store: LutEditorStore;
  let service: {
    bake: ReturnType<typeof vi.fn>;
    loadProject: ReturnType<typeof vi.fn>;
    cubeBlob: ReturnType<typeof vi.fn>;
    projectBlob: ReturnType<typeof vi.fn>;
  };
  let images: {
    load: ReturnType<typeof vi.fn>;
    loadDemo: ReturnType<typeof vi.fn>;
    loadPreset: ReturnType<typeof vi.fn>;
    loadLut: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
    preview: ReturnType<typeof vi.fn>;
    export: ReturnType<typeof vi.fn>;
  };
  let urlCounter: number;
  const revoke = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    urlCounter = 0;
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => `blob:download-${++urlCounter}`),
      revokeObjectURL: revoke,
    });
    service = {
      bake: vi.fn().mockImplementation(async (document: LutEditorDocument) => lut(document.name)),
      loadProject: vi.fn().mockResolvedValue(createEditorDocument()),
      cubeBlob: vi.fn().mockReturnValue(new Blob(['cube'], { type: 'text/plain' })),
      projectBlob: vi.fn().mockReturnValue(new Blob(['project'], { type: 'application/json' })),
    };
    images = {
      load: vi.fn().mockResolvedValue(source('photo.png')),
      loadDemo: vi.fn().mockResolvedValue({ ...source('demo.jpg'), demo: true }),
      loadPreset: vi.fn().mockResolvedValue(lut('Warm Daylight')),
      loadLut: vi.fn().mockResolvedValue(lut()),
      release: vi.fn(),
      preview: vi.fn().mockResolvedValue({ originalUrl: 'blob:original', url: 'blob:preview' }),
      export: vi.fn().mockResolvedValue({ url: 'blob:image-export', bytes: 80 } as LutResult),
    };
    TestBed.configureTestingModule({
      providers: [
        LutEditorStore,
        { provide: LutEditorService, useValue: service },
        { provide: LutService, useValue: images },
      ],
    });
    store = TestBed.inject(LutEditorStore);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('coalesces a continuous drag into one undo and discards redo after a new edit', () => {
    store.update({ exposure: 0.2 });
    store.update({ exposure: 0.7 });
    store.update({ exposure: 1.2 });
    store.commit();
    expect(store.canUndo()).toBe(true);
    store.undo();
    expect(store.document().settings.exposure).toBe(0);
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(true);
    store.redo();
    expect(store.document().settings.exposure).toBe(1.2);
    store.undo();
    store.update({ contrast: 20 });
    expect(store.canRedo()).toBe(false);
    store.undo();
    expect(store.document().settings.contrast).toBe(0);
  });

  it('keeps curve inputs immutable and includes curve resets, titles and size in history', () => {
    const points = [0, 0.15, 0.4, 0.85, 1];
    store.updateCurve('red', points);
    store.commit();
    points[2] = 0;
    expect(store.document().settings.curves.red[2]).toBe(0.4);
    store.resetCurve('red');
    expect(store.document().settings.curves.red).toEqual([0, 0.25, 0.5, 0.75, 1]);
    store.undo();
    expect(store.document().settings.curves.red[2]).toBe(0.4);
    store.rename('Film look');
    store.setSize(65);
    store.undo();
    expect(store.document().name).toBe('Film look');
    expect(store.document().size).toBe(33);
    store.undo();
    expect(store.document().name).toBe('My LUT');
  });

  it('bounds history and shares immutable base tables rather than copying pixel tables', async () => {
    const base = lut('Warm Daylight');
    images.loadPreset.mockResolvedValue(base);
    await store.selectBase('warm');
    for (let index = 0; index < 45; index++) {
      store.update({ contrast: index + 1 });
      store.commit();
    }
    let undos = 0;
    while (store.canUndo()) {
      store.undo();
      expect(store.document().base?.values).toBe(base.values);
      undos++;
    }
    expect(undos).toBe(40);
  });

  it('keeps later color changes while a base downloads and ignores a base superseded by a project', async () => {
    const late = deferred<Lut3D>();
    images.loadPreset.mockReturnValueOnce(late.promise);
    const pending = store.selectBase('warm');
    store.update({ saturation: 130 });
    late.resolve(lut('Warm Daylight'));
    await pending;
    expect(store.document().settings.saturation).toBe(130);
    expect(store.basePreset()).toBe('warm');
    const older = deferred<Lut3D>();
    images.loadPreset.mockReturnValueOnce(older.promise);
    const superseded = store.selectBase('silver-mist');
    const signal = images.loadPreset.mock.calls.at(-1)![1] as AbortSignal;
    const imported = {
      ...createEditorDocument(),
      name: 'Saved project',
      base: lut('Embedded base'),
    };
    service.loadProject.mockResolvedValueOnce(imported);
    await store.loadProject(new File([], 'saved.json'));
    expect(signal.aborted).toBe(true);
    older.resolve(lut('Silver Mist'));
    await superseded;
    expect(store.document().name).toBe('Saved project');
    expect(store.document().base).toBe(imported.base);
    expect(store.basePreset()).toBe('custom');
  });

  it('lets edits and Original supersede pending project or base uploads', async () => {
    const project = deferred<LutEditorDocument>();
    service.loadProject.mockReturnValueOnce(project.promise);
    const pendingProject = store.loadProject(new File([], 'slow.json'));
    store.update({ temperature: 15 });
    project.resolve({ ...createEditorDocument(), name: 'Late project' });
    await pendingProject;
    expect(store.document().settings.temperature).toBe(15);
    expect(store.document().name).toBe('My LUT');
    const base = deferred<Lut3D>();
    images.loadLut.mockReturnValueOnce(base.promise);
    const pendingBase = store.loadBase(new File([], 'slow.cube'));
    await store.selectBase('original');
    base.resolve(lut());
    await pendingBase;
    expect(store.document().base).toBeNull();
    expect(store.baseLoading()).toBe(false);
  });

  it('preserves the current valid project when another project fails to load', async () => {
    store.rename('Keep this');
    service.loadProject.mockRejectedValueOnce(new Error('Invalid project'));
    await store.loadProject(new File([], 'broken.json'));
    expect(store.document().name).toBe('Keep this');
    expect(store.baseLoading()).toBe(false);
    expect(store.error()).toBe('Invalid project');
  });

  it('aborts old bakes and uses the latest completed LUT for preview and cube export', async () => {
    const older = deferred<Lut3D>();
    service.bake.mockReturnValueOnce(older.promise);
    await store.loadImage(new File([], 'photo.png'));
    await vi.advanceTimersByTimeAsync(100);
    const signal = service.bake.mock.calls[0][1] as AbortSignal;
    store.rename('Latest');
    expect(signal.aborted).toBe(true);
    expect(await store.exportCube()).toBeNull();
    await vi.advanceTimersByTimeAsync(100);
    const current = store.bakedLut();
    expect(current?.title).toBe('Latest');
    expect(images.preview).toHaveBeenLastCalledWith(
      source('photo.png'),
      current,
      100,
      expect.any(AbortSignal),
    );
    older.resolve(lut('Obsolete'));
    await Promise.resolve();
    expect(store.bakedLut()).toBe(current);
    const pendingExport = store.exportCube();
    await vi.advanceTimersByTimeAsync(0);
    expect((await pendingExport)?.name).toBe('Latest.cube');
    expect(service.cubeBlob).toHaveBeenCalledExactlyOnceWith(current);
  });

  it('releases previews and image exports completed after a newer edit', async () => {
    const olderPreview = deferred<LutPreview>();
    images.preview.mockReturnValueOnce(olderPreview.promise);
    await store.loadImage(new File([], 'photo.png'));
    await vi.advanceTimersByTimeAsync(100);
    const previewSignal = images.preview.mock.calls[0][3] as AbortSignal;
    store.update({ saturation: 110 });
    expect(previewSignal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    olderPreview.resolve({ originalUrl: 'blob:stale-before', url: 'blob:stale-after' });
    await Promise.resolve();
    expect(store.previewUrl()).toBe('blob:preview');
    expect(revoke).toHaveBeenCalledWith('blob:stale-before');
    expect(revoke).toHaveBeenCalledWith('blob:stale-after');
    const oldExport = deferred<LutResult>();
    images.export.mockReturnValueOnce(oldExport.promise);
    const pending = store.exportImage();
    const exportSignal = images.export.mock.calls[0][3] as AbortSignal;
    store.update({ tint: 12 });
    expect(exportSignal.aborted).toBe(true);
    oldExport.resolve({ url: 'blob:stale-image', bytes: 80 } as LutResult);
    expect(await pending).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:stale-image');
    expect(store.exporting()).toBe(false);
  });

  it('saves the current project with its embedded base and cleans bounded downloads on destroy', async () => {
    const base = lut('Warm Daylight');
    images.loadPreset.mockResolvedValueOnce(base);
    await store.selectBase('warm');
    store.update({ exposure: 0.6 });
    const first = store.exportProject();
    expect(first?.name).toBe('My-LUT.lut-project.json');
    expect(service.projectBlob).toHaveBeenLastCalledWith(
      expect.objectContaining({ base, settings: expect.objectContaining({ exposure: 0.6 }) }),
    );
    const second = store.exportProject();
    expect(revoke).toHaveBeenCalledWith(first!.url);
    await store.loadImage(new File([], 'photo.png'));
    await vi.advanceTimersByTimeAsync(100);
    const pendingCube = store.exportCube();
    await vi.advanceTimersByTimeAsync(0);
    const cube = await pendingCube;
    TestBed.resetTestingModule();
    expect(revoke).toHaveBeenCalledWith(second!.url);
    expect(revoke).toHaveBeenCalledWith(cube!.url);
    expect(revoke).toHaveBeenCalledWith('blob:original');
    expect(revoke).toHaveBeenCalledWith('blob:preview');
    expect(images.release).toHaveBeenCalledWith(source('photo.png'));
  });

  it('releases an image decoded after destruction and cancels pending base and bake work', async () => {
    const lateImage = deferred<LutSource>();
    const lateBase = deferred<Lut3D>();
    const lateBake = deferred<Lut3D>();
    images.load.mockReturnValueOnce(lateImage.promise);
    images.loadPreset.mockReturnValueOnce(lateBase.promise);
    service.bake.mockReturnValueOnce(lateBake.promise);
    store.update({ contrast: 5 });
    await vi.advanceTimersByTimeAsync(100);
    const bakeSignal = service.bake.mock.calls[0][1] as AbortSignal;
    const image = store.loadImage(new File([], 'late.png'));
    const base = store.selectBase('silver-mist');
    const baseSignal = images.loadPreset.mock.calls[0][1] as AbortSignal;
    const previousSource = store.source();
    TestBed.resetTestingModule();
    expect(bakeSignal.aborted).toBe(true);
    expect(baseSignal.aborted).toBe(true);
    lateImage.resolve(source('late.png'));
    lateBase.resolve(lut());
    lateBake.resolve(lut('Late bake'));
    await image;
    await base;
    await Promise.resolve();
    expect(images.release).toHaveBeenCalledWith(source('late.png'));
    expect(store.source()).toBe(previousSource);
    expect(store.bakedLut()).toBeNull();
  });
});
