// Tela de Acessibilidade (Opções › Acessibilidade): cores dos jogadores, tamanho do HUD, legenda dos marcos, texto
// grande, reduzir efeitos, a Alta em curva (V12), efeitos de cartum, tremor de tela e a direção assistida de cada assento, com a explicação do item em foco.
// "Efeitos de cartum" (V8, docs/ondas/V8-efeitos.md) entra na coluna Visão, ao lado de "Reduzir efeitos": ela fica com 7 linhas e as amostras de cor,
// abaixo das 9 da coluna de direção (as colunas das Opções já têm as 10 que cabem).
// A legenda dos marcos mora aqui, ao lado do tamanho do HUD: as duas colunas das Opções já têm as dez linhas que cabem.
// Tela própria porque a de Opções já ocupa 1280×720 inteira: uma terceira coluna lá cortava os rótulos.
import { COLOR_PALETTES, seatColor } from '../core/data/drivers';
import { ASSIST_LEVELS } from '../core/sim/assist';
import { cameraName } from '../game/camera-switch';
import { HUD_SCALE_MAX, HUD_SCALE_MIN } from '../game/settings';
import { CAMERA_MODES, DEFAULT_CAMERA_MODE, pickCameraMode } from '../render/camera-base';
import { t } from '../i18n';
import { button, createFocusList, h, listNav, onOff, screenFrame, selector, type FocusItem, type ScreenApi, type ScreenInstance, type Selector } from '../ui/screens/common';
import { commitSettings, fps30Selector, heroCarsSelector, percent } from '../ui/screens/options';
import '../render/caption/strings';
import './access.css';
import './strings';

const SEATS = 4;

function cycle<T>(list: readonly T[], current: T, dir: -1 | 1): T {
  const i = list.indexOf(current);
  return list[(i + dir + list.length) % list.length];
}

/** Item da coluna de corrida das Opções que abre esta tela. */
export function accessEntry(api: ScreenApi): FocusItem {
  const el = h('div', { class: 'sel sel-action sel-access', attrs: { 'data-item': 'accessibility' } },
    h('span', { class: 'sel-label', text: t('access.options.title') }),
    h('span', { class: 'sel-box' }, h('span', { class: 'sel-value', text: t('access.options.open') })),
  );
  return { el, activate: () => api.go('access') };
}

