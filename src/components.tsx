import { useEffect, useRef } from 'react';
import { Minus, X, Zap } from 'lucide-react';
import { renderVoxelScene, ScenePreset } from './scenes/voxel';
import { windowAction } from './api';
import { t } from './i18n';
import { drawHead, loadImage, defaultSkin, Model } from './skin';

const FALLBACK: Record<ScenePreset, string> = {
  canyon: 'linear-gradient(180deg,#5aa9e6,#ffd6a5)',
  night: 'radial-gradient(circle at 70% 20%,#f3f0e0 0 6%,transparent 7%),linear-gradient(180deg,#0b1a3a,#2c5aa0)',
  hero: 'radial-gradient(circle at 70% 50%,#8e1840,#2a0d24 45%,#07050b 80%)',
};

export function Scene({ preset }: { preset: ScenePreset }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => (ref.current ? renderVoxelScene(ref.current, preset) : undefined), [preset]);
  return (
    <>
      <div className="scene-fallback" style={{ background: FALLBACK[preset] }} />
      <canvas ref={ref} className="scene-canvas" />
    </>
  );
}

export function Logo({ size }: { size?: number }) {
  return (
    <div className="logo" style={size ? { fontSize: size } : undefined}>
      <Zap size={(size ?? 26) * 0.95} strokeWidth={2.2} fill="currentColor" />
      Flash <span className="tag">LAUNCHER</span>
    </div>
  );
}

export function WindowControls({ close = true }: { close?: boolean }) {
  return (
    <div className="win-ctl nodrag">
      <button className="min" aria-label={t('Свернуть')} onClick={() => windowAction('minimize')}>
        <Minus size={14} />
      </button>
      {close && (
        <button className="close-btn" aria-label={t('Закрыть')} onClick={() => windowAction('close')}>
          <X size={15} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

export function Head({ skin, model, size = 30 }: { skin?: string; model?: Model; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (skin) loadImage(skin).then((img) => drawHead(c, img)).catch(() => drawHead(c, defaultSkin(model)));
    else drawHead(c, defaultSkin(model));
  }, [skin, model]);
  return <canvas ref={ref} width={8 * 8} height={8 * 8} style={{ width: size, height: size }} />;
}

export const tagline = () => t('Minecraft: Java Edition, Fabric, Forge и сборки модов.');

/** A Steam glyph for the sign-in button. */
export function SteamLogo({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.98 0C5.67 0 .5 4.86.02 11.04l6.43 2.66a3.38 3.38 0 0 1 1.92-.6l2.86-4.15v-.06a4.53 4.53 0 1 1 4.53 4.53h-.1l-4.08 2.91v.16a3.4 3.4 0 0 1-6.73.68L.3 15.24A12 12 0 1 0 11.98 0zM7.54 18.21l-1.47-.61a2.55 2.55 0 1 0 1.39-3.52l1.52.63a1.88 1.88 0 1 1-1.44 3.5zm11.42-9.3a3.02 3.02 0 1 0-6.04 0 3.02 3.02 0 0 0 6.04 0zm-5.28 0a2.27 2.27 0 1 1 4.54 0 2.27 2.27 0 0 1-4.54 0z" />
    </svg>
  );
}

/** The player's picture: their Steam avatar, else their skin's face. */
export function Avatar({ steam, skin, model, size = 30 }: { steam?: { avatar?: string | null }; skin?: string; model?: Model; size?: number }) {
  if (steam?.avatar) return <img src={steam.avatar} alt="" style={{ width: size, height: size, borderRadius: 7, objectFit: 'cover' }} />;
  return <Head skin={skin} model={model} size={size} />;
}
