type BoolGrid = boolean[][];
type NumGrid = number[][];
type MaskSource = {
  mask: BoolGrid;
  tilesetKey: string;
}

type AutoTileConfig = {
  subTile: number;
  room: readonly string[];
  roomFloor: readonly string[];
  door: string[];
  floor: string;
  floorWall: string;
  roomPrefabs?: RoomPrefab[];
  indexArrs?: number[][];
}

type RoomPrefab = {
  wallKey: string;
  floorKey: string;
  shape?: number[][];
  environments?: EnvDef[];
  percent?: number;
  count?: number;
  min?: number;
  max?: number;
}

type EnvDef = {
  element: string;
  data: number[][];
  collision: boolean;
}

type RotRoomRect = {
  getLeft(): number;
  getTop(): number;
  getRight(): number;
  getBottom(): number;
}

type RotCorridor = {
  create(cb: (x: number, y: number) => void): void;
}
