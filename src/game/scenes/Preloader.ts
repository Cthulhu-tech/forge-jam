import { roomNames } from '../../constants/map';
import { Base } from './Base/Base';

export class Preloader extends Base {
    constructor () {
        super('Preloader');
    }

    preload () {
        this.load.setPath('assets');
        this.load.image('logo', 'silly.png');
        this.load.image('menu-button', 'button/menu-button.png');
        this.load.image('menu', 'menu.png');
        this.load.image('digger', 'game/digger.png');
    
        this.load.image("walls_and_floor", "game/Tiles/walls_and_floor.png");
        this.load.image("decoration", "game/Tiles/decoration.png");

        this.load.spritesheet("player", "game/Animations/player.png", {
            frameWidth: 32,
            frameHeight: 64,
        });

        this.load.bitmapFont('desyrel', 'fonts/minogram_6x10.png', 'fonts/minogram_6x10.xml');

        this.load.json("walls_and_floor", "tiles/walls_and_floor.json");
        this.load.json("decoration", "tiles/decoration.json");

        for (const name of roomNames) {
            this.load.json(`room_${name}`, `rooms/${name}.json`);
        }
    }

    create () {
        const logo = this.add.image(0, 0, 'logo')
            .setOrigin(0.5);

        this.rexUI.add.gridSizer({
            x: 0,
            y: 0,
            column: 1,
            row: 1,
            columnProportions: [1, 1],
            rowProportions: [1],
            anchor: { centerX: '50%', centerY: '50%' },
        })
            .add(logo, 0, 0, 'center', 0, false)
            .layout();

        const timeoutId = setTimeout(() => {
            clearTimeout(timeoutId);
            this.scene.start('MainMenu');
        }, 2000);
    }
}
