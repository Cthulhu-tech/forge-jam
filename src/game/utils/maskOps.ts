export class MaskOps {
  constructor(private readonly w: number, private readonly h: number) {}

  makeMask(fill = false): BoolGrid {
    const m: BoolGrid = new Array(this.h);
    for (let y = 0; y < this.h; y++) { m[y] = new Array(this.w); for (let x = 0; x < this.w; x++) m[y][x] = fill; }
    return m;
  }

  inBounds(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  rectMask(left: number, top: number, right: number, bottom: number): BoolGrid {
    const m = this.makeMask(false);
    for (let y = top; y <= bottom; y++) {
      if (y < 0 || y >= this.h) continue;
      for (let x = left; x <= right; x++) {
        if (x < 0 || x >= this.w) continue;
        m[y][x] = true;
      }
    }
    return m;
  }

  shapeScaledToRoom(shape: number[][], L: number, T: number, R: number, B: number): BoolGrid {
    const m = this.makeMask(false);
    if (shape.length === 0 || shape[0].length === 0) return m;
    const rw = R - L + 1, rh = B - T + 1;
    const sw = shape[0].length, sh = shape.length;
    for (let y = 0; y < rh; y++) {
      const gy = T + y; if (gy < 0 || gy >= this.h) continue;
      const sy = Math.floor((y + 0.5) * sh / rh);
      for (let x = 0; x < rw; x++) {
        const gx = L + x; if (gx < 0 || gx >= this.w) continue;
        const sx = Math.floor((x + 0.5) * sw / rw);
        if (shape[sy]?.[sx] === 1) m[gy][gx] = true;
      }
    }
    return m;
  }

  outerPerimeterMask(interior: BoolGrid, floorMaskAll: BoolGrid): BoolGrid {
    const out = this.makeMask(false);
    const n8: ReadonlyArray<readonly [number, number]> = [
      [ 1, 0], [-1, 0], [0, 1], [0,-1],
      [ 1, 1], [ 1,-1], [-1, 1], [-1,-1],
    ];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (interior[y][x]) {
      for (const [dx, dy] of n8) {
        const nx = x + dx, ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        if (!floorMaskAll[ny][nx]) out[ny][nx] = true;
      }
    }
    return out;
  }

  doorMaskForRoom(interior: BoolGrid, corridor: BoolGrid): BoolGrid {
    const out = this.makeMask(false);
    const n4: ReadonlyArray<readonly [number, number]> = [[1,0],[-1,0],[0,1],[0,-1]];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (corridor[y][x]) {
      for (const [dx, dy] of n4) {
        const nx = x + dx, ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        if (interior[ny][nx]) { out[y][x] = true; break; }
      }
    }
    return out;
  }

  not(a: BoolGrid): BoolGrid {
    const out = this.makeMask(false);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out[y][x] = !a[y][x];
    return out;
  }

  or(a: BoolGrid, b: BoolGrid): BoolGrid {
    const out = this.makeMask(false);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out[y][x] = !!a?.[y]?.[x] || !!b?.[y]?.[x];
    return out;
  }

  orMany(masks: BoolGrid[]): BoolGrid {
    const out = this.makeMask(false);
    for (const m of masks) for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (m?.[y]?.[x]) out[y][x] = true;
    return out;
  }

  andNot(a: BoolGrid, b: BoolGrid): BoolGrid {
    const out = this.makeMask(false);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out[y][x] = !!a?.[y]?.[x] && !b?.[y]?.[x];
    return out;
  }

  placeEnvMaskCentered(envData: number[][], interior: BoolGrid, L: number, T: number, R: number, B: number): BoolGrid {
    const m = this.makeMask(false);
    const rw = R - L + 1, rh = B - T + 1;
    const sw = envData[0].length, sh = envData.length;
    const offX = L + Math.floor((rw - sw) / 2);
    const offY = T + Math.floor((rh - sh) / 2);
    for (let y = 0; y < sh; y++) {
      const gy = offY + y;
      if (gy < 0 || gy >= this.h) continue;
      for (let x = 0; x < sw; x++) {
        const gx = offX + x;
        if (gx < 0 || gx >= this.w) continue;
        if (envData[y]?.[x] === 1 && interior[gy][gx]) m[gy][gx] = true;
      }
    }
    return m;
  }

  filterByWhitelist(mask: BoolGrid, whitelist: Readonly<Record<string, number>>): BoolGrid {
    const out = this.makeMask(false);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!mask[y][x]) continue;
        const key = `${x},${y}`;
        if (whitelist[key]) out[y][x] = true;
      }
    }
    return out;
  }
}
