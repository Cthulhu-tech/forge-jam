import Phaser from 'phaser';
import * as ROT from 'rot-js';
import Digger from 'rot-js/lib/map/digger';
import { INDEX_ARRS, TILECOUNT_PER_SET } from '../../constants/map';
import { AutoTileMath } from './autoTileMath';

export class AutoTileRenderer {
  private scene: Phaser.Scene;
  private cfg: AutoTileConfig;
  private digger: Digger;
  private w: number;
  private h: number;

  constructor(scene: Phaser.Scene, cfg: AutoTileConfig, w = 200, h = 200, seed = 1337) {
    this.scene = scene;
    this.cfg = cfg;
    this.w = w;
    this.h = h;
    ROT.RNG.setSeed(seed);
    this.digger = new ROT.Map.Digger(this.w, this.h, { roomWidth: [4, 18], roomHeight: [4, 18], corridorLength: [4, 12], dugPercentage: 0.45 });
  }

  createTilemap(): { map: Phaser.Tilemaps.Tilemap } {
    this.digger.create();

    const map = this.scene.make.tilemap({ tileWidth: this.cfg.subTile, tileHeight: this.cfg.subTile, width: this.w * 2, height: this.h * 2 });

    let nextFirstGid = 1;
    const registerTileset = (keys: string[]) => {
      const out: Record<string, Phaser.Tilemaps.Tileset> = {};
      for (const key of keys) {
        const ts = map.addTilesetImage(key, key, this.cfg.subTile, this.cfg.subTile, 0, 0, nextFirstGid) as Phaser.Tilemaps.Tileset;
        out[key] = ts;
        nextFirstGid += TILECOUNT_PER_SET;
      }
      return out;
    };

    const prefabWallKeys = Array.from(new Set((this.cfg.roomPrefabs ?? []).map(p => p.wallKey))).filter(Boolean);
    const prefabFloorKeys = Array.from(new Set((this.cfg.roomPrefabs ?? []).map(p => p.floorKey))).filter(Boolean);
    const roomWallKeysAll = Array.from(new Set<string>([...this.cfg.room, ...prefabWallKeys]));
    const roomFloorKeysAll = Array.from(new Set<string>([...this.cfg.roomFloor, ...prefabFloorKeys]));

    const tilesetsVoid = registerTileset([this.cfg.floorWall]);
    const tilesetsRooms = registerTileset(roomWallKeysAll);
    const tilesetsCorridor = registerTileset([this.cfg.floor]);
    const tilesetsRoomFlr = registerTileset(roomFloorKeysAll);

    const solidLayer = map.createBlankLayer('Solid', [tilesetsVoid[this.cfg.floorWall], ...Object.values(tilesetsRooms)], 0) as Phaser.Tilemaps.TilemapLayer;
    const floorLayer = map.createBlankLayer('Floor', [tilesetsCorridor[this.cfg.floor], ...Object.values(tilesetsRoomFlr)], 1) as Phaser.Tilemaps.TilemapLayer;

    const dug = this.buildDugMask();
    const rooms = this.digger.getRooms() as RotRoomRect[];
    const corridorMask = this.buildCorridorMaskFromDigger();

    const assignments = this.assignPrefabs(rooms.length);

    const roomInteriorMasks: BoolGrid[] = [];
    const roomWallKeys: string[] = [];
    const roomFloorKeys: string[] = [];

    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      const L = r.getLeft(), T = r.getTop(), R = r.getRight(), B = r.getBottom();
      const a = assignments[i];
      if (a && a.shape && a.shape.length > 0 && a.shape[0].length > 0) {
        roomInteriorMasks.push(this.shapeScaledToRoom(a.shape, L, T, R, B));
        roomWallKeys.push(a.wallKey);
        roomFloorKeys.push(a.floorKey);
      } else {
        roomInteriorMasks.push(this.rectMask(L, T, R, B));
        roomWallKeys.push(a ? a.wallKey : this.pickFromTuple(this.cfg.room));
        roomFloorKeys.push(a ? a.floorKey : this.pickFromTuple(this.cfg.roomFloor));
      }
    }

    const floorMaskAll = this.orMany([corridorMask, ...roomInteriorMasks]);
    const voidMask = this.not(dug);

    const doorMasksPerRoom: BoolGrid[] = roomInteriorMasks.map(int => this.doorMaskForRoom(int, corridorMask));
    const doorMaskAll = this.orMany(doorMasksPerRoom);

    const roomWalls: MaskSource[] = [];
    const roomFloors: MaskSource[] = [];

