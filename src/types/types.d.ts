type BoolGrid   = boolean[][];
type NumGrid    = number[][];
type MaskSource = { mask: BoolGrid; tilesetKey: string };
type RotCorridor = { create(cb: (x: number, y: number) => void): void };

interface RotRoomRect {
  getLeft(): number;
  getRight(): number;
  getTop(): number;
  getBottom(): number;
}

interface RoomPrefabDef {
  wallKey: string;
  floorKey: string;
  shape: number[][];
  margin?: number;
  doors?: Array<{ x: number; y: number }>;

  percent?: number;
  pct?: number;
  count?: number;
  min?: number;
  max?: number;

  weight?: number;
}

interface AutoTileConfig {
  subTile: number;
  indexArrs: typeof INDEX_ARRS;
  room: ['library', 'medic', 'start', 'end'];
  roomFloor: ['glass', 'iron', 'tree', 'ground'];
  floor: 'glass' | 'iron' | 'tree' | 'ground';
  floorWall: 'wall';
  background: 'library' | 'medic' | 'start' | 'end' | 'glass' | 'iron' | 'tree' | 'ground' | 'wall';

  roomSpawnPercent?: number;
  roomKeepPct?: number;

  roomPrefabs?: RoomPrefabDef[];
}

type RoomPrefab = {
  wallKey: string;
  floorKey: string;
  shape?: number[][];
  percent?: number;
  count?: number;
  min?: number;
  max?: number;
}
