// Tela "Carreira" (continuar / nova), a Garagem e a base da Concessionária. A garagem tem um painel por piloto, cada um
// navegado pelo próprio dispositivo (como no lobby): os carros que o piloto TEM (←→ troca e escolhe), atributos com antes → depois
// do item em foco, as seis melhorias e PRONTO. A Concessionária (dealership.ts) é a mesma fábrica de painel no outro modo: os carros
// à venda, com a compra. As compras chamam as regras puras de src/core/career.ts e gravam o save na hora; com todos prontos, a sessão corre.
// Onda N, N2: o carro de cada painel é o modelo 3D do palco (src/render/stage.ts), numa janela transparente; o SVG só no Retrô.
import '../../career/strings';
import '../../dealership/strings';
import './garage.css';
import './passport.css';
import {
  buyCar, buyUpgrade, cupIndexOf, levelsOf, NO_UPGRADES, ownsCar, partMaxLevel, selectCar, UPGRADE_PARTS, upgradePrice, walletOf,
  type CareerGarage, type CareerState, type PurchaseResult,
} from '../../core/career';
import { nextTrackId } from '../../core/championship';
import { SPEED_TO_KMH, UPGRADE_MAX_LEVEL } from '../../core/constants';
import { seatColor } from '../../core/data/drivers';
import { effectiveStats } from '../../core/sim/stats';
import type { CarDef, CarStats, UpgradeLevels, UpgradePart } from '../../core/types';
import type { DeviceId, MenuContext, MenuNav } from '../../game/contracts';
import { unlockCar } from '../../game/career-save';
import { paintColors, paintedCar, seatPaint, stepSeatPaint } from '../../game/paints';
import { saveSave } from '../../game/save';
import { getLanguage, t } from '../../i18n';
import { mountShowroom, type StageHandle } from '../../render/stage';
import type { StageFocus } from '../../render/stage-plan';
import { arrowButton, button, carCount, createFocusList, h, listNav, screenFrame, trackName, type FocusItem, type FocusList, type ScreenApi, type ScreenFactory, type ScreenInstance } from './common';
import { carSilhouette, icon } from './icons';
import { startCursor } from './lobby';
import { paintSelector } from './paint';
import { garageRivalBlock } from './rival';

// ───────────────────────────── Números para a tela ─────────────────────────────

export function formatMoney(v: number): string {
  return t('career.money', { v: Math.round(v).toLocaleString(getLanguage() === 'pt' ? 'pt-BR' : 'en-US') });
}

export type GarageStat = 'topSpeed' | 'accel' | 'handling' | 'brake' | 'economy';
export const GARAGE_STATS: readonly GarageStat[] = ['topSpeed', 'accel', 'handling', 'brake', 'economy'];
const FULL: UpgradeLevels = { engine: UPGRADE_MAX_LEVEL, turbo: UPGRADE_MAX_LEVEL, tires: UPGRADE_MAX_LEVEL, brakes: UPGRADE_MAX_LEVEL, tank: UPGRADE_MAX_LEVEL, nitro: UPGRADE_MAX_LEVEL };

function statValue(s: CarStats, k: GarageStat): number {
  return k === 'economy' ? 1 / s.fuelPerUnit : s[k];
}

/** Faixa de cada atributo: do pior carro de fábrica ao melhor carro com tudo no máximo. */
function statRanges(cars: readonly CarDef[]): Record<GarageStat, [number, number]> {
  const out = {} as Record<GarageStat, [number, number]>;
  for (const k of GARAGE_STATS) {
    const lo = Math.min(...cars.map((c) => statValue(effectiveStats(c, null), k)));
    const hi = Math.max(...cars.map((c) => statValue(effectiveStats(c, FULL), k)));
    out[k] = [lo, hi];
  }
  return out;
}

/** 0..1 para a barra (o pior de fábrica fica em 0,12 para não sumir). */
export function statFraction(ranges: Record<GarageStat, [number, number]>, k: GarageStat, v: number): number {
  const [lo, hi] = ranges[k];
  if (!(hi > lo)) return 1;
  return 0.12 + 0.88 * Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
}

/** Velocidade em km/h (a unidade some no "antes → depois", que precisa caber ao lado da barra); o resto de 0 a 100. */
function statText(ranges: Record<GarageStat, [number, number]>, k: GarageStat, v: number, unit = true): string {
  return k === 'topSpeed' ? `${Math.round(v * SPEED_TO_KMH)}${unit ? ' km/h' : ''}` : String(Math.round(statFraction(ranges, k, v) * 100));
}

function levelsPlus(levels: UpgradeLevels, part: UpgradePart): UpgradeLevels {
  return { ...levels, [part]: levels[part] + 1 };
}

