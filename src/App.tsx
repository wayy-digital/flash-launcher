import { useEffect, useState } from 'react';
import { loadState, saveState, updateCheck, UpdateInfo, UiState } from './api';
import Setup from './screens/Setup';
import Login from './screens/Login';
import Main from './screens/Main';
import { setLang } from './i18n';
import { UpdateDialog, UpdatingScreen, useUpdateWatch } from './Updater';

export default function App() {
  const [state, setState] = useState<UiState | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [autoInstall, setAutoInstall] = useState(false);
  const [dialog, setDialog] = useState(false);

  useEffect(() => {
    loadState().then((s) => {
      // ?screen=setup|login|main forces a screen (for screenshots and support)
      const force = new URLSearchParams(location.search).get('screen');
      if (force === 'setup') s.setupDone = false;
      if (force === 'login') { s.setupDone = true; s.guest = undefined; }
      setState(s);
      // At start: a missed update goes in by itself, unless the player turned that off.
      updateCheck()
        .then((u) => {
          if (!u) return;
          setUpdate(u);
          if (s.autoUpdate !== false) setAutoInstall(true);
        })
        .catch(() => {});
    });
  }, []);
  // While the launcher stays open, a new release only lights up the update button.
  useUpdateWatch(setUpdate);

  const update_ = (patch: Partial<UiState>) =>
    setState((s) => {
      const next = { ...(s as UiState), ...patch };
      saveState(next);
      return next;
    });
  if (!state) return <div className="app" />;
  setLang(state.lang ?? 'ru');
  return (
    <div className="app" key={state.lang ?? 'ru'}>
      {!state.setupDone ? (
        <Setup state={state} onDone={update_} />
      ) : !state.guest ? (
        <Login state={state} onDone={update_} />
      ) : (
        <Main state={state} update={update_} onLogout={() => update_({ guest: undefined })}
          available={update} onUpdate={() => setDialog(true)} onFoundUpdate={setUpdate} />
      )}
      {update && dialog && !autoInstall && <UpdateDialog info={update} onClose={() => setDialog(false)} />}
      {update && autoInstall && <UpdatingScreen info={update} onSkip={() => setAutoInstall(false)} />}
    </div>
  );
}
