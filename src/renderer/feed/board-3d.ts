// Feed the Snake, 3D board test: the snake and the berries are real 3D objects, everything else
// stays the 2D painting. Soft toy look: matte body in the snake's colour, rounded segments shaped
// in the geometry rather than painted on, soft light and contact shadows, candy berries.
// The board is seen from above with an oblique projection: anything on the ground lands on
// exactly the same pixel as in 2D, anything with height rises toward the top of the screen.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { W } from '../engine/layout.ts';
import { BOARD_H, BOARD_W, FCELL, FX0, FY0, MOUTH } from './grid.ts';
import { currentSnakeSkin, setHeadLift, snakeTint, snakeTones } from './paint.ts';
import { FALL_TIME, cellAt, game } from './state.ts';
import type { Point } from '../engine/types.ts';

/** Screen rise per unit of height. */
const RISE = 0.45;
/** The region the 3D layer covers, in game units: the board plus room for the berry arc. */
const X0 = 0,
  X1 = W,
  Y0 = FY0 - 260,
  Y1 = FY0 + BOARD_H + 40;
const BODY_R = 14.2,
  BERRY_R = 11,
  ARC = 110,
  SIDES = 22,
  MAX_PTS = 2800;

/** Control room, "3D board": off, the 2D painters draw the board as before. */
let enabled = false;
export function setBoard3d(on: boolean): void {
  enabled = on;
  setHeadLift(on ? 30 : 0);
}
let renderer: THREE.WebGLRenderer | null = null;
let failed = false;
const scene = new THREE.Scene();
const root = new THREE.Group();
const cam = new THREE.OrthographicCamera(X0, X1, -Y0, -Y1, 1, 4000);

/**
 * The 2D skin, drawn with the same shades, widths and spacing as paint.ts, at 128 px per cell:
 * the classic bands every five cells or the dark back line, and a chevron every half cell
 * pointing at the head. The visible half of the tube (v 0.25 to 0.75) maps the 2D body's width.
 */
const PX = 64 / 29;
function drawSkin(cv: HTMLCanvasElement): void {
  const g = cv.getContext('2d');
  if (!g) return;
  const per = 128,
    h = cv.height,
    mid = h / 2,
    t = snakeTones();
  g.clearRect(0, 0, cv.width, h);
  g.fillStyle = snakeTint();
  g.fillRect(0, 0, cv.width, h);
  g.lineCap = 'round';
  const line = (x0: number, x1: number, width: number, style: string): void => {
    g.strokeStyle = style;
    g.lineWidth = width * PX;
    g.beginPath();
    g.moveTo(x0, mid);
    g.lineTo(x1, mid);
    g.stroke();
  };
  if (currentSnakeSkin() === 'dark-back') {
    g.lineCap = 'butt';
    line(0, cv.width, 11, `rgba(${t.dark},0.34)`);
    line(0, cv.width, 2.4, `rgba(${t.light},0.4)`);
  } else {
    line(per * 1.2, per * 2.8, 20, `rgba(${t.dark},0.42)`);
    line(per * 1.2, per * 2.8, 6, `rgba(${t.light},0.22)`);
  }
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const w = 9 * PX,
    d = (5 / 31) * per;
  // q = 0 and q = 5 are the two halves of the chevron on the seam.
  for (let q = 0; q <= 5; q += 0.5) {
    {
      const x = q * per;
      g.strokeStyle = `rgba(${t.mid},0.55)`;
      g.lineWidth = 2.2 * PX;
      g.beginPath();
      g.moveTo(x + d, mid - w);
      g.lineTo(x - d, mid);
      g.lineTo(x + d, mid + w);
      g.stroke();
      g.fillStyle = 'rgba(255,244,214,0.35)';
      g.beginPath();
      g.arc(x, mid + 4 * PX, 1.8 * PX, 0, Math.PI * 2);
      g.fill();
    }
  }
}
// Canvases are made on the first 3D frame, never at load: the game's tests load this module
// without a page.
let skinCanvas: HTMLCanvasElement | null = null,
  skinMap: THREE.CanvasTexture | null = null;
