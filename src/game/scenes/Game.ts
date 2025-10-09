import { RoomPoolService } from '../utils/roomGenerator';
import { DoorPlanner, LayoutEngine } from '../utils/roomPlacement';
import { Base } from './Base/Base';

export class Game extends Base {
  constructor() {
    super('Game');
  }

    create() {
        const map = this.make.tilemap({ tileWidth: 16, tileHeight: 16, width: 100, height: 100 });

        const walls = map.addTilesetImage('walls_and_floor', 'walls_and_floor');
        const deco = map.addTilesetImage('decoration', 'decoration');

        const service = new RoomPoolService({
          cache: this.cache,
          seed: this.registry.get('seed') ?? 'level-1',
          size: { room: 5, next_level: 2 },
          keyPrefix: 'room_',
        });

        const rooms = service.build(['start', 'room', 'next_level']);

        const seed = String(this.registry.get('seed') ?? 'level-1');

        const engine = new LayoutEngine({
          seed,
          mapWidth: 100,
          mapHeight: 100,
          roadWidth: 3,
        });

        const { placed, corridors } = engine.build(rooms);
        const doorPlanner = new DoorPlanner({ seed, maxDoorWidth: 6 });

        doorPlanner.createDoors(placed, corridors, {
          doorWallTile: 123,
        });

        console.log(placed, corridors)

        const playerSprite = this.add.sprite(0, 0, "player");

        const gridEngineConfig = {
                characters: [
                {
                    id: "player",
                    sprite: playerSprite,
                    walkingAnimationMapping: 6,
                    startPosition: { x: 22, y: 40 },
                },
            ],
            numberOfDirections: 8,
        };

        this.cameras.main.startFollow(playerSprite, true);
        this.cameras.main.setFollowOffset(-playerSprite.width, -playerSprite.height);


        this.gridEngine.create(map, gridEngineConfig);
    }
}
