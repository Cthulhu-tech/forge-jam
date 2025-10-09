import UIPlugin from 'phaser3-rex-plugins/templates/ui/ui-plugin';
import GridEngine from 'grid-engine';
import { Scene } from 'phaser';

export class Base extends Scene {
    rexUI: UIPlugin;
    gridEngine: GridEngine;
    constructor (name: string) {
        super(name);
    }
}