function skinTexture(): THREE.CanvasTexture {
  skinCanvas = document.createElement('canvas');
  skinCanvas.width = 128 * 5;
  skinCanvas.height = 128;
  drawSkin(skinCanvas);
  const t = new THREE.CanvasTexture(skinCanvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  return t;
}
const bodyM = new THREE.MeshPhysicalMaterial({
  vertexColors: true,
  roughness: 0.42,
  metalness: 0,
  clearcoat: 0.25,
  clearcoatRoughness: 0.35,
});
const headM = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 });
const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
const pupil = new THREE.MeshStandardMaterial({ color: 0x14201a, roughness: 0.2 });
const berryM = new THREE.MeshPhysicalMaterial({
  color: 0x8fe07c,
  emissive: 0x3f9e35,
  emissiveIntensity: 0.35,
  roughness: 0.3,
  clearcoat: 1,
  clearcoatRoughness: 0.2,
});
const berryGeo = new THREE.SphereGeometry(BERRY_R, 28, 20);
/** Soft green glow behind each berry, as in 2D. */
const glowM = new THREE.SpriteMaterial({
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
function glowTexture(): THREE.CanvasTexture {
  {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    if (g) {
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(155,226,138,0.55)');
      r.addColorStop(1, 'rgba(155,226,138,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
    }
    return new THREE.CanvasTexture(cv);
  }
}
let bodyGeo: THREE.BufferGeometry | null = null;
const head = new THREE.Group();
const pool: THREE.Mesh[] = [];
const base = new THREE.Color(),
  shade = new THREE.Color(),
  light = new THREE.Color(),
  tmp = new THREE.Color(),
  tmp2 = new THREE.Color();
let tintKey = '';

function setup(): THREE.WebGLRenderer | null {
  if (renderer || failed) return renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true });
  } catch {
    failed = true;
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  skinMap = skinTexture();
  glowM.map = glowTexture();
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Oblique projection: z' = z - RISE * y, so height shows as a rise on screen.
  root.matrixAutoUpdate = false;
  root.matrix.set(1, 0, 0, 0, 0, 1, 0, 0, 0, -RISE, 1, 0, 0, 0, 0, 1);
  scene.add(root);
  cam.position.set(0, 2000, 0);
  cam.up.set(0, 0, -1);
  cam.lookAt(0, 0, 0);
  // Big soft sky light and a gentle key from the top left: matte toy, no hard highlights.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5852, 1.7));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
  key.position.set(FX0 - 260, 700, FY0 - 380);
  key.target.position.set(FX0 + BOARD_W / 2, 0, FY0 + BOARD_H / 2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 5;
  Object.assign(key.shadow.camera, {
    left: -760,
    right: 760,
    top: 760,
    bottom: -760,
    near: 10,
    far: 2600,
  });
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xdff3ff, 0.6);
  rim.position.set(FX0 + BOARD_W + 300, 300, FY0 + BOARD_H + 300);
  scene.add(rim);
  // Catches the shadows only; the board itself is the 2D painting underneath.
  const catcher = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD_W + 200, BOARD_H + 200),
    new THREE.ShadowMaterial({ opacity: 0.28 }),
  );
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.set(FX0 + BOARD_W / 2, 0, FY0 + BOARD_H / 2);
  catcher.receiveShadow = true;
  root.add(catcher);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(19, 40, 28), headM);
  snout.castShadow = true;
  snout.scale.set(1, 0.9, 1.12);
  head.add(snout);
  // Eyes sit on top of the head, ahead of the neck: always above the body, whatever the turn.
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(5.8, 20, 14), eyeWhite);
    eye.position.set(8.5 * s, 17, 6);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(3.2, 14, 10), pupil);
    dot.position.set(8.7 * s, 20.5, 8.5);
    eye.renderOrder = dot.renderOrder = 2;
    head.add(eye, dot);
  }
  root.add(head);
  return renderer;
}

