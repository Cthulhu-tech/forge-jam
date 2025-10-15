import * as ROT from 'rot-js';

export class PrefabAssigner {
  static assignPrefabs(roomCount: number, list: RoomPrefab[] | undefined): Array<null | { wallKey: string; floorKey: string; shape?: number[][]; environments?: EnvDef[] }> {
    const res: Array<null | { wallKey: string; floorKey: string; shape?: number[][]; environments?: EnvDef[] }> = new Array(roomCount).fill(null);
    const prefs = list ?? [];
    if (!prefs.length || roomCount === 0) return res;

    const indices = [...Array(roomCount).keys()];
    for (let i = indices.length - 1; i > 0; i--) {
      const j = ROT.RNG.getUniformInt(0, i);
      const tmp = indices[i];
      indices[i] = indices[j];
      indices[j] = tmp;
    }

    type Target = { idxs: number[]; prefab: RoomPrefab; want: number };
    const targets: Target[] = [];
    let ptr = 0;

    for (const p of prefs) {
      const percent = p.percent;
      const count = p.count;
      const min = p.min;
      const max = p.max;
      let want = 0;
      if (typeof count === 'number') want = count;
      else if (typeof percent === 'number') want = Math.round(Math.max(0, Math.min(100, percent)) * roomCount / 100);
      if (typeof min === 'number') want = Math.max(want, min);
      if (typeof max === 'number') want = Math.min(want, max);
      want = Math.max(0, Math.min(want, roomCount - ptr));
      const idxs = indices.slice(ptr, ptr + want);
      ptr += want;
      targets.push({ idxs, prefab: p, want });
      if (ptr >= roomCount) break;
    }

    for (const t of targets) {
      for (const i of t.idxs) res[i] = { wallKey: t.prefab.wallKey, floorKey: t.prefab.floorKey, shape: t.prefab.shape, environments: t.prefab.environments };
    }
    return res;
  }
}
