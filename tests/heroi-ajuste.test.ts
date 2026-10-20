// V9 (carro herói): o interruptor "Carros em alta definição" — campo aditivo em Settings (save antigo abre igual, a 0.1.9 o ignora), o quadro que a sessão
// entrega ao renderizador (`options.heroCars`: nunca na Baixa nem em Reduzir efeitos) e a linha na tela de Opções (Acessibilidade, ao lado do "30 fps").
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type MenuContext, type Menus, type MenuScreen, type RenderFrame, type Renderer, type Settings } from '../src/game/contracts';
import { sanitizeSettings } from '../src/game/settings';
import { createSession, type Session } from '../src/game/session';
import { getLanguage, setLanguage, t } from '../src/i18n';
import { accessScreen } from '../src/access/screen';
import { all, FakeEl, installDocument, text } from './ui-fake';
import { human } from './helpers';

const captured: RenderFrame[] = [];
vi.mock('../src/render/renderer', () => ({
  createRenderer: (canvas: HTMLCanvasElement): Renderer => ({
    canvas, resize: () => undefined, render: (f: RenderFrame) => { captured.push(f); }, renderIdle: () => undefined, dispose: () => undefined,
  }),
}));
vi.mock('../src/ui/menus', () => ({
  createMenus: (_ctx: MenuContext): Menus => {
    let current: MenuScreen | null = null;
    return {
      show: (s: MenuScreen) => { current = s; }, hide: () => { current = null; }, current: () => current,
      navigate: () => undefined, update: () => undefined, refreshLanguage: () => undefined,
    };
  },
}));

type WithHero = Settings & { heroCars?: 'auto' | 'on' | 'off' };