/** Body shades from the control room colour: the colour, a deeper band shade, a light back. */
function updateTint(): void {
  const hex = snakeTint(),
    key = hex + currentSnakeSkin();
  if (key === tintKey) return;
  tintKey = key;
  if (skinCanvas && skinMap) {
    drawSkin(skinCanvas);
    skinMap.needsUpdate = true;
  }
  base.set(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  shade.setHSL(hsl.h, Math.min(1, hsl.s * 1.05), hsl.l * 0.8);
  light.setHSL(hsl.h, hsl.s * 0.7, Math.min(0.95, hsl.l + 0.12));
  headM.color.copy(base);
}

/** Body shapes tried for the 3D board. */
type Shape = 'skin' | 'tube' | 'beads' | 'blocks' | 'python' | 'ribbon';
// The skin is the shape kept; the others stay for comparison while the 3D board is on trial.
const shape = 'skin' as Shape;
const MAX_CELLS = 960;
let cord = false;
let beads: THREE.InstancedMesh | null = null,
  blocks: THREE.InstancedMesh | null = null,
  tubeMesh: THREE.Mesh | null = null;
const M = new THREE.Matrix4(),
  Q = new THREE.Quaternion(),
  V = new THREE.Vector3(),
  S = new THREE.Vector3(),
  UP = new THREE.Vector3(0, 1, 0);

function makeParts(): void {
  if (bodyGeo) return;
  const ring = SIDES + 1;
  bodyGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX_PTS * ring * 3),
    nor = new Float32Array(MAX_PTS * ring * 3),
    col = new Float32Array(MAX_PTS * ring * 3),
    idx = new Uint32Array((MAX_PTS - 1) * SIDES * 6);
  let k = 0;
  for (let i = 0; i < MAX_PTS - 1; i++)
    for (let j = 0; j < SIDES; j++) {
      const a = i * ring + j,
        b = a + ring;
      idx.set([a, a + 1, b, b, a + 1, b + 1], k);
      k += 6;
    }
  bodyGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  bodyGeo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  bodyGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  bodyGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(MAX_PTS * ring * 2), 2));
  bodyGeo.setIndex(new THREE.BufferAttribute(idx, 1));
  tubeMesh = new THREE.Mesh(bodyGeo, bodyM);
  tubeMesh.castShadow = true;
  tubeMesh.frustumCulled = false;
  root.add(tubeMesh);
  const solid = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0 });
  beads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 28, 20), solid, MAX_CELLS);
  blocks = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 4, 0.22), solid, MAX_CELLS);
  for (const m of [beads, blocks]) {
    m.castShadow = true;
    m.frustumCulled = false;
    m.setColorAt(0, base);
    root.add(m);
  }
}

/** Direction of the body at trace point i, kept from the last good one where the trace repeats. */
const dirs: { x: number; z: number }[] = [];
function directions(trace: readonly Point[], n: number): void {
  let tx = 0,
    tz = 1;
  for (let i = 0; i < n; i++) {
    const a = trace[Math.max(0, i - 2)],
      b = trace[Math.min(n - 1, i + 2)];
    if (a && b) {
      const dx = b.x - a.x,
        dz = b.y - a.y,
        l = Math.hypot(dx, dz);
      if (l > 0.5) {
        tx = dx / l;
        tz = dz / l;
      }
    }
    const d = dirs[i];
    if (d) {
      d.x = tx;
      d.z = tz;
    } else dirs[i] = { x: tx, z: tz };
  }
}

/** Soft band every five cells, as the 2D skin's bands. */
const bandAt = (q: number): number => {
  const m = (((q - 1.2) % 5) + 5) % 5;
  return m < 1.6 ? Math.min(1, Math.min(m, 1.6 - m) / 0.35) : 0;
};

/**
 * A tube along the trace, one ring per trace point. Perf: one buffer filled in place every frame.
 * The shape picks the cross-section and the radius along the body.
 */
