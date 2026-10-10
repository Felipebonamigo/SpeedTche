// N4, o resultado em sequência (docs/ondas/N/N4.md §4.3 e §5): a tabela de 20 linhas recolhida em top 3 mais a sua, o pódio 3D, a
// sequência que anda sozinha, o confirmar engolido enquanto ela anda, o pulo e a passagem ao Pagamento. DOM falso; o relógio
// (post-race.ts), o palco (stage-bus.ts) e a carreira são os de verdade.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginCareerCup, newCareer, settleCareerRace } from '../src/core/career';
import { POINTS_TABLE } from '../src/core/constants';
import { CARS } from '../src/core/data/cars';
import { CUPS } from '../src/core/data/cups';
import { AI_TEAM_ID_BASE } from '../src/core/data/drivers';
import { TRACKS, trackDef } from '../src/core/track/tracks';
import type { HumanEntry, RaceResultRow } from '../src/core/types';
import { DEFAULT_SETTINGS, type DeviceId, type MenuNav, type RaceMode, type ResultsScreenData, type SaveData, type Settings, type UiSound } from '../src/game/contracts';
import { paintColors } from '../src/game/paints';
import { sequenceFor, POST_STEP_SECONDS } from '../src/game/post-race';
import { sanitizeSave } from '../src/game/save';
import { setLanguage, t } from '../src/i18n';
import { stageBus } from '../src/render/stage-bus';
import '../src/ui/strings';
import type { ScreenApi, ScreenInstance } from '../src/ui/screens/common';
import { resultsScreen } from '../src/ui/screens/results';
import { all, fakeInput, hasClass, installDocument, NAV, text, type FakeEl, type FakeGamepad } from './ui-fake';
import { human } from './helpers';

void TRACKS;

/** 20 carros; cada humano na posição dada (a IA preenche o resto). */
function fakeResults(positions: Record<number, number>, humans: HumanEntry[], total = 20): RaceResultRow[] {
  const rows: RaceResultRow[] = [];
  const taken = Object.values(positions);
  for (const h of humans) {
    const p = positions[h.seat];
    rows.push({ carId: 100 + h.seat, seat: h.seat, name: h.name, teamId: h.teamId, carDefId: h.carId, position: p, finished: true, totalTicks: 9000, bestLapTicks: 3000, points: POINTS_TABLE[p - 1] ?? 0 });
  }
  let ai = 0;
  for (let p = 1; p <= total; p++) {
    if (taken.includes(p)) continue;
    rows.push({ carId: ai, seat: -1, name: `IA${ai}`, teamId: AI_TEAM_ID_BASE + Math.floor(ai / 2), carDefId: 'falcao', position: p, finished: true, totalTicks: 9000 + p, bestLapTicks: 3000, points: POINTS_TABLE[p - 1] ?? 0 });
    ai++;
  }
  return rows.sort((a, b) => a.position - b.position);
}

interface Rig {
  data: ResultsScreenData; screen: ScreenInstance; api: ScreenApi; went: Array<{ screen: string; data: unknown }>; events: Array<{ type: string }>;
  sounds: UiSound[]; save: SaveData; remount(): ScreenInstance;
}

interface RigOpts {
  mode?: RaceMode;
  positions?: Record<number, number>;
  humans?: number;
  coop?: boolean;
  settings?: Partial<Settings>;
  pads?: FakeGamepad[];
  paint?: string;
}

