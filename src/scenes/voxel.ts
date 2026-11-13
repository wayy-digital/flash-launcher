// Procedural voxel key art, rendered with three.js: the canyon (setup), the moonlit tree (login)
// and the crimson hero (home). Original art, built from cubes at run time.
import * as THREE from 'three';

export type ScenePreset = 'canyon' | 'night' | 'hero';

type Block = { x: number; y: number; z: number; c: number; glow?: boolean; s?: number };

// A small deterministic PRNG so every launch draws the same world.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shade = (hex: number, k: number) => {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, k);
  return c.getHex();
};

function canyon(): { blocks: Block[]; sky: [number, number]; fog: number; cam: THREE.Vector3; look: THREE.Vector3; sun: THREE.Vector3; sunColor: number } {
  const r = rng(7);
  const blocks: Block[] = [];
  const stone = [0x8a7a68, 0x7c6c5a, 0x9b8a74, 0x6e5f50, 0xa8957c];
  for (let z = -60; z < 14; z++) {
    const w = 4 + Math.round(Math.sin(z * 0.15) * 1.5); // half-width of the river
    for (let x = -26; x <= 26; x++) {
      const ax = Math.abs(x);
      if (ax <= w) {
        blocks.push({ x, y: -1, z, c: r() < 0.5 ? 0x1fb5a8 : 0x26c4b3 });
        if (r() < 0.05) blocks.push({ x, y: -0.9, z, c: 0x3d8b3d, s: 0.6 });
        continue;
      }
      // terraces: low ledge with flowers, then the cliff
      const ledge = ax <= w + 3;
      const cliffH = ledge ? 1 + (ax - w > 1 ? 1 : 0) : Math.round(10 + Math.sin(z * 0.3 + x) * 3 + (ax - w) * 0.9 + r() * 4);
      const top = Math.min(cliffH, 34);
      for (let y = 0; y < top; y++) {
        // only the visible skin of the cliff: faces toward the river, and the top
        if (!ledge && y < top - 1 && ax > w + 6) continue;
        const window = !ledge && ax === w + 4 && y > 2 && y < top - 2 && (y + z) % 5 === 0 && r() < 0.55;
        blocks.push({ x, y, z, c: window ? 0xffb347 : stone[Math.floor(r() * stone.length)], glow: window });
      }
      if (ledge || r() < 0.35) {
        const flower = r();
        if (flower < 0.55) {
          const colors = [0xff4d6d, 0xffd23f, 0xff8fab, 0xf72585, 0xffffff, 0xfb8500];
          blocks.push({ x, y: top, z, c: 0x4caf50 });
          if (r() < 0.6) blocks.push({ x, y: top + 0.55, z, c: colors[Math.floor(r() * colors.length)], s: 0.4 });
        } else blocks.push({ x, y: top, z, c: r() < 0.5 ? 0x3e8e41 : 0x2f7d32 });
      }
      // vines down the cliff face
      if (!ledge && ax === w + 4 && r() < 0.25) {
        const len = Math.floor(r() * 6) + 2;
        for (let k = 0; k < len; k++) blocks.push({ x: x + (x > 0 ? -1 : 1) * 0.6, y: top - 1 - k, z, c: 0x2e7d32, s: 0.5 });
      }
    }
  }
  // far towers in the haze
  for (let i = 0; i < 18; i++) {
    const x = Math.round((r() - 0.5) * 50), z = -70 - Math.round(r() * 30);
    const h = 20 + Math.round(r() * 30), w = 2 + Math.round(r() * 3);
    for (let y = 0; y < h; y++) for (let dx = 0; dx < w; dx++) blocks.push({ x: x + dx, y, z, c: shade(0x8fa6c4, -0.05 + r() * 0.08) });
  }
  return { blocks, sky: [0x5aa9e6, 0xffd6a5], fog: 0xc9d8e8, cam: new THREE.Vector3(0, 12, 16), look: new THREE.Vector3(0, 4, -30), sun: new THREE.Vector3(30, 45, 25), sunColor: 0xffd9a8 };
}

