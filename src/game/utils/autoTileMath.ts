export class AutoTileMath {
  static toZeroBased(i: number): number {
    return i - 1;
  }

  static pointBlocks(mapIds: number[][], x: number, y: number, W: number, H: number): number[] {
    const currId = mapIds[y][x];
    const get = (cx: number, cy: number): 0 | 1 => {
      if (cx >= 0 && cy >= 0 && cx < W && cy < H && mapIds[cy][cx] === currId) return 1;
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) return 1;
      return 0;
    };
    const out: number[] = [];
    for (let i = 0; i < 4; i++) {
      let b = 0;
      const ox = i % 2, oy = (i / 2) | 0;
      for (let j = 0; j < 4; j++) {
        const mx = j % 2, my = (j / 2) | 0;
        b += get(x + ox + mx - 1, y + oy + my - 1) * (1 << (3 - j));
      }
      out.push(b & 0b1111);
    }
    return out;
  }

  static quad(indexArrs: number[][], mapIds: number[][], x: number, y: number, W: number, H: number)
  : [number, number, number, number] {
    const pb = this.pointBlocks(mapIds, x, y, W, H);
    let tl = indexArrs[pb[0]][3 - 0];
    let tr = indexArrs[pb[1]][3 - 1];
    let bl = indexArrs[pb[2]][3 - 2];
    let br = indexArrs[pb[3]][3 - 3];

    if (tl === 13) { if (tr === 16) tr = 14; if (bl === 31) bl = 19; }
    if (tr === 18) { if (tl === 15) tl = 17; if (br === 36) br = 24; }
    if (bl === 43) { if (tl === 25) tl = 37; if (br === 46) br = 44; }
    if (br === 48) { if (tr === 30) tr = 42; if (bl === 45) bl = 47; }

    return [tl, tr, bl, br];
  }
}
