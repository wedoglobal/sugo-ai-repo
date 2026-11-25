import { readFileSync, writeFileSync } from 'node:fs';

// Natural Earth v5.1.2, 1:10m land and lakes GeoJSON, public domain.
// node scripts/build-roam-land.js ne_10m_land.geojson ne_10m_lakes.geojson
const [landFile, lakeFile] = process.argv.slice(2);
const resolution = 50;
const height = 180 * resolution;
const width = 360 * resolution;

function rasterize(file) {
  const rows = Array.from({ length: height }, () => []);
  const { features } = JSON.parse(readFileSync(file, 'utf8'));
  for (const { geometry } of features) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const rings of polygons) {
      const intersections = new Map();
      for (const ring of rings) {
        for (let i = 1; i < ring.length; i++) {
          let [[x0, y0], [x1, y1]] = [ring[i - 1], ring[i]];
          if (y1 < y0) [x0, y0, x1, y1] = [x1, y1, x0, y0];
          const start = Math.max(0, Math.ceil((y0 + 90) * resolution - 0.5));
          const end = Math.min(height, Math.ceil((y1 + 90) * resolution - 0.5));
          for (let row = start; row < end; row++) {
            const lat = (row + 0.5) / resolution - 90;
            const x = x0 + (x1 - x0) * (lat - y0) / (y1 - y0);
            if (!intersections.has(row)) intersections.set(row, []);
            intersections.get(row).push((x + 180) * resolution);
          }
        }
      }
      for (const [row, bounds] of intersections) {
        bounds.sort((a, b) => a - b);
        for (let i = 1; i < bounds.length; i += 2) rows[row].push([bounds[i - 1], bounds[i]]);
      }
    }
  }
  return rows;
}

const land = rasterize(landFile);
const lakes = rasterize(lakeFile);
const dryRows = land.map((ranges, row) => {
  const edges = [
    ...ranges.flatMap(([lo, hi]) => [[lo, 1, 0], [hi, -1, 0]]),
    ...lakes[row].flatMap(([lo, hi]) => [[lo, 0, 1], [hi, 0, -1]]),
  ].sort(([a], [b]) => a - b);
  const cells = new Uint8Array(width);
  let landCount = 0;
  let lakeCount = 0;
  let start = 0;
  for (const [x, landDelta, lakeDelta] of edges) {
    if (landCount > 0 && lakeCount === 0) {
      cells.fill(1, Math.max(0, Math.ceil(start - 0.5)), Math.max(0, Math.ceil(x - 0.5)));
    }
    landCount += landDelta;
    lakeCount += lakeDelta;
    start = x;
  }
  return cells;
});

// Erode one cell in each direction to stay clear of generalized coast and lake boundaries.
const rows = dryRows.map((cells, row) => {
  if (row === 0 || row === height - 1) return '';
  const north = dryRows[row + 1];
  const south = dryRows[row - 1];
  const bounds = [];
  let inside = false;
  for (let col = 1; col < width - 1; col++) {
    let dry = true;
    for (let i = col - 1; i <= col + 1; i++) {
      if (cells[i] && north[i] && south[i]) continue;
      dry = false;
      break;
    }
    if (dry !== inside) bounds.push(col);
    inside = dry;
  }
  if (inside) bounds.push(width - 1);
  const bytes = Buffer.alloc(bounds.length * 2);
  bounds.forEach((value, index) => bytes.writeUInt16LE(value, index * 2));
  return bytes.toString('base64');
});
writeFileSync(new URL('../apps/dashboard/src/lib/server/roam-land.json', import.meta.url), JSON.stringify({ resolution, rows }) + '\n');
