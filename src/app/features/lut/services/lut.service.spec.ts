import { TestBed } from '@angular/core/testing';
import { LutService } from './lut.service';
import { createPresetLut } from '@features/lut/engine/presets';
import { DEFAULT_LUT_SETTINGS, LutSource } from '@features/lut/models/lut-workspace.model';
import { WebpEncoderService } from '@shared/images/services/webp-encoder.service';

describe('SDR LUT browser export', () => {
  let service: LutService;
  let canvas: HTMLCanvasElement;
  let context: {
    drawImage: ReturnType<typeof vi.fn>;
    getImageData: ReturnType<typeof vi.fn>;
    putImageData: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
    globalCompositeOperation: string;
  };
  const source: LutSource = {
    image: {} as ImageBitmap,
    url: 'blob:source',
    name: 'photo.png',
    width: 1,
    height: 1,
    bytes: 10,
    demo: false,
  };
  const webpEncode = vi.fn();
  const createUrl = vi.fn().mockReturnValue('blob:output');

  beforeEach(() => {
    vi.stubGlobal('Worker', undefined);
    vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: vi.fn() });
    vi.stubGlobal(
      'ImageData',
      class {
        constructor(
          readonly data: Uint8ClampedArray,
          readonly width: number,
          readonly height: number,
        ) {}
      },
    );
    context = {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue({
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([100, 120, 140, 128]),
      }),
      putImageData: vi.fn(),
      fillRect: vi.fn(),
      globalCompositeOperation: 'source-over',
    };
    canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(context),
      toBlob: vi.fn((callback: BlobCallback, type: string) => {
        callback(new Blob(['pixels'], { type }));
      }),
    } as unknown as HTMLCanvasElement;
    TestBed.configureTestingModule({
      providers: [LutService, { provide: WebpEncoderService, useValue: { encode: webpEncode } }],
    });
    service = TestBed.inject(LutService);
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('normalizes exports through an sRGB canvas and preserves PNG transparency', async () => {
    const result = await service.export(
      source,
      null,
      DEFAULT_LUT_SETTINGS,
      new AbortController().signal,
    );
    expect(canvas.getContext).toHaveBeenCalledWith('2d', {
      colorSpace: 'srgb',
      willReadFrequently: true,
    });
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(result).toMatchObject({ width: 1, height: 1, format: 'png', name: 'photo-lut.png' });
    expect(createUrl).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/png' }));
  });

  it('applies the LUT before filling JPEG transparency', async () => {
    const fill = context.fillRect.mockImplementation(() => {
      expect(context.globalCompositeOperation).toBe('destination-over');
    });
    await service.export(
      source,
      createPresetLut('warm'),
      { ...DEFAULT_LUT_SETTINGS, format: 'jpeg', background: '#ffffff' },
      new AbortController().signal,
    );
    expect(context.putImageData).toHaveBeenCalledOnce();
    const pixels = context.putImageData.mock.calls[0][0] as ImageData;
    expect(pixels.data[3]).toBe(128);
    expect([...pixels.data.slice(0, 3)]).not.toEqual([100, 120, 140]);
    expect(context.putImageData.mock.invocationCallOrder[0]).toBeLessThan(
      fill.mock.invocationCallOrder[0],
    );
    expect(context.globalCompositeOperation).toBe('source-over');
  });

  it('uses local WASM when native canvas export silently falls back from WebP to PNG', async () => {
    vi.mocked(canvas.toBlob).mockImplementation((callback) => {
      callback(new Blob(['fallback'], { type: 'image/png' }));
    });
    webpEncode.mockResolvedValue(new Blob(['webp'], { type: 'image/webp' }));
    const result = await service.export(
      source,
      null,
      { ...DEFAULT_LUT_SETTINGS, format: 'webp' },
      new AbortController().signal,
    );
    expect(webpEncode).toHaveBeenCalledWith(context.getImageData.mock.results[0].value, 92);
    expect(result.format).toBe('webp');
    expect(createUrl).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/webp' }));
  });

  it('limits the comparison previews while retaining the source dimensions for export', async () => {
    await service.preview(
      { ...source, width: 6000, height: 4000 },
      null,
      100,
      new AbortController().signal,
    );
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(800);
    expect(context.drawImage).toHaveBeenCalledWith(source.image, 0, 0, 1200, 800);
  });
});
