import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Eraser, FolderOpen, PaintBucket, Pencil, Pipette, RotateCcw, Save, Undo2 } from 'lucide-react';
import { hz, inTauri, pickFile, readPng, saveSkin } from '../api';
import { buildPlayer, defaultSkin, faces, loadImage, Model, parts } from '../skin';
import { Ctx } from '../screens/Main';
import { t } from '../i18n';

type Tool = 'pen' | 'erase' | 'fill' | 'pick';
const PALETTE = ['#000000', '#3b2a22', '#6b4526', '#d6a07c', '#f3d2b5', '#ffffff', '#9aa0a6', '#4a4f57',
  '#e5484d', '#ff8a3d', '#ffd23f', '#5bd69b', '#208c84', '#2b7bd6', '#6c4ae0', '#ff4fd8'];
const SCALE = 8;

export default function SkinEditor({ ctx }: { ctx: Ctx }) {
  const guest = ctx.state.guest!;
  const [model, setModel] = useState<Model>(guest.model);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#e5484d');
  const [saving, setSaving] = useState(false);
  const skin = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const view = useRef<HTMLCanvasElement>(null);
  const three = useRef<HTMLCanvasElement>(null);
  const tex = useRef<THREE.CanvasTexture>();
  const rebuild = useRef<(m: Model) => void>(() => {});
  const undo = useRef<ImageData[]>([]);
  const drawing = useRef(false);

  const g = () => skin.current.getContext('2d', { willReadFrequently: true })!;
  const redraw = () => {
    const v = view.current;
    if (!v) return;
    const c = v.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, v.width, v.height);
    c.drawImage(skin.current, 0, 0, 64 * SCALE, 64 * SCALE);
    // part outlines
    c.strokeStyle = 'rgba(255,255,255,.10)';
    c.lineWidth = 1;
    for (const p of Object.values(parts(model))) for (const [x, y, w, h] of Object.values(faces(p))) c.strokeRect(x * SCALE + 0.5, y * SCALE + 0.5, w * SCALE - 1, h * SCALE - 1);
    if (tex.current) tex.current.needsUpdate = true;
  };

  // load the guest's skin, or the default one
  useEffect(() => {
    skin.current.width = skin.current.height = 64;
    const start = async () => {
      let src: CanvasImageSource = defaultSkin(model);
      if (guest.skin && inTauri) {
        try { src = await loadImage(await readPng(guest.skin)); } catch { /* default */ }
      }
      g().clearRect(0, 0, 64, 64);
      g().drawImage(src, 0, 0);
      redraw();
    };
    start();
  }, []);

  // 3D preview
  useEffect(() => {
    const canvas = three.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch { return; }
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 1.4);
    d.position.set(10, 20, 20);
    scene.add(d);
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 200);
    camera.position.set(0, 4, 92);
    camera.lookAt(0, 0, 0);
    const t = new THREE.CanvasTexture(skin.current);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    tex.current = t;
    let player = buildPlayer(t, model);
    scene.add(player);
    let yaw = 0.5, dragging = false, lastX = 0, auto = true, raf = 0;
    rebuild.current = (m) => { scene.remove(player); player = buildPlayer(t, m); scene.add(player); };
    const size = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (auto && !dragging) yaw += 0.008;
      player.rotation.y = yaw;
      renderer.render(scene, camera);
    };
    const down = (e: PointerEvent) => { dragging = true; auto = false; lastX = e.clientX; };
    const move = (e: PointerEvent) => { if (dragging) { yaw += (e.clientX - lastX) * 0.012; lastX = e.clientX; } };
    const up = () => { dragging = false; };
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    const ro = new ResizeObserver(size);
    ro.observe(canvas);
    size();
    loop();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose();
      canvas.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    };
  }, []);
  useEffect(() => { rebuild.current(model); redraw(); }, [model]);

  const at = (e: React.PointerEvent) => {
    const r = view.current!.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * 64), Math.floor(((e.clientY - r.top) / r.height) * 64)] as const;
  };
  const hex = (d: Uint8ClampedArray, i: number) => '#' + [d[i], d[i + 1], d[i + 2]].map((n) => n.toString(16).padStart(2, '0')).join('');
  const paint = (x: number, y: number) => {
    if (x < 0 || y < 0 || x > 63 || y > 63) return;
    const c = g();
    if (tool === 'pen') { c.fillStyle = color; c.fillRect(x, y, 1, 1); }
    else if (tool === 'erase') c.clearRect(x, y, 1, 1);
    else if (tool === 'pick') { setColor(hex(c.getImageData(x, y, 1, 1).data, 0)); setTool('pen'); }
    else if (tool === 'fill') {
      const img = c.getImageData(0, 0, 64, 64), d = img.data;
      const idx = (px: number, py: number) => (py * 64 + px) * 4;
      const target = d.slice(idx(x, y), idx(x, y) + 4);
      const n = parseInt(color.slice(1), 16), rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
      if (target.every((v, k) => v === rgb[k])) return;
      const stack = [[x, y]];
      while (stack.length) {
        const [px, py] = stack.pop()!;
        if (px < 0 || py < 0 || px > 63 || py > 63) continue;
        const i = idx(px, py);
        if (![0, 1, 2, 3].every((k) => d[i + k] === target[k])) continue;
        rgb.forEach((v, k) => (d[i + k] = v));
        stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
      }
      c.putImageData(img, 0, 0);
    }
    redraw();
  };
  const snapshot = () => { undo.current.push(g().getImageData(0, 0, 64, 64)); if (undo.current.length > 60) undo.current.shift(); };

  const open = async () => {
    const p = await pickFile([{ name: t('Скин PNG'), extensions: ['png'] }]);
    if (!p) return;
    try {
      const img = await loadImage(await readPng(p));
      snapshot();
      g().clearRect(0, 0, 64, 64);
      g().drawImage(img, 0, 0);
      redraw();
    } catch (e) { ctx.toast(String(e)); }
  };
  const reset = () => { snapshot(); g().clearRect(0, 0, 64, 64); g().drawImage(defaultSkin(model), 0, 0); redraw(); };
  const doUndo = () => { const s = undo.current.pop(); if (s) { g().putImageData(s, 0, 0); redraw(); } };
  const save = async () => {
    setSaving(true);
    try {
      const path = await saveSkin(guest.name, skin.current.toDataURL('image/png'));
      await hz(['account', 'skin', guest.name, path, '--model', model]);
      ctx.update({ guest: { ...guest, model, skin: path } });
      ctx.toast(t('Скин сохранён — в игре он уже на вас'));
    } catch (e) { ctx.toast(String(e)); }
    setSaving(false);
  };

  const tools: [Tool, JSX.Element, string][] = [
    ['pen', <Pencil size={15} />, t('Карандаш')], ['erase', <Eraser size={15} />, t('Ластик')], ['fill', <PaintBucket size={15} />, t('Заливка')], ['pick', <Pipette size={15} />, t('Пипетка')],
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="kicker">{t('РЕДАКТОР СКИНОВ')}</div>
          <h1>{guest.name}</h1>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <button className="btn-soft" onClick={open}><FolderOpen size={13} /> {t('Открыть PNG')}</button>
          <button className="btn-red" onClick={save} disabled={saving}><Save size={13} style={{ verticalAlign: -2 }} /> {saving ? t('Сохраняю…') : t('Сохранить скин')}</button>
        </div>
      </div>
      <div className="skin-ed">
        <div className="viewer">
          <canvas ref={three} />
          <div className="hint">{t('Потяните, чтобы повернуть')}</div>
        </div>
        <div className="paper">
          <canvas ref={view} width={64 * SCALE} height={64 * SCALE} style={{ width: 'min(100%, 460px)', aspectRatio: '1' }}
            onPointerDown={(e) => { snapshot(); drawing.current = true; (e.target as Element).setPointerCapture(e.pointerId); paint(...at(e)); }}
            onPointerMove={(e) => { if (drawing.current && (tool === 'pen' || tool === 'erase')) paint(...at(e)); }}
            onPointerUp={() => (drawing.current = false)} />
        </div>
        <div className="tools">
          <div className="panel-card">
            <h3>{t('Инструменты')}</h3>
            <div className="tool-row">
              {tools.map(([id, ic, tip]) => <button key={id} title={tip} className={tool === id ? 'on' : ''} onClick={() => setTool(id)}>{ic}</button>)}
              <button title={t('Отменить')} onClick={doUndo}><Undo2 size={15} /></button>
            </div>
          </div>
          <div className="panel-card">
            <h3>{t('Цвет')}</h3>
            <div className="swatches">
              {PALETTE.map((c) => <button key={c} className={c === color ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} />)}
            </div>
            <label className="field" style={{ marginTop: 10, height: 36 }}>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ flex: 'none', width: 28, height: 24, padding: 0, border: 0, background: 'none' }} />
              <input value={color} onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && setColor(e.target.value)} />
            </label>
          </div>
          <div className="panel-card">
            <h3>{t('Модель')}</h3>
            <div className="seg">
              <button className={model === 'classic' ? 'on' : ''} onClick={() => setModel('classic')}>{t('Классическая')}</button>
              <button className={model === 'slim' ? 'on' : ''} onClick={() => setModel('slim')}>{t('Тонкая')}</button>
            </div>
            <button className="btn-soft" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={reset}><RotateCcw size={13} /> {t('Стандартный скин')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
