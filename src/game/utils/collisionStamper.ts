export class CollisionStamper {
  constructor(private propName: string) {}
  stampFromTileset(
    layer: Phaser.Tilemaps.TilemapLayer,
    tileset: Phaser.Tilemaps.Tileset,
    skip?: (t: Phaser.Tilemaps.Tile) => boolean
  ) {
    const tp = tileset.tileProperties as unknown as Record<number, Record<string, unknown>>;
    layer.forEachTile(t => {
      if (!t || t.index < 0) return;
      if (skip && skip(t)) return;
      const src = tp?.[t.index];
      if (src && src[this.propName]) {
        const props = (t.properties ?? {}) as Record<string, unknown>;
        props[this.propName] = true;
        t.properties = props;
      }
    });
  }
}