function fillTube(trace: readonly Point[], n: number): void {
  if (!bodyGeo) return;
  const ring = SIDES + 1;
  const P = (bodyGeo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array,
    N = (bodyGeo.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array,
    C = (bodyGeo.getAttribute('color') as THREE.BufferAttribute).array as Float32Array,
    UV = (bodyGeo.getAttribute('uv') as THREE.BufferAttribute).array as Float32Array;
  const total = Math.max(1, (n - 1) / 3);
  for (let i = 0; i < n; i++) {
    const p = trace[i],
      d = dirs[i];
    if (!p || !d) break;
    const sx = -d.z,
      sz = d.x,
      q = i / 3,
      left = (n - 1 - i) / 3;
    let r: number;
    if (cord) r = BODY_R * 0.38;
    else if (shape === 'python') {
      // Thin neck, full body, a long thin tail: a real snake's silhouette.
      const neck = Math.min(1, q / 2.5),
        tail = Math.min(1, left / Math.max(3, total * 0.3));
      r = BODY_R * (0.55 + 0.5 * Math.min(neck, Math.sqrt(tail)));
    } else {
      const taper = left < 1.4 ? Math.sqrt(Math.max(0, left) / 1.4) : 1;
      r = BODY_R * taper * (shape === 'skin' ? 1 : 1 + 0.025 * Math.cos(q * Math.PI * 2));
      if (q < 1.6) r *= 0.66 + 0.34 * (q / 1.6);
      // Every berry swallowed travels down the body as a round bulge, fading toward the tail.
      if (shape === 'skin')
        for (const g of game.gulps) {
          const d = (q - Math.max(g, 2.2)) / 0.9;
          if (d > -3 && d < 3) r *= 1 + 0.42 * Math.max(0, 1 - g / 40) * Math.exp(-d * d);
        }
    }
    if (shape === 'skin') tmp.setRGB(1, 1, 1);
    else tmp.copy(base).lerp(shade, bandAt(q) * 0.75);
    for (let j = 0; j <= SIDES; j++) {
      const ang = (j / SIDES) * Math.PI * 2;
      let cy = Math.cos(ang),
        cs = Math.sin(ang),
        ny = cy,
        h = 0.92;
      if (shape === 'ribbon') {
        // Flat slab with rounded edges: a superellipse squashed to 45 % of its width.
        const e = 0.35;
        cs = Math.sign(cs) * Math.abs(cs) ** e;
        cy = Math.sign(cy) * Math.abs(cy) ** e;
        ny = cy * 1.8;
        h = 0.45;
      }
      const o = (i * ring + j) * 3;
      N[o] = sx * Math.sin(ang);
      N[o + 1] = ny;
      N[o + 2] = sz * Math.sin(ang);
      UV[(i * ring + j) * 2] = q / 5;
      UV[(i * ring + j) * 2 + 1] = j / SIDES + 0.5;
      P[o] = p.x + sx * cs * r;
      P[o + 1] = r * h + cy * r * h;
      P[o + 2] = p.y + sz * cs * r;
      let k = shape === 'skin' ? 0 : Math.max(0, cy) ** 3 * 0.35;
      tmp2.copy(tmp);
      if (shape === 'python') {
        // Diamonds down the back, one per cell, and a light belly line along the flanks.
        const u = Math.abs((((q % 1) + 1) % 1) - 0.5) * 2,
          w = Math.abs(Math.sin(ang)) * 1.6;
        if (cy > 0 && u + w < 0.75) tmp2.copy(shade).lerp(base, 0.15);
        k = Math.max(0, -Math.cos(ang) + 0.2) * 0.5;
      }
      if (shape === 'ribbon' && Math.abs(Math.sin(ang)) < 0.25 && cy > 0) k = 0.45;
      C[o] = tmp2.r + (light.r - tmp2.r) * k;
      C[o + 1] = tmp2.g + (light.g - tmp2.g) * k;
      C[o + 2] = tmp2.b + (light.b - tmp2.b) * k;
    }
  }
  for (const name of ['position', 'normal', 'color', 'uv'])
    (bodyGeo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  bodyGeo.setDrawRange(0, Math.max(0, n - 1) * SIDES * 6);
}

/** One piece per cell, bead or block, turned along the body. */
function fillPieces(
  mesh: THREE.InstancedMesh,
  trace: readonly Point[],
  n: number,
  blocky: boolean,
): void {
  let c = 0;
  for (let i = 3; i < n && c < MAX_CELLS; i += 3) {
    const p = trace[i],
      d = dirs[i];
    if (!p || !d) break;
    const left = (n - 1 - i) / 3,
      taper = left < 3 ? 0.55 + 0.45 * (left / 3) : 1;
    const ang = Math.atan2(d.x, d.z);
    Q.setFromAxisAngle(UP, blocky ? Math.round(ang / (Math.PI / 2)) * (Math.PI / 2) : ang);
    if (blocky) {
      const hgt = BODY_R * 1.25 * taper;
      S.set(BODY_R * 1.55 * taper, hgt, FCELL * 0.82);
      V.set(p.x, hgt / 2, p.y);
    } else {
      const rr = BODY_R * 0.9 * taper;
      S.set(rr, rr * 0.9, rr);
      V.set(p.x, rr * 0.9, p.y);
    }
    M.compose(V, Q, S);
    mesh.setMatrixAt(c, M);
    tmp.copy(base).lerp(shade, bandAt(i / 3) * 0.8);
    if (c % 2 === 1 && !blocky) tmp.lerp(light, 0.12);
    mesh.setColorAt(c, tmp);
    c++;
  }
  mesh.count = c;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function updateBody(trace: readonly Point[]): void {
  makeParts();
  const n = Math.min(trace.length, MAX_PTS);
  directions(trace, n);
  const want = shape === 'skin' ? skinMap : null;
  if (bodyM.map !== want) {
    bodyM.map = want;
    bodyM.needsUpdate = true;
  }
  const tubeLike = shape === 'skin' || shape === 'tube' || shape === 'python' || shape === 'ribbon';
  // Beads ride on a thin cord so the path still reads.
  if (tubeMesh) tubeMesh.visible = tubeLike || shape === 'beads';
  cord = shape === 'beads';
  if (beads) beads.visible = shape === 'beads';
  if (blocks) blocks.visible = shape === 'blocks';
  if (tubeLike || shape === 'beads') fillTube(trace, n);
  if (shape === 'beads' && beads) fillPieces(beads, trace, n, false);
  else if (shape === 'blocks' && blocks) fillPieces(blocks, trace, n, true);
  const h = trace[0],
    d = dirs[0];
  if (h && d) {
    const big = shape === 'python' ? 1.15 : 1.1;
    const b = game.bite,
      squash = b < 0.25 ? 0.22 * Math.sin((b / 0.25) * Math.PI) * (1 - b / 0.25) : 0;
    head.scale.set(
      big * (1 + squash),
      (shape === 'ribbon' ? 0.7 : big) * (1 - squash * 0.6),
      big * (1 - squash * 0.5),
    );
    head.position.set(h.x, BODY_R * 1.0 * (shape === 'ribbon' ? 0.6 : 1), h.y);
    head.rotation.y = Math.atan2(-d.x, -d.z); // d runs toward the tail
  }
}

/** Berries: landed ones bounce on their cell, falling ones fly the 2D arc for real. */
function updateBerries(): void {
  let i = 0;
  for (const b of game.berries.values()) {
    let m = pool[i];
    if (!m) {
      m = new THREE.Mesh(berryGeo, berryM);
      m.castShadow = true;
      const glow = new THREE.Sprite(glowM);
      glow.scale.setScalar(BERRY_R * 4.2);
      m.add(glow);
      pool.push(m);
      root.add(m);
    }
    m.visible = true;
    i++;
    const c = cellAt(b.at),
      tx = FX0 + c.x * FCELL + FCELL / 2,
      ty = FY0 + c.y * FCELL + FCELL / 2,
      beat = 1 + 0.07 * Math.sin(b.t * 3.4);
    if (b.t >= FALL_TIME) {
      const k = b.t - FALL_TIME,
        bounce = k < 0.3 ? Math.sin((k / 0.3) * Math.PI) * 8 * (1 - k / 0.3) : 0;
      m.position.set(tx, BERRY_R + bounce / RISE, ty);
      m.scale.setScalar(beat);
      continue;
    }
    const u = b.t / FALL_TIME,
      e = u * u;
    m.position.set(
      MOUTH.x + (tx - MOUTH.x) * u,
      BERRY_R + (Math.sin(u * Math.PI) * ARC) / RISE,
      MOUTH.y + (ty - MOUTH.y) * e,
    );
    m.scale.setScalar(0.7 + 0.3 * u);
  }
  for (; i < pool.length; i++) {
    const m = pool[i];
    if (m) m.visible = false;
  }
}

/** Paints the 3D layer onto the 2D canvas, in place of the 2D berries and body. False if no WebGL. */
export function paintBoard3d(c: CanvasRenderingContext2D, trace: readonly Point[]): boolean {
  if (!enabled) return false;
  const r = setup();
  if (!r) return false;
  const tr = c.getTransform(),
    scale = Math.hypot(tr.a, tr.b) || 1,
    w = Math.round((X1 - X0) * scale),
    h = Math.round((Y1 - Y0) * scale);
  if (r.domElement.width !== w || r.domElement.height !== h) r.setSize(w, h, false);
  updateTint();
  updateBody(trace);
  updateBerries();
  r.render(scene, cam);
  c.drawImage(r.domElement, X0, Y0, X1 - X0, Y1 - Y0);
  return true;
}
