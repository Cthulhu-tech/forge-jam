export class RoomPoolService {
  private readonly cache: Phaser.Cache.CacheManager;
  private readonly rng: Phaser.Math.RandomDataGenerator;
  private readonly size: Record<Exclude<RoomKey, 'start'>, number>;
  private readonly keyPrefix: string;

  constructor(opts: {
    cache: Phaser.Cache.CacheManager;
    seed: string;
    size: Record<Exclude<RoomKey, 'start'>, number>;
    keyPrefix?: string;
  }) {
    this.cache = opts.cache;
    this.rng = new Phaser.Math.RandomDataGenerator([String(opts.seed)]);
    this.size = opts.size;
    this.keyPrefix = opts.keyPrefix ?? 'room_';
  }

  build(keys: RoomKey[] = ['start', 'room', 'next_level']): Map<RoomKey, RawLayer[][]> {
    const out = new Map<RoomKey, RawLayer[][]>();

    for (const key of keys) {
      const cacheKey = `${this.keyPrefix}${key}`;
      const json = this.cache.json.get(cacheKey) as PlacedRoom[];

      if (!Array.isArray(json) || !Array.isArray(json[0]?.layers)) {
        throw new Error(`"${cacheKey}" need RawMap[] from .layers: RawLayer[]`);
      }

      if (key === 'start') {
        const one = json[this.rng.integerInRange(0, json.length - 1)];
        out.set('start', [one.layers]);
      } else {
        const need = this.size[key] ?? 0;
        const picked = this.pickExact(json, need).map(m => m.layers);
        out.set(key, picked);
      }
    }

    return out;
  }

  private shuffleInPlace<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.rng.integerInRange(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  private pickExact<T>(arr: T[], n: number): T[] {
    if (n <= 0 || arr.length === 0) return [];
    if (n <= arr.length) {
      const idx = [...arr.keys()];
      this.shuffleInPlace(idx);
      return idx.slice(0, n).map(i => arr[i]);
    }
    const res = this.shuffleInPlace([...arr]);
    while (res.length < n) {
      res.push(arr[this.rng.integerInRange(0, arr.length - 1)]);
    }
    return res;
  }
}
