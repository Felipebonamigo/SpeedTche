// V12, item 1: a câmera Alta "curva" (CAMERA_HIGH_CURVE, candidata da V11) vira OPÇÃO de verdade em Opções › Acessibilidade, desligada por padrão.
// Só renderização e opções: nada no núcleo, nada na rede. Campo aditivo `highCurveCamera` (opções de antes abrem igual; a 0.1.7 ignora o campo).
// As outras câmeras (Alta aprovada, Baixa, Capô, Frente) não mudam com ela ligada.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type MenuContext, type Menus, type MenuScreen, type RenderFrame, type Renderer, type Settings } from '../src/game/contracts';
import { sanitizeSettings } from '../src/game/settings';
import { createSession, type Session } from '../src/game/session';
import { getLanguage, setLanguage, t } from '../src/i18n';
import { accessScreen } from '../src/access/screen';
import { cameraExtraFor, ChaseCamera, newCameraExtra, type CameraExtra } from '../src/render/camera';
import * as B from '../src/render/camera-base';
import { buildRoadFrame } from '../src/render/roadframe';
import { all, FakeEl, installDocument, text } from './ui-fake';
import { human, quickRace, syntheticTrack } from './helpers';

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

type WithCurve = Settings & { highCurveCamera?: boolean };
const NO_SHAKE = { x: 0, y: 0, roll: 0 };
const track = syntheticTrack([{ op: 'straight', length: 800 }]);
const rf = buildRoadFrame(track, 4000, 30, 200);
const extra = (over: Partial<CameraExtra> & { curve?: boolean } = {}): CameraExtra => ({ ...newCameraExtra(), ...over });

/** Posição e FOV da câmera depois de 3 s a 60 quadros, parada (o repouso). */
function settle(chosen: B.CameraMode, ex: CameraExtra, eye: { x: number; y: number; z: number } | null = null) {
  const cam = new ChaseCamera();
  for (let i = 0; i < 180; i++) cam.update(rf, 0, 0, 0, false, i / 60, NO_SHAKE, ex, chosen, eye);
  return { x: cam.camera.position.x, y: cam.camera.position.y, z: cam.camera.position.z, fov: cam.camera.fov };
}

describe('a opção nas Settings (campo aditivo)', () => {
  it('desligada por padrão', () => {
    expect((DEFAULT_SETTINGS as WithCurve).highCurveCamera).toBe(false);
    expect((sanitizeSettings({}) as WithCurve).highCurveCamera).toBe(false);
  });

  it('opções de antes (fixture literal da 0.1.7, sem o campo) abrem iguais, com a opção desligada', () => {
    const antigo = '{"language":"en","masterVolume":0.3,"quality":"medium","seatCameras":["low","hood","bumper","high"],"reduceEffects":true,"cartoonEffects":true,"lockFps30":true,"assistOfferDeclined":true}';
    const s = sanitizeSettings(JSON.parse(antigo)) as WithCurve;
    expect(s.highCurveCamera).toBe(false);
    expect(s).toMatchObject({ language: 'en', masterVolume: 0.3, quality: 'medium', seatCameras: ['low', 'hood', 'bumper', 'high'], reduceEffects: true, cartoonEffects: true, lockFps30: true, assistOfferDeclined: true });
  });

  it('lembra true/false; lixo vira desligado; é o único campo a mais que o saneador devolve', () => {
    expect((sanitizeSettings({ highCurveCamera: true }) as WithCurve).highCurveCamera).toBe(true);
    expect((sanitizeSettings({ highCurveCamera: false }) as WithCurve).highCurveCamera).toBe(false);
    for (const bad of ['true', 1, null, [], {}]) expect((sanitizeSettings({ highCurveCamera: bad }) as WithCurve).highCurveCamera).toBe(false);
    const keys = Object.keys(sanitizeSettings({}));
    expect(keys).toContain('highCurveCamera');
    // a 0.1.7 devolvia estas (sem `autoQuality`, que só vem na 1ª abertura): nenhuma sumiu e só uma entrou (V9: `heroCars` é o campo seguinte, de propósito; tests/heroi-ajuste.test.ts)
    const da0_1_7 = ['language', 'masterVolume', 'musicVolume', 'sfxVolume', 'fullscreen', 'quality', 'renderStyle', 'showMinimap', 'screenShake', 'difficulty', 'manualGear', 'assists',
      'totalCars', 'quickLaps', 'music', 'telemetryConsent', 'controls', 'vibration', 'serverUrl', 'ghost', 'seatAssists', 'colorPalette', 'hudScale', 'largeText', 'reduceEffects',
      'cartoonEffects', 'landmarkCaptions', 'lockFps30', 'seatCameras', 'assistOfferDeclined'];
    expect(keys.filter((k) => !da0_1_7.includes(k))).toEqual(['highCurveCamera', 'heroCars']);
  });
});

