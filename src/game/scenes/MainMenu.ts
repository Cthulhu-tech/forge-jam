import { Button } from "../utils/button";
import { Base } from "./Base/Base";

export class MainMenu extends Base {
    constructor () {
        super('MainMenu');
    }

    create () {
        this.rexUI.add.gridSizer({
            x: 0,
            y: 0,
            column: 1,
            row: 1,
            columnProportions: [1],
            rowProportions: [1],
            anchor: { centerX: '50%', centerY: '50%' },
        })
         .add(this.rexUI.add.imageBox(0, 0, 'menu'), 0, 0, 'center-center', 0, true)
         .layout();

        const group = this.rexUI.add.buttons({
            x: 400, y: 300,
            orientation: 'y',
            space: { item: 20 },
            buttonsType: 'radio',
            buttons: [
                new Button(this, 'menu-button', 'start', 128).getButton(),
                // new Button(this, 'menu-button', 'option', 128).getButton(),
                // new Button(this, 'menu-button', 'quit', 128).getButton(),
            ],
        })
            .layout();

        group.on('button.click', (button: Phaser.GameObjects.GameObject) => {
            const id = button.getData('id');
            switch (id) {
                case 'start':
                this.scene.start('Game');
                break;
                case 'option':
                this.scene.start('Option');
                break;
                case 'quit':
                this.scene.start('Quit');
                break;
            }
        });
    }
}
