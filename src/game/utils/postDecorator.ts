import { MaskOps } from "./maskOps";
import * as ROT from 'rot-js';

export class PostDecorator {
  private w: number;
  private h: number;
  private mask: MaskOps;

  constructor(w: number, h: number, mask: MaskOps) {
    this.w = w;
    this.h = h;
    this.mask = mask;
  }

  decorate(
    solidLayer: Phaser.Tilemaps.TilemapLayer,
    floorLayer: Phaser.Tilemaps.TilemapLayer,
    rooms: RotRoomRect[],
    roomInteriorMasks: BoolGrid[],
    doorMasksPerRoom: BoolGrid[],
    corridorMask: BoolGrid
  ) {
    const eligible: number[] = [];
    const doorClustersPerRoom: Array<Array<[number, number][]>> = [];
    for (let i = 0; i < rooms.length; i++) {
      const interior = roomInteriorMasks[i];
      if (!this.isConnected(interior)) { doorClustersPerRoom.push([]); continue; }
      const clusters = this.connectedComponents4(doorMasksPerRoom[i]);
      doorClustersPerRoom.push(clusters);
      if (clusters.length >= 1) eligible.push(i);
    }
    if (eligible.length === 0) return;

    let doorId = 1;

    for (const i of eligible) {
      const clusters = doorClustersPerRoom[i];
      if (clusters.length !== 1) continue;

      const doorCell = this.pickClusterCenter(clusters[0]);
      this.tagQuad(floorLayer, doorCell[0], doorCell[1], { door: 'locked', door_id: doorId });

      const keyPlaced = this.placeKeyInOtherRoom(floorLayer, i, roomInteriorMasks, doorMasksPerRoom, doorId);
      if (!keyPlaced) { doorId++; continue; }

      const secretCell = this.findSecretWallCandidate(roomInteriorMasks[i], doorMasksPerRoom[i], corridorMask);
      if (secretCell) this.tagQuad(solidLayer, secretCell[0], secretCell[1], { secret_door: true, secret_for: doorId });

      doorId++;
    }
  }

  private isConnected(mask: BoolGrid): boolean {
    let start: [number, number] | null = null;
    let total = 0;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (mask[y][x]) { total++; if (!start) start = [x, y]; }
    if (!start) return false;
    const visited = this.mask.makeMask(false);
    const q: [number, number][] = [start];
    visited[start[1]][start[0]] = true;
    let seen = 1;
    const n4: ReadonlyArray<readonly [number, number]> = [[1,0],[-1,0],[0,1],[0,-1]];
    while (q.length) {
      const [x, y] = q.shift()!;
      for (const [dx, dy] of n4) {
        const nx = x + dx, ny = y + dy;
        if (!this.mask.inBounds(nx, ny) || visited[ny][nx] || !mask[ny][nx]) continue;
        visited[ny][nx] = true; seen++; q.push([nx, ny]);
      }
    }
    return seen === total;
  }

  private connectedComponents4(mask: BoolGrid): Array<[number, number][]> {
    const visited = this.mask.makeMask(false);
    const comps: Array<[number, number][]> = [];
    const n4: ReadonlyArray<readonly [number, number]> = [[1,0],[-1,0],[0,1],[0,-1]];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!mask[y][x] || visited[y][x]) continue;
        const comp: [number, number][] = [];
        const q: [number, number][] = [[x, y]];
        visited[y][x] = true;
        while (q.length) {
          const [cx, cy] = q.shift()!;
          comp.push([cx, cy]);
          for (const [dx, dy] of n4) {
            const nx = cx + dx, ny = cy + dy;
            if (!this.mask.inBounds(nx, ny) || visited[ny][nx] || !mask[ny][nx]) continue;
            visited[ny][nx] = true; q.push([nx, ny]);
          }
        }
        comps.push(comp);
      }
    }
    return comps;
  }

  private pickClusterCenter(comp: Array<[number, number]>): [number, number] {
    let sumx = 0, sumy = 0;
    for (const [x, y] of comp) { sumx += x; sumy += y; }
    const cx = sumx / comp.length, cy = sumy / comp.length;
    let best: [number, number] = comp[0];
    let bestD = Infinity;
    for (const [x, y] of comp) {
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < bestD) { bestD = d; best = [x, y]; }
    }
    return best;
  }

  private placeKeyInOtherRoom(
    floorLayer: Phaser.Tilemaps.TilemapLayer,
    roomIdx: number,
    interiors: BoolGrid[],
    doorMasks: BoolGrid[],
    doorId: number
  ): boolean {
    const candidates: number[] = [];
    for (let i = 0; i < interiors.length; i++) {
      if (i === roomIdx) continue;
      const hasDoor = this.hasAnyTrue(doorMasks[i]);
      if (!hasDoor) continue;
      if (!this.isConnected(interiors[i])) continue;
      candidates.push(i);
    }
    if (!candidates.length) return false;
    const target = candidates[ROT.RNG.getUniformInt(0, candidates.length - 1)];
    const pos = this.pickRandomTrue(interiors[target]);
    if (!pos) return false;
    this.tagQuad(floorLayer, pos[0], pos[1], { key_for: doorId });
    return true;
  }

  private findSecretWallCandidate(interior: BoolGrid, doorMask: BoolGrid, corridorMask: BoolGrid): [number, number] | null {
    const n4: ReadonlyArray<readonly [number, number]> = [[1,0],[-1,0],[0,1],[0,-1]];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!interior[y][x]) continue;
        for (const [dx, dy] of n4) {
          const wx = x + dx, wy = y + dy;
          if (!this.mask.inBounds(wx, wy)) continue;
          if (doorMask[wy][wx]) continue;
          if (corridorMask[wy][wx]) return [wx, wy];
        }
      }
    }
    return null;
  }

  private hasAnyTrue(m: BoolGrid): boolean {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (m[y][x]) return true;
    return false;
  }

  private pickRandomTrue(m: BoolGrid): [number, number] | null {
    const list: Array<[number, number]> = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (m[y][x]) list.push([x, y]);
    if (!list.length) return null;
    return list[ROT.RNG.getUniformInt(0, list.length - 1)];
  }

  private tagQuad(layer: Phaser.Tilemaps.TilemapLayer, gx: number, gy: number, props: Record<string, unknown>) {
    const sx = gx * 2, sy = gy * 2;
    for (let oy = 0; oy < 2; oy++) for (let ox = 0; ox < 2; ox++) {
      const tile = layer.getTileAt(sx + ox, sy + oy, false);
      if (!tile) continue;
      const p = (tile.properties as Record<string, unknown>) || {};
      for (const k of Object.keys(props)) p[k] = props[k];
      tile.properties = p;
    }
  }
}
