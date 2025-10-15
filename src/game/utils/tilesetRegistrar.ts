import { TILECOUNT_PER_SET } from "../../constants/map";

export class TilesetRegistrar {
  private map: Phaser.Tilemaps.Tilemap;
  private subTile: number;
  private nextFirstGid = 1;

  constructor(map: Phaser.Tilemaps.Tilemap, subTile: number) {
    this.map = map;
    this.subTile = subTile;
  }

  register(keys: string[]): Record<string, Phaser.Tilemaps.Tileset> {
    const out: Record<string, Phaser.Tilemaps.Tileset> = {};
    for (const key of keys) {
      const ts = this.map.addTilesetImage(
        key,
        key,
        this.subTile,
        this.subTile,
        0,
        0,
        this.nextFirstGid
      ) as Phaser.Tilemaps.Tileset;
      out[key] = ts;
      this.nextFirstGid += TILECOUNT_PER_SET;
    }
    return out;
  }
}
