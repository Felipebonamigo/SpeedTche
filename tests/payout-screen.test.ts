// N4, a tela Pagamento (docs/ondas/N/N4.md §5 "T"): uma coluna por piloto, a equipe e o cofre no co-op, uma carteira por assento no
// versus, os números contando até os do relatório, a moeda, o "Já dá para" e a navegação como as outras telas. DOM falso; o relógio
// (post-race.ts) e o modelo (payout-model.ts) são os de verdade.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginCareerCup, newCareer, settleCareerRace, walletOf, type CareerReport, type CareerState } from '../src/core/career';
import { POINTS_TABLE } from '../src/core/constants';
import { CARS } from '../src/core/data/cars';
import { CUPS } from '../src/core/data/cups';
import { AI_TEAM_ID_BASE } from '../src/core/data/drivers';
import { TRACKS, trackDef } from '../src/core/track/tracks';
import type { HumanEntry, RaceResultRow } from '../src/core/types';
import { DEFAULT_SETTINGS, type DeviceId, type MenuNav, type ResultsScreenData, type SaveData, type Settings, type UiSound } from '../src/game/contracts';
import { POST_STEP_SECONDS } from '../src/game/post-race';
import { sanitizeSave } from '../src/game/save';
import { STAR_GOAL, STAR_QUALIFY, STAR_RIVAL, type StarsLast } from '../src/game/stars';
import { goalLabel } from '../src/ui/screens/star-widgets';
import { setLanguage, t } from '../src/i18n';
import '../src/ui/strings';
import type { ScreenApi, ScreenInstance } from '../src/ui/screens/common';
import { formatMoney } from '../src/ui/screens/garage';
import { payoutScreen } from '../src/ui/screens/payout';
import { all, fakeInput, hasClass, installDocument, NAV, text, type FakeEl, type FakeGamepad } from './ui-fake';
import { human } from './helpers';

void TRACKS;

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
  career: CareerState; report: CareerReport; data: ResultsScreenData; screen: ScreenInstance; api: ScreenApi;
  went: Array<{ screen: string; data: unknown }>; backs: number[]; sounds: UiSound[]; events: unknown[]; save: SaveData;
}

interface RigOpts {
  kind?: 'solo' | 'coop' | 'versus';
  drivers?: number;
  positions?: Record<number, number>;
  money?: number;
  settings?: Partial<Settings>;
  pads?: FakeGamepad[];
  noCareer?: boolean;
  /** O que as estrelas gravaram para esta corrida (`save.stars.last`, O4). */
  stars?: StarsLast[];
}

function rig(o: RigOpts = {}): Rig {
  const kind = o.kind ?? 'solo';
  const n = o.drivers ?? (kind === 'solo' ? 1 : 2);
  const humans = Array.from({ length: n }, (_, i) => human(i, kind === 'versus' ? i : 0, ['falcao', 'trovao', 'tornado', 'camelo'][i]));
  const career = newCareer(humans);
  if (o.money !== undefined) career.wallets.fill(o.money);
  beginCareerCup(career, 3);
  const positions = o.positions ?? Object.fromEntries(humans.map((h, i) => [h.seat, i + 1]));
  const results = fakeResults(positions, humans);
  const { report, champ } = settleCareerRace(career, results);
  const save = sanitizeSave({});
  save.career = o.noCareer ? null : career;
  if (o.stars) save.stars = { profiles: [], last: o.stars };
  const data: ResultsScreenData = { mode: 'career', trackDef: trackDef('copacabana'), results, humans, champ, newRecords: [] };
  const settings: Settings = { ...DEFAULT_SETTINGS, seatAssists: [...DEFAULT_SETTINGS.seatAssists], ...o.settings };
  const bound: Array<DeviceId | null> = ['kb1', 'kb2', 'gp0', 'gp1'].slice(0, Math.max(1, n)) as DeviceId[];
  const went: Rig['went'] = []; const backs: number[] = []; const sounds: UiSound[] = []; const events: unknown[] = [];
  const api = {
    ctx: { cars: CARS, save, settings, input: fakeInput(bound, o.pads), cups: CUPS, tracks: [], isCupUnlocked: () => true },
    lobby: { mode: 'career', versus: false, seats: [null, null, null, null] },
    go: (screen: string, d?: unknown) => { went.push({ screen, data: d }); }, back: () => { backs.push(1); },
    emit: (e: unknown) => { events.push(e); }, sfx: (k: UiSound) => { sounds.push(k); }, refresh: () => undefined,
  } as unknown as ScreenApi;
  const screen = payoutScreen(api, data);
  return { career, report, data, screen, api, went, backs, sounds, events, save };
}

