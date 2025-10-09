import { centerOf } from "./roomPlacement";

export class CorridorPlanner {
  private readonly rng: Phaser.Math.RandomDataGenerator;
  private readonly width: number;

  private roomsCache: PlacedRoom[] = [];

  constructor(opts: { seed: string; roadWidth: number }) {
    this.rng = new Phaser.Math.RandomDataGenerator([String(opts.seed)]);
    this.width = Math.max(1, Math.floor(opts.roadWidth));
  }

  build(rooms: PlacedRoom[]): Corridor[] {
    if (rooms.length <= 1) return [];
    this.roomsCache = rooms;

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
      for (let v = 0; v < n; v++) if (!inMST[v] && dist[v] < best) { best = dist[v]; u = v; }
      if (u === -1) break;
      inMST[u] = true;
      for (let v = 0; v < n; v++) if (!inMST[v]) {
        const w = metric(u, v);
        if (w < dist[v]) { dist[v] = w; parent[v] = u; }
      }
    }

    const edges: Array<{ i: number; j: number }> = [];
    for (let v = 1; v < n; v++) if (parent[v] !== -1) edges.push({ i: parent[v], j: v });
    return { edges };
  }

  private makeElbow(a: PlacedRoom, b: PlacedRoom): CorridorRect[] {
    const aAnchors = this.listDoorAnchors(a);
    const bAnchors = this.listDoorAnchors(b);

    const aPt = aAnchors[0] ?? this.borderPointToward(a, b);
    const bPt = bAnchors[0] ?? this.borderPointToward(b, a);

    const pad = 1 + Math.floor((this.width - 1) / 2);
    const blocked = this.buildBlockedSet(this.roomsCache, pad, a, b, aPt, bPt);

    const bounds = this.computeSearchBounds(this.roomsCache, 6 + pad);

    const path = this.aStar(aPt, bPt, blocked, bounds);
    if (!path || path.length === 0) {
      return this.makeFallbackElbow(aPt, bPt, this.width);
    }

    return this.compressPathToRects(path, this.width);
  }

  private listDoorAnchors(room: PlacedRoom): Array<{ x: number; y: number }> {
    const misc = room.layers.find(l => l.name.toLowerCase() === 'misc');
    if (!misc) return [];
    const res: Array<{ x: number; y: number }> = [];
    const w = misc.width;
    for (let i = 0; i < misc.data.length; i++) {
      if ((misc.data[i] | 0) !== 13) continue;
      const lx = i % w;
      const ly = Math.floor(i / w);
      res.push({ x: room.x + lx, y: room.y + ly });
    }

    const c = centerOf(room);
    res.sort((p, q) => (Math.abs(p.x - c.cx) + Math.abs(p.y - c.cy)) - (Math.abs(q.x - c.cx) + Math.abs(q.y - c.cy)));
    return res;
  }


  private borderPointToward(src: PlacedRoom, dst: PlacedRoom): { x: number; y: number } {
    const dc = centerOf(dst);
    const rx0 = src.x, ry0 = src.y, rx1 = src.x + src.w - 1, ry1 = src.y + src.h - 1;
    const px = Phaser.Math.Clamp(dc.cx, rx0, rx1);
    const py = Phaser.Math.Clamp(dc.cy, ry0, ry1);
    const dxL = Math.abs(px - rx0), dxR = Math.abs(px - rx1);
    const dyT = Math.abs(py - ry0), dyB = Math.abs(py - ry1);
    const min = Math.min(dxL, dxR, dyT, dyB);
    if (min === dxL) return { x: rx0, y: py };
    if (min === dxR) return { x: rx1, y: py };
    if (min === dyT) return { x: px, y: ry0 };
    return { x: px, y: ry1 };
  }

  private buildBlockedSet(
    rooms: PlacedRoom[],
    pad: number,
    a: PlacedRoom,
    b: PlacedRoom,
    aPt: { x: number; y: number },
    bPt: { x: number; y: number },
  ): Set<string> {
    const blocked = new Set<string>();
    const allowSet = new Set<string>([`${aPt.x},${aPt.y}`, `${bPt.x},${bPt.y}`]);

    for (const r of rooms) {
      const minX = r.x - pad, maxX = r.x + r.w - 1 + pad;
      const minY = r.y - pad, maxY = r.y + r.h - 1 + pad;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const key = `${x},${y}`;
          if ((r === a || r === b) && allowSet.has(key)) continue;
          blocked.add(key);
        }
      }
    }
    return blocked;
  }

  private computeSearchBounds(rooms: PlacedRoom[], margin: number) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of rooms) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w - 1);
      maxY = Math.max(maxY, r.y + r.h - 1);
    }
    return {
      minX: Math.floor(minX - margin),
      minY: Math.floor(minY - margin),
      maxX: Math.ceil(maxX + margin),
      maxY: Math.ceil(maxY + margin),
    };
  }

  private aStar(
    start: { x: number; y: number },
    goal: { x: number; y: number },
    blocked: Set<string>,
    bounds: { minX: number; minY: number; maxX: number; maxY: number }
  ): Array<{ x: number; y: number }> | null {
    const key = (x: number, y: number) => `${x},${y}`;
    const h = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y);

    const open = new Set<string>();
    const came = new Map<string, string>();
    const g = new Map<string, number>();
    const f = new Map<string, number>();

    const startK = key(start.x, start.y);
    open.add(startK);
    g.set(startK, 0);
    f.set(startK, h(start.x, start.y));

    const dirs = this.rng.frac() < 0.5
      ? [[1,0], [0,1], [-1,0], [0,-1]]
      : [[0,1], [1,0], [0,-1], [-1,0]];

    const inBounds = (x:number,y:number) =>
      x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;

    while (open.size) {
      let currentK: string | null = null;
      let best = Infinity;
      for (const k of open) {
        const fv = f.get(k) ?? Infinity;
        if (fv < best) { best = fv; currentK = k; }
      }
      const [cx, cy] = currentK!.split(',').map(Number);
      if (cx === goal.x && cy === goal.y) return this.reconstructPath(came, currentK!, startK);

      open.delete(currentK!);

      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        const nk = key(nx, ny);
        if (!inBounds(nx, ny)) continue;
        if (blocked.has(nk)) continue;

        const tentative = (g.get(currentK!) ?? Infinity) + 1;
        if (tentative < (g.get(nk) ?? Infinity)) {
          came.set(nk, currentK!);
          g.set(nk, tentative);
          f.set(nk, tentative + h(nx, ny));
          open.add(nk);
        }
      }
    }
    return null;
    }

  private reconstructPath(came: Map<string, string>, goalK: string, startK: string) {
    const out: Array<{ x: number; y: number }> = [];
    let cur = goalK;
    while (true) {
      const [x, y] = cur.split(',').map(Number);
      out.push({ x, y });
      if (cur === startK) break;
      cur = came.get(cur)!;
    }
    out.reverse();
    return out;
  }

  private makeFallbackElbow(aPt:{x:number;y:number}, bPt:{x:number;y:number}, w:number): CorridorRect[] {
    const horizontalFirst = this.rng.frac() < 0.5;
    return horizontalFirst
      ? [this.hRect(aPt.x, bPt.x, aPt.y, w), this.vRect(aPt.y, bPt.y, bPt.x, w)]
      : [this.vRect(aPt.y, bPt.y, aPt.x, w), this.hRect(aPt.x, bPt.x, bPt.y, w)];
  }

  private compressPathToRects(path: Array<{x:number;y:number}>, width:number): CorridorRect[] {
    if (path.length <= 1) return [];
    const rects: CorridorRect[] = [];
    let i = 0;
    while (i < path.length - 1) {
      const a = path[i];
      const b = path[i + 1];
      const dx = Math.sign(b.x - a.x);
      const dy = Math.sign(b.y - a.y);
      if (dx !== 0 && dy !== 0) { i++; continue; }

      let j = i + 1;
      let last = b;
      while (j + 1 < path.length) {
        const c = path[j];
        const d = path[j + 1];
        const ddx = Math.sign(d.x - c.x);
        const ddy = Math.sign(d.y - c.y);
        if (ddx !== dx || ddy !== dy) break;
        last = d;
        j++;
      }

      if (dx !== 0) {
        rects.push(this.hRect(a.x, last.x, a.y, width));
      } else {
        rects.push(this.vRect(a.y, last.y, a.x, width));
      }
      i = j;
    }
    return rects;
  }

  private hRect(x1: number, x2: number, y: number, width: number): CorridorRect {
    const xl = Math.min(x1, x2), xr = Math.max(x1, x2);
    const half = Math.floor(width / 2);
    return { kind: 'corridor', minX: xl, maxX: xr + 1, minY: y - half, maxY: y - half + width };
  }
  private vRect(y1: number, y2: number, x: number, width: number): CorridorRect {
    const yl = Math.min(y1, y2), yr = Math.max(y1, y2);
    const half = Math.floor(width / 2);
    return { kind: 'corridor', minX: x - half, maxX: x - half + width, minY: yl, maxY: yr + 1 };
  }
}