export function accessScreen(api: ScreenApi): ScreenInstance {
  const s = api.ctx.settings;
  const sfx = api.sfx;
  const commit = () => commitSettings(api);
  const swatches = h('div', { class: 'access-swatches', attrs: { 'aria-hidden': 'true' } });
  const seatRows: Selector[] = [];
  const paint = () => {
    swatches.replaceChildren(...Array.from({ length: SEATS }, (_, i) => h('span', { class: 'access-swatch', style: `--seat:${seatColor(i, s.colorPalette)}`, text: `P${i + 1}` })));
    seatRows.forEach((row, i) => row.el.style.setProperty('--seat', seatColor(i, s.colorPalette)));
  };

  // "Alta em curva" (V12): a Alta sobe a 3,4 m e recua a 6,8 m (CAMERA_HIGH_CURVE). Global, não por assento: cabe numa linha só (a coluna da direita já estava cheia: ela entra na da esquerda, com as de visão).
  const highCurve = {
    item: selector(t('access.options.highCurve'), () => onOff(s.highCurveCamera === true), () => { s.highCurveCamera = !s.highCurveCamera; commit(); }, { sfx }),
    desc: () => t('access.desc.highCurve'),
  };
  const vision: Array<{ item: Selector; desc: () => string }> = [
    { item: selector(t('access.options.palette'), () => t(`access.palette.${s.colorPalette}`), (d) => { s.colorPalette = cycle(COLOR_PALETTES, s.colorPalette, d); commit(); paint(); }, { sfx }), desc: () => t(`access.desc.palette.${s.colorPalette}`) },
    { item: selector(t('access.options.hudScale'), () => percent(s.hudScale), (d) => { s.hudScale = Math.round(Math.min(HUD_SCALE_MAX, Math.max(HUD_SCALE_MIN, s.hudScale + d * 0.1)) * 10) / 10; commit(); }, { sfx }), desc: () => t('access.desc.hudScale') },
    { item: selector(t('caption.option'), () => onOff(s.landmarkCaptions), () => { s.landmarkCaptions = !s.landmarkCaptions; commit(); }, { sfx }), desc: () => t('caption.desc') },
    { item: selector(t('access.options.largeText'), () => onOff(s.largeText), () => { s.largeText = !s.largeText; commit(); }, { sfx }), desc: () => t('access.desc.largeText') },
    { item: selector(t('access.options.reduceEffects'), () => onOff(s.reduceEffects), () => { s.reduceEffects = !s.reduceEffects; commit(); }, { sfx }), desc: () => t('access.desc.reduceEffects') },
    { item: selector(t('access.options.cartoon'), () => onOff(s.cartoonEffects), () => { s.cartoonEffects = !s.cartoonEffects; commit(); }, { sfx }), desc: () => t('access.desc.cartoon') },
    { item: selector(t('ui.options.shake'), () => onOff(s.screenShake), () => { s.screenShake = !s.screenShake; commit(); }, { sfx }), desc: () => t('access.desc.shake') },
    highCurve,
  ];
  // A sessão troca o array a cada mudança de opções: sempre lido de s.seatAssists na hora.
  const levelOf = (seat: number) => s.seatAssists[seat] ?? 'none';
  const driving = Array.from({ length: SEATS }, (_, seat) => {
    const item = selector(t('access.options.seatAssist', { n: seat + 1 }), () => t(`access.level.${levelOf(seat)}`), (d) => {
      s.seatAssists[seat] = cycle(ASSIST_LEVELS, levelOf(seat), d);
      commit();
    }, { sfx, cls: 'sel-seat' });
    seatRows.push(item);
    return { item, desc: () => `${t(`access.desc.level.${levelOf(seat)}`)} ${levelOf(seat) === 'none' ? '' : t('access.desc.override')}`.trim() };
  });
  // A câmera de cada assento (nc/cameras): a padrão de quem joga, a mesma que a tecla de câmera troca em corrida (ação `camera`).
  const cameraOf = (seat: number) => pickCameraMode(s.seatCameras?.[seat], DEFAULT_CAMERA_MODE);
  const cameras = Array.from({ length: SEATS }, (_, seat) => {
    const item = selector(t('access.options.seatCamera', { n: seat + 1 }), () => cameraName(cameraOf(seat)), (d) => {
      if (!Array.isArray(s.seatCameras)) s.seatCameras = [DEFAULT_CAMERA_MODE, DEFAULT_CAMERA_MODE, DEFAULT_CAMERA_MODE, DEFAULT_CAMERA_MODE];
      s.seatCameras[seat] = cycle(CAMERA_MODES, cameraOf(seat), d);
      commit();
    }, { sfx, cls: 'sel-seat' });
    seatRows.push(item);
    return { item, desc: () => t(`access.desc.camera.${cameraOf(seat)}`) };
  });
  paint();

  const back = button(t('ui.common.back'), () => api.back());
  // 30 fps travados na Média com 3-4 jogadores (L2b): as colunas das Opções já têm as dez linhas que cabem (docs/TELAS.md); aqui a coluna de
  // direção é a mais curta, então a linha entra nela sem crescer a tela.
  const perf = { item: fps30Selector(api, commit), desc: () => t('ui.options.fps30.hint') };
  // Carros em alta definição (V9): a mesma razão — a linha entra na coluna de direção, abaixo do 30 fps (ela passa a ter 10 linhas, as que cabem).
  const hero = { item: heroCarsSelector(api, commit), desc: () => t('ui.options.heroCars.hint') };
  const entries = [...vision, ...driving, ...cameras, perf, hero];
  const list = createFocusList([...entries.map((e) => e.item), back], { sfx });
  const desc = h('p', { class: 'access-desc glass', attrs: { 'aria-live': 'polite' } });
  let shown = '';
  const refreshDesc = () => {
    const text = entries[list.index]?.desc() ?? t('access.desc.intro');
    if (text !== shown) { shown = text; desc.textContent = text; }
  };
  refreshDesc();

  const el = screenFrame('access', t('access.options.title'),
    h('div', { class: 'options-columns access-columns' },
      h('div', { class: 'options-col' }, h('h2', { class: 'sub-title', text: t('access.options.vision') }), vision[0].item.el, swatches, vision.slice(1).map((v) => v.item.el)),
      h('div', { class: 'options-col' }, h('h2', { class: 'sub-title', text: t('access.options.driving') }), driving.map((d) => d.item.el), cameras.map((c) => c.item.el), perf.item.el, hero.item.el),
    ),
    desc,
    h('div', { class: 'access-actions' }, back.el),
  );
  return {
    el,
    nav: (nav) => { listNav(list, nav, sfx, () => api.back()); refreshDesc(); },
    // Foco pelo mouse também troca a explicação.
    update: () => refreshDesc(),
  };
}
