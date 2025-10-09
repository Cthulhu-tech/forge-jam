type RawLayer = {
  name: string;
  width: number;
  height: number;
  data: number[];
};
type RoomKey = 'start' | 'room' | 'next_level';

type PlacedRoom = {
  key: RoomKey;
  layers: RawLayer[];
  x: number;
  y: number;
  w: number;
  h: number;
};

type AABB = { minX: number; minY: number; maxX: number; maxY: number; payload?: unknown };

type CorridorRect = AABB & { kind: 'corridor' };
type Corridor = { rects: CorridorRect[]; from: PlacedRoom; to: PlacedRoom };