function cupName(id: string): string {
  return t(`core.cup.${id}`);
}

// ───────────────────────────── Tela "Carreira" ─────────────────────────────

function modeText(career: CareerState): string {
  if (career.coop) return t('career.mode.coop');
  return career.drivers.length > 1 ? t('career.mode.versus') : t('career.mode.solo');
}

/** Faixa com as copas da carreira: feitas, a atual e as que faltam. */
function cupStrip(ctx: MenuContext, career: CareerState | null): HTMLElement {
  const current = career ? cupIndexOf(career, ctx.cups) : -1;
  return h('div', { class: 'cup-strip' }, ctx.cups.map((c, i) => {
    const done = career !== null && (career.completed || i < current);
    const now = career !== null && !career.completed && i === current;
    // Expedição Brasil: a sigla do estado (27 bandeiras do Brasil iguais não diziam nada); Mundial: a bandeira.
    const brasil = c.stage === 'brasil' && !!c.state;
    return h('span', { class: `cup-pip${brasil ? ' uf' : ''}${done ? ' done' : ''}${now ? ' now' : ''}`, title: cupName(c.id), attrs: brasil ? { 'data-region': c.region ?? '' } : undefined },
      h('span', { class: 'cup-pip-flag', text: brasil ? c.state ?? '' : c.flag }), done ? icon('check') : null);
  }));
}

function careerSummary(ctx: MenuContext, career: CareerState): HTMLElement {
  const cupIdx = cupIndexOf(career, ctx.cups);
  const cup = ctx.cups[cupIdx];
  const raceCount = cup?.trackIds.length ?? 0;
  const raceN = (career.champ?.raceIndex ?? 0) + 1;
  const money = career.coop
    ? h('span', { class: 'mono strong', text: formatMoney(career.wallets[0] ?? 0) })
    : h('span', { class: 'cs-list' }, career.drivers.map((d, i) => h('span', { class: 'cs-chip', style: `--seat:${seatColor(i, ctx.settings.colorPalette)}` },
      h('b', { text: `P${i + 1}` }), h('span', { class: 'mono', text: formatMoney(career.wallets[i] ?? 0) }))));
  const bought = new Set(career.drivers.flatMap((d) => d.garage.owned)).size;
  const row = (label: string, ...value: Array<HTMLElement | string>) => h('div', { class: 'cs-row' }, h('span', { class: 'cs-label', text: label }), h('span', { class: 'cs-value' }, value));
  return h('div', { class: 'career-summary' },
    career.completed ? h('div', { class: 'verdict good' }, icon('trophy'), h('span', { text: t('career.hub.completed') })) : null,
    row(t('career.hub.mode'), `${modeText(career)} · ${career.drivers.length}P`),
    row(t('career.hub.drivers'), h('span', { class: 'cs-list' }, career.drivers.map((d, i) => h('span', { class: 'cs-chip', style: `--seat:${seatColor(i, ctx.settings.colorPalette)}` },
      h('b', { text: `P${i + 1}` }), h('span', { text: d.name }), h('span', { class: 'muted-inline', text: ctx.cars.find((c) => c.id === d.garage.carId)?.name ?? '' }))))),
    career.completed ? null : row(t('career.hub.cup'),
      h('span', { class: 'cs-cup' }, `${cup?.flag ?? ''} ${cup ? cupName(cup.id) : ''} — ${t('career.hub.race', { n: Math.min(raceN, raceCount), m: raceCount })}`),
      career.attempts > 1 ? h('span', { class: 'muted-inline', text: ` · ${t('career.hub.attempt', { n: career.attempts })}` }) : ''),
    row(career.coop ? t('career.garage.teamWallet') : t('career.hub.money'), money),
    row(t('career.hub.cars'), String(bought)),
    row(t('career.hub.races'), String(career.racesRun)),
    cupStrip(ctx, career),
  );
}

