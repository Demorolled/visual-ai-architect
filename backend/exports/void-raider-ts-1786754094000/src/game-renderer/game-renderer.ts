import { ShipState, CombatAction, CombatState, CombatEngine } from '../combat-engine/combat-engine.ts';

export function render(container: HTMLElement) {
  const title = document.createElement('h1');
  title.textContent = 'VOID RAIDER';
  title.style.color = '#00d9ff';
  container.appendChild(title);

  const livesDisplay = document.createElement('div');
  livesDisplay.style.display = 'flex';
  livesDisplay.style.alignItems = 'center';
  livesDisplay.style.gap = '4px';
  for (let i = 0; i < 3; i++) {
    const life = document.createElement('span');
    life.style.borderRadius = '50%';
    life.style.width = '16px';
    life.style.height = '16px';
    life.style.border = '2px solid #4ade80';
    life.style.display = 'inline-block';
    if (i < 2) life.style.opacity = '0.3';
    livesDisplay.appendChild(life);
  }
  container.appendChild(livesDisplay);

  const scoreDisplay = document.createElement('div');
  scoreDisplay.style.display = 'flex';
  scoreDisplay.style.alignItems = 'center';
  scoreDisplay.style.gap = '4px';
  const scoreLabel = document.createElement('span');
  scoreLabel.textContent = 'Score: ';
  scoreLabel.style.color = '#00d9ff';
  const scoreValue = document.createElement('span');
  scoreValue.textContent = '0';
  scoreValue.style.color = '#4ade80';
  scoreDisplay.appendChild(scoreLabel);
  scoreDisplay.appendChild(scoreValue);
  container.appendChild(scoreDisplay);

  const waveTimer = document.createElement('div');
  waveTimer.style.display = 'flex';
  waveTimer.style.alignItems = 'center';
  waveTimer.style.gap = '4px';
  const waveLabel = document.createElement('span');
  waveLabel.textContent = 'Wave: ';
  waveLabel.style.color = '#00d9ff';
  const waveValue = document.createElement('span');
  waveValue.textContent = '1';
  waveValue.style.color = '#f87171';
  waveTimer.appendChild(waveLabel);
  waveTimer.appendChild(waveValue);
  container.appendChild(waveTimer);

  const healthBars = document.createElement('div');
  healthBars.style.display = 'flex';
  healthBars.style.gap = '4px';
  for (let i = 0; i < 3; i++) {
    const bar = document.createElement('progress');
    bar.max = 100;
    bar.value = 100;
    bar.style.width = '100px';
    bar.style.height = '12px';
    bar.style.background = 'rgba(255,255,255,0.1)';
    bar.style.borderRadius = '4px';
    bar.style.marginRight = '4px';
    healthBars.appendChild(bar);
  }
  container.appendChild(healthBars);
}