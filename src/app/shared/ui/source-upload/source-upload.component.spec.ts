import { TestBed } from '@angular/core/testing';
import { SourceUpload } from './source-upload.component';

function pasteEvent(file: File): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files: [file] } });
  return event;
}

describe('Shared source upload', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });
  it('owns clipboard selection in the uploader, respects inputs and removes the global listener', async () => {
    const fixture = TestBed.createComponent(SourceUpload);
    const selected = vi.fn();
    fixture.componentInstance.selected.subscribe(selected);
    await fixture.whenStable();
    const file = new File(['image'], 'test.png', { type: 'image/png' });
    const event = pasteEvent(file);
    window.dispatchEvent(event);
    expect(selected).toHaveBeenCalledWith(file);
    expect(event.defaultPrevented).toBe(true);

    const input = document.createElement('input');
    document.body.append(input);
    try {
      const inputEvent = pasteEvent(file);
      input.dispatchEvent(inputEvent);
      expect(inputEvent.defaultPrevented).toBe(false);
      expect(selected).toHaveBeenCalledTimes(1);
    } finally {
      input.remove();
    }

    fixture.destroy();
    const afterDestroy = pasteEvent(file);
    window.dispatchEvent(afterDestroy);
    expect(afterDestroy.defaultPrevented).toBe(false);
    expect(selected).toHaveBeenCalledTimes(1);
  });
});
