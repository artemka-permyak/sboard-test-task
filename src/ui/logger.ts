type Source = 'pixi' | 'skia' | 'info';

export class Logger {
  constructor(
    private readonly listEl: HTMLElement,
    private readonly statusEl: HTMLElement,
  ) {}

  log(message: string): void {
    const src: Source = message.startsWith('pixi:')
      ? 'pixi'
      : message.startsWith('skia:')
        ? 'skia'
        : 'info';

    const li = document.createElement('li');
    li.className = `src-${src}`;
    const time = new Date().toLocaleTimeString();
    li.textContent = `[${time}] ${message}`;
    this.listEl.prepend(li);

    while (this.listEl.children.length > 100) this.listEl.lastChild?.remove();

    console.log(message);
  }

  setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  clear(): void {
    this.listEl.innerHTML = '';
  }
}
