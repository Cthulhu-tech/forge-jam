import Phaser from 'phaser';
import * as ROT from 'rot-js';
import Digger from 'rot-js/lib/map/digger';
import { MaskOps } from './maskOps';
import { TilesetRegistrar } from './tilesetRegistrar';
import { OwnerBridgeResolver } from './ownerBridgeResolver';
import { Painter } from './painter';
import { PostDecorator } from './postDecorator';
import { PrefabAssigner } from './prefabAssigner';

export class AutoTileRenderer {
  private scene: Phaser.Scene;
  private cfg: AutoTileConfig;
  private digger: Digger;
  private w: number;
  private h: number;
  private seed: number;
  constructor(scene: Phaser.Scene, cfg: AutoTileConfig, w = 200, h = 200, seed = 12345) {
    this.scene = scene;
    this.cfg = cfg;
    this.w = w;
    this.h = h;
    this.seed = seed;
    ROT.RNG.setSeed(this.seed);
    this.digger = new ROT.Map.Digger(this.w, this.h, { roomWidth: [4, 18], roomHeight: [4, 18], corridorLength: [4, 12], dugPercentage: 0.45 });
  }

  createTilemap(): { map: Phaser.Tilemaps.Tilemap, start: { x: number, y: number } } {
    this.digger.create();

    const map = this.scene.make.tilemap({ tileWidth: this.cfg.subTile, tileHeight: this.cfg.subTile, width: this.w * 2, height: this.h * 2 });

    const tiles = new TilesetRegistrar(map, this.cfg.subTile);
    const mask = new MaskOps(this.w, this.h);
    const ownerBridge = new OwnerBridgeResolver(this.w, this.h);
    const painter = new Painter(this.w, this.h, this.cfg);
    const post = new PostDecorator(this.w, this.h, mask);

    const prefabWallKeys = Array.from(new Set((this.cfg.roomPrefabs ?? []).map(p => p.wallKey))).filter(Boolean) as string[];
    const prefabFloorKeys = Array.from(new Set((this.cfg.roomPrefabs ?? []).map(p => p.floorKey))).filter(Boolean) as string[];
    const envKeys = Array.from(new Set((this.cfg.roomPrefabs ?? []).flatMap(p => (p.environments ?? []).map(e => e.element)))).filter(Boolean) as string[];

    const roomWallKeysAll = Array.from(new Set<string>([...this.cfg.room, ...prefabWallKeys]));
    const roomFloorKeysAll = Array.from(new Set<string>([...this.cfg.roomFloor, ...prefabFloorKeys]));
    const tilesetsVoid = tiles.register([this.cfg.floorWall]);
    const tilesetsRooms = tiles.register(roomWallKeysAll);
    const tilesetsCorridor = tiles.register([this.cfg.floor]);
    const tilesetsRoomFlr = tiles.register(roomFloorKeysAll);
    const tilesetsEnv = tiles.register(envKeys);
    const tilesetsDoor = tiles.register(this.cfg.door ?? []);

    const solidLayer = map.createBlankLayer('Solid', [tilesetsVoid[this.cfg.floorWall], ...Object.values(tilesetsRooms)], 0) as Phaser.Tilemaps.TilemapLayer;
    const floorLayer = map.createBlankLayer('Floor', [tilesetsCorridor[this.cfg.floor], ...Object.values(tilesetsRoomFlr)], 1) as Phaser.Tilemaps.TilemapLayer;
    const doorLayer = map.createBlankLayer('Door', Object.values(tilesetsDoor), 2) as Phaser.Tilemaps.TilemapLayer;
    solidLayer.setPosition(0, 0);
    floorLayer.setPosition(0, 0);
    doorLayer.setPosition(0, 0);

    const dug = this.buildDugMask(mask);
    const rooms = this.digger.getRooms() as RotRoomRect[];
    const corridorMask = this.buildCorridorMaskFromDigger(mask);

    const assignments = PrefabAssigner.assignPrefabs(rooms.length, this.cfg.roomPrefabs);

    const roomInteriorMasks: BoolGrid[] = [];
    const roomWallKeys: string[] = [];
    const roomFloorKeys: string[] = [];
    const roomEnvs: EnvDef[][] = [];

    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      const L = r.getLeft(), T = r.getTop(), R = r.getRight(), B = r.getBottom();
      const a = assignments[i];
      if (a && a.shape && a.shape.length > 0 && a.shape[0].length > 0) {
        roomInteriorMasks.push(mask.shapeScaledToRoom(a.shape, L, T, R, B));
        roomWallKeys.push(a.wallKey);
        roomFloorKeys.push(a.floorKey);
      } else {
        roomInteriorMasks.push(mask.rectMask(L, T, R, B));
        roomWallKeys.push(a ? a.wallKey : this.pickFromTuple(this.cfg.room));
        roomFloorKeys.push(a ? a.floorKey : this.pickFromTuple(this.cfg.roomFloor));
      }
      roomEnvs.push(a?.environments ?? []);
    }

