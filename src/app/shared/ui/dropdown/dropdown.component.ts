import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  swatch?: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-dropdown',
  templateUrl: './dropdown.component.html',
  styleUrl: './dropdown.component.css',
})
export class Dropdown {
  readonly controlId = input.required<string>();
  readonly label = input.required<string>();
  readonly options = input.required<readonly DropdownOption[]>();
  readonly value = input.required<string>();
  readonly disabled = input(false);
  readonly variant = input<'default' | 'cards'>('default');
  readonly placeholder = input('Choose an option');
  readonly valueChanged = output<string>();

  protected readonly open = signal(false);
  protected readonly activeIndex = signal(-1);
  protected readonly selected = computed(() =>
    this.options().find((option) => option.value === this.value()),
  );
  protected readonly listId = computed(() => `${this.controlId()}-listbox`);

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild.required<ElementRef<HTMLDivElement>>('panel');
  private readonly destroyRef = inject(DestroyRef);
  private openingIndex?: number;
  private search = '';
  private searchedAt = 0;
  private frame?: number;

  constructor() {
    effect(() => {
      if (this.disabled() && this.open()) this.close();
    });
    afterNextRender(() => {
      const reposition = (event: Event) => {
        if (!this.open()) return;
        const panel = this.panel().nativeElement;
        if (event.target instanceof Node && panel.contains(event.target)) return;
        this.position();
      };
      window.addEventListener('resize', reposition);
      window.addEventListener('scroll', reposition, true);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('resize', reposition);
        window.removeEventListener('scroll', reposition, true);
        if (this.frame !== undefined) cancelAnimationFrame(this.frame);
      });
    });
  }

  protected beforeToggle(event: Event): void {
    const opening = (event as ToggleEvent).newState === 'open';
    this.open.set(opening);
    if (!opening) {
      this.search = '';
      return;
    }
    const selected = this.options().findIndex(
      (option) => option.value === this.value() && !option.disabled,
    );
    this.activeIndex.set(this.openingIndex ?? (selected < 0 ? this.edge() : selected));
    this.openingIndex = undefined;
    this.position();
    this.scheduleScroll();
  }

  protected keydown(event: KeyboardEvent): void {
    if (this.disabled() || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    if (key === 'Escape') {
      if (this.open()) {
        event.preventDefault();
        this.close();
      }
      return;
    }
    if (key === 'Tab') {
      this.close();
      return;
    }
    if (key === 'Enter' || key === ' ') {
      if (this.open()) {
        event.preventDefault();
        this.choose(this.activeIndex());
      }
      return;
    }
    const direction = key === 'ArrowDown' || key === 'ArrowRight' ? 1 : -1;
    if (key.startsWith('Arrow') || key === 'Home' || key === 'End') {
      event.preventDefault();
      if (!this.open()) {
        const selected = this.options().findIndex(
          (option) => option.value === this.value() && !option.disabled,
        );
        this.show(
          key === 'Home' || key === 'End'
            ? this.edge(key === 'End')
            : selected < 0
              ? this.edge(direction < 0)
              : selected,
        );
      } else {
        this.activate(
          key === 'Home' || key === 'End'
            ? this.edge(key === 'End')
            : this.next(this.activeIndex(), direction),
        );
      }
      return;
    }
    if (key.length === 1 && !event.isComposing) {
      event.preventDefault();
      const now = Date.now();
      this.search = now - this.searchedAt > 700 ? key : this.search + key;
      this.searchedAt = now;
      const query = this.search.toLocaleLowerCase();
      const repeated = [...query].every((letter) => letter === query[0]);
      const prefix = repeated ? query[0] : query;
      const options = this.options();
      const start = repeated ? this.activeIndex() + 1 : this.activeIndex();
      for (let offset = 0; offset < options.length; offset++) {
        const index = (Math.max(0, start) + offset) % options.length;
        if (
          !options[index].disabled &&
          options[index].label.toLocaleLowerCase().startsWith(prefix)
        ) {
          if (this.open()) this.activate(index);
          else this.show(index);
          break;
        }
      }
    }
  }

  protected choose(index: number): void {
    const option = this.options()[index];
    if (!option || option.disabled || this.disabled()) return;
    this.close();
    this.trigger().nativeElement.focus({ preventScroll: true });
    this.valueChanged.emit(option.value);
  }

  protected hover(index: number): void {
    if (!this.options()[index]?.disabled) this.activeIndex.set(index);
  }

  protected pointerdown(event: PointerEvent): void {
    if (event.pointerType === 'mouse') event.preventDefault();
  }

  private show(index: number): void {
    this.openingIndex = index;
    this.panel().nativeElement.showPopover();
  }

  private close(): void {
    if (this.open()) this.panel().nativeElement.hidePopover();
  }

  private edge(last = false): number {
    const options = this.options();
    if (last) {
      for (let index = options.length - 1; index >= 0; index--)
        if (!options[index].disabled) return index;
      return -1;
    }
    return options.findIndex((option) => !option.disabled);
  }

  private next(index: number, direction: number): number {
    const options = this.options();
    for (let offset = 1; offset <= options.length; offset++) {
      const next = (index + direction * offset + options.length) % options.length;
      if (!options[next].disabled) return next;
    }
    return -1;
  }

  private activate(index: number): void {
    this.activeIndex.set(index);
    this.scheduleScroll();
  }

  private scheduleScroll(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      if (!this.open()) return;
      this.position();
      const option = this.panel().nativeElement.children[this.activeIndex()] as
        HTMLElement | undefined;
      if (!option) return;
      const panel = this.panel().nativeElement;
      if (option.offsetTop < panel.scrollTop) panel.scrollTop = option.offsetTop;
      else if (option.offsetTop + option.offsetHeight > panel.scrollTop + panel.clientHeight)
        panel.scrollTop = option.offsetTop + option.offsetHeight - panel.clientHeight;
    });
  }

  private position(): void {
    const panel = this.panel().nativeElement;
    const bounds = this.trigger().nativeElement.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    if (bounds.bottom < 0 || bounds.top > viewportHeight) {
      this.close();
      return;
    }
    const gap = 8;
    const width = Math.min(bounds.width, viewportWidth - gap * 2);
    const below = viewportHeight - bounds.bottom - gap * 2;
    const above = bounds.top - gap * 2;
    const desired = Math.min(panel.scrollHeight || 368, 368);
    const upwards = below < desired && above > below;
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.max(0, Math.min(368, upwards ? above : below))}px`;
    panel.style.left = `${Math.max(gap, Math.min(bounds.left, viewportWidth - width - gap))}px`;
    panel.style.top = upwards ? 'auto' : `${bounds.bottom + gap}px`;
    panel.style.bottom = upwards ? `${viewportHeight - bounds.top + gap}px` : 'auto';
  }
}
