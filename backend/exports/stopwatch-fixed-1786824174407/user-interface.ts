export function render(container: HTMLElement) {
  let elapsedTime = 0;
  let timerInterval: number | null = null;
  let startTime = 0;

  const stopwatchDisplay = document.createElement('div');
  stopwatchDisplay.className = 'stopwatch-display';
  stopwatchDisplay.textContent = '00:00:00';
  container.appendChild(stopwatchDisplay);

  const buttons = document.createElement('div');
  buttons.className = 'buttons';
  container.appendChild(buttons);

  const startBtn = document.createElement('button');
  startBtn.className = 'btn';
  startBtn.textContent = '▶ Start';
  startBtn.onclick = () => {
    if (timerInterval !== null) {
      clearInterval(timerInterval);
      timerInterval = null;
      startBtn.textContent = '▶ Start';
      return;
    }
    startBtn.textContent = '⏸ Pause';
    startTime = Date.now() - elapsedTime;
    timerInterval = setInterval(() => {
      elapsedTime = Date.now() - startTime;
      stopwatchDisplay.textContent = formatTime(elapsedTime);
    }, 1000);
  };
  buttons.appendChild(startBtn);

  const stopBtn = document.createElement('button');
  stopBtn.className = 'btn';
  stopBtn.textContent = '⏹ Stop';
  stopBtn.onclick = () => {
    if (timerInterval !== null) clearInterval(timerInterval);
    timerInterval = null;
    elapsedTime = 0;
    startTime = 0;
    startBtn.textContent = '▶ Start';
    stopwatchDisplay.textContent = '00:00:00';
  };
  buttons.appendChild(stopBtn);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn';
  resetBtn.textContent = '↻ Reset';
  resetBtn.onclick = () => {
    if (timerInterval !== null) clearInterval(timerInterval);
    timerInterval = null;
    elapsedTime = 0;
    startTime = 0;
    startBtn.textContent = '▶ Start';
    stopwatchDisplay.textContent = '00:00:00';
  };
  buttons.appendChild(resetBtn);

  const lapBtn = document.createElement('button');
  lapBtn.className = 'btn';
  lapBtn.textContent = '⏱ Lap';
  lapBtn.onclick = () => {
    const lapDisplay = document.createElement('div');
    lapDisplay.className = 'lap-display';
    lapDisplay.textContent = formatTime(elapsedTime);
    container.appendChild(lapDisplay);
  };
  buttons.appendChild(lapBtn);
}

function formatTime(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return String(hours).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}
