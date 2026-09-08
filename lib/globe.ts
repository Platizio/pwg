/**
 * The particle globe's geometry, pure.
 *
 * The canvas renderer in components/marketing/motion/particle-globe.tsx draws
 * whatever this module hands it; nothing here touches the DOM, so the
 * projection, the route and the rotation are all testable with node.
 *
 * Coordinates: a unit sphere with +y north, +z toward the viewer, and +x to
 * the viewer's right. Longitude 0 faces the viewer at phi 0; rotateY turns the
 * globe about its axis so `facingPhi(lon)` brings that longitude to the front.
 */

export type Vec3 = { x: number; y: number; z: number };

export const DEG = Math.PI / 180;

export const NEW_DELHI = { lat: 28.6139, lon: 77.209 } as const;
export const NEW_YORK = { lat: 40.7128, lon: -74.006 } as const;

export function toVec3(lat: number, lon: number): Vec3 {
  const la = lat * DEG;
  const lo = lon * DEG;
  return { x: Math.cos(la) * Math.sin(lo), y: Math.sin(la), z: Math.cos(la) * Math.cos(lo) };
}

/** n points spread evenly over the sphere by the golden angle. Deterministic. */
export function fibonacciSphere(n: number): Vec3[] {
  const out: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / Math.max(1, n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const t = golden * i;
    out.push({ x: Math.cos(t) * r, y, z: Math.sin(t) * r });
  }
  return out;
}

export function rotateY(p: Vec3, phi: number): Vec3 {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}

/** The rotation that brings `lon` to face the viewer. */
export function facingPhi(lon: number): number {
  return -lon * DEG;
}

/** Orthographic projection onto a canvas of the given centre and radius. */
export function project(p: Vec3, radius: number, cx: number, cy: number): { x: number; y: number; depth: number } {
  return { x: cx + p.x * radius, y: cy - p.y * radius, depth: p.z };
}

/** `steps + 1` points along the shorter great-circle arc from a to b. */
export function greatCircle(a: Vec3, b: Vec3, steps: number): Vec3[] {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  const omega = Math.acos(dot);
  const out: Vec3[] = [];
  if (omega < 1e-9) {
    for (let i = 0; i <= steps; i++) out.push({ ...a });
    return out;
  }
  const so = Math.sin(omega);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ka = Math.sin((1 - t) * omega) / so;
    const kb = Math.sin(t * omega) / so;
    out.push({ x: ka * a.x + kb * b.x, y: ka * a.y + kb * b.y, z: ka * a.z + kb * b.z });
  }
  return out;
}

/** The share of `values` strictly below `value`, 0..100. Empty set answers 0. */
export function percentile(value: number, values: readonly number[]): number {
  if (values.length === 0) return 0;
  let below = 0;
  for (const v of values) if (v < value) below++;
  return Math.round((below / values.length) * 100);
}
