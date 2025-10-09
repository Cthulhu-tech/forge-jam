import RBush from 'rbush';

export function roomFloorSize(layers: RawLayer[]): { w: number; h: number } {
  const floor = layers.find(l => l.name.toLowerCase() === 'floor');
  if (!floor) {
    let w = 0, h = 0;
    for (const l of layers) { w = Math.max(w, l.width); h = Math.max(h, l.height); }
    return { w, h };
  }
  return { w: floor.width, h: floor.height };
}

export function centerOf(r: PlacedRoom) {
  return { cx: r.x + Math.floor(r.w / 2), cy: r.y + Math.floor(r.h / 2) };
}

export function rectFromXYWH(x: number, y: number, w: number, h: number, payload?: unknown): AABB {
  return { minX: x, minY: y, maxX: x + w, maxY: y + h, payload };
}

export class RoomPlacer {
  private readonly rng: Phaser.Math.RandomDataGenerator;
  private readonly mapW: number;
  private readonly mapH: number;
  private readonly maxAttempts: number;
  private index: RBush<AABB>;

  constructor(opts: { seed: string; mapWidth: number; mapHeight: number; maxAttempts?: number }) {
    this.rng = new Phaser.Math.RandomDataGenerator([String(opts.seed)]);
    this.mapW = opts.mapWidth;
    this.mapH = opts.mapHeight;
    this.maxAttempts = opts.maxAttempts ?? 300;
    this.index = new RBush<AABB>();
  }

  place(allRooms: Array<{ key: RoomKey; layers: RawLayer[] }>): PlacedRoom[] {
    const shuffled = [...allRooms];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = this.rng.integerInRange(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const placed: PlacedRoom[] = [];

    for (const r of shuffled) {
      const { w, h } = roomFloorSize(r.layers);
      if (w > this.mapW || h > this.mapH) continue;

      let placedOne: PlacedRoom | null = null;

      for (let a = 0; a < this.maxAttempts; a++) {
        const x = this.rng.integerInRange(0, this.mapW - w);
        const y = this.rng.integerInRange(0, this.mapH - h);
        const candidate = rectFromXYWH(x, y, w, h);

        const hits = this.index.search(candidate);
        const intersects = hits.some(hh =>
          !(candidate.maxX <= hh.minX || hh.maxX <= candidate.minX || candidate.maxY <= hh.minY || hh.maxY <= candidate.minY)
        );
        if (!intersects) {
          placedOne = { key: r.key, layers: r.layers, x, y, w, h };
          this.index.insert({ ...candidate, payload: placedOne });
          placed.push(placedOne);
          break;
        }
      }
    }

    return placed;
  }
}
