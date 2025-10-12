interface AutoTileConfig {
  subTile: number;
  indexArrs: IndexArrs;
  room: ['library', 'medic', 'start', 'end'];
  roomFloor: ['glass', 'iron', 'tree', 'ground'];
  floor: 'glass' | 'iron' | 'tree' | 'ground';
  floorWall: 'wall';
  background: 'library' | 'medic' | 'start' | 'end' | 'glass' | 'iron' | 'tree' | 'ground' | 'wall'
}

interface RotRoomRect {
  getLeft(): number;
  getRight(): number;
  getTop(): number;
  getBottom(): number;
}