describe('a pose escolhida pela opção', () => {
  it('cameraPoseFor(mode, true) dá a candidata só na Alta; sem o segundo argumento vale o interruptor do harness (desligado)', () => {
    const pose = B.cameraPoseFor as (m: B.CameraMode, curve?: boolean) => B.CameraPose;
    expect(pose('high', true)).toBe(B.CAMERA_HIGH_CURVE);
    expect(pose('high', false)).toBe(B.CAMERA_POSES.high);
    expect(pose('high')).toBe(B.CAMERA_POSES.high);
    for (const m of ['low', 'hood', 'bumper'] as const) { expect(pose(m, true)).toBe(B.CAMERA_POSES[m]); expect(pose(m, false)).toBe(B.CAMERA_POSES[m]); }
  });

  it('a Alta aprovada e as outras três continuam como estão (trava)', () => {
    expect(B.CAMERA_POSES.high).toEqual({ baseFov: 54, speedFov: 8, nitroFov: 5, height: 2.5, back: 5.8, lookAhead: 18, lookY: 0.7 });
    expect(B.CAMERA_POSES.low).toEqual({ baseFov: 62, speedFov: 13, nitroFov: 8, height: 2.05, back: 7.8, lookAhead: 18, lookY: 0.85 });
    expect(B.CAMERA_POSES.hood).toEqual({ baseFov: 72, speedFov: 9, nitroFov: 6, height: 1.35, back: 0, lookAhead: 30, lookY: 1.0 });
    expect(B.CAMERA_POSES.bumper).toEqual({ baseFov: 78, speedFov: 11, nitroFov: 7, height: 0.42, back: -1.9, lookAhead: 30, lookY: 0.55 });
    expect(B.CAMERA_HIGH_CURVE).toEqual({ baseFov: 54, speedFov: 8, nitroFov: 5, height: 3.4, back: 6.8, lookAhead: 30, lookY: 0.5 });
  });
});

describe('o que o renderizador entrega à câmera', () => {
  function cena() {
    const { state, track: tr } = quickRace({ humans: [human(0)], totalCars: 6 });
    state.phase = 'racing';
    const frame = { state, track: tr, viewports: [], options: { quality: 'high', showMinimap: false, screenShake: true, reduceEffects: false, palette: 'default' }, time: 0, paused: false, coop: false, showHud: false } as unknown as RenderFrame;
    return { frame, idx: state.cars.findIndex((c) => c.seat === 0) };
  }

  it('a opção do quadro chega ao extra (`curve`); sem ela, desligado', () => {
    const { frame, idx } = cena();
    expect((cameraExtraFor(frame, idx) as CameraExtra & { curve?: boolean }).curve).toBe(false);
    (frame.options as { highCurveCamera?: boolean }).highCurveCamera = true;
    expect((cameraExtraFor(frame, idx) as CameraExtra & { curve?: boolean }).curve).toBe(true);
  });
});