function rig(o: RigOpts = {}): Rig {
  const mode = o.mode ?? 'quick';
  const n = o.humans ?? 1;
  const humans = Array.from({ length: n }, (_, i) => ({ ...human(i, o.coop ? 0 : i, ['falcao', 'trovao', 'tornado', 'camelo'][i]), ...(o.paint && i === 0 ? { paint: o.paint } : {}) }));
  const positions = o.positions ?? Object.fromEntries(humans.map((h, i) => [h.seat, 14 + i]));
  const results = fakeResults(positions, humans);
  const save = sanitizeSave({});
  let champ = null;
  if (mode === 'career') {
    const career = newCareer(humans);
    beginCareerCup(career, 3);
    champ = settleCareerRace(career, results).champ;
    save.career = career;
  }
  const data: ResultsScreenData = { mode, trackDef: trackDef('copacabana'), results, humans, champ, newRecords: [] };
  const settings: Settings = { ...DEFAULT_SETTINGS, seatAssists: [...DEFAULT_SETTINGS.seatAssists], ...o.settings };
  const bound: Array<DeviceId | null> = ['kb1', 'kb2', 'gp0', 'gp1'].slice(0, Math.max(1, n)) as DeviceId[];
  const went: Rig['went'] = []; const events: Rig['events'] = []; const sounds: UiSound[] = [];
  const api = {
    ctx: { cars: CARS, save, settings, input: fakeInput(bound, o.pads), cups: CUPS, tracks: [], isCupUnlocked: () => true },
    lobby: { mode, versus: false, seats: [null, null, null, null] },
    go: (screen: string, d?: unknown) => { went.push({ screen, data: d }); }, back: () => undefined,
    emit: (e: { type: string }) => { events.push(e); }, sfx: (k: UiSound) => { sounds.push(k); }, refresh: () => undefined,
  } as unknown as ScreenApi;
  const screen = resultsScreen(api, data);
  return { data, screen, api, went, events, sounds, save, remount: () => resultsScreen(api, data) };
}

const press = (r: Rig, key: keyof MenuNav, device: DeviceId = 'kb1'): void => r.screen.nav({ ...NAV, [key]: true, device });
function run(r: Rig, seconds: number): void { for (let t0 = 0; t0 < seconds - 1e-9; t0 += 1 / 30) r.screen.update?.(1 / 30); }
const bodyRows = (r: Rig): FakeEl[] => all(all(r.screen.el, (e) => e.tag === 'tbody')[0], (e) => e.tag === 'tr');
const actions = (r: Rig): FakeEl[] => all(all(r.screen.el, hasClass('actions'))[0], (e) => e.tag === 'button');
const ready = (r: Rig): string | null => r.screen.el.getAttribute('data-post-ready');
const curtain = (r: Rig): FakeEl | undefined => all(r.screen.el, hasClass('results-podium-curtain'))[0];

beforeEach(() => { stageBus.clear(); setLanguage('pt'); installDocument(); });
afterEach(() => { stageBus.clear(); vi.unstubAllGlobals(); setLanguage('pt'); });

describe('a tabela recolhida', () => {
  it('corrida rápida: top 3 mais a linha do humano (4 linhas); "VER TODOS (20)" é o último item e o botão principal segue sendo o primeiro foco', () => {
    const r = rig({ positions: { 0: 14 } });
    expect(bodyRows(r)).toHaveLength(4);
    expect(bodyRows(r).map((row) => text(row.children[0]))).toEqual(['', '', '', '14']); // medalhas SVG nas 3 primeiras
    const labels = actions(r).map(text);
    expect(labels[0]).toBe(t('ui.results.again'));
    expect(labels[labels.length - 1]).toBe(t('ui.results.showAll', { n: 20 }));
    expect(actions(r)[0].classList.contains('focus')).toBe(true);
  });
  it('humano no pódio: só as 3 linhas, sem duplicar', () => {
    const r = rig({ positions: { 0: 2 } });
    expect(bodyRows(r)).toHaveLength(3);
  });
  it('co-op com 2 humanos fora do pódio: top 3 e as duas linhas deles', () => {
    const r = rig({ humans: 2, coop: true, positions: { 0: 9, 1: 15 } });
    expect(bodyRows(r)).toHaveLength(5);
  });
  it('VER TODOS abre as 20 linhas (e o pódio some); VER O TOPO recolhe de novo', () => {
    const r = rig({ positions: { 0: 14 } });
    const toggle = actions(r)[actions(r).length - 1];
    toggle.click();
    expect(bodyRows(r)).toHaveLength(20);
    expect(text(toggle)).toBe(t('ui.results.showTop'));
    expect(r.screen.el.classList.contains('expanded')).toBe(true);
    toggle.click();
    expect(bodyRows(r)).toHaveLength(4);
    expect(text(toggle)).toBe(t('ui.results.showAll', { n: 20 }));
    expect(r.screen.el.classList.contains('expanded')).toBe(false);
  });
  it('contra-relógio e festa ficam como eram: a tabela inteira, sem sequência e sem "VER TODOS"', () => {
    for (const mode of ['timetrial', 'tournament'] as RaceMode[]) {
      const r = rig({ mode, positions: { 0: 14 } });
      expect(bodyRows(r)).toHaveLength(20);
      expect(ready(r)).toBe('1');
      expect(actions(r).map(text)).not.toContain(t('ui.results.showAll', { n: 20 }));
      expect(all(r.screen.el, hasClass('results-skip'))).toHaveLength(0);
      expect(stageBus.all()).toHaveLength(0);
    }
  });
});

