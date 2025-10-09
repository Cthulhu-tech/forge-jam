import { first_gid } from "../../constants/map";

export class LayerBlitter {
  constructor(
    private mapW: number,
    private mapH: number,
  ) {}
  private toLocal(layerName: string, gid: number): number {
    if (gid === 0) return -1;
    const fg = first_gid[layerName.toLowerCase()] ?? 1;
    const local = gid - fg;
    return local >= 0 ? local : -1;
  }
  blit(layer: Phaser.Tilemaps.TilemapLayer, raw: RawLayer, dx: number, dy: number) {
    const sw = raw.width, sh = raw.height, lname = raw.name.toLowerCase();
    for (let sy = 0; sy < sh; sy++) {
      const srow = sy * sw;
      const y = dy + sy; if (y < 0 || y >= this.mapH) continue;
      for (let sx = 0; sx < sw; sx++) {
        const x = dx + sx; if (x < 0 || x >= this.mapW) continue;
        const local = this.toLocal(lname, raw.data[srow + sx] | 0);
        layer.putTileAt(local >= 0 ? local : -1, x, y, false);
      }
    }
  }
}