const press = (r: Rig, key: keyof MenuNav, device: DeviceId = 'kb1'): void => r.screen.nav({ ...NAV, [key]: true, device });
/** Anda o relógio da tela em quadros de 1/30 s por `seconds`. */
function run(r: Rig, seconds: number): void { for (let t0 = 0; t0 < seconds - 1e-9; t0 += 1 / 30) r.screen.update?.(1 / 30); }
const cols = (r: Rig): FakeEl[] => all(r.screen.el, hasClass('payout-col'));
const teamCol = (r: Rig): FakeEl[] => all(r.screen.el, (e) => hasClass('payout-col')(e) && hasClass('team')(e));
const prizeVals = (r: Rig): string[] => all(r.screen.el, hasClass('pc-prize-val')).map(text);
const walletVals = (r: Rig): string[] => all(r.screen.el, hasClass('pc-wallet-val')).map(text);
const vault = (r: Rig): FakeEl[] => all(r.screen.el, hasClass('payout-vault'));
const buy = (r: Rig): FakeEl => all(r.screen.el, hasClass('payout-buy'))[0];
const coins = (r: Rig): FakeEl[] => all(r.screen.el, hasClass('payout-coin'));
const actions = (r: Rig): FakeEl[] => all(all(r.screen.el, hasClass('actions'))[0], (e) => e.tag === 'button');

beforeEach(() => { setLanguage('pt'); installDocument(); });
afterEach(() => { vi.unstubAllGlobals(); setLanguage('pt'); });

describe('Pagamento: as colunas (T1)', () => {
  it('solo: uma coluna, sem equipe nem cofre, com a carteira do piloto', () => {
    const r = rig({ kind: 'solo' });
    expect(cols(r)).toHaveLength(1);
    expect(teamCol(r)).toHaveLength(0);
    expect(vault(r)).toHaveLength(0);
    expect(walletVals(r)).toHaveLength(1);
  });
  it('co-op com 2 pilotos: 2 colunas, a coluna da equipe e UMA linha do cofre (nenhuma carteira por piloto)', () => {
    const r = rig({ kind: 'coop' });
    expect(cols(r)).toHaveLength(3);
    expect(teamCol(r)).toHaveLength(1);
    expect(vault(r)).toHaveLength(1);
    expect(walletVals(r)).toHaveLength(0);
    expect(text(vault(r)[0])).toContain(t('career.payout.vault'));
  });
  it('versus com 2 pilotos: 2 colunas e uma carteira por assento, sem equipe nem cofre', () => {
    const r = rig({ kind: 'versus' });
    expect(cols(r)).toHaveLength(2);
    expect(teamCol(r)).toHaveLength(0);
    expect(vault(r)).toHaveLength(0);
    expect(walletVals(r)).toHaveLength(2);
  });
  it('com 4 pilotos no co-op: 4 colunas, a da equipe e o cofre', () => {
    const r = rig({ kind: 'coop', drivers: 4, positions: { 0: 1, 1: 2, 2: 3, 3: 4 } });
    expect(cols(r)).toHaveLength(5);
    expect(vault(r)).toHaveLength(1);
  });
  it('eliminado: a faixa de ELIMINADO e a linha vira "Ajuda de custo"', () => {
    const r = rig({ kind: 'solo', positions: { 0: 20 } });
    expect(r.report.verdict).toBe('eliminated');
    expect(text(r.screen.el)).toContain(t('career.payout.eliminated'));
    expect(text(cols(r)[0])).toContain(t('career.payout.allowance'));
  });
  it('classificado: sem a faixa, a linha é "Prêmio" com a posição', () => {
    const r = rig({ kind: 'solo', positions: { 0: 2 } });
    expect(text(r.screen.el)).not.toContain(t('career.payout.eliminated'));
    expect(text(cols(r)[0])).toContain(t('career.payout.prize'));
    expect(text(cols(r)[0])).toContain(t('career.payout.position', { pos: 2 }));
  });
});

