import assert from "node:assert/strict";
import test from "node:test";
import {
  DEG, NEW_DELHI, NEW_YORK, toVec3, fibonacciSphere, rotateY, project, greatCircle, facingPhi, percentile,
} from "../lib/globe.ts";

const len = (p: { x: number; y: number; z: number }) => Math.hypot(p.x, p.y, p.z);

test("a lat/lon lands on the unit sphere", () => {
  for (const [lat, lon] of [[0, 0], [28.6, 77.2], [-33.9, 151.2], [90, 0]]) {
    assert.ok(Math.abs(len(toVec3(lat, lon)) - 1) < 1e-9, `${lat},${lon}`);
  }
});

test("longitude 0 faces the viewer and north is up", () => {
  const p = toVec3(0, 0);
  assert.ok(Math.abs(p.z - 1) < 1e-9);
  assert.ok(toVec3(45, 0).y > 0);
});

test("a fibonacci sphere has n points, all on the sphere, spread across both hemispheres", () => {
  const pts = fibonacciSphere(500);
  assert.equal(pts.length, 500);
  for (const p of pts) assert.ok(Math.abs(len(p) - 1) < 1e-9);
  const front = pts.filter((p) => p.z > 0).length;
  assert.ok(front > 200 && front < 300, `front hemisphere holds ${front} of 500`);
});

test("rotating by zero is the identity and by 2π returns home", () => {
  const p = toVec3(28.6, 77.2);
  const r0 = rotateY(p, 0);
  const r1 = rotateY(p, 2 * Math.PI);
  for (const k of ["x", "y", "z"] as const) {
    assert.ok(Math.abs(r0[k] - p[k]) < 1e-9);
    assert.ok(Math.abs(r1[k] - p[k]) < 1e-9);
  }
});

test("facingPhi brings a longitude to the centre of the disc", () => {
  const delhi = rotateY(toVec3(NEW_DELHI.lat, NEW_DELHI.lon), facingPhi(NEW_DELHI.lon));
  assert.ok(Math.abs(delhi.x) < 1e-9, `x was ${delhi.x}`);
  assert.ok(delhi.z > 0.8, "faces the viewer");
});

test("projection maps the centre to the canvas centre and depth to z", () => {
  const q = project({ x: 0, y: 0, z: 1 }, 100, 200, 150);
  assert.deepEqual(q, { x: 200, y: 150, depth: 1 });
  const up = project({ x: 0, y: 1, z: 0 }, 100, 200, 150);
  assert.equal(up.y, 50, "north points up the canvas");
});

test("a great circle starts and ends at its endpoints and stays on the sphere", () => {
  const a = toVec3(NEW_DELHI.lat, NEW_DELHI.lon);
  const b = toVec3(NEW_YORK.lat, NEW_YORK.lon);
  const arc = greatCircle(a, b, 32);
  assert.equal(arc.length, 33);
  for (const k of ["x", "y", "z"] as const) {
    assert.ok(Math.abs(arc[0][k] - a[k]) < 1e-9);
    assert.ok(Math.abs(arc[32][k] - b[k]) < 1e-9);
  }
  for (const p of arc) assert.ok(Math.abs(len(p) - 1) < 1e-6);
});

test("percentile is the share of the set strictly below the value", () => {
  assert.equal(percentile(2, [1, 2, 3, 4]), 25);
  assert.equal(percentile(5, [1, 2, 3, 4]), 100);
  assert.equal(percentile(0, [1, 2, 3, 4]), 0);
  assert.equal(percentile(1, []), 0);
});

test("DEG converts degrees to radians", () => {
  assert.ok(Math.abs(180 * DEG - Math.PI) < 1e-12);
});
