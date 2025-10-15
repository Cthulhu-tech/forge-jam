import { OwnerBridgeResolver } from './ownerBridgeResolver';
import { Painter } from './painter';
import { MaskOps } from './maskOps';
import { PrefabAssigner } from './prefabAssigner';
import { TilesetRegistrar } from './tilesetRegistrar';
import Digger from 'rot-js/lib/map/digger';
import Phaser from 'phaser';
import * as ROT from 'rot-js';

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

    const tiles = new TilesetRegistrar(map, this.cfg.subTile);
    const mask = new MaskOps(this.w, this.h);
    const ownerBridge = new OwnerBridgeResolver(mask, this.w, this.h);
    const painter = new Painter(this.w, this.h, this.cfg);

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

    const solidLayer = map.createBlankLayer('Solid', [tilesetsVoid[this.cfg.floorWall], ...Object.values(tilesetsRooms)], 0) as Phaser.Tilemaps.TilemapLayer;
    const floorLayer = map.createBlankLayer('Floor', [tilesetsCorridor[this.cfg.floor], ...Object.values(tilesetsRoomFlr)], 1) as Phaser.Tilemaps.TilemapLayer;
    solidLayer.setPosition(0, 0);
    floorLayer.setPosition(0, 0);

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

    const doorMasksPerRoom: BoolGrid[] = roomInteriorMasks.map(int => mask.doorMaskForRoom(int, corridorMask));
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

    const { solid: solidCombined, bridges: bridgeMask } = ownerBridge.computeRelaxedWallsAndBridges(solidCombined0, floorOwner0);

    const {
      bridgeSources,
      floorOwner: floorOwner,
      floorCombined: floorCombined
    } = ownerBridge.assignBridgeOwnersAndExtendFloor(bridgeMask, floorOwner0, floorCombined0, this.cfg.floor);

    painter.paintCompositeAutotilePerQuad(
      solidLayer,
      solidCombined,
      [{ mask: voidMask, tilesetKey: this.cfg.floorWall }, ...roomWalls],
      true,
      { [this.cfg.floorWall]: tilesetsVoid[this.cfg.floorWall], ...tilesetsRooms },
      floorOwner,
      this.cfg.floor,
      this.cfg.floorWall
    );

    painter.paintCompositeAutotilePerQuad(
      floorLayer,
      floorCombined,
      [
        { mask: corridorNoDoors, tilesetKey: this.cfg.floor },
        ...roomFloors,
        ...bridgeSources
      ],
      false,
      { [this.cfg.floor]: tilesetsCorridor[this.cfg.floor], ...tilesetsRoomFlr },
      null,
      null,
      null
    );

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

    let envZ = 2;
    for (const element of Object.keys(envGroups)) {
      const group = envGroups[element];
      if (!group.sources.length) continue;
      const layer = map.createBlankLayer(`Env_${element}`, [tilesetsEnv[element]], envZ++) as Phaser.Tilemaps.TilemapLayer;
      layer.setPosition(0, 0);
      const combined = mask.orMany(group.sources.map(s => s.mask));
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

    return { map };
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