    const floorMaskAll = mask.orMany([corridorMask, ...roomInteriorMasks]);
    const voidMask = mask.not(dug);

    const doorMasksPerRoom = this.buildDoorMasksFromRooms(rooms, mask);
    const doorMaskAll = mask.orMany(doorMasksPerRoom);

    const roomWalls: MaskSource[] = [];
    const roomFloors: MaskSource[] = [];

    for (let i = 0; i < rooms.length; i++) {
      const interior = roomInteriorMasks[i];
      const doors = doorMasksPerRoom[i];
      const wallsOuter = mask.outerPerimeterMask(interior, floorMaskAll);
      const wallsNoDoors = mask.andNot(wallsOuter, doorMaskAll);
      const floorIn = mask.or(interior, doors);
      roomWalls.push({ mask: wallsNoDoors, tilesetKey: roomWallKeys[i] });
      roomFloors.push({ mask: floorIn, tilesetKey: roomFloorKeys[i] });
    }

    const solidCombined0 = mask.orMany([voidMask, ...roomWalls.map(r => r.mask)]);
    const corridorNoDoors = mask.andNot(corridorMask, doorMaskAll);
    const floorCombined0 = mask.andNot(mask.orMany([corridorNoDoors, ...roomFloors.map(r => r.mask)]), solidCombined0);

    const floorOwner0 = ownerBridge.buildOwnerGrid(
      floorCombined0,
      [{ mask: corridorNoDoors, tilesetKey: this.cfg.floor }, ...roomFloors]
    );

    const solidCombined = solidCombined0;
    const floorOwner = floorOwner0;
    const floorCombined = floorCombined0;

    const doorSources: Array<{ mask: BoolGrid; tilesetKey: string }> = [];
    const doorKeys = (this.cfg.door ?? []).length ? this.cfg.door! : ['door'];
    for (let i = 0; i < doorMasksPerRoom.length; i++) {
      const dk = this.pickFromTuple(doorKeys as readonly string[]);
      doorSources.push({ mask: doorMasksPerRoom[i], tilesetKey: dk });
    }

    const wallForFloor: Record<string, string> = {};
    for (let i = 0; i < rooms.length; i++) {
      wallForFloor[roomFloorKeys[i]] = roomWallKeys[i];
    }

    painter.paintCompositeAutotilePerQuad(
      solidLayer,
      solidCombined,
      [{ mask: voidMask, tilesetKey: this.cfg.floorWall }, ...roomWalls],
      true,
      { [this.cfg.floorWall]: tilesetsVoid[this.cfg.floorWall], ...tilesetsRooms },
      floorOwner,
      this.cfg.floor,
      this.cfg.floorWall,
      wallForFloor
    );

    painter.paintCompositeAutotilePerQuad(
      floorLayer,
      floorCombined,
      [
        { mask: corridorNoDoors, tilesetKey: this.cfg.floor },
        ...roomFloors
      ],
      false,
      { [this.cfg.floor]: tilesetsCorridor[this.cfg.floor], ...tilesetsRoomFlr },
      null,
      null,
      null
    );

    if (doorSources.length) {
      const doorTilesetMap: Record<string, Phaser.Tilemaps.Tileset> = {};
      for (const k of Object.keys(tilesetsDoor)) doorTilesetMap[k] = tilesetsDoor[k];
      painter.paintCompositeAutotilePerQuad(
        doorLayer,
        doorMaskAll,
        doorSources,
        false,
        doorTilesetMap,
        null,
        null,
        null
      );
    }

    const envGroups: Record<string, { collidable: boolean; sources: MaskSource[] }> = {};
    for (const key of envKeys) envGroups[key] = { collidable: false, sources: [] };

    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      const L = r.getLeft(), T = r.getTop(), R = r.getRight(), B = r.getBottom();
      const interior = roomInteriorMasks[i];

