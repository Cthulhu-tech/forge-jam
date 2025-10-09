import { Game, WEBGL } from 'phaser';
import RexUIPlugin from 'phaser3-rex-plugins/templates/ui/ui-plugin.js';

import { GameOver } from './scenes/GameOver';
import { MainMenu } from './scenes/MainMenu';
import { Preloader } from './scenes/Preloader';
import { Game as MainGame } from './scenes/Game';
import GridEngine from 'grid-engine';

const config: Phaser.Types.Core.GameConfig = {
    type: WEBGL,
    parent: 'game-container',
    backgroundColor: '#000',
    scene: [
        Preloader,
        MainMenu,
        MainGame,
        GameOver
    ],
    scale: {
        width: 800,
        height: 600,
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        zoom: 1,
    },
    fps: {
        target: 120,
        min: 30,
        smoothStep: true,
    },
    plugins: {
        scene: [{
                key: 'rexUI',
                plugin: RexUIPlugin,
                mapping: 'rexUI',
            },
            {
                key: 'gridEngine',
                plugin: GridEngine,
                mapping: 'gridEngine',
            },
        ],
    },
    antialiasGL: false,
    pixelArt: true,
    preserveDrawingBuffer: true,
    roundPixels: true,
    antialias: false,
    autoRound: false,
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });
}

export default StartGame;