describe('Pagamento: o número conta (T2)', () => {
  it('antes de o tempo andar mostra o "antes"; ao fim, exatamente os números do relatório', () => {
    const r = rig({ kind: 'versus', money: 0 });
    expect(prizeVals(r).every((v) => v.includes(formatMoney(0)))).toBe(true);
    expect(walletVals(r).every((v) => v.includes(formatMoney(0)))).toBe(true);
    run(r, POST_STEP_SECONDS.payout + 0.5);
    expect(prizeVals(r)).toEqual(r.report.rows.map((row) => `+${formatMoney(row.prize)}`));
    expect(walletVals(r)).toEqual([0, 1].map((i) => formatMoney(walletOf(r.career, i))));
  });
  it('co-op: o cofre vai de antes a depois somando prêmios e bônus', () => {
    const r = rig({ kind: 'coop', money: 0 });
    run(r, POST_STEP_SECONDS.payout + 0.5);
    const total = r.report.rows.reduce((s, row) => s + row.prize, 0) + r.report.teamBonus;
    expect(total).toBeGreaterThan(0);
    expect(text(vault(r)[0])).toContain(formatMoney(total));
    expect(text(teamCol(r)[0])).toContain(formatMoney(r.report.teamBonus));
  });
  it('no meio da contagem os números ainda não chegaram e só crescem', () => {
    const r = rig({ kind: 'solo', money: 0, positions: { 0: 1 } });
    const final = `+${formatMoney(r.report.rows[0].prize)}`;
    run(r, 0.9);
    const mid = prizeVals(r)[0];
    expect(mid).not.toBe(final);
    expect(mid).not.toBe(`+${formatMoney(0)}`);
  });
  it('"Já dá para" só aparece no fim, e só quando o pagamento cruzou um preço', () => {
    const r = rig({ kind: 'solo', money: 0 });
    expect(buy(r).classList.contains('on')).toBe(false);
    run(r, 3);
    expect(buy(r).classList.contains('on')).toBe(false);
    run(r, POST_STEP_SECONDS.payout);
    expect(buy(r).classList.contains('on')).toBe(true);
    expect(text(buy(r))).toContain('Já dá para:');
    expect(text(buy(r))).toContain(`${t('career.garage.part.engine')} nível 1`);
    // Quem já podia comprar tudo antes não ganha a linha.
    const rich = rig({ kind: 'solo', money: 3000, positions: { 0: 3 } }); // abaixo do carro mais barato à venda (Jabuti, 7.000) mesmo com o 3º lugar
    run(rich, POST_STEP_SECONDS.payout + 1);
    expect(buy(rich).classList.contains('on')).toBe(false);
  });
  it('um carro à venda cruzado aparece pelo nome do carro', () => {
    const r = rig({ kind: 'solo', money: 6500, positions: { 0: 1 } }); // + 6.000 do 1º = 12.500: o mais caro cruzado é o Curupira (12.000), abaixo do Pampeiro (13.000)
    run(r, POST_STEP_SECONDS.payout + 1);
    expect(buy(r).classList.contains('on')).toBe(true);
    expect(text(buy(r))).toContain(CARS.find((c) => c.id === 'curupira')?.name ?? '?');
  });
  it('pular (Start/Enter segurado) mostra os números finais de uma vez, sem tique nem moeda', () => {
    const r = rig({ kind: 'solo', money: 0 });
    r.screen.nav({ ...NAV, start: true, device: 'kb1' });
    r.screen.update?.(1 / 30);
    expect(prizeVals(r)).toEqual(r.report.rows.map((row) => `+${formatMoney(row.prize)}`));
    expect(buy(r).classList.contains('on')).toBe(true);
    expect(r.sounds).not.toContain('coin');
    expect(r.sounds).not.toContain('count');
  });
  it('os sons: tique ao contar, moeda ao pousar e o sino uma vez só', () => {
    const r = rig({ kind: 'versus', money: 0 });
    run(r, POST_STEP_SECONDS.payout + 0.5);
    expect(r.sounds.filter((s) => s === 'count').length).toBeGreaterThan(2);
    expect(r.sounds.filter((s) => s === 'coin').length).toBeGreaterThan(0);
    expect(r.sounds.filter((s) => s === 'chime')).toHaveLength(1);
  });
});

