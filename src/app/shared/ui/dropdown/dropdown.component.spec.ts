import { TestBed } from '@angular/core/testing';
import { Dropdown, DropdownOption } from './dropdown.component';

const options: readonly DropdownOption[] = [
  { value: 'original', label: 'Original' },
  { value: 'blocked', label: 'Blue unavailable', disabled: true },
  { value: 'blue', label: 'Blue hour' },
  { value: 'warm', label: 'Warm daylight' },
];

function toggle(panel: HTMLElement, newState: 'open' | 'closed'): void {
  const event = new Event('beforetoggle');
  Object.defineProperty(event, 'newState', { value: newState });
  panel.dispatchEvent(event);
}

function key(trigger: HTMLElement, value: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true });
  trigger.dispatchEvent(event);
  return event;
}

async function create() {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const fixture = TestBed.createComponent(Dropdown);
  fixture.componentRef.setInput('controlId', 'test-look');
  fixture.componentRef.setInput('label', 'Choose a look');
  fixture.componentRef.setInput('options', options);
  fixture.componentRef.setInput('value', 'original');
  fixture.detectChanges();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const trigger = root.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  const panel = root.querySelector<HTMLElement>('[role="listbox"]')!;
  // jsdom does not perform native popover activation or light-dismiss.
  Object.defineProperty(panel, 'showPopover', { value: () => toggle(panel, 'open') });
  Object.defineProperty(panel, 'hidePopover', { value: () => toggle(panel, 'closed') });
  const changed = vi.fn();
  fixture.componentInstance.valueChanged.subscribe(changed);
  return { fixture, root, trigger, panel, changed };
}

describe('Shared dropdown', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('skips disabled choices and commits only on selection, awaiting the parent value', async () => {
    const { fixture, trigger, changed } = await create();
    key(trigger, 'ArrowDown');
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-activedescendant')).toBe('test-look-option-0');
    key(trigger, 'ArrowDown');
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-activedescendant')).toBe('test-look-option-2');
    expect(changed).not.toHaveBeenCalled();
    key(trigger, 'Enter');
    fixture.detectChanges();
    expect(changed).toHaveBeenCalledExactlyOnceWith('blue');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.textContent).toContain('Original');
    fixture.componentRef.setInput('value', 'blue');
    fixture.detectChanges();
    expect(trigger.textContent).toContain('Blue hour');
  });

  it('supports typeahead and edge navigation, and cancels with Escape or Tab', async () => {
    const { fixture, trigger, changed } = await create();
    key(trigger, 'b');
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-activedescendant')).toBe('test-look-option-2');
    key(trigger, 'End');
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-activedescendant')).toBe('test-look-option-3');
    key(trigger, 'Home');
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-activedescendant')).toBe('test-look-option-0');
    key(trigger, 'Escape');
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    key(trigger, 'ArrowUp');
    expect(key(trigger, 'Tab').defaultPrevented).toBe(false);
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(changed).not.toHaveBeenCalled();
  });

  it('emits an explicit re-selection so the parent can cancel a pending asynchronous choice', async () => {
    const { fixture, trigger, changed } = await create();
    key(trigger, 'ArrowDown');
    key(trigger, 'Enter');
    fixture.detectChanges();
    expect(changed).toHaveBeenCalledExactlyOnceWith('original');
  });

  it('reflects native light-dismiss and closes when the parent disables the control', async () => {
    const { fixture, trigger, panel, changed } = await create();
    toggle(panel, 'open');
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    toggle(panel, 'closed');
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    toggle(panel, 'open');
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(trigger.disabled).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    key(trigger, 'ArrowDown');
    expect(changed).not.toHaveBeenCalled();
  });

  it('shows custom values and preserves descriptions and swatches in card options', async () => {
    const { fixture, root, trigger } = await create();
    fixture.componentRef.setInput('variant', 'cards');
    fixture.componentRef.setInput('value', 'custom');
    fixture.componentRef.setInput('placeholder', 'Imported LUT');
    fixture.componentRef.setInput('options', [
      ...options,
      {
        value: 'custom',
        label: 'My imported look',
        description: 'A custom color grade',
        swatch: 'linear-gradient(red, blue)',
        disabled: true,
      },
    ]);
    fixture.detectChanges();
    expect(trigger.textContent).toContain('My imported look');
    expect(root.querySelector('.dropdown-trigger-swatch')).not.toBeNull();
    expect(root.querySelector('.dropdown-cards')).not.toBeNull();
    expect(root.querySelectorAll('[role="option"]')[4].textContent).toContain(
      'A custom color grade',
    );
    fixture.componentRef.setInput('value', 'unknown');
    fixture.detectChanges();
    expect(trigger.textContent).toContain('Imported LUT');
  });
});
