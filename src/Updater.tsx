// The launcher's own updates: a full-screen "updating" view at start, the "update available"
// button in the top bar, and the dialog it opens.
import { useEffect, useState } from 'react';
import { Download, Loader2, X, Zap } from 'lucide-react';
import { updateCheck, UpdateInfo, updateInstall, uaError } from './api';
import { t } from './i18n';

const mb = (n: number) => (n / 1048576).toFixed(1);

/** The download/install progress, shown while an update goes in. */
export function UpdateProgress({ info, onError }: { info: UpdateInfo; onError: (e: string) => void }) {
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => {
    updateInstall((d, tt) => { setDone(d); setTotal(tt); }).catch((e) => onError(uaError(e)));
  }, []);
  const pct = total ? Math.min(100, (done / total) * 100) : 0;
  return (
    <>
      <div className="progress" style={{ height: 8 }}><i style={{ width: `${total ? pct : 8}%` }} /></div>
      <div className="sub" style={{ color: 'var(--muted)', fontSize: 12, marginTop: 10, textAlign: 'center' }}>
        {total && done >= total ? t('Устанавливаю и перезапускаю…') : total ? t('Скачано {d} из {t} МБ', { d: mb(done), t: mb(total) }) : t('Скачиваю версию {v}…', { v: info.version })}
      </div>
    </>
  );
}

/** Full screen, at start: the launcher updates itself before anything else. */
export function UpdatingScreen({ info, onSkip }: { info: UpdateInfo; onSkip: () => void }) {
  const [err, setErr] = useState('');
  return (
    <div className="updating drag">
      <div className="box nodrag">
        <div className="logo" style={{ justifyContent: 'center', marginBottom: 6 }}><Zap size={30} fill="currentColor" /> Flash <span className="tag">LAUNCHER</span></div>
        <h2>{t('Обновление до версии {v}', { v: info.version })}</h2>
        <div className="sub" style={{ color: 'var(--muted)', fontSize: 12.5, marginBottom: 18 }}>{t('Вы пропустили обновление — ставлю его, это займёт минуту.')}</div>
        {err ? (
          <>
            <div className="badge red" style={{ whiteSpace: 'normal', padding: 10, lineHeight: 1.5 }}>{err}</div>
            <button className="btn-ghost" style={{ marginTop: 14, width: '100%' }} onClick={onSkip}>{t('Открыть лаунчер без обновления')}</button>
          </>
        ) : (
          <UpdateProgress info={info} onError={setErr} />
        )}
      </div>
    </div>
  );
}

/** The dialog behind the top bar's update button. */
export function UpdateDialog({ info, onClose }: { info: UpdateInfo; onClose: () => void }) {
  const [installing, setInstalling] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="modal-bg nodrag" onClick={() => !installing && onClose()}>
      <div className="modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <b style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Download size={15} /> {t('Вышло обновление {v}', { v: info.version })}</b>
          {!installing && <button className="close-btn" onClick={onClose}><X size={14} strokeWidth={3} /></button>}
        </div>
        <div className="mb" style={{ gap: 14 }}>
          <div className="kv" style={{ gridTemplateColumns: '120px 1fr' }}>
            <span className="k">{t('Сейчас')}</span><span>{info.current}</span>
            <span className="k">{t('Новая версия')}</span><span style={{ color: '#7fe3b2', fontWeight: 600 }}>{info.version}</span>
          </div>
          {info.notes && <div className="log" style={{ maxHeight: 180, whiteSpace: 'pre-wrap', color: '#c9c9d1', fontFamily: 'inherit', fontSize: 12.5 }}>{info.notes}</div>}
          {err && <div className="badge red" style={{ whiteSpace: 'normal', padding: 10 }}>{err}</div>}
          {installing && !err ? (
            <UpdateProgress info={info} onError={setErr} />
          ) : (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={onClose}>{t('Позже')}</button>
              <button className="btn-red" onClick={() => { setErr(''); setInstalling(true); }}>{t('Обновить и перезапустить')}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Checks now and every 30 minutes while the launcher is open. */
export function useUpdateWatch(onFound: (u: UpdateInfo) => void) {
  useEffect(() => {
    const tick = () => updateCheck().then((u) => u && onFound(u)).catch(() => {});
    const id = window.setInterval(tick, 30 * 60_000);
    return () => window.clearInterval(id);
  }, []);
}

export { Loader2 };
