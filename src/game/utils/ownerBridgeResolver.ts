import { MaskOps } from "./maskOps";

export class OwnerBridgeResolver {
  constructor(private readonly mask: MaskOps, private readonly w: number, private readonly h: number) {}

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

  computeRelaxedWallsAndBridges(solidMask: BoolGrid, floorOwner: (string | null)[][]): { solid: BoolGrid; bridges: BoolGrid } {
    const solidOut = this.mask.makeMask(false);
    const bridges = this.mask.makeMask(false);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!solidMask[y][x]) continue;

        const up    = y > 0 ? floorOwner[y - 1][x] : null;
        const down  = y + 1 < this.h ? floorOwner[y + 1][x] : null;
        const left  = x > 0 ? floorOwner[y][x - 1] : null;
        const right = x + 1 < this.w ? floorOwner[y][x + 1] : null;

        const udOpen = up !== null && down !== null;
        const lrOpen = left !== null && right !== null;

        if (udOpen || lrOpen) {
          bridges[y][x] = true;
        } else {
          solidOut[y][x] = true;
        }
      }
    }
    return { solid: solidOut, bridges };
  }

  assignBridgeOwnersAndExtendFloor(
    bridgeMask: BoolGrid,
    floorOwner0: (string | null)[][],
    floorCombined0: BoolGrid,
    corridorFloorKey: string
  ): {
    bridgeSources: Array<{ mask: BoolGrid; tilesetKey: string }>;
    floorOwner: (string | null)[][];
    floorCombined: BoolGrid;
  } {
    const owner: (string | null)[][] = floorOwner0.map(row => row.slice());
    const floorCombined: BoolGrid = this.mask.makeMask(false);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) floorCombined[y][x] = floorCombined0[y][x];

    const masksByKey: Record<string, BoolGrid> = {};
    const ensureMask = (key: string) => {
      if (!masksByKey[key]) masksByKey[key] = this.mask.makeMask(false);
      return masksByKey[key];
    };

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!bridgeMask[y][x]) continue;

        const chosen = this.chooseBridgeOwner(x, y, owner, corridorFloorKey);
        const key = chosen ?? corridorFloorKey;

        owner[y][x] = key;
        floorCombined[y][x] = true;

        const mask = ensureMask(key);
        mask[y][x] = true;
      }
    }

    const bridgeSources: Array<{ mask: BoolGrid; tilesetKey: string }> =
      Object.keys(masksByKey).map(k => ({ mask: masksByKey[k], tilesetKey: k }));

    return { bridgeSources, floorOwner: owner, floorCombined };
  }

  chooseBridgeOwner(
    x: number,
    y: number,
    owner: (string | null)[][],
    corridorKey: string
  ): string | null {
    const counts = new Map<string, number>();
    const inc = (k: string | null) => {
      if (!k) return;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    };
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (!this.mask.inBounds(nx, ny)) continue;
        inc(owner[ny][nx]);
      }
    }

    if (counts.size === 0) return corridorKey;

    const corridorCnt = counts.get(corridorKey) ?? 0;

    let bestRoomKey: string | null = null;
    let bestRoomCnt = -1;
    for (const [k, v] of counts.entries()) {
      if (k === corridorKey) continue;
      if (v > bestRoomCnt || (v === bestRoomCnt && bestRoomKey !== null && k < bestRoomKey)) {
        bestRoomKey = k;
        bestRoomCnt = v;
      }
    }

    if (corridorCnt >= Math.max(0, bestRoomCnt)) return corridorKey;

    return bestRoomKey;
  }
}