function night(): ReturnType<typeof canyon> {
  const r = rng(11);
  const blocks: Block[] = [];
  for (let z = -50; z < 12; z++) {
    for (let x = -30; x <= 30; x++) {
      const river = Math.abs(x - Math.round(Math.sin(z * 0.12) * 4) + 2) <= 3;
      if (river) {
        blocks.push({ x, y: -1, z, c: r() < 0.5 ? 0x1b6f8a : 0x1f7f9c });
        if (r() < 0.04) blocks.push({ x, y: -0.85, z, c: 0x3fa34d, s: 0.7 });
        continue;
      }
      const h = Math.max(0, Math.round(Math.sin(x * 0.2) * 1.5 + Math.cos(z * 0.17) * 1.5 + (Math.abs(x) > 18 ? 3 : 0)));
      for (let y = 0; y <= h; y++) if (y === h || r() < 0.15) blocks.push({ x, y, z, c: y === h ? (r() < 0.5 ? 0x4caf50 : 0x43a047) : 0x6d4c41 });
      if (r() < 0.06) blocks.push({ x, y: h + 0.6, z, c: r() < 0.7 ? 0xff7b1c : 0xffd166, s: 0.35, glow: true });
    }
  }
  // the great tree
  const tx = 2, tz = -22;
  for (let y = 0; y < 22; y++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) blocks.push({ x: tx + dx, y, z: tz + dz, c: r() < 0.5 ? 0x7a5230 : 0x6b4526 });
  const canopy = (cx: number, cy: number, cz: number, rad: number) => {
    for (let x = -rad; x <= rad; x++) for (let y = -2; y <= 2; y++) for (let z = -rad; z <= rad; z++) {
      if (x * x + z * z + y * y * 3 > rad * rad || r() < 0.18) continue;
      blocks.push({ x: cx + x, y: cy + y, z: cz + z, c: shade(0x2e7d32, (r() - 0.5) * 0.12) });
    }
  };
  canopy(tx, 23, tz, 8);
  canopy(tx - 9, 14, tz + 1, 4);
  canopy(tx + 9, 17, tz - 2, 5);
  // floating platforms with warm windows
  for (const [px, py, pz] of [[-14, 9, -14], [14, 12, -18], [-8, 18, -26]] as const) {
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) blocks.push({ x: px + x, y: py, z: pz + z, c: 0x8d6e63 });
    for (let x = -2; x <= 2; x++) for (let y = 1; y <= 3; y++) blocks.push({ x: px + x, y: py + y, z: pz + 2, c: y === 2 && x % 2 === 0 ? 0xffb347 : 0xa1887f, glow: y === 2 && x % 2 === 0 });
    for (let x = -3; x <= 3; x++) for (let z = -2; z <= 3; z++) blocks.push({ x: px + x, y: py + 4, z: pz + z, c: 0x4e7d3a });
  }
  // the moon
  for (let x = -5; x <= 5; x++) for (let y = -5; y <= 5; y++) if (x * x + y * y <= 25) blocks.push({ x: 12 + x, y: 31 + y, z: -60, c: shade(0xf3f0e0, (r() - 0.5) * 0.06), glow: true });
  // stars
  for (let i = 0; i < 160; i++) blocks.push({ x: (r() - 0.5) * 160, y: 25 + r() * 50, z: -70, c: 0xffffff, glow: true, s: 0.3 });
  return { blocks, sky: [0x0b1a3a, 0x2c5aa0], fog: 0x14305e, cam: new THREE.Vector3(-2, 8, 14), look: new THREE.Vector3(3, 14, -24), sun: new THREE.Vector3(-14, 30, 30), sunColor: 0xa9c2ff };
}

function hero(): ReturnType<typeof canyon> {
  const r = rng(3);
  const blocks: Block[] = [];
  for (let z = -40; z < 10; z++) for (let x = -30; x <= 30; x++) {
    const h = Math.round(Math.max(0, Math.sin(x * 0.25) + Math.cos(z * 0.2)) * 1.2);
    blocks.push({ x, y: h, z, c: shade(0x1a1420, (r() - 0.5) * 0.05) });
  }
  // crystal spires
  for (let i = 0; i < 26; i++) {
    const x = Math.round((r() - 0.25) * 44), z = -4 - Math.round(r() * 30), h = 3 + Math.round(r() * 12);
    for (let y = 0; y < h; y++) {
      const w = y < h * 0.6 ? 1 : 0;
      for (let dx = -w; dx <= w; dx++) blocks.push({ x: x + dx, y: y + 1, z, c: y > h - 3 ? 0xff4fd8 : shade(0xc2185b, (r() - 0.5) * 0.1), glow: y > h * 0.5 });
    }
  }
  // thorny vines
  for (let i = 0; i < 40; i++) {
    let x = 4 + r() * 24, y = 1 + r() * 4, z = -2 - r() * 10;
    for (let k = 0; k < 14; k++) {
      blocks.push({ x, y, z, c: 0x2b0f1e, s: 0.6 });
      x += (r() - 0.5) * 1.4; y += r() * 0.9; z += (r() - 0.5) * 0.8;
    }
  }
  // the hero: a blocky figure with a crimson cloak, right third of the frame (units: cells)
  const hx = 13, hz = 2, base = 1.5, C = 0.85;
  const box = (x0: number, y0: number, z0: number, w: number, h: number, d: number, c: number, glow = false) => {
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) for (let z = 0; z < d; z++)
      blocks.push({ x: hx + (x0 + x) * C, y: base + (y0 + y) * C, z: hz + (z0 + z) * C, c: shade(c, (r() - 0.5) * 0.05), glow, s: C });
  };
  box(-2, 0, -1, 2, 6, 2, 0x2a1830); // legs
  box(0, 0, -1, 2, 6, 2, 0x2a1830);
  box(-2, 0, -1, 4, 1, 2, 0x150b14); // boots
  box(-2, 6, -1, 4, 6, 2, 0x8e1840); // body
  box(-2, 9, -1, 4, 1, 2, 0x3b0d22); // belt
  box(-4, 6, -1, 2, 6, 2, 0x6d1236); // arms
  box(2, 6, -1, 2, 6, 2, 0x6d1236);
  box(-4, 6, -1, 2, 1, 2, 0xff4fd8, true); // glowing gauntlets
  box(2, 6, -1, 2, 1, 2, 0xff4fd8, true);
  box(-2, 12, -2, 4, 4, 4, 0x3b1e2e); // hooded head
  box(-2, 15, -2, 4, 1, 4, 0x2b1322);
  box(-1, 13, 2, 1, 1, 1, 0xff4fd8, true); // eyes
  box(0, 13, 2, 1, 1, 1, 0xff4fd8, true);
  box(-3, 2, -3, 6, 11, 1, 0xb0174f); // cloak
  box(-4, 11, -2, 8, 1, 4, 0xe0306f); // pauldrons
  box(5, 2, -1, 1, 14, 1, 0x40102a); // staff
  box(4, 16, -1, 3, 3, 1, 0xff4fd8, true); // staff crystal
  // magenta motes
  for (let i = 0; i < 120; i++) blocks.push({ x: (r() - 0.2) * 40, y: r() * 20, z: -r() * 30, c: r() < 0.5 ? 0xff4fd8 : 0xff2e63, glow: true, s: 0.15 });
  return { blocks, sky: [0x07050b, 0x2a0d24], fog: 0x12070f, cam: new THREE.Vector3(-1, 9, 34), look: new THREE.Vector3(5, 8, 0), sun: new THREE.Vector3(-10, 20, 20), sunColor: 0xff8fc8 };
}