describe('a ChaseCamera com a opção', () => {
  it('ligada, a Alta sobe a 3,4 m e recua a 6,8 m; desligada, 2,5 m e 5,8 m (a de hoje); o FOV é o mesmo', () => {
    const off = settle('high', extra()); const on = settle('high', extra({ curve: true } as Partial<CameraExtra>));
    expect(off.y).toBeCloseTo(2.5, 3); expect(off.z).toBeCloseTo(5.8, 3);
    expect(on.y).toBeCloseTo(3.4, 3); expect(on.z).toBeCloseTo(6.8, 3);
    expect(on.fov).toBeCloseTo(off.fov, 6);
  });

  it('Baixa, Capô e Frente ficam idênticos com a opção ligada', () => {
    const eye = { x: 0, y: 1.35, z: 0.2 };
    for (const m of ['low', 'hood', 'bumper'] as const) {
      expect(settle(m, extra({ curve: true } as Partial<CameraExtra>), eye), m).toEqual(settle(m, extra(), eye));
    }
  });
});

// A sessão entrega a opção ao renderizador (RenderOptions) e a câmera Alta é a escolha do assento; o Retrô e as outras câmeras não a leem.
describe('a sessão passa a opção ao quadro', () => {
  let session: Session;
  beforeEach(() => {
    captured.length = 0;
    vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener: () => undefined, removeEventListener: () => undefined, navigator: { getGamepads: () => [null, null, null, null] } });
    session = createSession({} as HTMLCanvasElement, {} as HTMLElement, {} as HTMLElement);
  });
  afterEach(() => { session.input.dispose(); vi.unstubAllGlobals(); });

  it('desligada por padrão; ligada nas Settings, o quadro leva `highCurveCamera: true`', () => {
    session.startQuick('copacabana', 2, [human(0)], true);
    session.debugStep(60 * 2);
    session.frame(2000); session.frame(2020);
    expect((captured.at(-1)?.options as { highCurveCamera?: boolean } | undefined)?.highCurveCamera).toBeFalsy();
    (session.settings as WithCurve).highCurveCamera = true;
    session.frame(2040);
    expect((captured.at(-1)?.options as { highCurveCamera?: boolean } | undefined)?.highCurveCamera).toBe(true);
  });
});

// A linha na tela de Acessibilidade (DOM falso), PT e EN, ao lado das câmeras por assento.
describe('Opções › Acessibilidade', () => {
  const lang = getLanguage();
  beforeEach(() => { installDocument(); });
  afterEach(() => { vi.unstubAllGlobals(); setLanguage(lang); });

  function abre() {
    const settings = { ...DEFAULT_SETTINGS, seatCameras: [...DEFAULT_SETTINGS.seatCameras] } as WithCurve;
    const emitted: unknown[] = [];
    const api = {
      ctx: { settings, audio: { musicList: () => [] } }, lobby: {}, go: () => undefined, back: () => undefined, emit: (e: unknown) => emitted.push(e), sfx: () => undefined, refresh: () => undefined,
    };
    const scr = accessScreen(api as unknown as Parameters<typeof accessScreen>[0]);
    return { settings, scr, emitted };
  }
  const rowOf = (root: unknown, label: string): FakeEl | undefined => all(root, (e) => e.className.split(/\s+/).includes('sel')).find((e) => text(e).startsWith(label));

  it('existe um seletor "Alta em curva" que liga e desliga a opção e mostra Ligado/Desligado', () => {
    const { settings, scr, emitted } = abre();
    const row = rowOf(scr.el, t('access.options.highCurve'));
    expect(row, 'linha da opção').toBeDefined();
    if (!row) return;
    expect(text(row)).toContain(t('ui.common.off'));
    const next = all(row, (e) => e.className.split(/\s+/).includes('next'))[0];
    next.listeners.click[0]({ stopPropagation: () => undefined });
    expect(settings.highCurveCamera).toBe(true);
    expect(text(row)).toContain(t('ui.common.on'));
    expect(emitted.length).toBeGreaterThan(0);
  });

  it('o texto existe em PT e EN (rótulo e explicação), sem chave crua', () => {
    for (const l of ['pt', 'en'] as const) {
      setLanguage(l);
      for (const k of ['access.options.highCurve', 'access.desc.highCurve']) {
        expect(t(k), `${l} ${k}`).not.toBe(k);
        expect(t(k).length).toBeGreaterThan(6);
      }
    }
    setLanguage('pt');
    expect(t('access.options.highCurve')).not.toBe((setLanguage('en'), t('access.options.highCurve')));
  });
});
