/** Minimal ResizeObserver stand-in: jsdom has none. Tests drive it with the static trigger. */
export class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];

  private callback: (entries: unknown[]) => void;
  private targets: Element[] = [];

  constructor(callback: (entries: unknown[]) => void) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }

  unobserve(target: Element) {
    this.targets = this.targets.filter((t) => t !== target);
  }

  disconnect() {
    this.targets = [];
  }

  /** Report a new content size to every observer watching the target. */
  static trigger(target: Element, width: number, height: number) {
    for (const observer of FakeResizeObserver.instances) {
      if (observer.targets.includes(target)) observer.callback([{ target, contentRect: { width, height } }]);
    }
  }
}
