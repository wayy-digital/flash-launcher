import { useEffect, useRef, useState } from 'react';
import { Download, Heart, Loader2, Search, X } from 'lucide-react';
import { downloadMrpack, fmtNum, http, hz, hzStream, modrinthSearch, MrHit, uaError } from '../api';
import { t } from '../i18n';
import { Ctx } from '../screens/Main';

type Line = { t: string; e: boolean };
type MrVersion = { name: string; version_number: string; game_versions: string[]; loaders: string[]; files: { url: string; filename: string; primary: boolean }[] };

export default function Browse({ ctx, type }: { ctx: Ctx; type: 'mod' | 'modpack' }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('relevance');
  const [hits, setHits] = useState<MrHit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState('');
  const [onlyFit, setOnlyFit] = useState(true);
  const [job, setJob] = useState<{ title: string; lines: Line[]; done?: number | null; summary?: string } | null>(null);
  const timer = useRef<number>();
  const sel = ctx.selected;
  const loader = type === 'mod' && onlyFit ? sel?.java?.loader?.kind : undefined;
  const version = type === 'mod' && onlyFit ? sel?.java?.minecraft : undefined;

  const load = (offset = 0) => {
    setErr('');
    modrinthSearch({ query: q, type, sort, offset, loader, version })
      .then((r) => { setHits((h) => (offset ? [...(h ?? []), ...r.hits] : r.hits)); setTotal(r.total_hits); })
      .catch((e) => { setErr(uaError(e)); setHits([]); });
  };
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => load(0), 280);
  }, [q, sort, loader, version]);

  const run = async (h: MrHit, lines: Line[], args: string[]) => {
    const push = (l: Line) => { lines.push(l); setJob({ title: h.title, lines: [...lines.slice(-300)] }); };
    const code = await hzStream(args, (s, e) => push({ t: s, e: e && /^error/i.test(s) })).catch((e) => { push({ t: uaError(e), e: true }); return 1; });
    return code;
  };

  const install = async (h: MrHit) => {
    const lines: Line[] = [];
    setJob({ title: h.title, lines });
    if (type === 'mod') {
      if (!sel) { setJob({ title: h.title, lines: [{ t: t('Сначала создайте сборку с загрузчиком модов.'), e: true }], done: 1 }); return; }
      const code = await run(h, lines, ['mods', 'install', h.slug, '--instance', sel.id]);
      const file = lines.map((l) => l.t.match(/: (mods\/\S+\.jar)/)?.[1]).find(Boolean);
      setJob({ title: h.title, lines, done: code, summary: code === 0 ? t('Установлено в «{n}»: {f}', { n: sel.name, f: file ?? h.title }) : undefined });
      return;
    }
    // a modpack: its newest .mrpack from Modrinth, imported as a Java instance of its own
    try {
      lines.push({ t: t('Ищу последнюю версию сборки…'), e: false });
      setJob({ title: h.title, lines: [...lines] });
      const versions = await http<MrVersion[]>(`https://api.modrinth.com/v2/project/${h.project_id}/version`);
      const v = versions.find((x) => x.files.some((f) => f.filename.endsWith('.mrpack')));
      if (!v) throw new Error(t('У этой сборки нет файла .mrpack'));
      const file = v.files.find((f) => f.primary && f.filename.endsWith('.mrpack')) ?? v.files.find((f) => f.filename.endsWith('.mrpack'))!;
      lines.push({ t: t('Скачиваю {f} (Minecraft {m}, {l})…', { f: file.filename, m: v.game_versions[0] ?? '?', l: v.loaders.join(', ') }), e: false });
      setJob({ title: h.title, lines: [...lines] });
      const path = await downloadMrpack(file.url, file.filename);
      const code = await run(h, lines, ['instance', 'import', path, '--java']);
      let summary: string | undefined;
      if (code === 0) {
        const json = lines.filter((l) => !l.e).map((l) => l.t).join('\n');
        const made = (() => { try { return JSON.parse(json.slice(json.indexOf('{'))); } catch { return null; } })();
        if (made?.id) await hz(['instance', 'select', made.id]).catch(() => {});
        summary = t('Сборка «{n}» готова: Minecraft {m} · {l}', { n: made?.name ?? h.title, m: v.game_versions[0] ?? '?', l: v.loaders.join(', ') });
        ctx.update({ recentPacks: [{ id: h.project_id, title: h.title, icon: h.icon_url }, ...ctx.state.recentPacks.filter((p) => p.id !== h.project_id)].slice(0, 12) });
        ctx.refresh();
      }
      setJob({ title: h.title, lines, done: code, summary });
    } catch (e) {
      lines.push({ t: uaError(e), e: true });
      setJob({ title: h.title, lines, done: 1 });
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="kicker">MODRINTH</div>
          <h1>{type === 'modpack' ? t('Сборки модов') : t('Моды')}</h1>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>{total ? t('{n} проектов', { n: fmtNum(total) }) : ''}</div>
      </div>
      <div className="toolbar">
        <label className="field"><Search size={14} /><input placeholder={type === 'modpack' ? t('Поиск сборок…') : t('Поиск модов…')} value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {[['relevance', 'Подходящие'], ['downloads', 'Популярные'], ['follows', 'Любимые'], ['updated', 'Обновлённые']].map(([k, n]) => (
          <button key={k} className={`btn-soft ${sort === k ? 'active' : ''}`} onClick={() => setSort(k)}>{t(n)}</button>
        ))}
        {type === 'mod' && sel?.java && (
          <button className={`btn-soft ${onlyFit ? 'active' : ''}`} onClick={() => setOnlyFit(!onlyFit)}>
            {t('Для «{n}»', { n: sel.name })}{sel.java.loader ? ` · ${sel.java.loader.kind}` : ''} {sel.java.minecraft}
          </button>
        )}
      </div>
      {type === 'mod' && sel?.java && !sel.java.loader && (
        <div className="sub" style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 10 }}>
          {t('Выбранная сборка ванильная: для модов создайте сборку с Fabric, Forge, NeoForge или Quilt.')}
        </div>
      )}
      {err && <div className="badge red" style={{ alignSelf: 'flex-start', marginBottom: 10 }}>{err}</div>}
      <div className="scroll">
        {hits === null ? <div className="empty"><Loader2 className="spin" /></div> : hits.length === 0 ? <div className="empty">{t('Ничего не найдено')}</div> : (
          <div className="grid">
            {hits.map((h) => (
              <div className="pcard" key={h.project_id}>
                <div className="cover" style={{ backgroundImage: `url(${h.featured_gallery || h.gallery?.[0] || ''})` }}>
                  <div className="icon" style={{ backgroundImage: h.icon_url ? `url(${h.icon_url})` : undefined }} />
                </div>
                <div className="b">
                  <div className="name">{h.title}</div>
                  <div className="by">{t('от {a}', { a: h.author })} · {h.versions[h.versions.length - 1] ?? ''}</div>
                  <div className="desc">{h.description}</div>
                  <div className="tags">{h.categories.slice(0, 4).map((c) => <span key={c}>{c}</span>)}</div>
                  <div className="f">
                    <span><Download size={11} style={{ verticalAlign: -1 }} /> {fmtNum(h.downloads)} · <Heart size={11} style={{ verticalAlign: -1 }} /> {fmtNum(h.follows)}</span>
                    <button className="btn-soft active" onClick={() => install(h)}>{t('Установить')}</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {hits && hits.length < total && hits.length > 0 && (
          <div style={{ textAlign: 'center', margin: 16 }}><button className="btn-ghost" onClick={() => load(hits.length)}>{t('Показать ещё')}</button></div>
        )}
      </div>
      {job && (
        <div className="modal-bg">
          <div className="modal">
            <div className="mh">
              <b>{job.done === undefined ? t('Устанавливаю') : job.done === 0 ? t('Установлено') : t('Ошибка')}: {job.title}</b>
              {job.done !== undefined && <button className="close-btn" onClick={() => setJob(null)}><X size={14} strokeWidth={3} /></button>}
            </div>
            <div className="mb">
              {job.done === undefined && <div className="progress"><i style={{ width: `${Math.min(95, 8 + job.lines.length * 2)}%` }} /></div>}
              {job.summary && <div className="row done" style={{ cursor: 'default' }}><span>{job.summary}</span></div>}
              <div className="log" style={{ height: 220 }} ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
                {job.lines.length === 0 && t('Скачиваю с Modrinth…')}
                {job.lines.map((l, i) => <div key={i} className={l.e ? 'e' : ''}>{l.t}</div>)}
              </div>
              {job.done === 0 && type === 'modpack' && <button className="btn-red" onClick={() => { setJob(null); ctx.go('home'); }}>{t('Играть в сборку')}</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
