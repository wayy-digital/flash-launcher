import { useEffect, useState } from 'react';
import { Clock3, FileWarning, ScrollText } from 'lucide-react';
import { readGameLog, uaError } from '../api';
import { locale, t } from '../i18n';
import { Ctx } from '../screens/Main';

export default function Activity({ ctx }: { ctx: Ctx }) {
  const [crash, setCrash] = useState(false);
  const [log, setLog] = useState<{ path?: string; text?: string; error?: string } | null>(null);
  const inst = ctx.selected;
  useEffect(() => {
    setLog(null);
    if (!inst) return setLog({ error: t('Сборка не выбрана') });
    readGameLog(inst.home, crash).then(setLog).catch((e) => setLog({ error: uaError(e) }));
  }, [crash, inst?.id]);
  const name = (id: string) => ctx.instances.find((i) => i.id === id)?.name ?? id;
  const sessions = [...ctx.state.sessions].reverse().slice(0, 40);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="kicker">{t('АКТИВНОСТЬ')}</div>
          <h1>{t('Журнал игры')}</h1>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <button className={`btn-soft ${!crash ? 'active' : ''}`} onClick={() => setCrash(false)}><ScrollText size={13} /> latest.log</button>
          <button className={`btn-soft ${crash ? 'active' : ''}`} onClick={() => setCrash(true)}><FileWarning size={13} /> {t('Отчёт о сбое')}</button>
        </div>
      </div>
      <div className="two" style={{ flex: 1, minHeight: 0, gridTemplateColumns: '320px 1fr' }}>
        <div className="panel-card" style={{ overflow: 'auto' }}>
          <h3>{t('Сессии')}</h3>
          {sessions.length === 0 && <div className="empty" style={{ padding: 20 }}>{t('Вы ещё не играли через этот лаунчер')}</div>}
          <div className="list">
            {sessions.map((s) => (
              <div key={s.start} className="row" style={{ cursor: 'default' }}>
                <div>
                  <div>{name(s.instance)}</div>
                  <div className="sub">{new Date(s.start).toLocaleString(locale())}</div>
                </div>
                <span className="badge"><Clock3 size={10} style={{ verticalAlign: -1 }} /> {t('{m} мин', { m: Math.max(1, Math.round(s.secs / 60)) })}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="log" style={{ minHeight: 0 }}>
          {log === null ? t('Загружаю…') : log.error ? log.error : (<>{log.path && <div style={{ color: '#666', marginBottom: 6 }}>{log.path}</div>}{log.text || t('Журнал пуст')}</>)}
        </div>
      </div>
    </div>
  );
}
