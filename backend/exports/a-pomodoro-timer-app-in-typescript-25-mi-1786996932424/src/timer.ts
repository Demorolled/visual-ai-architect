export class Timer {
  private intervalId: NodeJS.Timeout | null = null;
  private remainingTime: number;
  private isRunning = false;
  private history: { startTime: Date; endTime: Date }[] = [];

  constructor(workMinutes: number, breakMinutes: number) {
    this.remainingTime = workMinutes * 60;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.remainingTime--;
      if (this.remainingTime <= 0) {
        this.stop();
        this.history.push({ startTime: new Date(), endTime: new Date() });
      }
    }, 1000);
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public undo(): void {
    if (this.history.length === 0) return;
    const last = this.history.pop();
    if (last) {
      this.remainingTime = Math.max(0, this.remainingTime + (last.endTime.getTime() - last.startTime.getTime()) / 1000);
    }
  }
}