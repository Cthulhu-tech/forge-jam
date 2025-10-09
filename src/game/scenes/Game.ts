import { roomNames } from '../../constants/map';
import { Base } from './Base/Base';

type RawLayer = {
  name: string;
  width: number;
  height: number;
  data: number[];
}

type RawMap = {
  layers: RawLayer[];
}

export class Game extends Base {
  constructor() {
    super('Game');
  }

    create() {
        const map = this.make.tilemap({ tileWidth: 16, tileHeight: 16, width: 100, height: 100 });

        const walls = map.addTilesetImage('walls_and_floor', 'walls_and_floor');
        const deco = map.addTilesetImage('decoration', 'decoration');

        for (const name of roomNames) {
          const json = this.cache.json.get(`room_${name}`);

          json.forEach((data: RawMap[]) => {
            data.forEach(({ layers }) => {
              layers.forEach(({ data, width, height }) => {

              });
            });
          });
        }

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