    for (let i = 0; i < rooms.length; i++) {
      const interior = roomInteriorMasks[i];
      const doors = doorMasksPerRoom[i];
      const wallsOuter = this.outerPerimeterMask(interior, floorMaskAll);
      const wallsNoDoors = this.andNot(wallsOuter, doorMaskAll);
      const floorIn = this.or(interior, doors);
      roomWalls.push({ mask: wallsNoDoors, tilesetKey: roomWallKeys[i] });
      roomFloors.push({ mask: floorIn, tilesetKey: roomFloorKeys[i] });
    }

    const solidCombined = this.orMany([voidMask, ...roomWalls.map(r => r.mask)]);
    const corridorNoDoors = this.andNot(corridorMask, doorMaskAll);
    const floorCombined = this.andNot(this.orMany([corridorNoDoors, ...roomFloors.map(r => r.mask)]), solidCombined);

    this.paintCompositeAutotile(
      solidLayer,
      solidCombined,
      [{ mask: voidMask, tilesetKey: this.cfg.floorWall }, ...roomWalls],
      true,
      { [this.cfg.floorWall]: tilesetsVoid[this.cfg.floorWall], ...tilesetsRooms }
    );

    this.paintCompositeAutotile(
      floorLayer,
      floorCombined,
      [{ mask: corridorNoDoors, tilesetKey: this.cfg.floor }, ...roomFloors],
      false,
      { [this.cfg.floor]: tilesetsCorridor[this.cfg.floor], ...tilesetsRoomFlr }
    );