describe('o pódio 3D', () => {
  it('3D: um painel "results:podium" no registro com os três primeiros (carro e pintura do humano); sair da tela o solta', () => {
    const r = rig({ positions: { 0: 2 }, paint: 'rubi' });
    const p = stageBus.panel('results:podium');
    expect(p.kind).toBe('podium');
    expect(p.podium.map((e) => e.place)).toEqual([1, 2, 3]);
    expect(p.podium[1].carId).toBe('falcao'); // o humano (Falcão) em 2º
    expect(p.podium[1].paint).toEqual(paintColors('rubi'));
    expect(p.podium[0].paint).toBeNull(); // a IA corre com a pintura de fábrica
    expect(stageBus.all()).toHaveLength(1);
    r.screen.destroy?.();
    expect(stageBus.all()).toHaveLength(0);
  });
  it('Retrô: sem janela, sem painel e sem cortina; a tabela segue recolhida', () => {
    const r = rig({ settings: { renderStyle: 'retro' } });
    expect(stageBus.all()).toHaveLength(0);
    expect(all(r.screen.el, hasClass('results-podium'))).toHaveLength(0);
    expect(bodyRows(r)).toHaveLength(4);
    expect(r.screen.el.classList.contains('stage3d')).toBe(false);
  });
  it('a qualidade das Opções e o "reduzir efeitos" vão para o painel', () => {
    rig({ settings: { quality: 'ultra', reduceEffects: true } });
    const p = stageBus.panel('results:podium');
    expect(p.quality).toBe('ultra');
    expect(p.reduceEffects).toBe(true);
  });
  it('a cortina cobre a janela na chegada e abre quando o pódio entra; pulando, já abre', () => {
    const r = rig();
    expect(curtain(r)?.classList.contains('up')).toBe(true);
    run(r, POST_STEP_SECONDS.arrival + 0.3);
    expect(r.screen.el.getAttribute('data-post-step')).toBe('podium');
    expect(curtain(r)?.classList.contains('up')).toBe(false);
    const skipped = rig();
    skipped.screen.nav({ ...NAV, start: true, device: 'kb1' });
    expect(curtain(skipped)?.classList.contains('up')).toBe(false);
  });
});