export function renderVoxelScene(canvas: HTMLCanvasElement, preset: ScenePreset): () => void {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
  } catch {
    canvas.dataset.nogl = '1';
    return () => {};
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const def = preset === 'canyon' ? canyon() : preset === 'night' ? night() : hero();
  const scene = new THREE.Scene();
  // sky: a big gradient sphere
  const skyGeo = new THREE.SphereGeometry(400, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { top: { value: new THREE.Color(def.sky[0]) }, bottom: { value: new THREE.Color(def.sky[1]) } },
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 p; void main(){ float h = clamp(normalize(p).y*1.6+0.25,0.,1.); gl_FragColor = vec4(mix(bottom, top, h),1.); }',
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  scene.fog = new THREE.Fog(def.fog, preset === 'hero' ? 34 : 30, preset === 'hero' ? 80 : 120);

  scene.add(new THREE.HemisphereLight(preset === 'night' ? 0x5b7fd0 : def.sky[0], preset === 'night' ? 0x1c2a22 : 0x3a3020, preset === 'hero' ? 0.6 : preset === 'night' ? 1.5 : 1.3));
  const fill = new THREE.DirectionalLight(preset === 'canyon' ? 0xbfd8ff : 0x8fa8ff, preset === 'hero' ? 0.25 : 0.7);
  fill.position.copy(def.cam).add(new THREE.Vector3(-8, 10, 0));
  scene.add(fill);
  const sun = new THREE.DirectionalLight(def.sunColor, preset === 'hero' ? 1.6 : 2.4);
  sun.position.copy(def.sun);
  scene.add(sun);
  if (preset === 'night') {
    for (const [x, y, z] of [[-14, 11, -12], [14, 14, -16], [-8, 20, -24]]) {
      const l = new THREE.PointLight(0xffa64d, 40, 16);
      l.position.set(x, y, z);
      scene.add(l);
    }
  }
  if (preset === 'hero') {
    const rim = new THREE.PointLight(0xff3d9a, 60, 30);
    rim.position.set(18, 14, -2);
    scene.add(rim);
    const key = new THREE.PointLight(0xffc4e6, 140, 40);
    key.position.set(8, 16, 16);
    scene.add(key);
  }

  const solid = def.blocks.filter((b) => !b.glow);
  const glow = def.blocks.filter((b) => b.glow);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  const add = (list: Block[], mat: THREE.Material) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((b, i) => {
      const s = b.s ?? 1;
      m.makeScale(s, s, s).setPosition(b.x, b.y, b.z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.setHex(b.c));
    });
    scene.add(mesh);
  };
  add(solid, new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0 }));
  add(glow, new THREE.MeshBasicMaterial({ fog: preset !== 'night' }));

  const camera = new THREE.PerspectiveCamera(preset === 'hero' ? 45 : 55, 1, 0.1, 900);
  let t = 0;
  let raf = 0;
  const size = () => {
    const w = canvas.clientWidth || 600, h = canvas.clientHeight || 400;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const draw = () => {
    camera.position.copy(def.cam).add(new THREE.Vector3(Math.sin(t) * 1.2, Math.sin(t * 0.7) * 0.3, 0));
    camera.lookAt(def.look);
    renderer.render(scene, camera);
  };
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let last = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (now - last < 66) return; // ~15 fps is plenty for a slow drift
    last = now;
    t += 0.004;
    draw();
  };
  const ro = new ResizeObserver(() => { size(); draw(); });
  ro.observe(canvas);
  size();
  draw();
  if (!reduce) raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    renderer.dispose();
  };
}
