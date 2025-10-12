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

  constructor(scene: Phaser.Scene, cfg: AutoTileConfig, w = 100, h = 100, seed = 1337) {
    this.scene = scene;
    this.cfg = cfg;
    this.w = w;
    this.h = h;

    ROT.RNG.setSeed(seed);
    this.digger = new ROT.Map.Digger(this.w, this.h, {
      roomWidth: [4, 10],
      roomHeight: [4, 10],
      corridorLength: [2, 8],
      dugPercentage: 0.45,
    });
  }

  createTilemap(): { map: Phaser.Tilemaps.Tilemap } {
    this.digger.create();

    const map = this.scene.make.tilemap({
      tileWidth: this.cfg.subTile,
      tileHeight: this.cfg.subTile,
      width: this.w * 2,
      height: this.h * 2,
    });

    let nextFirstGid = 1;

    const registerTileset = (keys: string[]) => {
      const out: Record<string, Phaser.Tilemaps.Tileset> = {};

      for (const key of keys) {
        const ts = map.addTilesetImage(
          key,
          key,
          this.cfg.subTile,
          this.cfg.subTile,
          0,
          0,
          nextFirstGid
        ) as Phaser.Tilemaps.Tileset;

        out[key] = ts;
        nextFirstGid += TILECOUNT_PER_SET;
      }

      return out;
    };

    const tilesetsVoid     = registerTileset([this.cfg.floorWall]);
    const tilesetsRooms    = registerTileset([...this.cfg.room]);
    const tilesetsCorridor = registerTileset([this.cfg.floor]);
    const tilesetsRoomFlr  = registerTileset([...this.cfg.roomFloor]);

    const solidLayer = map.createBlankLayer(
      'Solid',
      [tilesetsVoid[this.cfg.floorWall], ...Object.values(tilesetsRooms)],
      0
    ) as Phaser.Tilemaps.TilemapLayer;

    const floorLayer = map.createBlankLayer(
      'Floor',
      [tilesetsCorridor[this.cfg.floor], ...Object.values(tilesetsRoomFlr)],
      1
    ) as Phaser.Tilemaps.TilemapLayer;

    const dug = this.buildDugMask();
    const rooms = this.digger.getRooms() as RotRoomRect[];

    const roomInteriorMask = this.mergeRoomRects(rooms);
    const corridorMask     = this.diff(roomInteriorMask, dug, true);
    const voidMask         = this.not(dug);

    const roomWalls: Array<{ mask: boolean[][]; tilesetKey: string }> = [];
    for (const room of rooms) {
      const interior = this.rectMask(room.getLeft(), room.getTop(), room.getRight(), room.getBottom());
      const walls    = this.innerPerimeterMaskMinusDoors(interior, corridorMask);
      const wallKey  = this.pickFromTuple(this.cfg.room);

      roomWalls.push({ mask: walls, tilesetKey: wallKey });
    }

    const roomFloors: Array<{ mask: boolean[][]; tilesetKey: string }> = [];
    for (let i = 0; i < rooms.length; i++) {
      const r     = rooms[i];
      const floor = this.rectMask(r.getLeft(), r.getTop(), r.getRight(), r.getBottom());
      const walls = roomWalls[i].mask;

      const interiorNoWalls = this.andNot(floor, walls);
      const floorKey        = this.pickFromTuple(this.cfg.roomFloor);

      roomFloors.push({ mask: interiorNoWalls, tilesetKey: floorKey });
    }

    const solidCombined = this.orMany([voidMask, ...roomWalls.map(r => r.mask)]);
    const floorCombined = this.andNot(
      this.orMany([corridorMask, ...roomFloors.map(r => r.mask)]),
      solidCombined
    );

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
      [{ mask: corridorMask, tilesetKey: this.cfg.floor }, ...roomFloors],
      false,
      { [this.cfg.floor]: tilesetsCorridor[this.cfg.floor], ...tilesetsRoomFlr }
    );

    return { map };
  }

  private makeMask(fill = false) {
    const m: boolean[][] = new Array(this.h);

    for (let y = 0; y < this.h; y++) {
      m[y] = new Array(this.w);

      for (let x = 0; x < this.w; x++) {
        m[y][x] = fill;
      }
    }

    return m;
  }

  private inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  private buildDugMask() {
    const m = this.makeMask(false);

    this.digger.create((x: number, y: number, v: number) => {
      if (v === 0) {
        m[y][x] = true;
      }
    });

    return m;
  }

  private mergeRoomRects(rooms: RotRoomRect[]) {
    const m = this.makeMask(false);

    for (const r of rooms) {
      const L = r.getLeft();
      const R = r.getRight();
      const T = r.getTop();
      const B = r.getBottom();

      for (let y = T; y <= B; y++) {
        if (y < 0 || y >= this.h) continue;

        for (let x = L; x <= R; x++) {
          if (x < 0 || x >= this.w) continue;

          m[y][x] = true;
        }
      }
    }

    return m;
  }

  private rectMask(left: number, top: number, right: number, bottom: number) {
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

  private diff(a: boolean[][], b: boolean[][], reverse = false) {
    const out = this.makeMask(false);

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!reverse) {
          out[y][x] = a[y][x] && !b[y][x];
        } else {
          out[y][x] = b[y][x] && !a[y][x];
        }
      }
    }

    return out;
  }

  private not(a: boolean[][]) {
    const out = this.makeMask(false);

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        out[y][x] = !a[y][x];
      }
    }

    return out;
  }

  private orMany(masks: boolean[][][]) {
    const out = this.makeMask(false);

    for (const m of masks) {
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          if (m?.[y]?.[x]) {
            out[y][x] = true;
          }
        }
      }
    }

    return out;
  }

  private andNot(a: boolean[][], b: boolean[][]) {
    const out = this.makeMask(false);

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        out[y][x] = !!a?.[y]?.[x] && !b?.[y]?.[x];
      }
    }

    return out;
  }

  private innerPerimeterMaskMinusDoors(interior: boolean[][], corridorMask: boolean[][]) {
    const out = this.makeMask(false);
    const n4: ReadonlyArray<readonly [number, number]> = [
      [ 1, 0],
      [-1, 0],
      [ 0, 1],
      [ 0,-1],
    ];

    const isDoor = (nx: number, ny: number, dx: number, dy: number) => {
      if (!this.inBounds(nx, ny)) return false;
      if (!corridorMask[ny][nx])  return false;

      const fx = nx + dx;
      const fy = ny + dy;

      const forward =
        this.inBounds(fx, fy) &&
        corridorMask[fy][fx];

      const lx = nx + dy;
      const ly = ny - dx;

      const rx = nx - dy;
      const ry = ny + dx;

      const side =
        (this.inBounds(lx, ly) && corridorMask[ly][lx]) ||
        (this.inBounds(rx, ry) && corridorMask[ry][rx]);

      return forward || side;
    };

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!interior[y][x]) continue;

        let edge = false;
        let door = false;

        for (const [dx, dy] of n4) {
          const nx = x + dx;
          const ny = y + dy;

          const inside =
            this.inBounds(nx, ny) &&
            interior[ny][nx];

          if (!inside) {
            edge = true;

            if (isDoor(nx, ny, dx, dy)) {
              door = true;
              break;
            }
          }
        }

        out[y][x] = edge && !door;
      }
    }

    return out;
  }

  private paintCompositeAutotile(
    layer: Phaser.Tilemaps.TilemapLayer,
    combinedMask: boolean[][],
    sources: Array<{ mask: boolean[][]; tilesetKey: string }>,
    collidable: boolean,
    tilesetMap: Record<string, Phaser.Tilemaps.Tileset>
  ) {
    const ids = combinedMask.map(row => row.map(v => (v ? 1 : 0)));

    const pickKey = (x: number, y: number) => {
      for (const s of sources) {
        if (s.mask?.[y]?.[x]) {
          return s.tilesetKey;
        }
      }
      return null;
    };

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!combinedMask[y][x]) continue;

        const quad = AutoTileMath.quad(
          this.cfg.indexArrs ?? INDEX_ARRS,
          ids,
          x,
          y,
          this.w,
          this.h
        );

        const tl = this.toZeroBased(quad[0]);
        const tr = this.toZeroBased(quad[1]);
        const bl = this.toZeroBased(quad[2]);
        const br = this.toZeroBased(quad[3]);

        const key = pickKey(x, y);
        if (!key) continue;

        const ts  = tilesetMap[key];
        const sx  = x * 2;
        const sy  = y * 2;

        this.putTileWithCollision(layer, ts.firstgid + tl, sx,     sy,     collidable);
        this.putTileWithCollision(layer, ts.firstgid + tr, sx + 1, sy,     collidable);
        this.putTileWithCollision(layer, ts.firstgid + bl, sx,     sy + 1, collidable);
        this.putTileWithCollision(layer, ts.firstgid + br, sx + 1, sy + 1, collidable);
      }
    }
  }

  private putTileWithCollision(
    layer: Phaser.Tilemaps.TilemapLayer,
    tileIndex: number,
    x: number,
    y: number,
    collidable: boolean
  ) {
    const tile = layer.putTileAt(tileIndex, x, y, true);

    if (tile) {
      (tile.properties as Record<string, unknown>)['ge_colide'] = collidable;
    }
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