export function careerScreen(api: ScreenApi): ScreenInstance {
  const { ctx } = api;
  const career = ctx.save.career;
  const ongoing = career !== null && !career.completed;
  const openLobby = (resume: boolean) => {
    api.lobby.mode = 'career';
    api.lobby.resume = resume;
    for (const seat of api.lobby.seats) if (seat) { seat.ready = false; seat.cursor = startCursor(api.lobby); }
    api.go('lobby');
  };
  let confirming = false;
  const items: FocusItem[] = [];
  if (ongoing) items.push(button(t('career.hub.continue'), () => openLobby(true), 'btn-primary'));
  const fresh = button(t('career.hub.new'), () => {
    if (ongoing && !confirming) {
      confirming = true;
      fresh.el.textContent = t('career.hub.confirmNew');
      fresh.el.classList.add('btn-danger');
      return;
    }
    openLobby(false);
  }, ongoing ? '' : 'btn-primary');
  items.push(fresh, button(t('ui.common.back'), () => api.back()));
  const list = createFocusList(items, { sfx: api.sfx });
  const el = screenFrame('career', t('career.hub.title'),
    h('div', { class: 'career-hub glass' },
      career ? careerSummary(ctx, career) : h('div', { class: 'career-intro' },
        h('p', { text: t('career.hub.intro') }),
        h('p', { class: 'muted-inline', text: t('career.hub.introCoop') }),
        h('p', { class: 'muted-inline', text: t('career.hub.none') }),
        cupStrip(ctx, null),
      ),
      h('div', { class: 'menu-list career-actions' }, items.map((i) => i.el)),
    ),
  );
  return { el, nav: (nav) => listNav(list, nav, api.sfx, () => api.back()) };
}

// ───────────────────────────── Garagem e Concessionária ─────────────────────────────

interface SeatUi {
  /** Índice em ctx.cars do carro à mostra (garagem: um dos do piloto; Concessionária: um dos à venda). */
  view: number;
  ready: boolean;
  cursor: number;
  msg: string;
  msgKind: 'good' | 'bad';
  msgTtl: number;
}

const MSG_SECONDS = 1.8;

/** `garage` = os carros que o piloto tem, as peças e a pintura; `dealership` = os carros à venda, a pintura e a compra. */
export type CarScreenMode = 'garage' | 'dealership';

export const garageScreen: ScreenFactory = (api) => carScreen(api, 'garage');

/** O que o painel guarda do palco: a janela (DOM) e a alça do registro. */
interface PanelParts {
  el: HTMLElement;
  items: FocusItem[];
  preview: () => void;
  msgEl: HTMLElement;
  /** A janela transparente onde o palco desenha o carro (nula no Retrô). */
  stageEl: HTMLElement | null;
  /** A peça cujo detalhe a câmera deve mostrar, pelo item em foco. */
  focusOf: () => StageFocus;
}

