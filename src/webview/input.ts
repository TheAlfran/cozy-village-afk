export class InputManager {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();

  constructor(target: Window) {
    target.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'e', 'i', 'escape', ' '].includes(key)) event.preventDefault();
      if (!this.held.has(key)) this.pressed.add(key);
      this.held.add(key);
    });
    target.addEventListener('keyup', (event) => this.held.delete(event.key.toLowerCase()));
    target.addEventListener('blur', () => this.held.clear());
  }

  isHeld(key: string): boolean { return this.held.has(key); }
  consume(key: string): boolean {
    const found = this.pressed.has(key);
    this.pressed.delete(key);
    return found;
  }

  clear(): void {
    this.held.clear();
    this.pressed.clear();
  }
}