      for (const env of roomEnvs[i]) {
        if (!env.element || !env.data.length || !env.data[0]?.length) continue;
        const m = mask.placeEnvMaskCentered(env.data, interior, L, T, R, B);
        if (!envGroups[env.element]) envGroups[env.element] = { collidable: env.collision, sources: [] };
        envGroups[env.element].sources.push({ mask: m, tilesetKey: env.element });
        if (env.collision) envGroups[env.element].collidable = true;
      }
    }

    let envZ = 3;
    for (const element of Object.keys(envGroups)) {
      const group = envGroups[element];
      if (!group.sources.length) continue;
      const layer = map.createBlankLayer(`Env_${element}`, [tilesetsEnv[element]], envZ++) as Phaser.Tilemaps.TilemapLayer;
      layer.setPosition(0, 0);
      const combined = envGroups[element].sources.reduce((acc, s) => {
        if (!acc) return s.mask;
        return mask.or(acc, s.mask);
      }, mask.makeMask(false));
      painter.paintCompositeAutotilePerQuad(
        layer,
        combined,
        group.sources,
        group.collidable,
        { [element]: tilesetsEnv[element] },
        null,
        null,
        null
      );
    }

    post.decorate(
      solidLayer,
      floorLayer,
      rooms,
      roomInteriorMasks,
      doorMasksPerRoom,
      corridorMask
    );

    const start = this.findStartCenter(rooms, roomInteriorMasks, roomWallKeys) ?? {
      x: 0,
      y: 0,
    };

    return { map, start };
  }

  private findStartCenter(rooms: RotRoomRect[], interiors: BoolGrid[], wallKeys: string[]): { x: number, y: number } | null {
    const idx = wallKeys.findIndex(k => k === 'start');
    if (idx === -1) return null;
    const r = rooms[idx];
    const m = interiors[idx];
    let cx = Math.floor((r.getLeft() + r.getRight()) / 2);
    let cy = Math.floor((r.getTop() + r.getBottom()) / 2);
    if (m[cy]?.[cx]) return { x: cx, y: cy };
    const best = this.closestTrueTo(m, cx, cy);
    if (best) return { x: best[0], y: best[1] };
    const any = this.pickRandomTrue(m);
    if (any) return { x: any[0], y: any[1] };
    return null;
  }

  private closestTrueTo(m: BoolGrid, cx: number, cy: number): [number, number] | null {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[0].length; x++) {
        if (!m[y][x]) continue;
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d < bestD) { bestD = d; best = [x, y]; }
      }
    }
    return best;
  }

  private pickRandomTrue(m: BoolGrid): [number, number] | null {
    const list: Array<[number, number]> = [];
    for (let y = 0; y < m.length; y++) for (let x = 0; x < m[0].length; x++) if (m[y][x]) list.push([x, y]);
    if (!list.length) return null;
    return list[ROT.RNG.getUniformInt(0, list.length - 1)];
  }

  private buildDoorMasksFromRooms(rooms: RotRoomRect[], maskOps: MaskOps): BoolGrid[] {
    const perRoom: BoolGrid[] = [];
    for (let i = 0; i < rooms.length; i++) {
      const m = maskOps.makeMask(false);
      const anyRoom: any = rooms[i] as any;
      const doorsObj: Record<string, number> | undefined = anyRoom?._doors;
      if (doorsObj) {
        for (const key of Object.keys(doorsObj)) {
          const [sx, sy] = key.split(',').map(v => parseInt(v, 10));
          if (Number.isFinite(sx) && Number.isFinite(sy) && maskOps.inBounds(sx, sy)) {
            m[sy][sx] = true;
          }
        }
      }
      perRoom.push(m);
    }
    return perRoom;
  }

  private buildCorridorMaskFromDigger(mask: MaskOps): BoolGrid {
    const m = mask.makeMask(false);
    const corridors = this.digger.getCorridors() as RotCorridor[];
    for (const c of corridors) c.create((x, y) => { if ((mask as any).inBounds(x, y)) m[y][x] = true; });
    return m;
  }

  private buildDugMask(mask: MaskOps): BoolGrid {
    const m = mask.makeMask(false);
    this.digger.create((x: number, y: number, v: number) => { if (v === 0) m[y][x] = true; });
    return m;
  }

  private pickFromTuple<T extends string>(tuple: readonly T[]) {
    const idx = ROT.RNG.getUniformInt(0, tuple.length - 1);
    return tuple[idx];
  }
}
