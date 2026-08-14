export class Item {
  private position: { x: number; y: number; z: number };
  private scale: { x: number; y: number; z: number };
  private color: string;
  private picked: boolean;

  constructor(x: number, y: number, z: number) {
    this.position = { x, y, z };
    this.scale = { x: 0.5, y: 0.5, z: 0.5 };
    this.color = '#ffd700';
    this.picked = false;
  }

  public update(dt: number) {}

  public render(renderer: import('three').Renderer) {
    const geometry = new import('three').SphereGeometry(this.scale.x, this.scale.y, this.scale.z);
    const material = new import('three').MeshBasicMaterial({ color: this.color });
    const mesh = new import('three').Mesh(geometry, material);
    mesh.position.set(this.position.x, this.position.y, this.position.z);
    renderer.scene.add(mesh);
  }

  public onPick() {
    this.picked = true;
  }

  public isPicked() {
    return this.picked;
  }
}