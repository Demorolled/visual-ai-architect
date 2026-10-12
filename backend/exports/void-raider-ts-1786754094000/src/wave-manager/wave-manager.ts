export interface Enemy {
  id: number;
  state: 'alive' | 'dead';
  event: string;
}

interface Wave {
  id: number;
  size: number;
  enemies: Enemy[];
}

export class WaveManager {
  private waves: Wave[] = [];
  private nextEnemyId = 1;

  constructor() {
    this.waves = [];
  }

  registerWave(waveData: { size: number; enemyCount: number }) {
    const enemies: Enemy[] = [];
    for (let i = 0; i < waveData.enemyCount; i++) {
      enemies.push({ id: this.nextEnemyId++, state: 'alive', event: '' });
    }
    const wave: Wave = {
      id: this.getWaveId(),
      size: waveData.size,
      enemies,
    };
    this.waves.push(wave);
  }

  getWaveById(id: number) {
    return this.waves.find(wave => wave.id === id);
  }

  getEnemyAliveAt(waveIndex: number, enemyIndex: number) {
    const wave = this.getWaveById(waveIndex);
    if (wave) {
      return wave.enemies[enemyIndex];
    }
    return null;
  }

  updateEnemyStateAt(waveIndex: number, enemyIndex: number, newState: 'alive' | 'dead', event: string) {
    const wave = this.getWaveById(waveIndex);
    if (wave && wave.enemies[enemyIndex]) {
      wave.enemies[enemyIndex] = { ...wave.enemies[enemyIndex], state: newState, event };
      return true;
    }
    return false;
  }

  removeEnemyAt(waveIndex: number, enemyIndex: number) {
    const wave = this.getWaveById(waveIndex);
    if (wave) {
      wave.enemies.splice(enemyIndex, 1);
      return true;
    }
    return false;
  }

  getWaveCount() {
    return this.waves.length;
  }

  private getWaveId() {
    return Date.now();
  }
}