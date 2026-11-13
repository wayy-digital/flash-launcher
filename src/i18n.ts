// UI language: Russian by default, Ukrainian on request. Strings are written in Russian in the
// code and looked up in UK by that text; {name} placeholders are filled from `vars`.
import { UK } from './i18n-uk';

export type Lang = 'ru' | 'uk';
let lang: Lang = 'ru';

export const setLang = (l: Lang) => { lang = l; };
export const getLang = () => lang;
export const locale = () => (lang === 'uk' ? 'uk-UA' : 'ru-RU');

export function t(s: string, vars?: Record<string, string | number>): string {
  let r = lang === 'uk' ? UK[s] ?? s : s;
  if (vars) for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
}
