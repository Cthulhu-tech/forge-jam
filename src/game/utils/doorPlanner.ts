import RBush from 'rbush';

export class DoorPlanner {
  private readonly rng: Phaser.Math.RandomDataGenerator;
  private readonly doorWidthClamp: number;

  constructor(opts: { seed: string; maxDoorWidth?: number }) {
    this.rng = new Phaser.Math.RandomDataGenerator([String(opts.seed)]);
    this.doorWidthClamp = Math.max(1, Math.floor(opts.maxDoorWidth ?? 6));
  }

  createDoors(
    placed: PlacedRoom[],
    corridors: Corridor[],
    tiles: {
      doorWallTile: number;
      floorTileUnderDoor?: number;
    }
  ): Array<{ room: PlacedRoom; x: number; y: number; w: number; h: number }> {
    const doors: Array<{ room: PlacedRoom; x: number; y: number; w: number; h: number }> = [];

    type AABB = { minX: number; minY: number; maxX: number; maxY: number; payload: PlacedRoom };
    const index = new RBush<AABB>();
    index.load(
      placed.map(r => ({
        minX: r.x,
        minY: r.y,
        maxX: r.x + r.w,
        maxY: r.y + r.h,
        payload: r,
      }))
    );

    for (const c of corridors) {
      for (const seg of c.rects) {
        const hits = index.search({
          minX: seg.minX,
          minY: seg.minY,
          maxX: seg.maxX,
          maxY: seg.maxY,
          payload: null,
        });

        for (const hit of hits) {
          const room = hit.payload;

          const ix0 = Math.max(seg.minX, room.x);
          const iy0 = Math.max(seg.minY, room.y);
          const ix1 = Math.min(seg.maxX, room.x + room.w);
          const iy1 = Math.min(seg.maxY, room.y + room.h);

          if (ix1 <= ix0 || iy1 <= iy0) continue;

          let doorX = ix0, doorY = iy0, doorW = ix1 - ix0, doorH = iy1 - iy0;

          const touchesTop = iy0 === room.y;
          const touchesBottom = iy1 === room.y + room.h;
          const touchesLeft = ix0 === room.x;
          const touchesRight = ix1 === room.x + room.w;

          if (touchesTop) {
            doorY = room.y; doorH = 1;
            doorW = this.clampDoorWidth(doorW);
            if (ix1 - ix0 > doorW) {
              const shift = this.rng.integerInRange(0, (ix1 - ix0) - doorW);
              doorX = ix0 + shift;
            }
          } else if (touchesBottom) {
            doorY = room.y + room.h - 1; doorH = 1;
            doorW = this.clampDoorWidth(doorW);
            if (ix1 - ix0 > doorW) {
              const shift = this.rng.integerInRange(0, (ix1 - ix0) - doorW);
              doorX = ix0 + shift;
            }
          } else if (touchesLeft) {
            doorX = room.x; doorW = 1;
            doorH = this.clampDoorWidth(doorH);
            if (iy1 - iy0 > doorH) {
              const shift = this.rng.integerInRange(0, (iy1 - iy0) - doorH);
              doorY = iy0 + shift;
            }
          } else if (touchesRight) {
            doorX = room.x + room.w - 1; doorW = 1;
            doorH = this.clampDoorWidth(doorH);
            if (iy1 - iy0 > doorH) {
              const shift = this.rng.integerInRange(0, (iy1 - iy0) - doorH);
              doorY = iy0 + shift;
            }
          } else {
            continue;
          }

          this.carveDoorInRoom(room, doorX, doorY, doorW, doorH, tiles);
          doors.push({ room, x: doorX, y: doorY, w: doorW, h: doorH });
        }
      }
    }

    return doors;
  }

  private clampDoorWidth(v: number) {
    return Math.max(1, Math.min(this.doorWidthClamp, v));
  }

  private carveDoorInRoom(
    room: PlacedRoom,
    doorX: number,
    doorY: number,
    doorW: number,
    doorH: number,
    tiles: { doorWallTile: number; floorTileUnderDoor?: number }
  ) {
    const walls = room.layers.find(l => l.name.toLowerCase() === 'walls');
    if (!walls) return;
    const floor = room.layers.find(l => l.name.toLowerCase() === 'floor');

    const lx = doorX - room.x;
    const ly = doorY - room.y;

    this.fillRectInLayer(walls, lx, ly, doorW, doorH, tiles.doorWallTile);

    if (floor && Number.isInteger(tiles.floorTileUnderDoor ?? NaN)) {
      this.fillRectInLayer(floor, lx, ly, doorW, doorH, tiles.floorTileUnderDoor!);
    }
  }

  private fillRectInLayer(layer: RawLayer, x: number, y: number, w: number, h: number, tileIndex: number) {
    const W = layer.width;
    const H = layer.height;
    for (let yy = 0; yy < h; yy++) {
      const gy = y + yy;
      if (gy < 0 || gy >= H) continue;
      const row = gy * W;
      for (let xx = 0; xx < w; xx++) {
        const gx = x + xx;
        if (gx < 0 || gx >= W) continue;
        layer.data[row + gx] = tileIndex;
      }
    }
  }
}
