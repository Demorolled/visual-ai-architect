const timerDisplay = document.getElementById('timerDisplay') as HTMLSpanElement;
const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
let timerInterval: number | null = null;
let remainingTime = 0;

startBtn.addEventListener('click', startTimer);
resetBtn.addEventListener('click', resetTimer);

function startTimer() {
  if (timerInterval !== null) return;
  if (remainingTime <= 0) return;
  timerInterval = setInterval(() => {
    remainingTime--;
    updateDisplay();
    if (remainingTime <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      remainingTime = 0;
      timerDisplay.textContent = '00:00:00';
      startBtn.textContent = 'Start';
      startBtn.disabled = false;
      return;
    }
    startBtn.textContent = 'Pause';
    startBtn.disabled = true;
  }, 1000);
}

function resetTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  remainingTime = 0;
  timerDisplay.textContent = '00:00:00';
  startBtn.textContent = 'Start';
  startBtn.disabled = false;
}

function updateDisplay() {
  const minutes = Math.floor(remainingTime / 6000) % 60;
  const seconds = Math.floor(remainingTime / 100) % 60;
  const milliseconds = remainingTime % 100;
  timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(milliseconds).padStart(2, '0')}`;
}