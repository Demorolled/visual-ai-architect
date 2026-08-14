export class Game {
  private scene: SceneRenderer;
  constructor(scene: SceneRenderer) { this.scene = scene; }
  private inputHandler: InputHandler;
  private gameLoop: GameLoop;
  private tick() {
    this.inputHandler.update();
    this.gameLoop.update();
    this.scene.render();
  }
  public run() {
    this.inputHandler = new InputHandler();
    this.gameLoop = new GameLoop();
    setInterval(this.tick.bind(this), 16);
  }
}
export class InputHandler { update() {} }
export class GameLoop { update() {} }
export class SceneRenderer { render() {} }