"use client";

import { useEffect, useState } from "react";

type Cell = { x: number; y: number; size: number; delay: number; duration: number };

function cellsFor(width: number, height: number): Cell[] {
  const cellSize = width > 960 ? width / 20 : 64;
  // `.landing-field`'s background-image tiles from `background-position: center 0`, not
  // from the left edge, so cell columns need the same horizontal offset to land on top
  // of the drawn grid lines instead of straddling two of them.
  const offsetX = (((width - cellSize) / 2) % cellSize + cellSize) % cellSize;
  const startX = offsetX - cellSize;
  const columns = Math.ceil((width - startX) / cellSize);
  const rows = Math.floor(height / cellSize);
  const cells: Cell[] = [];

  // Stable, sparse selection that changes with the viewport grid, not on each render.
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const left = startX + column * cellSize;
      if (left + cellSize <= 0 || left >= width) continue;
      const x = (left + cellSize / 2) / width;
      const y = (row + 0.5) * cellSize / height;
      if (x > 0.3 && x < 0.7 && y > 0.22 && y < 0.78) continue;
      const hash = (column * 73 + row * 151 + column * row * 19) % 97;
      if (hash > 3) continue;
      cells.push({ x: left, y: row * cellSize, size: cellSize, delay: hash * 2.7 + row * 1.3, duration: 9 + (column + row) % 5 });
    }
  }
  const stride = Math.max(1, Math.ceil(cells.length / 9));
  return cells.filter((_, index) => index % stride === 0);
}

export function GridCells() {
  const [cells, setCells] = useState<Cell[]>([]);

  useEffect(() => {
    const field = document.querySelector<HTMLElement>(".landing-field");
    if (!field) return;
    const observer = new ResizeObserver(([entry]) => {
      setCells(cellsFor(entry.contentRect.width, entry.contentRect.height));
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, []);

  return cells.map((cell) => (
    <span
      key={`${cell.x}-${cell.y}`}
      className="landing-grid-cell"
      style={{ left: cell.x, top: cell.y, width: cell.size, height: cell.size, animationDelay: `${cell.delay}s`, animationDuration: `${cell.duration}s` }}
    />
  ));
}