describe('a sequência do resultado', () => {
  it('anda sozinha: chegada, pódio, pronta em chegada + pódio (5,5 s) — e para ali, sem largar nada', () => {
    const r = rig();
    expect(ready(r)).toBe('0');
    expect(r.screen.el.getAttribute('data-post-step')).toBe('arrival');
    run(r, POST_STEP_SECONDS.arrival + POST_STEP_SECONDS.podium - 0.2);
    expect(ready(r)).toBe('0');
    run(r, 0.5);
    expect(ready(r)).toBe('1');
    run(r, 20);
    expect(r.events).toEqual([]);
    expect(r.went).toEqual([]);
  });
  it('o confirmar solto com a sequência andando é engolido; pronta, "MAIS UMA" larga a próxima pista', () => {
    const r = rig();
    press(r, 'confirm');
    run(r, 1);
    press(r, 'confirm');
    expect(r.events).toEqual([]);
    run(r, 6);
    press(r, 'confirm');
    expect(r.events.map((e) => e.type)).toEqual(['startQuick']);
  });
  it('as setas continuam andando o foco enquanto a sequência anda', () => {
    const r = rig();
    press(r, 'down');
    expect(actions(r)[1].classList.contains('focus')).toBe(true);
  });
  it('o clique do mouse ativa a qualquer hora', () => {
    const r = rig();
    actions(r)[0].click();
    expect(r.events.map((e) => e.type)).toEqual(['startQuick']);
  });
  it('Enter segurado (a repetição vira "start") pula tudo: pronta na hora', () => {
    const r = rig();
    press(r, 'start');
    expect(ready(r)).toBe('1');
    press(r, 'confirm');
    expect(r.events.map((e) => e.type)).toEqual(['startQuick']);
  });
  it('o A do controle segurado por 0,45 s (visto solto antes) pula; já preso na chegada, não', () => {
    const pad: FakeGamepad = { id: 'gp0', buttons: [0] };
    const stuck = rig({ pads: [pad] });
    run(stuck, 1.5);
    expect(ready(stuck)).toBe('0');
    const pad2: FakeGamepad = { id: 'gp0', buttons: [] };
    const r = rig({ pads: [pad2] });
    run(r, 0.2);
    pad2.buttons = [0];
    run(r, 0.3);
    expect(ready(r)).toBe('0');
    run(r, 0.3);
    expect(ready(r)).toBe('1');
  });
  it('a dica "Segure A ou Enter para pular" some quando a sequência acaba', () => {
    const r = rig();
    const hint = all(r.screen.el, hasClass('results-skip'))[0];
    expect(text(hint)).toBe(t('ui.results.skip'));
    expect(hint.classList.contains('done')).toBe(false);
    run(r, 8);
    expect(hint.classList.contains('done')).toBe(true);
  });
  it('os botões ficam "pendentes" (esmaecidos) enquanto a sequência anda e voltam ao normal no fim', () => {
    const r = rig();
    expect(actions(r)[0].classList.contains('pending')).toBe(true);
    run(r, 8);
    expect(actions(r)[0].classList.contains('pending')).toBe(false);
  });
  it('remontar a tela (idioma, VOLTAR) com os mesmos dados não reinicia o relógio', () => {
    const r = rig();
    run(r, 3);
    const again = r.remount();
    expect(again.el.getAttribute('data-post-step')).toBe('podium');
    expect(sequenceFor(r.data, () => []).elapsed).toBeGreaterThan(2.9);
  });
});

describe('carreira: o Pagamento fecha a sequência', () => {
  it('a sequência tem três passos e, ao chegar no pagamento, abre a tela dele uma única vez, com os mesmos dados', () => {
    const r = rig({ mode: 'career', positions: { 0: 3 } });
    expect(sequenceFor(r.data, () => []).plan).toEqual(['arrival', 'podium', 'payout']);
    run(r, POST_STEP_SECONDS.arrival + POST_STEP_SECONDS.podium - 0.3);
    expect(r.went).toEqual([]);
    run(r, 0.6);
    expect(r.went).toHaveLength(1);
    expect(r.went[0].screen).toBe('payout');
    expect(r.went[0].data).toBe(r.data);
    run(r, 2);
    expect(r.went).toHaveLength(1);
  });
  it('pular (Enter segurado) leva direto ao Pagamento, uma vez só', () => {
    const r = rig({ mode: 'career', positions: { 0: 3 } });
    press(r, 'start');
    expect(r.went.map((w) => w.screen)).toEqual(['payout']);
    press(r, 'start');
    expect(r.went).toHaveLength(1);
  });
  it('voltando do Pagamento (sequência pronta) o resultado não reabre o Pagamento e mostra a classificação como botão principal', () => {
    const r = rig({ mode: 'career', positions: { 0: 3 } });
    sequenceFor(r.data, () => []).skip();
    const back = r.remount();
    back.update?.(0.1);
    back.update?.(0.1);
    expect(r.went).toEqual([]);
    const primary = all(back.el, (e) => e.tag === 'button')[0];
    expect(text(primary)).toBe(t('ui.results.standings'));
    expect(back.el.getAttribute('data-post-ready')).toBe('1');
  });
  it('copa normal (sem dinheiro): a sequência é só chegada e pódio, e nunca abre o Pagamento', () => {
    const r = rig({ mode: 'cup', positions: { 0: 5 } });
    expect(sequenceFor(r.data, () => []).plan).toEqual(['arrival', 'podium']);
    run(r, 10);
    expect(r.went).toEqual([]);
  });
});
