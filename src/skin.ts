// Skin texture helpers: the 64×64 layout, an original default skin, and a three.js player model.
import * as THREE from 'three';

export type Model = 'classic' | 'slim';
type Part = { u: number; v: number; w: number; h: number; d: number };

export const parts = (model: Model) => {
  const aw = model === 'slim' ? 3 : 4;
  return {
    head: { u: 0, v: 0, w: 8, h: 8, d: 8 },
    hat: { u: 32, v: 0, w: 8, h: 8, d: 8 },
    body: { u: 16, v: 16, w: 8, h: 12, d: 4 },
    rarm: { u: 40, v: 16, w: aw, h: 12, d: 4 },
    larm: { u: 32, v: 48, w: aw, h: 12, d: 4 },
    rleg: { u: 0, v: 16, w: 4, h: 12, d: 4 },
    lleg: { u: 16, v: 48, w: 4, h: 12, d: 4 },
  } satisfies Record<string, Part>;
};

/** The six face rectangles of a part on the net: [x, y, w, h]. */
export function faces(p: Part) {
  const { u, v, w, h, d } = p;
  return {
    top: [u + d, v, w, d],
    bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h],
    front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h],
    back: [u + d + w + d, v + d, w, h],
  } as Record<'top' | 'bottom' | 'right' | 'front' | 'left' | 'back', [number, number, number, number]>;
}

/** An original default skin: a traveller in a teal jacket with a dark hood. */
export function defaultSkin(model: Model = 'classic'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const P = parts(model);
  const noise = (x: number, y: number) => ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1;
  const fill = (p: Part, color: (face: string, x: number, y: number, w: number, h: number) => string) => {
    for (const [face, [fx, fy, fw, fh]] of Object.entries(faces(p))) {
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        g.fillStyle = color(face, x, y, fw, fh);
        g.fillRect(fx + x, fy + y, 1, 1);
      }
    }
  };
  const jit = (base: [number, number, number], x: number, y: number, k = 10) => {
    const n = (noise(x, y) - 0.5) * k;
    return `rgb(${base[0] + n},${base[1] + n},${base[2] + n})`;
  };
  const skinT: [number, number, number] = [214, 160, 124];
  const hair: [number, number, number] = [52, 36, 30];
  const teal: [number, number, number] = [32, 140, 132];
  const tealD: [number, number, number] = [22, 98, 94];
  const pants: [number, number, number] = [40, 44, 72];
  const boots: [number, number, number] = [60, 46, 40];
  fill(P.head, (f, x, y) => {
    if (f === 'top' || f === 'back') return jit(hair, x, y);
    if (f === 'bottom') return jit(skinT, x, y);
    if (y < 2 || ((f === 'left' || f === 'right') && (y < 4 || x > 5))) return jit(hair, x, y);
    if (f === 'front') {
      if (y === 4 && (x === 1 || x === 6)) return '#ffffff';
      if (y === 4 && (x === 2 || x === 5)) return '#2b7bd6';
      if (y === 3 && x >= 1 && x <= 6 && x !== 3 && x !== 4) return 'rgb(70,48,38)';
      if (y === 6 && x >= 3 && x <= 4) return 'rgb(160,96,80)';
      if (y === 7 && (x <= 1 || x >= 6)) return jit(hair, x, y);
    }
    return jit(skinT, x, y, 6);
  });
  fill(P.body, (f, x, y, w) => {
    if (f === 'front' && (x === w / 2 - 1 || x === w / 2) && y < 9) return y % 3 === 1 ? '#d9b44a' : jit(tealD, x, y);
    if (y === 9 || y === 10) return y === 9 && f === 'front' && x >= 3 && x <= 4 ? '#c9a24a' : 'rgb(70,50,40)';
    return jit(y > 10 ? pants : teal, x, y);
  });
  for (const arm of [P.rarm, P.larm]) fill(arm, (f, x, y) => (y > 8 || f === 'bottom' ? jit(skinT, x, y, 6) : y === 8 ? jit(tealD, x, y) : jit(teal, x, y)));
  for (const leg of [P.rleg, P.lleg]) fill(leg, (f, x, y) => (y > 9 || f === 'bottom' ? jit(boots, x, y) : jit(pants, x, y)));
  return c;
}

/** Draws the face (with its hat layer) of a skin into a small canvas. */
export function drawHead(target: HTMLCanvasElement, skin: CanvasImageSource) {
  const g = target.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, target.width, target.height);
  g.drawImage(skin, 8, 8, 8, 8, 0, 0, target.width, target.height);
  g.drawImage(skin, 40, 8, 8, 8, 0, 0, target.width, target.height);
}

/** A front view of the whole player, flat, for small previews. */
export function drawFront(target: HTMLCanvasElement, skin: CanvasImageSource, model: Model) {
  const g = target.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const s = target.width / 16;
  g.clearRect(0, 0, target.width, target.height);
  const P = parts(model);
  const blit = (p: Part, dx: number, dy: number) => {
    const [x, y, w, h] = faces(p).front;
    g.drawImage(skin, x, y, w, h, dx * s, dy * s, w * s, h * s);
  };
  const aw = P.rarm.w;
  blit(P.head, 4, 0);
  blit(P.hat, 4, 0);
  blit(P.body, 4, 8);
  blit(P.rarm, 4 - aw, 8);
  blit(P.larm, 12, 8);
  blit(P.rleg, 4, 20);
  blit(P.lleg, 8, 20);
}

/** A three.js player whose boxes are UV-mapped onto the skin texture. */
export function buildPlayer(tex: THREE.Texture, model: Model): THREE.Group {
  const P = parts(model);
  const group = new THREE.Group();
  const solid = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.1 });
  const overlay = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
  const box = (p: Part, pos: [number, number, number], mat: THREE.Material, grow = 0) => {
    const geo = new THREE.BoxGeometry(p.w + grow, p.h + grow, p.d + grow);
    const f = faces(p);
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z. The player faces +z.
    const order = [f.left, f.right, f.top, f.bottom, f.front, f.back];
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    order.forEach(([x, y, w, h], i) => {
      const u0 = x / 64, u1 = (x + w) / 64, v0 = 1 - y / 64, v1 = 1 - (y + h) / 64;
      const flipY = i === 3; // the bottom face reads upside down
      const quad = flipY ? [[u0, v1], [u1, v1], [u0, v0], [u1, v0]] : [[u0, v0], [u1, v0], [u0, v1], [u1, v1]];
      quad.forEach(([u, v], k) => uv.setXY(i * 4 + k, u, v));
    });
    uv.needsUpdate = true;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    group.add(mesh);
    return mesh;
  };
  const aw = P.rarm.w;
  box(P.head, [0, 28, 0], solid);
  box(P.hat, [0, 28, 0], overlay, 1);
  box(P.body, [0, 18, 0], solid);
  box(P.rarm, [-4 - aw / 2, 18, 0], solid);
  box(P.larm, [4 + aw / 2, 18, 0], solid);
  box(P.rleg, [-2, 6, 0], solid);
  box(P.lleg, [2, 6, 0], solid);
  group.position.y = -16;
  return group;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}
