import RBush from 'rbush';
import { roomNames } from '../../constants/map';

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

export class CorridorPlanner {
  private readonly rng: Phaser.Math.RandomDataGenerator;
  private readonly width: number;

  constructor(opts: { seed: string; roadWidth: number }) {
    this.rng = new Phaser.Math.RandomDataGenerator([String(opts.seed)]);
    this.width = Math.max(1, Math.floor(opts.roadWidth));
  }

  build(rooms: PlacedRoom[]): Corridor[] {
    if (rooms.length <= 1) return [];

    const { edges } = this.mstByPrim(rooms);

    const corridors: Corridor[] = [];
    for (const e of edges) {
      const a = rooms[e.i];
      const b = rooms[e.j];
      const segs = this.makeElbow(a, b);
      corridors.push({ rects: segs, from: a, to: b });
    }
    return corridors;
  }

  private mstByPrim(rooms: PlacedRoom[]) {
    const n = rooms.length;
    const inMST = new Array<boolean>(n).fill(false);
    const dist = new Array<number>(n).fill(Infinity);
    const parent = new Array<number>(n).fill(-1);

    dist[0] = 0;

    const metric = (i: number, j: number) => {
      const ci = centerOf(rooms[i]);
      const cj = centerOf(rooms[j]);
      return Math.abs(ci.cx - cj.cx) + Math.abs(ci.cy - cj.cy);
    };

    for (let count = 0; count < n - 1; count++) {
      let u = -1, best = Infinity;
      for (let v = 0; v < n; v++) {
        if (!inMST[v] && dist[v] < best) { best = dist[v]; u = v; }
      }
      if (u === -1) break;
      inMST[u] = true;

      for (let v = 0; v < n; v++) {
        if (!inMST[v]) {
          const w = metric(u, v);
          if (w < dist[v]) { dist[v] = w; parent[v] = u; }
        }
      }
    }

    const edges: Array<{ i: number; j: number }> = [];
    for (let v = 1; v < n; v++) {
      if (parent[v] !== -1) edges.push({ i: parent[v], j: v });
    }
    return { edges };
  }

  private makeElbow(a: PlacedRoom, b: PlacedRoom): CorridorRect[] {
    const { cx: ax, cy: ay } = centerOf(a);
    const { cx: bx, cy: by } = centerOf(b);
    const horizontalFirst = this.rng.frac() < 0.5;

    const w = this.width;

    const rects: CorridorRect[] = [];
    if (horizontalFirst) {
      rects.push(this.hRect(ax, bx, ay, w));
      rects.push(this.vRect(ay, by, bx, w));
    } else {
      rects.push(this.vRect(ay, by, ax, w));
      rects.push(this.hRect(ax, bx, by, w));
    }
    return rects;
  }

  private hRect(x1: number, x2: number, y: number, width: number): CorridorRect {
    const xl = Math.min(x1, x2);
    const xr = Math.max(x1, x2);
    const half = Math.floor(width / 2);
    return {
      kind: 'corridor',
      minX: xl,
      maxX: xr + 1,
      minY: y - half,
      maxY: y - half + width,
    };
  }

  private vRect(y1: number, y2: number, x: number, width: number): CorridorRect {
    const yl = Math.min(y1, y2);
    const yr = Math.max(y1, y2);
    const half = Math.floor(width / 2);
    return {
      kind: 'corridor',
      minX: x - half,
      maxX: x - half + width,
      minY: yl,
      maxY: yr + 1,
    };
  }
}

export class LayoutEngine {
  private readonly placer: RoomPlacer;
  private readonly roads: CorridorPlanner;

  constructor(opts: { seed: string; mapWidth: number; mapHeight: number; roadWidth: number }) {
    this.placer = new RoomPlacer({
      seed: opts.seed,
      mapWidth: opts.mapWidth,
      mapHeight: opts.mapHeight,
    });
    this.roads = new CorridorPlanner({ seed: opts.seed, roadWidth: opts.roadWidth });
  }

  build(pools: Map<RoomKey, RawLayer[][]>) {
    const all: Array<{ key: RoomKey; layers: RawLayer[] }> = [];
    for (const key of (roomNames as RoomKey[])) {
      for (const layers of (pools.get(key) ?? [])) {
        all.push({ key, layers });
      }
    }

    const placed = this.placer.place(all);
    const corridors = this.roads.build(placed);

    return { placed, corridors };
  }
}

export class DoorPlanner {
  private readonly rng: Phaser.Math.RandomDataGenerator;
  private readonly doorWidthClamp: number;

  constructor(opts: { seed: string; maxDoorWidth?: number }) {
    this.rng = new Phaser.Math.RandomDataGenerator([String(opts.seed)]);
    this.doorWidthClamp = Math.max(1, Math.floor(opts.maxDoorWidth ?? 6));
  }

