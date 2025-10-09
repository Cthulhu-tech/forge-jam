export class CorridorCarver {
  constructor(
    private mapW: number,
    private mapH: number,
    private floorId: number,
    private doorId: number,
  ) {}
  carve(
    corridors: { rects: CorridorRect[] }[],
    layers: { floor: Phaser.Tilemaps.TilemapLayer; walls: Phaser.Tilemaps.TilemapLayer; deco: Phaser.Tilemaps.TilemapLayer; misc: Phaser.Tilemaps.TilemapLayer }
  ) {
    const { floor, walls, deco, misc } = layers;
    for (const c of corridors) for (const rc of c.rects) {
      const x0 = Math.max(0, Math.floor(rc.minX));
      const y0 = Math.max(0, Math.floor(rc.minY));
      const x1 = Math.min(this.mapW, Math.ceil(rc.maxX));
      const y1 = Math.min(this.mapH, Math.ceil(rc.maxY));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const wt = walls.getTileAt(x, y);
        if (wt && wt.index === this.doorId) walls.putTileAt(-1, x, y, false);
        floor.putTileAt(this.floorId, x, y, false);
        walls.putTileAt(-1, x, y, false);
        deco.putTileAt(-1, x, y, false);
        misc.putTileAt(-1, x, y, false);
      }
    }
  }
}
