/**
 * Flat-top hexagonal grid utility using cube coordinates.
 *
 * Cube coordinates: (x, y, z) where x + y + z = 0.
 * All pixel values are in image coordinate space (matching L.CRS.Simple bounds).
 */

export interface HexCoord {
  x: number;
  y: number;
  z: number;
}

export interface Point {
  x: number;
  y: number;
}

const SQRT3 = Math.sqrt(3);

/** Convert a cube-coordinate hex to its pixel centre (flat-top). */
export function hexToPixel(hex: HexCoord, size: number): Point {
  const px = size * (3 / 2) * hex.x;
  const py = size * ((SQRT3 / 2) * hex.x + SQRT3 * hex.z);
  return { x: px, y: py };
}

/** Convert a pixel position to the nearest cube-coordinate hex (flat-top). */
export function pixelToHex(point: Point, size: number): HexCoord {
  const q = (2 / 3) * point.x / size;
  const r = ((-1 / 3) * point.x + (SQRT3 / 3) * point.y) / size;

  const x = q;
  const z = r;
  const y = -x - z;

  return cubeRound({ x, y, z });
}

/** Round fractional cube coordinates to the nearest integer hex. */
function cubeRound(frac: { x: number; y: number; z: number }): HexCoord {
  let rx = Math.round(frac.x);
  let ry = Math.round(frac.y);
  let rz = Math.round(frac.z);

  const xDiff = Math.abs(rx - frac.x);
  const yDiff = Math.abs(ry - frac.y);
  const zDiff = Math.abs(rz - frac.z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { x: rx, y: ry, z: rz };
}

/** Get the 6 corner points of a flat-top hex at the given centre. */
export function getHexCorners(centre: Point, size: number): Point[] {
  const corners: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i;
    const angleRad = (Math.PI / 180) * angleDeg;
    corners.push({
      x: centre.x + size * Math.cos(angleRad),
      y: centre.y + size * Math.sin(angleRad),
    });
  }
  return corners;
}

/**
 * Get hex corners as Leaflet-compatible [y, x] pairs.
 * CRS.Simple uses [lat, lng] = [y, x].
 */
export function getHexCornersLatLng(centre: Point, size: number): [number, number][] {
  return getHexCorners(centre, size).map(p => [p.y, p.x]);
}

/**
 * Generate all hex coordinates that cover an image area.
 * The grid is centred at the image centre to ensure even coverage.
 *
 * Uses an "odd-q" offset → cube conversion (flat-top, odd columns shifted
 * down by half a row). The conversion is exact (no rounding), which
 * guarantees a 1:1 mapping between (col, row) iterations and the resulting
 * cube coordinates — so callers can safely use `hexKey(coord)` as a unique
 * key in lookup maps without risk of collisions at rounding boundaries.
 */
export function generateHexGrid(
  imageWidth: number,
  imageHeight: number,
  hexSize: number
): { coord: HexCoord; centre: Point }[] {
  const results: { coord: HexCoord; centre: Point }[] = [];

  const offsetX = imageWidth / 2;
  const offsetY = imageHeight / 2;

  const colStep = hexSize * (3 / 2);
  const rowStep = hexSize * SQRT3;

  const maxCol = Math.ceil(imageWidth / colStep) + 1;
  const maxRow = Math.ceil(imageHeight / rowStep) + 1;

  for (let col = -maxCol; col <= maxCol; col++) {
    // The odd-q → cube conversion shifts z by ~col/2, so widen the row
    // range proportionally to keep the iteration symmetric around the
    // image centre and ensure full coverage at extreme columns.
    const colShift = Math.ceil(Math.abs(col) / 2);

    for (let row = -maxRow - colShift; row <= maxRow + colShift; row++) {
      // odd-q offset → cube (flat-top): integer arithmetic, no rounding.
      const x = col;
      const z = row - ((col - (col & 1)) >> 1);
      const y = -x - z;

      const coord: HexCoord = { x, y, z };
      const pixel = hexToPixel(coord, hexSize);

      const cx = pixel.x + offsetX;
      const cy = pixel.y + offsetY;

      if (cx >= -hexSize && cx <= imageWidth + hexSize &&
          cy >= -hexSize && cy <= imageHeight + hexSize) {
        results.push({ coord, centre: { x: cx, y: cy } });
      }
    }
  }

  return results;
}

/** Serialise a hex coordinate to a stable string key. */
export function hexKey(coord: HexCoord): string {
  return `${coord.x},${coord.y},${coord.z}`;
}

/** Parse a hex key string back to coordinates. */
export function parseHexKey(key: string): HexCoord {
  const [x, y, z] = key.split(',').map(Number);
  return { x, y, z };
}
