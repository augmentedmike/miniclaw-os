// BFS pathfinding on tile grid
// Extracted from pixel-agents (MIT)

import { TileType } from "./types";

export function isWalkable(
  col: number,
  row: number,
  tiles: number[],
  cols: number,
  rows: number,
  blocked: Set<string>
): boolean {
  if (col < 0 || row < 0 || col >= cols || row >= rows) return false;
  const t = tiles[row * cols + col];
  if (t === TileType.WALL || t === TileType.VOID) return false;
  if (blocked.has(`${col},${row}`)) return false;
  return true;
}

export function findPath(
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number,
  tiles: number[],
  cols: number,
  rows: number,
  blocked: Set<string>
): { col: number; row: number }[] {
  if (startCol === endCol && startRow === endRow) return [];

  const startKey = `${startCol},${startRow}`;
  const visited = new Set<string>([startKey]);
  const parent = new Map<string, string>();
  const queue: { col: number; row: number }[] = [{ col: startCol, row: startRow }];

  const dirs = [
    { dc: 0, dr: -1 },
    { dc: 0, dr: 1 },
    { dc: -1, dr: 0 },
    { dc: 1, dr: 0 },
  ];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currKey = `${curr.col},${curr.row}`;

    for (const d of dirs) {
      const nc = curr.col + d.dc;
      const nr = curr.row + d.dr;
      const nk = `${nc},${nr}`;
      if (visited.has(nk)) continue;
      if (!isWalkable(nc, nr, tiles, cols, rows, blocked)) continue;
      visited.add(nk);
      parent.set(nk, currKey);

      if (nc === endCol && nr === endRow) {
        // Reconstruct path
        const path: { col: number; row: number }[] = [];
        let k = nk;
        while (k !== startKey) {
          const [c, r] = k.split(",").map(Number);
          path.unshift({ col: c, row: r });
          k = parent.get(k)!;
        }
        return path;
      }
      queue.push({ col: nc, row: nr });
    }
  }
  return [];
}

export function getWalkableTiles(
  tiles: number[],
  cols: number,
  rows: number,
  blocked: Set<string>
): { col: number; row: number }[] {
  const result: { col: number; row: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isWalkable(c, r, tiles, cols, rows, blocked)) {
        result.push({ col: c, row: r });
      }
    }
  }
  return result;
}
