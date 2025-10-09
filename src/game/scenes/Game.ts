import { Base } from './Base/Base';
import { RoomPoolService } from '../utils/roomGenerator';
import { CollisionStamper } from '../utils/collisionStamper';
import { CorridorCarver } from '../utils/corridorCarver';
import { LayerBlitter } from '../utils/layerBlitter';
import { TilesetPropsMerger } from '../utils/tilesetPropsMerger';
import { map_const, size } from '../../constants/map';
import { LayoutEngine } from '../utils/layoutEngine';
import { DoorPlanner } from '../utils/doorPlanner';

export class Game extends Base {
  private geReady = false;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() { super('Game'); }

  create() {
    const map = this.make.tilemap({ tileWidth: map_const.TILE, tileHeight: map_const.TILE, width: map_const.MAP_W, height: map_const.MAP_H });
    const tsWalls = map.addTilesetImage('walls_and_floor', 'walls_and_floor', map_const.TILE, map_const.TILE, 0, 0, 0)!;
    const tsDeco  = map.addTilesetImage('decoration',      'decoration',      map_const.TILE, map_const.TILE, 0, 0, 0)!;

    const floorL = map.createBlankLayer('floor', [tsWalls], 0, 0, map_const.MAP_W, map_const.MAP_H, map_const.TILE, map_const.TILE)!;
    const wallsL = map.createBlankLayer('walls', [tsWalls], 0, 0, map_const.MAP_W, map_const.MAP_H, map_const.TILE, map_const.TILE)!;
    const decoL  = map.createBlankLayer('deco' , [tsDeco ], 0, 0, map_const.MAP_W, map_const.MAP_H, map_const.TILE, map_const.TILE)!;
    const npcL   = map.createBlankLayer('npc'  , [tsDeco ], 0, 0, map_const.MAP_W, map_const.MAP_H, map_const.TILE, map_const.TILE)!;
    const miscL  = map.createBlankLayer('misc' , [tsDeco ], 0, 0, map_const.MAP_W, map_const.MAP_H, map_const.TILE, map_const.TILE)!;

    const propsMerger = new TilesetPropsMerger(this);
    propsMerger.merge('walls_and_floor', tsWalls);
    propsMerger.merge('decoration', tsDeco);

    const seed = String(this.registry.get('seed') ?? 'level-1');
    const pool = new RoomPoolService({ cache: this.cache, seed, size, keyPrefix: 'room_' });
    const rooms = pool.build(['start', 'room', 'next_level']);

    const engine = new LayoutEngine({ seed, mapWidth: map_const.MAP_W, mapHeight: map_const.MAP_H, roadWidth: 1 });
    const { placed, corridors } = engine.build(rooms);

    const doorPlanner = new DoorPlanner({ seed, maxDoorWidth: 6 });
    doorPlanner.createDoors(placed, corridors, { doorWallTile: map_const.DOOR_LOCAL_ID });

    const blitter = new LayerBlitter(map_const.MAP_W, map_const.MAP_H);
    for (const r of placed) {
      const pick = (n: string) => r.layers.find(l => l.name.toLowerCase() === n);
      const f = pick('floor'); if (f) blitter.blit(floorL, f, r.x, r.y);
      const w = pick('walls'); if (w) blitter.blit(wallsL, w, r.x, r.y);
      const d = pick('deco');  if (d) blitter.blit(decoL , d, r.x, r.y);
      const n = pick('npc');   if (n) blitter.blit(npcL  , n, r.x, r.y);
      const m = pick('misc');  if (m) blitter.blit(miscL , m, r.x, r.y);
    }

    new CorridorCarver(map_const.MAP_W, map_const.MAP_H, map_const.CORRIDOR_FLOOR_LOCAL_ID, map_const.DOOR_LOCAL_ID)
      .carve(corridors, { floor: floorL, walls: wallsL, deco: decoL, misc: miscL });

    const stamper = new CollisionStamper(map_const.GE_PROP);
    stamper.stampFromTileset(wallsL, tsWalls, (t) => t.index === map_const.DOOR_LOCAL_ID);
    stamper.stampFromTileset(decoL , tsDeco);
    stamper.stampFromTileset(miscL , tsDeco);
    const startRoom = (placed).find(p => p.key === 'start') ?? (placed)[0];
    const startPosition = {
      x: Phaser.Math.Clamp(startRoom.x + Math.floor(startRoom.w / 2), 0, map_const.MAP_W - 1),
      y: Phaser.Math.Clamp(startRoom.y + Math.floor(startRoom.h / 2), 0, map_const.MAP_H - 1),
    };

    const playerSprite = this.add.sprite(0, 0, 'player');

    this.gridEngine.create(map, {
      characters: [{ id: 'player', sprite: playerSprite, walkingAnimationMapping: 6, startPosition }],
      numberOfDirections: 8,
      collisionTilePropertyName: map_const.GE_PROP,
    });

    this.geReady = true;

    this.cursors = this.input.keyboard.createCursorKeys();
    this.cameras.main.startFollow(playerSprite, true);
    this.cameras.main.setFollowOffset(-playerSprite.width, -playerSprite.height);
  }

  update() {
    if (!this.geReady) return;
    if (this.cursors.left.isDown) this.gridEngine.move('player', 'left');
    else if (this.cursors.right.isDown) this.gridEngine.move('player', 'right');
    else if (this.cursors.up.isDown) this.gridEngine.move('player', 'up');
    else if (this.cursors.down.isDown) this.gridEngine.move('player', 'down');
  }
}
