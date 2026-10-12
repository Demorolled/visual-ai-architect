export class CountdownTimer {
  private timeLeft: number = 0;
  private interval: number | null = null;
  private isRunning: boolean = false;
  private targetTime: number = 0;

  constructor() {
    this.timeLeft = 0;
    this.interval = null;
    this.isRunning = false;
    this.targetTime = 0;
  }

  public start(minutes: number): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.targetTime = minutes * 60;
    this.timeLeft = this.targetTime;
    this.interval = setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        this.stop();
        this.timeLeft = 0;
        return;
      }
      this.updateDisplay();
    }, 1000);
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    clearInterval(this.interval);
    this.interval = null;
    this.timeLeft = 0;
  }

  public reset(): void {
    this.stop();
    this.timeLeft = 0;
  }

  private updateDisplay(): void {
    const minutes = Math.floor(this.timeLeft / 60);
    const seconds = this.timeLeft % 60;
    const display = document.getElementById('display') as HTMLSpanElement;
    display.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
}