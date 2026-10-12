import { ShipControls } from '../ship-controls/ship-controls.ts';
import { EnemyAI } from '../enemy-ai/enemy-ai.ts';

export interface ShipState { health: number; position: { x: number; y: number }; velocity: { x: number; y: number }; rotation: number; shield: number; energy: number; weapons: { name: string; cooldown: number; state: 'ready' | 'charging' | 'firing' }[]; }
export interface CombatAction { type: 'fire' | 'shield' | 'recharge'; target?: { x: number; y: number }; weaponIndex?: number; }
export interface CombatState { ships: ShipState[]; actions: CombatAction[]; time: number; round: number; enemyWave: { ships: number; strength: number; speed: number; }; playerScore: number; enemyScore: number; gameStatus: 'running' | 'paused' | 'gameover'; }
export class CombatEngine {
  private state: CombatState;
  private nextShipIndex: number;
  private nextEnemyIndex: number;
  private actionQueue: CombatAction[];
  private actionsProcessed: number;
  private lastActionTime: number;
  private actionCooldown: number;
  private actionCooldownMax: number;
  constructor() {
    this.state = { ships: [], actions: [], time: 0, round: 1, enemyWave: { ships: 0, strength: 0, speed: 0 }, playerScore: 0, enemyScore: 0, gameStatus: 'running' };
    this.nextShipIndex = 0;
    this.nextEnemyIndex = 0;
    this.actionQueue = [];
    this.actionsProcessed = 0;
    this.lastActionTime = 0;
    this.actionCooldown = 0;
    this.actionCooldownMax = 50;
  }
  public addShip(ship: ShipState) {
    this.state.ships.push(ship);
  }
  public removeShip(index: number) {
    this.state.ships.splice(index, 1);
  }
  public addEnemyWave(wave: { ships: number; strength: number; speed: number }) {
    this.state.enemyWave = wave;
    this.nextEnemyIndex = 0;
    this.state.round++;
  }
  public addAction(action: CombatAction) {
    this.actionQueue.push(action);
  }
  public update(dt: number) {
    this.lastActionTime += dt;
    while (this.lastActionTime >= this.actionCooldown && this.actionQueue.length > 0) {
      const action = this.actionQueue.shift()!;
      this.actionsProcessed++;
      this.lastActionTime = 0;
      this.handleAction(action);
    }
    this.state.time += dt;
  }
  private handleAction(action: CombatAction) {
    switch (action.type) {
      case 'fire':
        const shipIndex = action.target ? this.findShip(action.target.x, action.target.y) : this.nextShipIndex;
        if (shipIndex !== undefined) {
          const ship = this.state.ships[shipIndex];
          if (ship && ship.energy > 0 && this.actionsProcessed % 2 === 0) {
            this.actionsProcessed++;
            this.state.actions.push(action);
            this.state.playerScore++;
            this.fireWeapon(ship, action.target);
          }
        }
        this.nextShipIndex = (this.nextShipIndex + 1) % this.state.ships.length;
        break;
      case 'shield':
        const shieldShipIndex = this.findShip(action.target.x, action.target.y);
        if (shieldShipIndex !== undefined) {
          const shieldShip = this.state.ships[shieldShipIndex];
          if (shieldShip && shieldShip.shield > 0) {
            this.state.ships[shieldShipIndex].shield = 0;
          }
        }
        break;
      case 'recharge':
        const rechargeShipIndex = this.findShip(action.target.x, action.target.y);
        if (rechargeShipIndex !== undefined) {
          const rechargeShip = this.state.ships[rechargeShipIndex];
          if (rechargeShip && rechargeShip.energy < 100) {
            this.state.ships[rechargeShipIndex].energy += 10;
          }
        }
        break;
    }
  }
  private findShip(x: number, y: number) {
    for (let i = 0; i < this.state.ships.length; i++) {
      const ship = this.state.ships[i];
      if (Math.abs(ship.position.x - x) < 5 && Math.abs(ship.position.y - y) < 5) {
        return i;
      }
    }
    return undefined;
  }
  private fireWeapon(ship: ShipState, target: { x: number; y: number }) {
    const weapon = ship.weapons[0];
    if (weapon.state === 'ready') {
      weapon.state = 'charging';
      this.actionCooldown = this.actionCooldownMax;
      return;
    }
    if (weapon.state === 'charging') {
      weapon.cooldown++;
      if (weapon.cooldown >= 30) {
        weapon.state = 'firing';
        weapon.cooldown = 0;
        this.actionCooldown = 0;
        this.state.actions.push({ type: 'fire', target: target });
        this.state.playerScore++;
        return;
      }
      return;
    }
    if (weapon.state === 'firing') {
      weapon.cooldown++;
      if (weapon.cooldown >= 60) {
        weapon.state = 'ready';
        weapon.cooldown = 0;
        return;
      }
      return;
    }
  }
}