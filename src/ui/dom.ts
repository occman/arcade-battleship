type Child = Node | string | number | null | undefined | false;

type Attrs<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], 'style' | 'children'>> & {
  class?: string;
  style?: Partial<CSSStyleDeclaration>;
  dataset?: Record<string, string>;
  onClick?: (e: MouseEvent) => void;
};

/** Tiny element builder: h('button', { class: 'btn', onClick }, 'START'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs<K> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: className, style, dataset, onClick, ...rest } = attrs;
  if (className) el.className = className;
  if (style) Object.assign(el.style, style);
  if (dataset) Object.assign(el.dataset, dataset);
  if (onClick) el.addEventListener('click', onClick as EventListener);
  Object.assign(el, rest);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Registers a window keydown handler and returns its remover. */
export function onKey(handler: (e: KeyboardEvent) => void): () => void {
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}

/**
 * True when Enter/Space is about to activate a keyboard-focused button or link.
 * Screen-level shortcuts must yield in that case so the focused control wins.
 */
export function activatesFocusedControl(e: KeyboardEvent): boolean {
  if (e.key !== 'Enter' && e.key !== ' ') return false;
  const el = document.activeElement;
  if (!(el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement)) return false;
  return el.matches(':focus-visible');
}
