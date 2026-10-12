import { WaveManager } from '../wave-manager/wave-manager.ts';

export class EnemyAI {
  private waveManager: WaveManager;

  constructor() {
    this.waveManager = new WaveManager();
  }

  registerEnemy(waveIndex: number): void {
    const wave = this.waveManager.getWaveById(waveIndex);
    if (wave) {
      wave.enemies.push({ id: wave.enemies.length + 1, state: 'alive', event: '' });
    }
  }

  attackEnemy(waveIndex: number, enemyIndex: number): boolean {
    const wave = this.waveManager.getWaveById(waveIndex);
    if (wave && enemyIndex < wave.enemies.length) {
      wave.enemies[enemyIndex].state = 'dead';
      return true;
    }
    return false;
  }

  updateEnemyState(state: 'alive' | 'dead', event: string): boolean {
    const enemyIndex = this.findAliveEnemyIndex();
    if (enemyIndex !== -1) {
      this.attackEnemy(0, enemyIndex);
      return true;
    }
    return false;
  }

  private findAliveEnemyIndex(): number {
    const wave = this.waveManager.getWaveById(0);
    if (wave && wave.enemies.length > 0) {
      return wave.enemies.findIndex(enemy => enemy.state === 'alive');
    }
    return -1;
  }

  removeEnemy(waveIndex: number, enemyIndex: number): boolean {
    const wave = this.waveManager.getWaveById(waveIndex);
    if (wave && enemyIndex < wave.enemies.length) {
      wave.enemies.splice(enemyIndex, 1);
      return true;
    }
    return false;
  }

  update(): void {
    const waves = this.waveManager.getWaveById(0);
    if (waves && waves.enemies.length > 0) {
      for (const enemy of waves.enemies) {
        if (enemy.state === 'alive') {
          console.log(`Enemy ${enemy.id} is attacking`);
          break;
        }
      }
    }
  }
}