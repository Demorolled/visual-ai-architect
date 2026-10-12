/**
 * Ship Controls — translates keyboard input into control state and forwards
 * discrete requests to the Combat Engine (data contract: Ship Controls →
 * Combat Engine : requests).
 *
 * Controls: ↑/W thrust, ←/A and →/D turn, Space fire.
 */

import type { CombatEngine } from '../combat-engine/combat-engine.ts';

export type ControlAction = 'thrust' | 'turn-left' | 'turn-right' | 'fire';

export interface ControlState {
  thrust: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  fire: boolean;
}

const KEY_MAP: Record<string, ControlAction> = {
  ArrowUp: 'thrust',
  KeyW: 'thrust',
  ArrowLeft: 'turn-left',
  KeyA: 'turn-left',
  ArrowRight: 'turn-right',
  KeyD: 'turn-right',
  Space: 'fire',
};

export class ShipControls {
  private state: ControlState = { thrust: false, turnLeft: false, turnRight: false, fire: false };

  constructor(private readonly engine: CombatEngine) {}

  /** Bind keyboard listeners. */
  attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  /** Remove keyboard listeners. */
  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  /** Current control state, read every tick by the engine. */
  getState(): ControlState {
    return { ...this.state };
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    this.setAction(action, true);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    this.setAction(action, false);
  };

  private setAction(action: ControlAction, down: boolean): void {
    switch (action) {
      case 'thrust':
        this.state.thrust = down;
        break;
      case 'turn-left':
        this.state.turnLeft = down;
        break;
      case 'turn-right':
        this.state.turnRight = down;
        break;
      case 'fire':
        this.state.fire = down;
        if (down) this.engine.handleRequest('fire');
        return;
    }
    if (down) this.engine.handleRequest(action);
  }
}
