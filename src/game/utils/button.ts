import { Base } from "../scenes/Base/Base";

export class Button {
  private scene: Base;
  private iconKey: string;
  private size: number;
  private text: string;

  constructor(scene: Base, iconKey: string, text: string, size = 128) {
    this.scene = scene;
    this.iconKey = iconKey;
    this.size = size;
    this.text = text;
  }

  getButton() {
    const background = this.scene.rexUI.add
      .imageBox(0, 0, this.iconKey, undefined, {
        width: this.size,
        height: this.size / 2,
      });

    const btn = this.scene.rexUI.add
      .overlapSizer(0, 0, this.size, this.size / 2)
      .addBackground(background);

    return this.scene.rexUI.add.simpleLabel({
      x: 0,
      y: 0,
      text: {
        $type: 'bitmaptext',
        font: 'desyrel',
        fontSize: 24,
        align: 'center',
      },
      align: 'center',
      space: { left: 10, right: 10, top: 15, bottom: 10, icon: 0 },
    })
      .addBackground(btn)
      .setSize(this.size, this.size / 2)
      .resetDisplayContent({ text: this.text })
      .setOrigin(0.5)
      .setData('id', this.text)
      .setInteractive({ useHandCursor: true });
  }
}

export class GameButton {
  private scene: Base;
  private iconKey: string;
  private size: number;
  private text: string;

  constructor(scene: Base, iconKey: string, text: string, size = 128) {
    this.scene = scene;
    this.iconKey = iconKey;
    this.size = size;
    this.text = text;
  }

  getButton() {
    return this.scene.rexUI.add.simpleLabel({
      x: 0,
      y: 0,
      text: {
        $type: 'bitmaptext',
        font: 'desyrel',
        fontSize: 24,
        align: 'center',
      },
      align: 'center',
      space: { left: 10, right: 10, top: 15, bottom: 10, icon: 0 },
    })
      .setSize(this.size, this.size / 2)
      .resetDisplayContent({ text: this.text, icon: this.iconKey, iconSize: 16 })
      .setOrigin(0.5)
      .setData('id', this.text)
      .setInteractive({ useHandCursor: true });
  }
}