  createDoors(
    placed: PlacedRoom[],
    corridors: Corridor[],
    tiles: {
      doorWallTile: number;
      floorTileUnderDoor?: number;
    }
  ): Array<{ room: PlacedRoom; x: number; y: number; w: number; h: number }> {
    const doors: Array<{ room: PlacedRoom; x: number; y: number; w: number; h: number }> = [];

    type AABB = { minX: number; minY: number; maxX: number; maxY: number; payload: PlacedRoom };
    const index = new RBush<AABB>();
    index.load(
      placed.map(r => ({
        minX: r.x,
        minY: r.y,
        maxX: r.x + r.w,
        maxY: r.y + r.h,
        payload: r,
      }))
    );

    for (const c of corridors) {
      for (const seg of c.rects) {
        const hits = index.search({
          minX: seg.minX,
          minY: seg.minY,
          maxX: seg.maxX,
          maxY: seg.maxY,
          payload: null,
        });

        for (const hit of hits) {
          const room = hit.payload;

          const ix0 = Math.max(seg.minX, room.x);
          const iy0 = Math.max(seg.minY, room.y);
          const ix1 = Math.min(seg.maxX, room.x + room.w);
          const iy1 = Math.min(seg.maxY, room.y + room.h);

          if (ix1 <= ix0 || iy1 <= iy0) continue;

          let doorX = ix0, doorY = iy0, doorW = ix1 - ix0, doorH = iy1 - iy0;

          const touchesTop = iy0 === room.y;
          const touchesBottom = iy1 === room.y + room.h;
          const touchesLeft = ix0 === room.x;
          const touchesRight = ix1 === room.x + room.w;

          if (touchesTop) {
            doorY = room.y; doorH = 1;
            doorW = this.clampDoorWidth(doorW);
            if (ix1 - ix0 > doorW) {
              const shift = this.rng.integerInRange(0, (ix1 - ix0) - doorW);
              doorX = ix0 + shift;
            }
          } else if (touchesBottom) {
            doorY = room.y + room.h - 1; doorH = 1;
            doorW = this.clampDoorWidth(doorW);
            if (ix1 - ix0 > doorW) {
              const shift = this.rng.integerInRange(0, (ix1 - ix0) - doorW);
              doorX = ix0 + shift;
            }
          } else if (touchesLeft) {
            doorX = room.x; doorW = 1;
            doorH = this.clampDoorWidth(doorH);
            if (iy1 - iy0 > doorH) {
              const shift = this.rng.integerInRange(0, (iy1 - iy0) - doorH);
              doorY = iy0 + shift;
            }
          } else if (touchesRight) {
            doorX = room.x + room.w - 1; doorW = 1;
            doorH = this.clampDoorWidth(doorH);
            if (iy1 - iy0 > doorH) {
              const shift = this.rng.integerInRange(0, (iy1 - iy0) - doorH);
              doorY = iy0 + shift;
            }
          } else {
            continue;
          }

          this.carveDoorInRoom(room, doorX, doorY, doorW, doorH, tiles);
          doors.push({ room, x: doorX, y: doorY, w: doorW, h: doorH });
        }
      }
    }

    return doors;
  }

  private clampDoorWidth(v: number) {
    return Math.max(1, Math.min(this.doorWidthClamp, v));
  }

  private carveDoorInRoom(
    room: PlacedRoom,
    doorX: number,
    doorY: number,
    doorW: number,
    doorH: number,
    tiles: { doorWallTile: number; floorTileUnderDoor?: number }
  ) {
    const walls = room.layers.find(l => l.name.toLowerCase() === 'walls');
    if (!walls) return;
    const floor = room.layers.find(l => l.name.toLowerCase() === 'floor');

    const lx = doorX - room.x;
    const ly = doorY - room.y;

    this.fillRectInLayer(walls, lx, ly, doorW, doorH, tiles.doorWallTile);

    if (floor && Number.isInteger(tiles.floorTileUnderDoor ?? NaN)) {
      this.fillRectInLayer(floor, lx, ly, doorW, doorH, tiles.floorTileUnderDoor!);
    }
  }

  private fillRectInLayer(layer: RawLayer, x: number, y: number, w: number, h: number, tileIndex: number) {
    const W = layer.width;
    const H = layer.height;
    for (let yy = 0; yy < h; yy++) {
      const gy = y + yy;
      if (gy < 0 || gy >= H) continue;
      const row = gy * W;
      for (let xx = 0; xx < w; xx++) {
        const gx = x + xx;
        if (gx < 0 || gx >= W) continue;
        layer.data[row + gx] = tileIndex;
      }
    }
  }
}
