import { roomNames } from "../../constants/map";
import { CorridorPlanner } from "./corridorPlanner";
import { RoomPlacer } from "./roomPlacement";

export class LayoutEngine {
  private readonly placer: RoomPlacer;
  private readonly roads: CorridorPlanner;

  constructor(opts: { seed: string; mapWidth: number; mapHeight: number; roadWidth: number }) {
    this.placer = new RoomPlacer({
      seed: opts.seed,
      mapWidth: opts.mapWidth,
      mapHeight: opts.mapHeight,
    });
    this.roads = new CorridorPlanner({ seed: opts.seed, roadWidth: opts.roadWidth });
  }

  build(pools: Map<RoomKey, RawLayer[][]>) {
    const all: Array<{ key: RoomKey; layers: RawLayer[] }> = [];
    for (const key of (roomNames as RoomKey[])) {
      for (const layers of (pools.get(key) ?? [])) {
        all.push({ key, layers });
      }
    }

    const placed = this.placer.place(all);
    const corridors = this.roads.build(placed);

    return { placed, corridors };
  }
}