export function carScreen(api: ScreenApi, mode: CarScreenMode): ScreenInstance {
  const { ctx } = api;
  const cars = ctx.cars;
  const dealer = mode === 'dealership';
  const ranges = statRanges(cars);
  const careerOrNull = ctx.save.career;
  if (!careerOrNull && !dealer) {
    const back = button(t('ui.common.back'), () => api.emit({ type: 'toMain' }));
    const list = createFocusList([back], { sfx: api.sfx });
    return { el: screenFrame('garage', t('career.garage.title'), h('p', { class: 'hint', text: t('career.hub.none') }), back.el), nav: (nav) => listNav(list, nav, api.sfx) };
  }
  // Concessionária sem carreira: vitrine só de ver (um painel, sem dinheiro, nada para comprar).
  const career: CareerState | null = careerOrNull;
  const n = career ? career.drivers.length : 1;
  /** Palco 3D no lugar da silhueta (o Retrô não tem palco). */
  const use3d = ctx.settings.renderStyle !== 'retro';
  const stageId = (seat: number) => `${mode}:P${seat + 1}`;
  const garageOf = (seat: number): CareerGarage | null => career?.drivers[seat]?.garage ?? null;
  const carIndex = (id: string) => Math.max(0, cars.findIndex((c) => c.id === id));
  /** Os carros que ←→ percorre neste painel (índices em `cars`, na ordem da lista): os do piloto ou os à venda. Nunca vazio. */
  const pool = (seat: number): number[] => {
    const g = garageOf(seat);
    const out: number[] = [];
    cars.forEach((c, i) => { if (dealer ? c.price > 0 : !!g && ownsCar(g, c.id)) out.push(i); });
    return out.length ? out : [0];
  };
  // Carreira concluída: não há o que comprar na garagem; o foco começa no MENU (o último item).
  const lockedCareer = !dealer && !!career?.completed;
  const uis: SeatUi[] = Array.from({ length: n }, (_, seat) => ({
    view: dealer ? pool(seat)[0] : carIndex(garageOf(seat)?.carId ?? ''), ready: false, cursor: lockedCareer ? Number.MAX_SAFE_INTEGER : 0, msg: '', msgKind: 'good', msgTtl: 0,
  }));
  let lists: Array<FocusList | null> = [];
  let previews: Array<() => void> = [];
  let msgEls: HTMLElement[] = [];
  let panelEls: HTMLElement[] = [];
  let stageEls: Array<HTMLElement | null> = [];
  const stages: Array<StageHandle | null> = Array.from({ length: n }, () => null);
  let started = false;

  const persist = () => saveSave(ctx.save);

  const say = (seat: number, text: string, kind: SeatUi['msgKind']) => {
    const ui = uis[seat];
    ui.msg = text; ui.msgKind = kind; ui.msgTtl = MSG_SECONDS;
  };

  const purchaseMessage = (r: PurchaseResult): [string, SeatUi['msgKind']] => {
    if (r === 'ok') return [t('career.garage.msg.bought'), 'good'];
    if (r === 'noMoney') return [t('career.garage.msg.noMoney'), 'bad'];
    if (r === 'maxLevel') return [t('career.garage.msg.maxLevel'), 'bad'];
    if (r === 'owned') return [t('dealership.msg.owned'), 'good'];
    return [t('career.garage.msg.notOwned'), 'bad'];
  };

  function allReady(): boolean {
    return uis.every((u) => u.ready);
  }

  function toggleReady(seat: number): void {
    if (!career) return;
    if (career.completed) { api.sfx('confirm'); api.emit({ type: 'toMain' }); return; }
    const ui = uis[seat];
    ui.ready = !ui.ready;
    // Pronto vale para o carro escolhido: a vitrine volta para ele.
    if (ui.ready) ui.view = carIndex(career.drivers[seat].garage.carId);
    api.sfx(ui.ready ? 'confirm' : 'back');
    if (ui.ready && allReady() && !started) {
      started = true;
      api.emit({ type: 'careerRace' });
      return;
    }
    render();
  }

  function changeView(seat: number, dir: -1 | 1): void {
    const ui = uis[seat];
    if (lockedCareer) { api.sfx('back'); return; }
    if (ui.ready) { say(seat, t('career.garage.msg.locked'), 'bad'); render(); return; }
    const p = pool(seat);
    ui.view = p[(Math.max(0, p.indexOf(ui.view)) + dir + p.length) % p.length];
    // Garagem: passear pelos carros do piloto já escolhe o carro. Concessionária: só a vitrine (não troca o carro da pista).
    if (!dealer && career && selectCar(career, seat, cars[ui.view].id)) persist();
    render();
  }

  /** Enter na linha do carro: na garagem escolhe o carro (já é dele); na Concessionária compra. */
  function activateCar(seat: number): void {
    const ui = uis[seat];
    if (lockedCareer) { api.sfx('back'); return; }
    if (ui.ready) { say(seat, t('career.garage.msg.locked'), 'bad'); render(); return; }
    const car = cars[ui.view];
    if (!career) { api.sfx('back'); return; }
    const g = career.drivers[seat].garage;
    if (!dealer) {
      if (ownsCar(g, car.id)) { selectCar(career, seat, car.id); persist(); render(); }
      return;
    }
    const r = buyCar(career, seat, car.id);
    if (r === 'ok') {
      unlockCar(ctx.save, car.id); persist();
      stages[seat]?.reveal(); // a compra vira revelação: holofote, capa, faróis, confete e "NOVO!"
    }
    const [text, kind] = purchaseMessage(r);
    say(seat, text, kind);
    api.sfx(r === 'ok' ? 'confirm' : 'back');
    render();
  }

  /** Pintura do carro à mostra (o escolhido ou o da vitrine): gravada para o piloto (assento) e o carro. */
  function changePaint(seat: number, dir: -1 | 1): void {
    const ui = uis[seat];
    if (lockedCareer) { api.sfx('back'); return; }
    if (ui.ready) { say(seat, t('career.garage.msg.locked'), 'bad'); render(); return; }
    stepSeatPaint(ctx.save, seat, cars[ui.view].id, dir);
    persist();
    render();
  }

  function activatePart(seat: number, part: UpgradePart): void {
    const ui = uis[seat];
    if (!career) return;
    if (career.completed) { api.sfx('back'); return; }
    if (ui.ready) { say(seat, t('career.garage.msg.locked'), 'bad'); render(); return; }
    const r = buyUpgrade(career, seat, part, cars[ui.view].id);
    if (r === 'ok') { persist(); stages[seat]?.workshop(); } // a peça vira oficina: faísca e o carro afundando como mola
    const [text, kind] = purchaseMessage(r);
    say(seat, text, kind);
    api.sfx(r === 'ok' ? 'confirm' : 'back');
    render();
  }

  // ── Blocos de um painel ──

  function statsBlock(base: CarStats, after: CarStats | null): HTMLElement {
    const rows = GARAGE_STATS.map((k) => {
      const b = statValue(base, k);
      const a = after ? statValue(after, k) : b;
      const fb = statFraction(ranges, k, b);
      const fa = statFraction(ranges, k, a);
      const diff = Math.abs(fa - fb) > 1e-4;
      const up = fa > fb;
      const lo = Math.min(fa, fb);
      return h('div', { class: 'gs-row' },
        h('span', { class: 'gs-label', text: t(`career.garage.stat.${k}`) }),
        h('span', { class: 'gs-track' },
          h('span', { class: 'gs-fill', style: `width:${(diff ? lo : fb) * 100}%` }),
          diff ? h('span', { class: `gs-ghost ${up ? 'up' : 'down'}`, style: `left:${lo * 100}%;width:${Math.abs(fa - fb) * 100}%` }) : null,
        ),
        h('span', { class: `gs-value mono${diff ? (up ? ' up' : ' down') : ''}` },
          diff ? `${statText(ranges, k, b, false)} → ${statText(ranges, k, a, false)}` : statText(ranges, k, b)),
      );
    });
    const nitroDiff = after !== null && after.nitro !== base.nitro;
    rows.push(h('div', { class: 'gs-row' },
      h('span', { class: 'gs-label', text: t('career.garage.stat.nitro') }),
      h('span', { class: 'gs-nitro' }, Array.from({ length: Math.max(base.nitro, after?.nitro ?? 0) }, (_, i) => h('i', { class: i < base.nitro ? 'on' : 'new' }))),
      h('span', { class: `gs-value mono${nitroDiff ? ((after?.nitro ?? 0) > base.nitro ? ' up' : ' down') : ''}`, text: nitroDiff ? `${base.nitro} → ${after?.nitro ?? 0}` : String(base.nitro) }),
    ));
    return h('div', { class: 'gs' }, rows);
  }

  function panel(seat: number): PanelParts {
    const driver = career?.drivers[seat];
    const g = garageOf(seat);
    const ui = uis[seat];
    const car = cars[ui.view];
    const owned = g ? ownsCar(g, car.id) : false;
    const selected = owned && g?.carId === car.id;
    const levels = g && owned ? levelsOf(g, car.id) : { ...NO_UPGRADES };
    const money = career ? walletOf(career, seat) : 0;
    const shown = effectiveStats(car, levels);
    const mineDef = (g ? cars.find((c) => c.id === g.carId) : undefined) ?? cars[0];
    const mine = g ? effectiveStats(mineDef, levelsOf(g, mineDef.id)) : shown;
    const locked = ui.ready || lockedCareer;
    const carList = pool(seat).map((i) => cars[i]);

    // Carro
    let status: HTMLElement;
    if (selected) status = h('span', { class: 'gp-tag ok' }, icon('check'), h('span', { text: t('career.garage.selected') }));
    else if (owned) status = h('span', { class: 'gp-tag', text: t('career.garage.owned') });
    else {
      const short = career ? car.price - money : 0;
      status = h('span', { class: `gp-tag sale${short > 0 ? ' cant' : ''}` },
        h('span', { class: 'gp-tag-line' }, h('small', { class: 'gp-tag-k', text: t('career.garage.forSale') }), h('b', { class: 'mono', text: formatMoney(car.price) })),
        h('small', { class: 'gp-tag-need', text: !career ? '' : short > 0 ? t('career.garage.need', { price: formatMoney(short) }) : t('career.garage.buyHint') }));
    }
    const stageEl = use3d ? h('div', { class: 'gp-stage', attrs: { 'data-car': car.id } }) : null;
    const carItem: FocusItem = {
      el: h('div', { class: `gp-car${locked ? ' locked' : ''}` },
        arrowButton(-1, () => { changeView(seat, -1); api.sfx('move'); }),
        h('div', { class: 'gp-car-body', attrs: { 'data-car': car.id } },
          h('div', { class: 'gp-car-name' },
            h('span', { class: 'gp-car-name-text', text: car.name }),
            h('span', { class: 'gp-car-count mono', text: carCount(car, carList) }),
          ),
          stageEl ?? h('div', { class: 'gp-car-visual' }, carSilhouette(paintedCar(car, seatPaint(ctx.save, seat, car.id)))),
          status,
        ),
        arrowButton(1, () => { changeView(seat, 1); api.sfx('move'); }),
      ),
      adjust: (dir) => changeView(seat, dir),
      activate: () => activateCar(seat),
    };

    // Pintura do carro à mostra, na linha do PRONTO (a coluna de 2–4 pilotos não tem altura para mais uma linha);
    // o carro, em cima, é a prévia. Confirmar avança uma, como ←→.
    const paintItem = paintSelector({
      current: () => seatPaint(ctx.save, seat, car.id),
      car: () => car,
      onAdjust: (dir) => changePaint(seat, dir),
      sfx: api.sfx,
      cls: `gp-paint${locked ? ' locked' : ''}`,
    });

    // Melhorias (só na garagem)
    const partItems: FocusItem[] = dealer ? [] : UPGRADE_PARTS.map((part) => {
      const level = levels[part];
      const cap = partMaxLevel(car.id, part);
      const price = upgradePrice(part, level, car.id);
      const cls = !owned ? ' disabled' : price === null ? ' max' : price > money ? ' cant' : '';
      // Nível que não mudaria nada neste carro (pneus no teto de dirigibilidade) aparece riscado e não se vende.
      const capped = owned && cap < UPGRADE_MAX_LEVEL && level >= cap;
      return {
        el: h('div', { class: `gp-part${cls}` },
          h('span', { class: 'gp-part-name' }, h('b', { text: t(`career.garage.part.${part}`) }), h('small', { text: capped ? t('career.garage.capped') : t(`career.garage.effect.${part}`) })),
          h('span', { class: 'pips' }, Array.from({ length: UPGRADE_MAX_LEVEL }, (_, i) => h('i', { class: i < level ? 'on' : i >= cap ? 'cap' : '' }))),
          h('span', { class: 'gp-part-price mono', text: !owned ? '—' : price === null ? t('career.garage.max') : formatMoney(price) }),
        ),
        activate: () => activatePart(seat, part),
      };
    });

    // A linha de baixo: PRONTO (garagem) ou COMPRAR (Concessionária).
    let ready: FocusItem | null = null;
    if (dealer) {
      if (career) {
        ready = button(owned ? t('career.garage.owned') : t('dealership.buy'), () => activateCar(seat), `btn-ready gp-ready${owned ? ' on' : ' btn-primary'}`);
        if (owned) ready.el.prepend(icon('check'));
      }
    } else {
      const readyLabel = career?.completed ? t('career.garage.menu') : n === 1 ? t('career.garage.race') : t('career.garage.ready');
      ready = button(readyLabel, () => toggleReady(seat), `btn-ready gp-ready${ui.ready ? ' on' : ''}${n === 1 || career?.completed ? ' btn-primary' : ''}`);
      if (ui.ready) ready.el.prepend(icon('check'));
    }

    const statsHost = h('div', { class: 'gp-stats' });
    const waiting = !dealer && ui.ready && !allReady() ? t('career.garage.waiting') : '';
    const msgEl = h('div', { class: `gp-msg ${ui.msgTtl > 0 ? ui.msgKind : ''}`, text: ui.msgTtl > 0 ? ui.msg : waiting });
    const items = [carItem, ...partItems, paintItem, ...(ready ? [ready] : [])];

    const focusOf = (): StageFocus => {
      const list = lists[seat];
      const idx = list ? list.index : -1;
      const k = idx >= 0 ? partItems.indexOf(items[idx]) : -1;
      return k >= 0 ? UPGRADE_PARTS[k] : null;
    };

    const preview = () => {
      const focus = lists[seat] ? lists[seat]?.index ?? -1 : -1;
      const partIndex = focus >= 0 ? partItems.indexOf(items[focus]) : -1;
      let base = shown;
      let after: CarStats | null = null;
      // Carro à venda (ou, sem ele, qualquer carro que não é o da pista): o antes → depois é contra o carro que o piloto usa hoje.
      if (focus === 0 && !selected && (dealer || !owned)) { base = mine; after = shown; }
      else if (partIndex >= 0 && owned && !locked) {
        const part = UPGRADE_PARTS[partIndex];
        if (levels[part] < partMaxLevel(car.id, part)) after = effectiveStats(car, levelsPlus(levels, part));
      }
      statsHost.replaceChildren(statsBlock(base, after));
      stages[seat]?.set({ focus: focusOf() });
    };

    const walletLabel = career?.coop ? t('career.garage.teamWallet') : t('career.garage.wallet');
    const go = h('div', { class: 'gp-go' }, paintItem.el, ready ? ready.el : h('span', { class: 'gp-note', text: t('dealership.viewOnly') }));
    const blurb = h('p', { class: 'gp-car-blurb', text: t(`core.car.${car.id}.blurb`) });
    const el = h('div', { class: `gp glass${ui.ready ? ' ready' : ''}`, style: `--seat:${seatColor(seat, ctx.settings.colorPalette)}` },
      h('div', { class: 'gp-head' },
        h('span', { class: 'seat-badge', text: `P${seat + 1}` }),
        h('span', { class: 'gp-name', text: driver?.name ?? t('dealership.title') }),
        career ? h('span', { class: 'gp-money' }, h('small', { text: walletLabel }), h('b', { class: 'mono', text: formatMoney(money) })) : null,
      ),
      // A frase do carro diz a troca (o que ganha, o que perde): cabe com um piloto só (garage.css).
      dealer
        ? [h('div', { class: 'gp-left' }, carItem.el, blurb), h('div', { class: 'gp-right' }, statsHost, go, msgEl)]
        : [h('div', { class: 'gp-left' }, carItem.el, statsHost, blurb),
          h('div', { class: 'gp-right' },
            h('div', { class: 'gp-parts' }, h('h2', { class: 'sub-title', text: t('career.garage.upgrades') }), partItems.map((p) => p.el)),
            go, msgEl)],
    );
    return { el, items, preview, msgEl, stageEl, focusOf };
  }

  // ── Cabeçalho e relatório da última corrida (garagem) ──

  const cupIdx = career ? cupIndexOf(career, ctx.cups) : 0;
  const cup = ctx.cups[cupIdx];

  function headInfo(): string {
    if (!career || career.completed || !cup) return '';
    const raceIndex = career.champ?.raceIndex ?? 0;
    const trackId = career.champ ? nextTrackId(career.champ) : cup.trackIds[0];
    return t('career.garage.next', { track: trackName(trackId ?? cup.trackIds[0]), n: raceIndex + 1, m: cup.trackIds.length });
  }

  function reportBlock(): HTMLElement | null {
    if (!career) return null;
    const r = career.lastReport;
    if (career.completed) {
      return h('div', { class: 'garage-report glass' }, h('div', { class: 'verdict good' }, icon('trophy'), h('span', { text: t('career.garage.report.careerDone') })));
    }
    // Boas-vindas só antes da primeira corrida (sem relatório depois disso = relatório descartado pelo save).
    if (!r) return career.racesRun > 0 ? null : h('div', { class: 'garage-report glass' }, h('span', { class: 'gr-line', text: t(n === 1 ? 'career.garage.welcomeSolo' : 'career.garage.welcome') }));
    const lines: HTMLElement[] = [h('strong', { class: 'gr-title', text: t('career.garage.report.title', { track: trackName(r.trackId) }) })];
    for (const row of r.rows) {
      const name = career.drivers[row.driver]?.name ?? `P${row.driver + 1}`;
      lines.push(h('span', { class: 'gr-chip mono', style: `--seat:${seatColor(row.driver, ctx.settings.colorPalette)}`, text: t('career.garage.report.row', { name, pos: row.position, prize: formatMoney(row.prize) }) }));
    }
    if (r.teamBonus > 0) lines.push(h('span', { class: 'gr-chip team mono', text: t('career.garage.report.team', { rank: r.teamRank, prize: formatMoney(r.teamBonus) }) }));
    let banner: HTMLElement | null = null;
    if (r.verdict === 'eliminated') banner = h('div', { class: 'gr-banner bad', text: t('career.garage.report.eliminated', { cup: cupName(r.cupId), n: career.attempts }) });
    else if (r.cupCompleted && cup) banner = h('div', { class: 'gr-banner good' }, icon('trophy'), h('span', { text: t('career.garage.report.cupDone', { cup: cupName(r.cupId), next: `${cup.flag} ${cupName(cup.id)}` }) }));
    return h('div', { class: 'garage-report glass' }, h('div', { class: 'gr-lines' }, lines), banner);
  }

  const panelsEl = h('div', { class: `garage-panels n-${n}` });
  const reportHost = h('div', { class: 'garage-report-host' });
  const el = screenFrame(mode, null,
    h('div', { class: 'garage-head' },
      h('h1', { class: 'screen-title', text: dealer ? t('dealership.title') : t('career.garage.title') }),
      !dealer && career && cup && !career.completed ? h('span', { class: 'chip', text: `${cup.flag} ${cupName(cup.id)}` }) : null,
      h('span', { class: 'garage-progress muted-inline', text: !dealer && career && !career.completed ? t('career.garage.progress', { i: cupIdx + 1, n: ctx.cups.length }) : '' }),
      h('span', { class: 'garage-next', text: dealer ? '' : headInfo() }),
    ),
    reportHost,
    panelsEl,
    h('p', { class: 'hint', text: dealer ? t('dealership.hint') : t('career.garage.hint') }),
  );
  // A Concessionária divide o CSS da garagem (`.scr-garage`); `stage3d` tira o degradê da tela e fura o vidro onde está a janela do palco.
  if (dealer) el.classList.add('scr-garage');
  if (use3d) el.classList.add('stage3d');

  /** Põe o painel do palco de cada assento na janela nova (a tela refaz o DOM a cada ação; o painel e o estado dele continuam). */
  function bindStages(built: PanelParts[]): void {
    built.forEach((b, seat) => {
      if (!b.stageEl) return;
      const car = cars[uis[seat].view];
      stages[seat] = mountShowroom(b.stageEl, {
        id: stageId(seat), carId: car.id, paint: paintColors(seatPaint(ctx.save, seat, car.id)), focus: b.focusOf(),
        quality: ctx.settings.quality, reduceEffects: ctx.settings.reduceEffects, ring: seatColor(seat, ctx.settings.colorPalette),
      });
    });
  }

  function render(): void {
    lists.forEach((l, i) => { if (l && l.index >= 0) uis[i].cursor = l.index; });
    const built = Array.from({ length: n }, (_, seat) => panel(seat));
    lists = built.map((b, seat) => createFocusList(b.items, { start: Math.min(uis[seat].cursor, b.items.length - 1), sfx: api.sfx }));
    previews = built.map((b) => b.preview);
    msgEls = built.map((b) => b.msgEl);
    panelEls = built.map((b) => b.el);
    stageEls = built.map((b) => b.stageEl);
    bindStages(built);
    built.forEach((b, seat) => {
      for (const it of b.items) it.el.addEventListener('mousemove', () => { uis[seat].cursor = lists[seat]?.index ?? 0; previews[seat](); });
      b.preview();
    });
    const report = dealer ? null : reportBlock();
    const rival = !dealer && career ? garageRivalBlock(career) : null;
    reportHost.replaceChildren(...[report, rival].filter((x): x is HTMLElement => x !== null));
    panelsEl.replaceChildren(...built.map((b) => b.el));
  }

  /** O buraco no vidro de cada painel (máscara CSS): onde está a janela do palco o painel não cobre o canvas. Só mexe no estilo se mudou. */
  function syncHoles(): void {
    if (!use3d) return;
    panelEls.forEach((p, seat) => {
      const win = stageEls[seat];
      if (!win || typeof p.getBoundingClientRect !== 'function' || typeof win.getBoundingClientRect !== 'function') return;
      const a = p.getBoundingClientRect(); const b = win.getBoundingClientRect();
      const x = Math.round(b.left - a.left - (p.clientLeft || 0)); const y = Math.round(b.top - a.top - (p.clientTop || 0));
      const key = `${x},${y},${Math.round(b.width)},${Math.round(b.height)}`;
      if (p.getAttribute('data-hole') === key) return;
      p.setAttribute('data-hole', key);
      p.style.setProperty('--hx', `${x}px`); p.style.setProperty('--hy', `${y}px`);
      p.style.setProperty('--hw', `${Math.round(b.width)}px`); p.style.setProperty('--hh', `${Math.round(b.height)}px`);
    });
  }

  /** Assento do dispositivo; sem ninguém ligado ao P1 (tela aberta direto), o teclado 1 comanda o P1. */
  function seatFor(device: DeviceId | null): number {
    if (!device) return -1;
    for (let i = 0; i < n; i++) if (ctx.input.seatDevice(i) === device) return i;
    return ctx.input.seatDevice(0) === null && device === 'kb1' ? 0 : -1;
  }

  render();

  return {
    el,
    nav(nav: MenuNav) {
      if (started) return;
      const seat = seatFor(nav.device);
      if (seat < 0) return;
      if (nav.back) {
        if (dealer) { if (seat === 0) { api.sfx('back'); api.back(); } return; }
        if (uis[seat].ready) toggleReady(seat);
        else if (seat === 0) { api.sfx('back'); api.emit({ type: 'toMain' }); }
        return;
      }
      if (nav.start) { if (!dealer) toggleReady(seat); return; }
      const list = lists[seat];
      if (!list) return;
      // Confirmar: cada ação toca o próprio som (compra recusada soa diferente de compra feita).
      if (nav.confirm) { list.activate(); return; }
      listNav(list, nav, api.sfx);
      uis[seat].cursor = list.index;
      previews[seat]?.();
    },
    update(dt: number) {
      uis.forEach((ui, seat) => {
        if (ui.msgTtl <= 0) return;
        ui.msgTtl -= dt;
        if (ui.msgTtl <= 0) {
          const m = msgEls[seat];
          if (m) { m.textContent = !dealer && ui.ready && !allReady() ? t('career.garage.waiting') : ''; m.className = 'gp-msg'; }
        }
      });
      syncHoles();
    },
    destroy() {
      for (const s of stages) s?.release();
      stages.fill(null);
    },
  };
}
