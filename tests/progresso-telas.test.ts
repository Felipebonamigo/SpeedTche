// O5 (docs/ondas/O/O5.md §4.7): a aba "Nível" dos Recordes (nível, título, moldura e a maestria dos 14 carros, por perfil) e a faixa de
// progresso do resultado (o que a corrida rendeu a cada humano local). DOM falso (tests/ui-fake.ts); as contas são as de progression.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARS } from '../src/core/data/cars';
import { CUPS } from '../src/core/data/cups';
import { trackDef } from '../src/core/track/tracks';
import { DEFAULT_SETTINGS, type ResultsScreenData, type Settings } from '../src/game/contracts';
import type { ProgressData, ProgressNews } from '../src/game/progression';
import { sanitizeSave } from '../src/game/save';
import { emptyPlayerStats } from '../src/game/stats';
import { setLanguage } from '../src/i18n';
import '../src/ui/strings';
import type { ScreenApi } from '../src/ui/screens/common';
import { recordsScreen } from '../src/ui/screens/info';
import { resultsScreen } from '../src/ui/screens/results';
import { all, fakeInput, hasClass, installDocument, NAV, text } from './ui-fake';
import { human } from './helpers';

beforeEach(() => { installDocument(); setLanguage('pt'); });
afterEach(() => { vi.unstubAllGlobals(); setLanguage('pt'); });

function ctxApi(save = sanitizeSave({}), progress?: ProgressData): ScreenApi {
  const settings: Settings = { ...DEFAULT_SETTINGS, seatAssists: [...DEFAULT_SETTINGS.seatAssists] };
  return {
    ctx: { cars: CARS, save, settings, input: fakeInput(['kb1', null, null, null]), cups: CUPS, tracks: [], isCupUnlocked: () => true, progress },
    lobby: { mode: 'quick', versus: false, seats: [null, null, null, null] },
    go: () => undefined, back: () => undefined, emit: () => undefined, sfx: () => undefined, refresh: () => undefined,
  } as unknown as ScreenApi;
}

describe('Recordes › Nível', () => {
  function screenWithProfiles() {
    const save = sanitizeSave({});
    // Ana: 9 corridas, 27 voltas, 4 pódios, 2 vitórias = 590 XP (nível 5, moldura de bronze); Bia: nunca subiu (nível 1).
    save.stats.players.push({ name: 'Ana', ...emptyPlayerStats(), races: 9, laps: 27, podiums: 4, wins: 2 });
    save.stats.players.push({ name: 'Bia', ...emptyPlayerStats(), races: 1, laps: 1 });
    const progress: ProgressData = { profiles: [{ name: 'Ana', cars: { falcao: 400, beijaflor: 2200 } }] };
    const screen = recordsScreen(ctxApi(save, progress));
    return { screen, save };
  }
  const toLevelTab = (screen: ReturnType<typeof recordsScreen>) => { for (let i = 0; i < 3; i++) screen.nav({ ...NAV, right: true, device: 'kb1' }); };

  it('a 4ª aba é "Nível"', () => {
    const { screen } = screenWithProfiles();
    const tabs = all(screen.el, hasClass('rec-tab'));
    expect(tabs).toHaveLength(4);
    expect(text(tabs[3])).toBe('Nível');
  });

  it('um perfil por linha (os das estatísticas); o detalhe mostra nível, título, moldura e a barra de XP', () => {
    const { screen } = screenWithProfiles();
    toLevelTab(screen);
    const rows = all(screen.el, hasClass('lvl-row'));
    expect(rows.map((r) => r.getAttribute('data-name'))).toEqual(['Ana', 'Bia']);
    expect(text(rows[0])).toContain('Nível 5');
    const head = all(screen.el, hasClass('lvl-head'))[0];
    expect(text(head)).toContain('Ana');
    expect(text(head)).toContain('Nível 5');
    expect(text(head)).toContain('Piloto'); // título do nível 4
    expect(text(head)).toContain('40 / 200 XP'); // 590 − 550, de 200 (do 5 ao 6: 100 + 25·4)
    expect(all(head, (e) => e.getAttribute('data-frame') === 'bronze')).toHaveLength(1);
    expect(text(head)).toContain('Próximo título: Ás do volante (nível 8)');
  });

  it('a maestria dos 14 carros, com o próximo prêmio de cada um', () => {
    const { screen } = screenWithProfiles();
    toLevelTab(screen);
    const rows = all(screen.el, hasClass('mastery-row'));
    expect(rows.map((r) => r.getAttribute('data-car'))).toEqual(CARS.map((c) => c.id));
    const falcao = rows.find((r) => r.getAttribute('data-car') === 'falcao')!;
    expect(falcao.getAttribute('data-mastery')).toBe('2');
    expect(text(falcao)).toContain('Maestria 3: Acabamento cromado');
    const beija = rows.find((r) => r.getAttribute('data-car') === 'beijaflor')!;
    expect(beija.getAttribute('data-mastery')).toBe('5');
    expect(text(beija)).toContain('Tudo liberado');
    expect(text(rows.find((r) => r.getAttribute('data-car') === 'saci')!)).toContain('Maestria 1: Aro dourado');
  });

  it('descer da lista para outro perfil troca o detalhe', () => {
    const { screen } = screenWithProfiles();
    toLevelTab(screen);
    screen.nav({ ...NAV, down: true, device: 'kb1' });
    screen.update?.(0.016);
    const head = all(screen.el, hasClass('lvl-head'))[0];
    expect(text(head)).toContain('Bia');
    expect(text(head)).toContain('Nível 1');
    expect(text(head)).toContain('Estreante');
  });

  it('sem nenhum perfil: o aviso de como subir de nível; EN completo', () => {
    setLanguage('en');
    const screen = recordsScreen(ctxApi());
    toLevelTab(screen);
    expect(text(screen.el)).toContain('Race to level up');
    expect(text(all(screen.el, hasClass('rec-tab'))[3])).toBe('Level');
  });
});

