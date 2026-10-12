export class CountdownTimer {
  private timeLeft: number = 0;
  private isRunning: boolean = false;
  private intervalId: number | null = null;

  constructor(private display: HTMLSpanElement) {}

  start(minutes: number) {
    if (this.isRunning) return;
    this.timeLeft = minutes * 60;
    this.isRunning = true;
    this.updateDisplay();
    this.intervalId = setInterval(() => {
      this.timeLeft -= 1;
      this.updateDisplay();
      if (this.timeLeft <= 0) this.stop();
    }, 1000);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.updateDisplay();
  }

  reset() {
    this.stop();
    this.timeLeft = 0;
    this.updateDisplay();
  }

  private updateDisplay() {
    const minutes = Math.floor(this.timeLeft / 60);
    const seconds = this.timeLeft % 60;
    this.display.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
}