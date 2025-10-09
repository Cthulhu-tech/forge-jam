export class TilesetPropsMerger {
  constructor(private scene: Phaser.Scene) {}
  merge(cacheKey: string, tileset: Phaser.Tilemaps.Tileset) {
    const json = this.scene.cache.json.get(cacheKey);
    if (!json || !Array.isArray(json.tiles)) return;
    const target = tileset.tileProperties as Record<number, Record<string, unknown>>;
    for (const t of json.tiles) {
      if (!t || typeof t.id !== 'number') continue;
      const dst = target[t.id] ?? {};
      if (Array.isArray(t.properties)) {
        for (const p of t.properties) dst[p.name] = p.value;
      }
      target[t.id] = dst;
    }
  }
}