    return { map };
  }

  private assignPrefabs(roomCount: number): Array<null | { wallKey: string; floorKey: string; shape?: number[][] }> {
    const res: Array<null | { wallKey: string; floorKey: string; shape?: number[][] }> = new Array(roomCount).fill(null);
    const list = this.cfg.roomPrefabs ?? [];
    if (!list.length || roomCount === 0) return res;

    const indices = [...Array(roomCount).keys()];
    for (let i = indices.length - 1; i > 0; i--) {
      const j = ROT.RNG.getUniformInt(0, i);
      const tmp = indices[i];
      indices[i] = indices[j];
      indices[j] = tmp;
    }

    type Target = { idxs: number[]; prefab: RoomPrefab; want: number };
    const targets: Target[] = [];
    let ptr = 0;

    for (const p of list) {
      const percent = p.percent;
      const count = p.count;
      const min = p.min;
      const max = p.max;
      let want = 0;
      if (typeof count === 'number') want = count;
      else if (typeof percent === 'number') want = Math.round(Math.max(0, Math.min(100, percent)) * roomCount / 100);
      if (typeof min === 'number') want = Math.max(want, min);
      if (typeof max === 'number') want = Math.min(want, max);
      want = Math.max(0, Math.min(want, roomCount - ptr));
      const idxs = indices.slice(ptr, ptr + want);
      ptr += want;
      targets.push({ idxs, prefab: p, want });
      if (ptr >= roomCount) break;
    }

    for (const t of targets) {
      for (const i of t.idxs) res[i] = { wallKey: t.prefab.wallKey, floorKey: t.prefab.floorKey, shape: t.prefab.shape };
    }
    return res;
  }

  private buildCorridorMaskFromDigger(): BoolGrid {
    const m = this.makeMask(false);
    const corridors = this.digger.getCorridors() as RotCorridor[];
    for (const c of corridors) c.create((x, y) => { if (this.inBounds(x, y)) m[y][x] = true; });
    return m;
  }

  private buildDugMask(): BoolGrid {
    const m = this.makeMask(false);
    this.digger.create((x: number, y: number, v: number) => { if (v === 0) m[y][x] = true; });
    return m;
  }

  private makeMask(fill = false): BoolGrid {
    const m: BoolGrid = new Array(this.h);
    for (let y = 0; y < this.h; y++) { m[y] = new Array(this.w); for (let x = 0; x < this.w; x++) m[y][x] = fill; }
    return m;
  }

  private inBounds(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  private rectMask(left: number, top: number, right: number, bottom: number): BoolGrid {
    const m = this.makeMask(false);
    for (let y = top; y <= bottom; y++) {
      if (y < 0 || y >= this.h) continue;
      for (let x = left; x <= right; x++) {
        if (x < 0 || x >= this.w) continue;
        m[y][x] = true;
      }
    }
    return m;
  }

  private shapeScaledToRoom(shape: number[][], L: number, T: number, R: number, B: number): BoolGrid {
    const m = this.makeMask(false);
    if (shape.length === 0 || shape[0].length === 0) return m;
    const rw = R - L + 1, rh = B - T + 1;
    const sw = shape[0].length, sh = shape.length;
    for (let y = 0; y < rh; y++) {
      const gy = T + y; if (gy < 0 || gy >= this.h) continue;
      const sy = Math.floor((y + 0.5) * sh / rh);
      for (let x = 0; x < rw; x++) {
        const gx = L + x; if (gx < 0 || gx >= this.w) continue;
        const sx = Math.floor((x + 0.5) * sw / rw);
        if (shape[sy]?.[sx] === 1) m[gy][gx] = true;
      }
    }
    return m;
  }

  private outerPerimeterMask(interior: BoolGrid, floorMaskAll: BoolGrid): BoolGrid {
    const out = this.makeMask(false);
    const n4: ReadonlyArray<readonly [number, number]> = [[1,0],[-1,0],[0,1],[0,-1]];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (interior[y][x]) {
      for (const [dx, dy] of n4) {
        const nx = x + dx, ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        if (!floorMaskAll[ny][nx]) out[ny][nx] = true;
      }
    }
    return out;
  }

  private doorMaskForRoom(interior: BoolGrid, corridor: BoolGrid): BoolGrid {
    const out = this.makeMask(false);
    const n4: ReadonlyArray<readonly [number, number]> = [[1,0],[-1,0],[0,1],[0,-1]];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (corridor[y][x]) {
      for (const [dx, dy] of n4) {
        const nx = x + dx, ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        if (interior[ny][nx]) { out[y][x] = true; break; }
      }
    }
    return out;
  }

  private not(a: BoolGrid): BoolGrid {
    const out = this.makeMask(false);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out[y][x] = !a[y][x];
    return out;
  }

  private or(a: BoolGrid, b: BoolGrid): BoolGrid {
    const out = this.makeMask(false);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out[y][x] = !!a?.[y]?.[x] || !!b?.[y]?.[x];
    return out;
  }

  private orMany(masks: BoolGrid[]): BoolGrid {
    const out = this.makeMask(false);
    for (const m of masks) for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (m?.[y]?.[x]) out[y][x] = true;
    return out;
  }

  private andNot(a: BoolGrid, b: BoolGrid): BoolGrid {
    const out = this.makeMask(false);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out[y][x] = !!a?.[y]?.[x] && !b?.[y]?.[x];
    return out;
  }

  private paintCompositeAutotile(
    layer: Phaser.Tilemaps.TilemapLayer,
    combinedMask: BoolGrid,
    sources: Array<{ mask: BoolGrid; tilesetKey: string }>,
    collidable: boolean,
    tilesetMap: Record<string, Phaser.Tilemaps.Tileset>
  ) {
    const ids: NumGrid = combinedMask.map(r => r.map(v => (v ? 1 : 0)));
    const pickKey = (x: number, y: number) => {
      let key: string | null = null;
      for (const s of sources) if (s.mask?.[y]?.[x]) key = s.tilesetKey;
      return key;
    };
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!combinedMask[y][x]) continue;
        const [a, b, c, d] = AutoTileMath.quad(this.cfg.indexArrs ?? INDEX_ARRS, ids, x, y, this.w, this.h);
        const tl = this.toZeroBased(a), tr = this.toZeroBased(b), bl = this.toZeroBased(c), br = this.toZeroBased(d);
        const key = pickKey(x, y);
        if (!key) continue;
        const ts = tilesetMap[key];
        if (!ts) continue;
        const sx = x * 2, sy = y * 2;
        this.putTileWithCollision(layer, ts.firstgid + tl, sx,     sy,     collidable);
        this.putTileWithCollision(layer, ts.firstgid + tr, sx + 1, sy,     collidable);
        this.putTileWithCollision(layer, ts.firstgid + bl, sx,     sy + 1, collidable);
        this.putTileWithCollision(layer, ts.firstgid + br, sx + 1, sy + 1, collidable);
      }
    }
  }

  private putTileWithCollision(layer: Phaser.Tilemaps.TilemapLayer, tileIndex: number, x: number, y: number, collidable: boolean) {
    const tile = layer.putTileAt(tileIndex, x, y, true);
    if (tile) (tile.properties as Record<string, unknown>)['ge_colide'] = collidable;
  }

  private toZeroBased(idx1to48: number) {
    const idx = Math.max(1, Math.min(48, idx1to48));
    return idx - 1;
  }

  private pickFromTuple<T extends string>(tuple: readonly T[]) {
    const idx = ROT.RNG.getUniformInt(0, tuple.length - 1);
    return tuple[idx];
  }
}
