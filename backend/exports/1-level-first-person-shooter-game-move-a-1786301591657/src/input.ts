export class InputHandler {
  private velocity = { x: 0, y: 0 };
  private keyMap = new Map<string, boolean>();
  constructor() {}
  update() {
    this.keyMap.set('ArrowRight', document.activeElement !== document.body && document.activeElement.tagName !== 'INPUT');
    this.keyMap.set('ArrowLeft', document.activeElement !== document.body && document.activeElement.tagName !== 'INPUT');
    this.keyMap.set('ArrowUp', document.activeElement !== document.body && document.activeElement.tagName !== 'INPUT');
    this.keyMap.set('ArrowDown', document.activeElement !== document.body && document.activeElement.tagName !== 'INPUT');
    this.keyMap.forEach((pressed, key) => {
      if (pressed) {
        if (key === 'ArrowRight') this.velocity.x = 1;
        if (key === 'ArrowLeft') this.velocity.x = -1;
        if (key === 'ArrowUp') this.velocity.y = -1;
        if (key === 'ArrowDown') this.velocity.y = 1;
      } else {
        if (key === 'ArrowRight') this.velocity.x = 0;
        if (key === 'ArrowLeft') this.velocity.x = 0;
        if (key === 'ArrowUp') this.velocity.y = 0;
        if (key === 'ArrowDown') this.velocity.y = 0;
      }
    });
  }
}