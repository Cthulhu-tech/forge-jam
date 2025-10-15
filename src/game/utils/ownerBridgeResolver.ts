export class OwnerBridgeResolver {
  constructor(private readonly w: number, private readonly h: number) {}

  buildOwnerGrid(combinedMask: BoolGrid, sources: Array<{ mask: BoolGrid; tilesetKey: string }>): (string | null)[][] {
    const owner: (string | null)[][] = Array.from({ length: this.h }, () => Array<string | null>(this.w).fill(null));
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!combinedMask[y][x]) continue;
        let k: string | null = null;
        for (const s of sources) if (s.mask?.[y]?.[x]) k = s.tilesetKey;
        owner[y][x] = k;
      }
    }
    return owner;
  }
}
