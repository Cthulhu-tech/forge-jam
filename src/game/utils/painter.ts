import { INDEX_ARRS } from "../../constants/map";
import { AutoTileMath } from "./autoTileMath";

export class Painter {
  constructor(private readonly w: number, private readonly h: number, private readonly cfg: AutoTileConfig) {}

  paintCompositeAutotilePerQuad(
    layer: Phaser.Tilemaps.TilemapLayer,
    combinedMask: BoolGrid,
    sources: Array<{ mask: BoolGrid; tilesetKey: string }>,
    collidable: boolean,
    tilesetMap: Record<string, Phaser.Tilemaps.Tileset>,
    floorOwner: (string | null)[][] | null,
    corridorFloorKey: string | null,
    corridorWallKey: string | null
  ) {
    const ids: NumGrid = combinedMask.map(r => r.map(v => (v ? 1 : 0)));
    const lastKeyAt = (x: number, y: number) => {
      let key: string | null = null;
      for (const s of sources) if (s.mask?.[y]?.[x]) key = s.tilesetKey;
      return key;
    };
    const corrAt = (cx: number, cy: number) => {
      if (!floorOwner || !corridorFloorKey) return false;
      if (cy < 0 || cy >= this.h || cx < 0 || cx >= this.w) return false;
      return floorOwner[cy][cx] === corridorFloorKey;
    };

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!combinedMask[y][x]) continue;

        const [a, b, c, d] = AutoTileMath.quad(this.cfg.indexArrs ?? INDEX_ARRS, ids, x, y, this.w, this.h);
        const tl = this.toZeroBased(a), tr = this.toZeroBased(b), bl = this.toZeroBased(c), br = this.toZeroBased(d);

        let keyTL = lastKeyAt(x, y);
        let keyTR = keyTL;
        let keyBL = keyTL;
        let keyBR = keyTL;

        if (corridorWallKey && corridorFloorKey && floorOwner) {
          const tlCorr = corrAt(x, y - 1) || corrAt(x - 1, y) || corrAt(x - 1, y - 1);
          const trCorr = corrAt(x, y - 1) || corrAt(x + 1, y) || corrAt(x + 1, y - 1);
          const blCorr = corrAt(x, y + 1) || corrAt(x - 1, y) || corrAt(x - 1, y + 1);
          const brCorr = corrAt(x, y + 1) || corrAt(x + 1, y) || corrAt(x + 1, y + 1);

          if (tlCorr) keyTL = corridorWallKey;
          if (trCorr) keyTR = corridorWallKey;
          if (blCorr) keyBL = corridorWallKey;
          if (brCorr) keyBR = corridorWallKey;
        }

        const tsTL = keyTL ? tilesetMap[keyTL] : null;
        const tsTR = keyTR ? tilesetMap[keyTR] : null;
        const tsBL = keyBL ? tilesetMap[keyBL] : null;
        const tsBR = keyBR ? tilesetMap[keyBR] : null;

        const sx = x * 2, sy = y * 2;
        if (tsTL) this.putTileWithCollision(layer, tsTL.firstgid + tl, sx,     sy,     collidable);
        if (tsTR) this.putTileWithCollision(layer, tsTR.firstgid + tr, sx + 1, sy,     collidable);
        if (tsBL) this.putTileWithCollision(layer, tsBL.firstgid + bl, sx,     sy + 1, collidable);
        if (tsBR) this.putTileWithCollision(layer, tsBR.firstgid + br, sx + 1, sy + 1, collidable);
      }
    }
  }

  private putTileWithCollision(layer: Phaser.Tilemaps.TilemapLayer, tileIndex: number, x: number, y: number, collidable: boolean) {
    const tile = layer.putTileAt(tileIndex, x, y, true);
    if (tile) (tile.properties as Record<string, unknown>)['ge_colide'] = collidable;
  }

  private toZeroBased(idx1to48: number) {
    const idx = Math.max(1, Math.min(48, idx1to48));
    return idx - 1;
  }
}
