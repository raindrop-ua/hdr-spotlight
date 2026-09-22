import { TestBed } from '@angular/core/testing';
import { DisplayIndicator } from './display-indicator.component';

describe('HDR display indicator', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });
  it('updates display status on media changes and releases its listener', async () => {
    const query = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => query),
    );
    const fixture = TestBed.createComponent(DisplayIndicator);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('SDR display');
    const update = query.addEventListener.mock.calls[0][1] as () => void;
    query.matches = true;
    update();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('HDR display');
    fixture.destroy();
    expect(query.removeEventListener).toHaveBeenCalledWith('change', update);
  });
});