describe('Pagamento: navegação e foco (T3, T4)', () => {
  it('o foco nasce no botão da classificação (o mesmo destino que o resultado tinha)', () => {
    const r = rig({ kind: 'solo' });
    const [primary] = actions(r);
    expect(primary.classList.contains('focus')).toBe(true);
    expect(text(primary)).toBe(t('ui.results.standings'));
  });
  it('confirmar com a contagem andando é engolido; depois que acaba, abre a classificação da carreira', () => {
    const r = rig({ kind: 'solo' });
    press(r, 'confirm');
    run(r, 2);
    press(r, 'confirm');
    expect(r.went).toHaveLength(0);
    run(r, POST_STEP_SECONDS.payout + 0.5);
    press(r, 'confirm');
    expect(r.went).toHaveLength(1);
    expect(r.went[0].screen).toBe('standings');
    expect(r.went[0].data).toMatchObject({ career: true });
  });
  it('o clique do mouse é deliberado: ativa a qualquer hora', () => {
    const r = rig({ kind: 'solo' });
    actions(r)[0].click();
    expect(r.went.map((w) => w.screen)).toEqual(['standings']);
  });
  it('segurar o A do controle (visto solto antes) por 0,45 s pula a contagem', () => {
    const pad: FakeGamepad = { id: 'gp0', buttons: [] };
    const r = rig({ kind: 'solo', pads: [pad] });
    run(r, 0.2);
    pad.buttons = [0];
    run(r, 0.3);
    press(r, 'confirm', 'gp0');
    expect(r.went).toHaveLength(0); // 0,3 s apertado: ainda não pulou
    run(r, 0.3);
    press(r, 'confirm', 'gp0');
    expect(r.went.map((w) => w.screen)).toEqual(['standings']);
  });
  it('o A de acelerar ainda preso na chegada não pula nada', () => {
    const pad: FakeGamepad = { id: 'gp0', buttons: [0] };
    const r = rig({ kind: 'solo', pads: [pad] });
    run(r, 1.5);
    press(r, 'confirm', 'gp0');
    expect(r.went).toHaveLength(0);
  });
  it('VOLTAR (Esc/B) volta à tela anterior e deixa a sequência pronta (não reinicia o relógio)', () => {
    const r = rig({ kind: 'solo' });
    press(r, 'back');
    expect(r.backs).toHaveLength(1);
    expect(r.sounds).toContain('back');
  });
  it('sem carreira (ou sem relatório) a tela não quebra: um botão que leva ao menu', () => {
    const r = rig({ kind: 'solo', noCareer: true });
    expect(actions(r)).toHaveLength(1);
    press(r, 'confirm');
    expect(r.events).toEqual([{ type: 'toMain' }]);
  });
});

describe('Pagamento: reduzir efeitos (T5) e idiomas', () => {
  it('sem reduzir: as moedas existem no DOM; reduzindo, nenhuma — só o número', () => {
    const full = rig({ kind: 'versus', money: 0 });
    expect(coins(full).length).toBeGreaterThan(0);
    const calm = rig({ kind: 'versus', money: 0, settings: { reduceEffects: true } });
    expect(coins(calm)).toHaveLength(0);
    run(calm, POST_STEP_SECONDS.payout + 0.5);
    expect(prizeVals(calm)).toEqual(calm.report.rows.map((row) => `+${formatMoney(row.prize)}`));
    expect(calm.sounds).not.toContain('coin');
    expect(calm.sounds).toContain('chime');
  });
  it('nenhum texto da tela fica sem tradução em PT nem em EN', () => {
    for (const lang of ['pt', 'en'] as const) {
      setLanguage(lang);
      for (const kind of ['solo', 'coop', 'versus'] as const) {
        const r = rig({ kind, money: 0 });
        run(r, POST_STEP_SECONDS.payout + 0.5);
        expect(text(r.screen.el), `${lang} ${kind}`).not.toMatch(/\b(career|ui)\.[a-z]+\.[A-Za-z.]+/);
      }
    }
  });
});

// ───────────── O4: as estrelas, o objetivo da pista e o rival com rosto no Pagamento ─────────────

