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

        this.load.spritesheet("player", "game/Animations/player.png", {
            frameWidth: 16,
            frameHeight: 32,
        });

        this.load.bitmapFont('desyrel', 'fonts/minogram_6x10.png', 'fonts/minogram_6x10.xml');

        this.load.image("end", "game/Tiles/end.png");
        this.load.image("glass", "game/Tiles/glass.png");
        this.load.image("ground", "game/Tiles/ground.png");
        this.load.image("iron", "game/Tiles/iron.png");
        this.load.image("library", "game/Tiles/library.png");
        this.load.image("medic", "game/Tiles/medic.png");
        this.load.image("start", "game/Tiles/start.png");
        this.load.image("tree", "game/Tiles/tree.png");
        this.load.image("wall", "game/Tiles/wall.png");
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
