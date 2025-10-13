type BoolGrid = boolean[][];
type NumGrid = number[][];
type RotCorridor = {
  create(cb: (x: number, y: number) => void): void
}

type RotRoomRect = {
  getLeft(): number;
  getRight(): number;
  getTop(): number;
  getBottom(): number
}

type MaskSource = {
  mask: BoolGrid;
  tilesetKey: string
}

type EnvDef = {
  element: string;
  data: number[][];
  collision: boolean;
}

type RoomPrefab = {
  wallKey: string;
  floorKey: string;
  shape?: number[][];
  percent?: number;
  count?: number;
  min?: number;
  max?: number;
  environments?: EnvDef[];
}

type AutoTileConfig = {
  subTile: number;
  indexArrs: number[][];
  room: readonly string[];
  roomFloor: readonly string[];
  floor: string;
  floorWall: string;
  roomPrefabs?: RoomPrefab[];
}