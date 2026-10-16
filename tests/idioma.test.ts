// O5 (docs/ondas/O/O5.md §4.5): idioma detectado na 1ª abertura — Steam, depois `app.getLocale`, depois `navigator.language` — sem
// nunca sobrescrever uma escolha salva e nunca sob automação (o Chromium dos playtests é en-US: os roteiros em português quebrariam).
import { describe, expect, it } from 'vitest';
import type { DesktopApi } from '../src/game/desktop';
import { firstOpenSettings, langOf, languageCandidates, pickLanguage, sanitizeSettings, shouldDetectLanguage } from '../src/game/settings';

describe('langOf: o que vem da Steam e dos locais', () => {
  it('Steam: brazilian e portuguese → pt; english → en; outros idiomas → null', () => {
    expect(langOf('brazilian')).toBe('pt');
    expect(langOf('portuguese')).toBe('pt');
    expect(langOf('english')).toBe('en');
    expect(langOf('spanish')).toBeNull();
    expect(langOf('german')).toBeNull();
  });
  it('locais: pt*, en* (com hífen ou sublinhado, maiúsculas ou não)', () => {
    for (const v of ['pt', 'pt-BR', 'PT_br', 'pt-PT']) expect(langOf(v), v).toBe('pt');
    for (const v of ['en', 'en-US', 'en_GB', 'EN']) expect(langOf(v), v).toBe('en');
    for (const v of ['es-ES', 'fr', 'ptx', 'entrar', 'enx-US', '', '  ', null, undefined, 7, {}]) expect(langOf(v), String(v)).toBeNull();
  });
  it('pickLanguage: o primeiro reconhecido vale; nenhum → null (fica o padrão de hoje)', () => {
    expect(pickLanguage(['german', 'es-ES', 'en-US', 'pt-BR'])).toBe('en');
    expect(pickLanguage(['brazilian', 'en-US'])).toBe('pt');
    expect(pickLanguage(['spanish', 'es-ES'])).toBeNull();
    expect(pickLanguage([])).toBeNull();
  });
});

describe('languageCandidates: a ordem Steam → app.getLocale → navegador', () => {
  const nav = { language: 'es-ES', languages: ['es-ES', 'fr-FR'] };
  const withLocale = (r: Promise<{ steam: string | null; app: string | null }>) => ({ locale: () => r }) as Pick<DesktopApi, 'locale'>;
  it('Steam primeiro, depois o sistema, depois o navegador', async () => {
    expect(await languageCandidates(withLocale(Promise.resolve({ steam: 'english', app: 'pt-BR' })), nav)).toEqual(['english', 'pt-BR', 'es-ES', 'fr-FR', 'es-ES']);
    expect(pickLanguage(await languageCandidates(withLocale(Promise.resolve({ steam: 'english', app: 'pt-BR' })), nav))).toBe('en');
    expect(pickLanguage(await languageCandidates(withLocale(Promise.resolve({ steam: 'spanish', app: 'pt-BR' })), nav))).toBe('pt');
  });
  it('sem Steam (nulos), com preload antigo (sem locale), com o IPC falhando ou mudo: segue para o navegador', async () => {
    expect(await languageCandidates(withLocale(Promise.resolve({ steam: null, app: null })), nav)).toEqual(['es-ES', 'fr-FR', 'es-ES']);
    expect(await languageCandidates({}, nav)).toEqual(['es-ES', 'fr-FR', 'es-ES']);
    expect(await languageCandidates(null, nav)).toEqual(['es-ES', 'fr-FR', 'es-ES']);
    expect(await languageCandidates(withLocale(Promise.reject(new Error('ipc'))), nav)).toEqual(['es-ES', 'fr-FR', 'es-ES']);
    expect(await languageCandidates(withLocale(new Promise(() => undefined)), nav, 20)).toEqual(['es-ES', 'fr-FR', 'es-ES']);
    expect(await languageCandidates(null, null)).toEqual([]);
  });
});

describe('só na 1ª abertura, sem sobrescrever', () => {
  const env = { webdriver: false, search: '' };
  it('roda só sem opções E sem save; nunca sob automação', () => {
    expect(shouldDetectLanguage(null, null, env)).toBe(true);
    expect(shouldDetectLanguage(undefined, undefined, env)).toBe(true);
    expect(shouldDetectLanguage({ language: 'pt' }, null, env)).toBe(false);
    expect(shouldDetectLanguage({}, null, env)).toBe(false); // opções salvas, mesmo sem o campo: o jogador já abriu o jogo
    expect(shouldDetectLanguage(null, { racesRun: 3 }, env)).toBe(false);
    expect(shouldDetectLanguage(null, null, { webdriver: true })).toBe(false);
  });

  it('firstOpenSettings: na 1ª abertura junta a qualidade automática e o idioma detectado num gravação só', async () => {
    const got = await firstOpenSettings({ settings: null, save: null }, env, { quality: async () => 'medium', candidates: async () => ['english'] });
    expect(got).toMatchObject({ quality: 'medium', autoQuality: 'medium', language: 'en' });
    expect(sanitizeSettings(got).language).toBe('en');
  });
  it('nenhum candidato reconhecido: grava só a qualidade (o idioma fica o padrão, pt)', async () => {
    const got = await firstOpenSettings({ settings: null, save: null }, env, { quality: async () => 'high', candidates: async () => ['german'] });
    expect(got).not.toHaveProperty('language');
    expect(sanitizeSettings(got).language).toBe('pt');
  });
  it('escolha salva NUNCA é sobrescrita: com opções gravadas não há nada a gravar', async () => {
    let asked = 0;
    const probes = { quality: async () => { asked++; return 'low' as const; }, candidates: async () => { asked++; return ['english']; } };
    expect(await firstOpenSettings({ settings: { language: 'pt' }, save: null }, env, probes)).toBeNull();
    expect(await firstOpenSettings({ settings: null, save: { racesRun: 1 } }, env, probes)).toBeNull();
    expect(asked).toBe(0);
  });
  it('sob automação nada é detectado nem gravado (os playtests seguem em português)', async () => {
    expect(await firstOpenSettings({ settings: null, save: null }, { webdriver: true, search: '' }, { quality: async () => 'low', candidates: async () => ['english'] })).toBeNull();
  });
  it('?autoq=0 desliga a qualidade mas não o idioma', async () => {
    expect(await firstOpenSettings({ settings: null, save: null }, { webdriver: false, search: '?autoq=0' }, { quality: async () => 'low', candidates: async () => ['english'] }))
      .toEqual({ language: 'en' });
  });
});