describe('Resultado: o progresso sem tela nova (O5)', () => {
  function rig(progress?: ProgressNews[], achievements?: Array<{ id: string; seats: number[] }>) {
    const humans = [human(0, 0, 'falcao'), human(1, 1, 'trovao')];
    const results = [
      { carId: 0, seat: 0, name: 'P1', teamId: 0, carDefId: 'falcao', position: 1, finished: true, totalTicks: 9000, bestLapTicks: 3000, points: 10 },
      { carId: 1, seat: 1, name: 'P2', teamId: 1, carDefId: 'trovao', position: 2, finished: true, totalTicks: 9100, bestLapTicks: 3000, points: 8 },
    ];
    const data: ResultsScreenData = { mode: 'quick', trackDef: trackDef('copacabana'), results, humans, champ: null, newRecords: [], ...(progress ? { progress } : {}), ...(achievements ? { achievements } : {}) };
    const screen = resultsScreen(ctxApi(), data);
    return { screen };
  }
  const NEWS: ProgressNews[] = [
    { seat: 0, name: 'P1', carId: 'falcao', xp: 100, pilotXp: 400, level: { before: 3, after: 4 }, carXp: 160, mastery: { before: 0, after: 1 }, unlocks: [{ kind: 'title', id: 'piloto', level: 4 }, { kind: 'cosmetic', field: 'rim', value: 'dourado', carId: 'falcao', mastery: 1 }] },
    { seat: 1, name: 'P2', carId: 'trovao', xp: 70, pilotXp: 70, level: { before: 1, after: 1 }, carXp: 70, mastery: { before: 0, after: 0 }, unlocks: [] },
  ];
  const rowOf = (screen: ReturnType<typeof rig>['screen'], seat: number) => all(screen.el, (e) => e.tag === 'tr' && e.getAttribute('data-seat') === String(seat))[0];

  it('o XP vai na linha de cada humano da tabela (sem altura nova): "+N XP" e, para quem subiu, "Nível N!"', () => {
    const { screen } = rig(NEWS);
    const tag0 = all(rowOf(screen, 0), hasClass('xp-tag'));
    const tag1 = all(rowOf(screen, 1), hasClass('xp-tag'));
    expect(tag0).toHaveLength(1);
    expect(text(tag0[0])).toBe('+100 XP · Nível 4!');
    expect(tag0[0].getAttribute('title')).toContain('Falcão GT: maestria 1');
    expect(text(tag1[0])).toBe('+70 XP');
    expect(tag1[0].getAttribute('title')).toContain('Nível 1');
  });

  it('o que ficou liberado entra no quadro das conquistas: o nível novo com o título, o prêmio do carro', () => {
    const { screen } = rig(NEWS);
    const chips = all(screen.el, hasClass('prog-chip'));
    // Um cartão por humano que ganhou algo: o prêmio de maestria na frente, o título e o nível novo juntos (o P2 não ganhou nada: sem cartão).
    expect(chips.map(text)).toEqual(['Aro dourado no Falcão GTTítulo: Piloto · Nível 4!']);
    expect(chips[0].getAttribute('data-seat')).toBe('0');
    // Só progresso: o quadro chama "Progresso"; com conquistas junto, o título de sempre.
    expect(text(all(screen.el, hasClass('results-ach-title'))[0])).toContain('Progresso');
    const both = rig(NEWS, [{ id: 'PRIMEIRA_CORRIDA', seats: [0, 1] }]).screen;
    expect(text(all(both.el, hasClass('results-ach-title'))[0])).toContain('Conquistas desbloqueadas');
    expect(all(both.el, hasClass('prog-chip'))).toHaveLength(1);
    expect(all(both.el, hasClass('ach-chip')).length).toBe(2);
  });

  it('sem progresso (dado ausente ou vazio) nada muda; com ele, nenhum item de foco novo', () => {
    const a = rig();
    const b = rig([]);
    const c = rig(NEWS);
    for (const r of [a, b]) {
      expect(all(r.screen.el, hasClass('xp-tag'))).toHaveLength(0);
      expect(all(r.screen.el, hasClass('results-ach'))).toHaveLength(0);
    }
    const buttons = (r: typeof a) => all(all(r.screen.el, hasClass('actions'))[0], (e) => e.tag === 'button').map(text);
    expect(buttons(c)).toEqual(buttons(a));
    expect(all(c.screen.el, (e) => e.className.includes('focusable') && (e.className.includes('prog-chip') || e.className.includes('xp-tag')))).toHaveLength(0);
  });

  it('sem liberar nada (subindo de nível ou não): só o XP na linha, sem quadro', () => {
    const { screen } = rig([NEWS[1], { ...NEWS[0], unlocks: [] }]);
    expect(all(screen.el, hasClass('xp-tag'))).toHaveLength(2);
    expect(text(all(screen.el, hasClass('xp-tag'))[0])).toContain('Nível 4!'); // P1 (assento 0) subiu
    expect(all(screen.el, hasClass('results-ach'))).toHaveLength(0);
  });
});
