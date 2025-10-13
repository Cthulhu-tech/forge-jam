import { INDEX_ARRS, roomPrefabs, SUBTILE } from '../../constants/map';
import { AutoTileRenderer } from '../utils/autoTileRenderer';
import { Base } from './Base/Base';

const cfg: AutoTileConfig = {
  subTile: SUBTILE,
  indexArrs: INDEX_ARRS,
  room: ['library', 'medic', 'start', 'end'],
  roomFloor: ['glass', 'iron', 'tree', 'ground'],
  floor: 'iron',
  floorWall: 'wall',
  roomPrefabs,
}

export class Game extends Base {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  constructor() {
    super('Game');
  }

  create() {
    const playerSprite = this.add
      .sprite(16, 32, 'player', 0)
      .setOrigin(0.5, 1);

    const renderer = new AutoTileRenderer(this, cfg, 55, 55, 12345);
    const { map } = renderer.createTilemap();

    this.gridEngine.create(map, {
      characters: [{
          id: 'player',
          sprite: playerSprite,
          startPosition: {
            x: 28,
            y: 24,
          },
          speed: 20,
          walkingAnimationMapping: 8
        }
      ],
      numberOfDirections: 4,
      collisionTilePropertyName: 'ge_colide',
    });

    const cam = this.cameras.main;

    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.setZoom(1);

    cam.startFollow(playerSprite, true, 0.15, 0.15);
    cam.setRoundPixels(true);

    cam.followOffset.set(0, -8);

    if(this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }
  }

  update() {
    if (this.cursors.left.isDown) this.gridEngine.move('player', 'left');
    else if (this.cursors.right.isDown) this.gridEngine.move('player', 'right');
    else if (this.cursors.up.isDown) this.gridEngine.move('player', 'up');
    else if (this.cursors.down.isDown) this.gridEngine.move('player', 'down');
  }
}
