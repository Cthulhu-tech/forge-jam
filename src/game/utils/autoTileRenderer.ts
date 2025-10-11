import Phaser from 'phaser';
import * as ROT from 'rot-js';
import Digger from 'rot-js/lib/map/digger';
import { INDEX_ARRS } from '../../constants/map';
import { AutoTileMath } from './autoTileMath';

export class AutoTileRenderer {
  private scene: Phaser.Scene;
  private cfg: AutoTileConfig;
  private digger: Digger;
  private w: number;
  private h: number;

  constructor(scene: Phaser.Scene, cfg: AutoTileConfig, w = 100, h = 100, seed = 1337) {
    this.scene = scene;
    this.cfg = cfg;
    this.w = w;
    this.h = h;

    ROT.RNG.setSeed(seed);
    this.digger = new ROT.Map.Digger(this.w, this.h, {
      roomWidth:      [4, 10],
      roomHeight:     [4, 10],
      corridorLength: [2, 8],
      dugPercentage:  .45,
    });
  }

  createTilemap(): { map: Phaser.Tilemaps.Tilemap } {
    const { subTile } = this.cfg;

    const map = this.scene.make.tilemap({
      tileWidth: subTile,
      tileHeight: subTile,
      width: this.w * 2,
      height: this.h * 2,
    });

    const registerTileset = (key: string): Phaser.Tilemaps.Tileset =>
      map.addTilesetImage(key, key, subTile, subTile, 0, 0) as Phaser.Tilemaps.Tileset;

    const tilesetBase     = registerTileset(this.cfg.floorWall);
    const tilesetCorridor = registerTileset(this.cfg.floor);

    const makeLayer = (
      name: string,
      ts: Phaser.Tilemaps.Tileset,
      depth: number
    ): Phaser.Tilemaps.TilemapLayer => {
      const layer = map.createBlankLayer(name, ts, 0, 0);
      if (!layer) throw new Error(`Failed to create layer: ${name}`);
      layer.setDepth(depth);
      return layer;
    };

    const baseLayer     = makeLayer('BaseFloorWall', tilesetBase, 0);
    const corridorLayer = makeLayer('CorridorFloor', tilesetCorridor, 1);

    let dug: BoolGrid = this.buildDugMask();
    const rooms = this.digger.getRooms() as RotRoomRect[];
    dug = this.connectAllRooms(dug, rooms);

    const roomMask = this.mergeRoomRects(rooms);
    const corridorMask = this.diff(dug, roomMask);

    this.paintBase(baseLayer, true, dug);

    const corridorMaskForBase = this.corridorMaskWithoutRoomEdges(corridorMask, roomMask);
    this.paintMaskAutotile(baseLayer, corridorMaskForBase, false);

    this.paintMaskAutotile(baseLayer, roomMask, false);
    this.paintMaskAutotile(corridorLayer, corridorMask, false);

    rooms.forEach((room, i) => {
      const roomWallKey  = this.pickFromTuple(this.cfg.room);
      const roomFloorKey = this.pickFromTuple(this.cfg.roomFloor);

      const tsRoomWall  = registerTileset(roomWallKey);
      const tsRoomFloor = registerTileset(roomFloorKey);

      const roomFloorLayer = makeLayer(`Room${i}_Floor_${roomFloorKey}`, tsRoomFloor, 2);
      const roomWallLayer  = makeLayer(`Room${i}_Wall_${roomWallKey}`,  tsRoomWall,  3);
      
      const interiorMask = this.rectMask(
        room.getLeft(),
        room.getTop(),
        room.getRight(),
        room.getBottom()
      );

      const innerPerimeterNoDoors = this.innerPerimeterMaskMinusDoors(interiorMask, corridorMask);

      this.paintMaskAutotile(roomFloorLayer, interiorMask, false);
      this.paintMaskAutotile(roomWallLayer,  innerPerimeterNoDoors, true);
    });

    return { map };
  }

  private corridorMaskWithoutRoomEdges(corridorMask: BoolGrid, roomMask: BoolGrid): BoolGrid {
    const out: BoolGrid = corridorMask.map(row => row.slice());
    const n4: ReadonlyArray<readonly [number, number]> = [[1,0],[-1,0],[0,1],[0,-1]] as const;

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!corridorMask[y][x]) continue;