const lastOf = (o: Partial<StarsLast> & { name: string }): StarsLast => ({ trackId: 'copacabana', got: 0, was: 0, goal: 'draft20', rival: null, duel: null, ...o });
const starRows = (r: Rig): FakeEl[] => all(r.screen.el, hasClass('stars'));
const litOf = (el: FakeEl): boolean[] => all(el, hasClass('star')).map((s) => hasClass('on')(s));
const newOf = (el: FakeEl): boolean[] => all(el, hasClass('star')).map((s) => hasClass('new')(s));
const goalStrip = (r: Rig): FakeEl[] => all(r.screen.el, hasClass('payout-goal'));
const faces = (r: Rig): string[] => all(r.screen.el, (e) => e.innerHTML.includes('data-face=')).map((e) => /data-face="(\w+)"/.exec(e.innerHTML)?.[1] ?? '');

describe('Pagamento: as estrelas (O4)', () => {
  it('solo: as 3 estrelas da corrida na coluna do piloto, as novas marcadas, e o objetivo da pista embaixo', () => {
    const r = rig({ kind: 'solo', stars: [lastOf({ name: 'P1', got: STAR_QUALIFY | STAR_GOAL, was: STAR_QUALIFY })] });
    expect(starRows(r)).toHaveLength(1);
    expect(litOf(starRows(r)[0])).toEqual([true, false, true]);
    expect(newOf(starRows(r)[0])).toEqual([false, false, true]);
    expect(goalStrip(r)).toHaveLength(1);
    expect(text(goalStrip(r)[0])).toContain(goalLabel('copacabana'));
    expect(text(goalStrip(r)[0])).toContain(t('stars.goalLine', { goal: goalLabel('copacabana') }));
  });

  it('versus: cada piloto com as estrelas do seu perfil, pelo nome', () => {
    const r = rig({ kind: 'versus', stars: [lastOf({ name: 'P1', got: 7 }), lastOf({ name: 'p2', got: STAR_RIVAL })] });
    const rows = starRows(r);
    expect(rows).toHaveLength(2);
    expect(rows.map(litOf)).toEqual([[true, true, true], [false, true, false]]);
    expect(cols(r).map((c) => all(c, hasClass('stars')).length)).toEqual([1, 1]);
  });

  it('o rival perde (duelo ganho) com cara de perdeu; ganha com cara de venceu; sem rival, sem rosto', () => {
    expect(faces(rig({ stars: [lastOf({ name: 'P1', got: 3, rival: 'Zé Turbo', duel: 'win' })] }))).toEqual(['lose']);
    expect(faces(rig({ stars: [lastOf({ name: 'P1', got: 1, rival: 'Zé Turbo', duel: 'lose' })] }))).toEqual(['win']);
    expect(faces(rig({ stars: [lastOf({ name: 'P1', got: 1 })] }))).toEqual([]);
  });

  it('o brilho da estrela nova só existe sem reduceEffects', () => {
    const stars = [lastOf({ name: 'P1', got: 7, was: 0 })];
    expect(starRows(rig({ stars })).every((row) => !hasClass('calm')(row))).toBe(true);
    const calm = rig({ stars, settings: { reduceEffects: true } });
    expect(starRows(calm).every((row) => hasClass('calm')(row))).toBe(true);
    expect(litOf(starRows(calm)[0])).toEqual([true, true, true]);
  });

  it('sem estrelas gravadas, ou de outra pista, a tela é a de antes: nada novo e os mesmos botões', () => {
    const base = rig({ kind: 'solo' });
    for (const stars of [undefined, [], [lastOf({ name: 'P1', got: 7, trackId: 'paraty' })], [lastOf({ name: 'Outro', got: 7 })]]) {
      const r = rig({ kind: 'solo', stars });
      expect(starRows(r)).toHaveLength(0);
      expect(goalStrip(r)).toHaveLength(0);
      expect(faces(r)).toEqual([]);
      expect(actions(r).length).toBe(actions(base).length);
    }
  });

  it('a navegação e o foco são os de sempre com estrelas (mesmos botões, confirmar engolido até acabar)', () => {
    const base = rig({ kind: 'solo' });
    const r = rig({ kind: 'solo', stars: [lastOf({ name: 'P1', got: 7, rival: 'Zé Turbo', duel: 'win' })] });
    expect(actions(r).length).toBe(actions(base).length);
    press(r, 'confirm');
    expect(r.events).toEqual([]);
    run(r, POST_STEP_SECONDS.payout + 0.5);
    expect(all(r.screen.el, hasClass('payout-skip'))[0].classList.contains('done')).toBe(true);
  });
});