describe('o campo nas Settings (aditivo)', () => {
  it('automático por padrão; aceita auto/on/off; lixo vira automático', () => {
    expect((DEFAULT_SETTINGS as WithHero).heroCars).toBe('auto');
    expect((sanitizeSettings({}) as WithHero).heroCars).toBe('auto');
    for (const v of ['auto', 'on', 'off'] as const) expect((sanitizeSettings({ heroCars: v }) as WithHero).heroCars).toBe(v);
    for (const bad of [true, false, 1, null, 'ligado', [], {}]) expect((sanitizeSettings({ heroCars: bad }) as WithHero).heroCars).toBe('auto');
  });

  it('opções gravadas pela 0.1.8 (fixture literal, sem o campo) abrem iguais, com o herói no automático', () => {
    const fx = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'saves-antigos', 'v0.1.8-completo.json'), 'utf8')) as { settings: Record<string, unknown> };
    expect('heroCars' in fx.settings).toBe(false);
    const now = sanitizeSettings(JSON.parse(JSON.stringify(fx.settings))) as unknown as Record<string, unknown>;
    expect(now.heroCars).toBe('auto');
    for (const key of Object.keys(fx.settings)) if (key !== 'controls') expect(now[key], key).toEqual(fx.settings[key]);
  });

  it('a 0.1.9 devolvia estas chaves: nenhuma sumiu e só `heroCars` entrou', () => {
    const da0_1_9 = ['language', 'masterVolume', 'musicVolume', 'sfxVolume', 'fullscreen', 'quality', 'renderStyle', 'showMinimap', 'screenShake', 'difficulty', 'manualGear', 'assists',
      'totalCars', 'quickLaps', 'music', 'telemetryConsent', 'controls', 'vibration', 'serverUrl', 'ghost', 'seatAssists', 'colorPalette', 'hudScale', 'largeText', 'reduceEffects',
      'cartoonEffects', 'landmarkCaptions', 'lockFps30', 'seatCameras', 'highCurveCamera', 'assistOfferDeclined'];
    const keys = Object.keys(sanitizeSettings({}));
    expect(da0_1_9.filter((k) => !keys.includes(k))).toEqual([]);
    expect(keys.filter((k) => !da0_1_9.includes(k))).toEqual(['heroCars']);
  });

  it('gravar e reabrir não muda nada (idempotente)', () => {
    const s = sanitizeSettings({ heroCars: 'off', quality: 'ultra' });
    expect(sanitizeSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

// A sessão resolve o interruptor com a qualidade e o "Reduzir efeitos" e entrega o resultado em `options.heroCars` (RenderOptions).
describe('a sessão passa o herói ao quadro', () => {
  let session: Session;
  beforeEach(() => {
    captured.length = 0;
    vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener: () => undefined, removeEventListener: () => undefined, navigator: { getGamepads: () => [null, null, null, null] } });
    session = createSession({} as HTMLCanvasElement, {} as HTMLElement, {} as HTMLElement);
    session.startQuick('copacabana', 2, [human(0)], true);
    session.debugStep(60 * 2);
  });
  afterEach(() => { session.input.dispose(); vi.unstubAllGlobals(); });

  const heroNoQuadro = (t0: number): boolean | undefined => {
    session.frame(t0); session.frame(t0 + 20);
    return (captured.at(-1)?.options as { heroCars?: boolean } | undefined)?.heroCars;
  };

  it('Alta e Ultra (automático): ligado; Média (automático): desligado; "ligado" liga a Média', () => {
    const s = session.settings as WithHero;
    s.quality = 'high'; s.heroCars = 'auto'; expect(heroNoQuadro(2000)).toBe(true);
    s.quality = 'ultra'; expect(heroNoQuadro(2100)).toBe(true);
    s.quality = 'medium'; expect(heroNoQuadro(2200)).toBe(false);
    s.heroCars = 'on'; expect(heroNoQuadro(2300)).toBe(true);
  });
  it('Baixa nunca; Reduzir efeitos nunca; interruptor desligado nunca', () => {
    const s = session.settings as WithHero;
    s.quality = 'low'; s.heroCars = 'on'; expect(heroNoQuadro(2000)).toBe(false);
    s.quality = 'high'; s.heroCars = 'on'; s.reduceEffects = true; expect(heroNoQuadro(2100)).toBe(false);
    s.reduceEffects = false; s.heroCars = 'off'; expect(heroNoQuadro(2200)).toBe(false);
  });
});

// A linha na tela de Acessibilidade (DOM falso), PT e EN, ao lado do "30 fps".
describe('Opções › Visual: Carros em alta definição', () => {
  const lang = getLanguage();
  beforeEach(() => { installDocument(); });
  afterEach(() => { vi.unstubAllGlobals(); setLanguage(lang); });

  function abre() {
    const settings = { ...DEFAULT_SETTINGS, seatCameras: [...DEFAULT_SETTINGS.seatCameras] } as WithHero;
    const emitted: unknown[] = [];
    const api = { ctx: { settings, audio: { musicList: () => [] } }, lobby: {}, go: () => undefined, back: () => undefined, emit: (e: unknown) => emitted.push(e), sfx: () => undefined, refresh: () => undefined };
    return { settings, scr: accessScreen(api as unknown as Parameters<typeof accessScreen>[0]), emitted };
  }
  const rowOf = (root: unknown, label: string): FakeEl | undefined => all(root, (e) => e.className.split(/\s+/).includes('sel')).find((e) => text(e).startsWith(label));

  it('o seletor gira automático → ligado → desligado → automático e grava a cada passo', () => {
    const { settings, scr, emitted } = abre();
    const row = rowOf(scr.el, t('ui.options.heroCars'));
    expect(row, 'linha da opção').toBeDefined();
    if (!row) return;
    const next = all(row, (e) => e.className.split(/\s+/).includes('next'))[0];
    expect(text(row)).toContain(t('ui.options.heroCars.auto'));
    const press = () => next.listeners.click[0]({ stopPropagation: () => undefined });
    press(); expect(settings.heroCars).toBe('on'); expect(text(row)).toContain(t('ui.options.heroCars.on'));
    press(); expect(settings.heroCars).toBe('off'); expect(text(row)).toContain(t('ui.options.heroCars.off'));
    press(); expect(settings.heroCars).toBe('auto');
    expect(emitted.length).toBeGreaterThanOrEqual(3);
  });

  it('o texto existe em PT e EN (rótulo, valores e explicação), sem chave crua', () => {
    for (const l of ['pt', 'en'] as const) {
      setLanguage(l);
      for (const k of ['ui.options.heroCars', 'ui.options.heroCars.hint', 'ui.options.heroCars.auto', 'ui.options.heroCars.on', 'ui.options.heroCars.off']) {
        expect(t(k), `${l} ${k}`).not.toBe(k);
        expect(t(k).length).toBeGreaterThan(1);
      }
    }
    setLanguage('pt'); const pt = t('ui.options.heroCars'); setLanguage('en');
    expect(t('ui.options.heroCars')).not.toBe(pt);
  });
});