        let touchesRoom = false;
        for (const [dx, dy] of n4) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          if (roomMask[ny][nx]) { touchesRoom = true; break; }
        }

        if (touchesRoom) out[y][x] = false;
      }
    }
    return out;
  }

  private connectAllRooms(dug: BoolGrid, rooms: RotRoomRect[]): BoolGrid {
    if (rooms.length <= 1) return dug;

    const centers = rooms.map(r => {
      const cx = Math.floor((r.getLeft() + r.getRight()) / 2);
      const cy = Math.floor((r.getTop()  + r.getBottom()) / 2);
      return { x: this.clamp(cx, 0, this.w - 1), y: this.clamp(cy, 0, this.h - 1) };
    });

    const connected: boolean[] = Array(centers.length).fill(false);
    connected[0] = true;

    for (let k = 1; k < centers.length; k++) {
      let bestA = -1, bestB = -1, bestDist = Number.POSITIVE_INFINITY;

      for (let i = 0; i < centers.length; i++) if (connected[i]) {
        for (let j = 0; j < centers.length; j++) if (!connected[j]) {
          const d = Math.abs(centers[i].x - centers[j].x) + Math.abs(centers[i].y - centers[j].y);
          if (d < bestDist) { bestDist = d; bestA = i; bestB = j; }
        }
      }

      if (bestA !== -1 && bestB !== -1) {
        this.carveLPath(dug, centers[bestA], centers[bestB]);
        connected[bestB] = true;
      }
    }

    return this.ensureSingleComponent(dug);
  }

  private carveLPath(dug: BoolGrid, a: {x:number,y:number}, b: {x:number,y:number}): void {
    const firstHorizontal = ROT.RNG.getUniform() < 0.5;

    if (firstHorizontal) {
      this.carveLineX(dug, a.x, b.x, a.y);
      this.carveLineY(dug, a.y, b.y, b.x);
    } else {
      this.carveLineY(dug, a.y, b.y, a.x);
      this.carveLineX(dug, a.x, b.x, b.y);
    }
  }

  private carveLineX(dug: BoolGrid, x1: number, x2: number, y: number): void {
    const step = x2 >= x1 ? 1 : -1;
    for (let x = x1; x !== x2 + step; x += step) {
      if (y >= 0 && y < this.h && x >= 0 && x < this.w) dug[y][x] = true;
    }
  }

  private carveLineY(dug: BoolGrid, y1: number, y2: number, x: number): void {
    const step = y2 >= y1 ? 1 : -1;
    for (let y = y1; y !== y2 + step; y += step) {
      if (y >= 0 && y < this.h && x >= 0 && x < this.w) dug[y][x] = true;
    }
  }

  private ensureSingleComponent(dug: BoolGrid): BoolGrid {
    const comp = this.labelComponents(dug);
    if (comp.count <= 1) return dug;

    let mainId = 0, mainSize = 0;
    for (let id = 1; id <= comp.count; id++) {
      if ((comp.sizes.get(id) ?? 0) > mainSize) {
        mainSize = comp.sizes.get(id)!;
        mainId = id;
      }
    }

    const reps: Record<number, {x:number,y:number}[]> = {};
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const id = comp.ids[y][x];
        if (id <= 0) continue;
        if (!reps[id]) reps[id] = [];
        if ((x + y) % 7 === 0) reps[id].push({x,y});
      }
    }

    const mainPts = reps[mainId] ?? [];
    for (let id = 1; id <= comp.count; id++) {
      if (id === mainId) continue;
      const pts = reps[id] ?? [];
      if (pts.length === 0 || mainPts.length === 0) continue;

      let bestA: {x:number,y:number}|null = null;
      let bestB: {x:number,y:number}|null = null;
      let bestD = Number.POSITIVE_INFINITY;

      for (const a of pts) {
        for (const b of mainPts) {
          const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
          if (d < bestD) { bestD = d; bestA = a; bestB = b; }
        }
      }

      if (bestA && bestB) this.carveLPath(dug, bestA, bestB);
    }

    return dug;
  }

  private labelComponents(mask: BoolGrid): {
    ids: number[][];
    count: number;
    sizes: Map<number, number>;
  } {
    const ids: number[][] = Array.from({ length: this.h }, () => Array(this.w).fill(0));
    const sizes = new Map<number, number>();
    let curId = 0;
    const n4: ReadonlyArray<readonly [number, number]> = [[1,0],[-1,0],[0,1],[0,-1]] as const;

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!mask[y][x] || ids[y][x] !== 0) continue;
        curId++;
        let size = 0;
        const q: Array<[number, number]> = [[x, y]];
        ids[y][x] = curId;

        while (q.length) {
          const [cx, cy] = q.pop()!;
          size++;
          for (const [dx, dy] of n4) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
            if (!mask[ny][nx] || ids[ny][nx] !== 0) continue;
            ids[ny][nx] = curId;
            q.push([nx, ny]);
          }
        }
        sizes.set(curId, size);
      }
    }
    return { ids, count: curId, sizes };
  }

  private clamp(v:number, min:number, max:number) { return Math.max(min, Math.min(max, v)); }

  private buildDugMask(): BoolGrid {
    const dug: BoolGrid = Array.from({ length: this.h }, () => Array(this.w).fill(false));
    this.digger.create((x: number, y: number, value: number) => {
      if (value === 0) dug[y][x] = true;
    });
    return dug;
  }

  private mergeRoomRects(rooms: RotRoomRect[]): BoolGrid {
    const mask: BoolGrid = Array.from({ length: this.h }, () => Array(this.w).fill(false));
    for (const r of rooms) {
      const L = r.getLeft();
      const R = r.getRight();
      const T = r.getTop();
      const B = r.getBottom();
      for (let y = T; y <= B; y++) {
        if (y < 0 || y >= this.h) continue;
        for (let x = L; x <= R; x++) {
          if (x < 0 || x >= this.w) continue;
          mask[y][x] = true;
        }
      }
    }
    return mask;
  }

  private diff(a: BoolGrid, b: BoolGrid): BoolGrid {
    const out: BoolGrid = Array.from({ length: this.h }, () => Array(this.w).fill(false));
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        out[y][x] = a[y][x] && !b[y][x];
      }
    }
    return out;
  }

  private rectMask(left: number, top: number, right: number, bottom: number): BoolGrid {
    const mask: BoolGrid = Array.from({ length: this.h }, () => Array(this.w).fill(false));
    for (let y = top; y <= bottom; y++) {
      if (y < 0 || y >= this.h) continue;
      for (let x = left; x <= right; x++) {
        if (x < 0 || x >= this.w) continue;
        mask[y][x] = true;
      }
    }
    return mask;
  }

  private innerPerimeterMaskMinusDoors(interior: BoolGrid, corridorMask: BoolGrid): BoolGrid {
    const out: BoolGrid = Array.from({ length: this.h }, () => Array(this.w).fill(false));
    const n4: ReadonlyArray<readonly [number, number]> = [[1,0],[-1,0],[0,1],[0,-1]] as const;

    const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h;

    const isRealDoor = (nx: number, ny: number, dx: number, dy: number): boolean => {
      if (!inBounds(nx, ny) || !corridorMask[ny][nx]) return false;
      const fx = nx + dx, fy = ny + dy;
      const forward = inBounds(fx, fy) && corridorMask[fy][fx];
      const lx = nx + dy,  ly = ny - dx;
      const rx = nx - dy,  ry = ny + dx;
      const side = (inBounds(lx, ly) && corridorMask[ly][lx]) ||
                   (inBounds(rx, ry) && corridorMask[ry][rx]);
      return forward || side;
    };

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!interior[y][x]) continue;

        let touchesOutside = false;
        let hasDoor = false;
        let insideNeighbors = 0;

        for (const [dx, dy] of n4) {
          const nx = x + dx, ny = y + dy;
          const inN = inBounds(nx, ny) && interior[ny][nx];
          if (inN) insideNeighbors++;
        }

        if (insideNeighbors < 4) touchesOutside = true;

        const isCorner = (insideNeighbors === 2);
        if (touchesOutside && isCorner) {
          out[y][x] = true;
          continue;
        }

        if (touchesOutside) {
          for (const [dx, dy] of n4) {
            const nx = x + dx, ny = y + dy;
            const neighborInside = inBounds(nx, ny) && interior[ny][nx];
            if (!neighborInside && isRealDoor(nx, ny, dx, dy)) {
              hasDoor = true;
              break;
            }
          }
        }

        out[y][x] = touchesOutside && !hasDoor;
      }
    }
    return out;
  }

  private paintBase(
    layer: Phaser.Tilemaps.TilemapLayer,
    collidable: boolean,
    skipMask?: BoolGrid
  ): void {
    const baseMask: BoolGrid = Array.from({ length: this.h }, (_, y) =>
      Array.from({ length: this.w }, (_, x) => !(skipMask?.[y]?.[x] ?? false))
    );
    this.paintMaskAutotile(layer, baseMask, collidable);
  }

  private paintMaskAutotile(layer: Phaser.Tilemaps.TilemapLayer, mask: BoolGrid, collidable: boolean): void {
    const ids: NumGrid = mask.map(row => row.map(v => (v ? 1 : 0)));
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (ids[y][x] === 0) continue;

        const arr = AutoTileMath.quad(this.cfg.indexArrs ?? INDEX_ARRS, ids, x, y, this.w, this.h);
        const tl = this.toZeroBased(arr[0]);
        const tr = this.toZeroBased(arr[1]);
        const bl = this.toZeroBased(arr[2]);
        const br = this.toZeroBased(arr[3]);

        const sx = x * 2;
        const sy = y * 2;
        this.putTileWithCollision(layer, tl, sx,     sy,     collidable);
        this.putTileWithCollision(layer, tr, sx + 1, sy,     collidable);
        this.putTileWithCollision(layer, bl, sx,     sy + 1, collidable);
        this.putTileWithCollision(layer, br, sx + 1, sy + 1, collidable);
      }
    }
  }

  private putTileWithCollision(
    layer: Phaser.Tilemaps.TilemapLayer,
    tileIndex: number,
    x: number,
    y: number,
    collidable: boolean
  ): void {
    const tile = layer.putTileAt(tileIndex, x, y, true);
    if (tile) {
      (tile.properties as Record<string, unknown>)['ge_colide'] = collidable;
    }
  }

  private toZeroBased(idx1to48: number): number {
    const idx = Math.max(1, Math.min(48, idx1to48));
    return idx - 1;
  }

  private pickFromTuple<T extends string>(tuple: readonly T[]): T {
    const idx = ROT.RNG.getUniformInt(0, tuple.length - 1);
    return tuple[idx];
  }
}
