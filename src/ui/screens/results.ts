// Resultado da corrida e classificação do campeonato.
import { isCoop, nextTrackId, teamRaceRank, teamRaceScore } from '../../core/championship';
import { seatColor, type ColorPalette } from '../../core/data/drivers';
import { formatTicks } from '../../core/sim/race';
import type { AssistLevel, CupDef, HumanEntry, RaceResultRow, StandingRow } from '../../core/types';
import { seatAssist } from '../../access/humans';
import '../../access/access.css';
import { achievementDescription, achievementName } from '../../game/achievements';
import type { ResultsScreenData, StandingsScreenData } from '../../game/contracts';
import { cupRival } from '../../game/rivals';
import { paintColors } from '../../game/paints';
import { createHoldSkip, guardConfirm, planPostRace, sequenceFor, type PostRace, type PostStepId } from '../../game/post-race';
import { mountPodium, type StageHandle } from '../../render/stage-mount';
import type { PodiumEntry } from '../../render/stage-bus';
import '../../career/strings';
import { t } from '../../i18n';
import '../../stats/strings';
import './records.css';
import './passport.css';
import './payout.css';
import { button, createFocusList, h, listNav, screenFrame, trackName, type FocusItem, type ScreenApi, type ScreenData, type ScreenInstance } from './common';
import { isVipRow, partyResultsParts } from './party';
import { VIP_COLOR } from '../../core/modes';
import { BRAZIL_REGIONS } from '../../core/data/cups';
import '../passport/strings';

/** Título grande com um chip ao lado (pista ou copa), em vez de "Resultado — Nome" numa linha só que quebra. */
export function titleRow(title: string, chip: string): HTMLElement {
  return h('div', { class: 'screen-title-row' }, h('h1', { class: 'screen-title', text: title }), h('span', { class: 'chip', text: chip }));
}
import { icon, medal } from './icons';
import { rivalRaceCard, rivalStandingsCard, rivalTag } from './rival';
import { cupTabs } from './select';

/** Cor do humano do assento na paleta das opções (a da HumanEntry é a de quem montou a corrida). */
function humanColor(humans: HumanEntry[], seat: number, palette: ColorPalette): string | null {
  return humans.some((x) => x.seat === seat) ? seatColor(seat, palette) : null;
}

function rowStyle(humans: HumanEntry[], seat: number, palette: ColorPalette): string {
  const color = seat >= 0 ? humanColor(humans, seat, palette) : null;
  return color ? `--seat:${color}` : '';
}

/**
 * Marca discreta ao lado do nome de quem correu com direção assistida (resultado local e online);
 * o nível inteiro fica no título. Nada para quem não usou.
 */
export function assistMark(level: AssistLevel): HTMLElement | null {
  if (level === 'none') return null;
  return h('span', { class: 'assist-mark', text: t('access.hud.assist'), attrs: { title: t(`access.level.${level}`) } });
}

/**
 * Pista seguinte da corrida rápida ("Mais uma?"): a ordem da tela de pistas (abas das regiões e o Mundial, copa por
 * copa); depois da última, volta à primeira. Pista fora das copas: a primeira.
 */
export function nextQuickTrackId(cups: readonly CupDef[], trackId: string): string {
  const order = cupTabs(cups).flatMap((tab) => tab.cups).flatMap((c) => c.trackIds);
  const i = order.indexOf(trackId);
  return i < 0 ? order[0] : order[(i + 1) % order.length];
}

/** Célula da posição: medalha para o pódio, número para o resto. */
function positionCell(position: number): HTMLElement {
  const m = medal(position);
  return h('td', { class: 'mono pos' }, m ?? String(position));
}

/** O botão de ir à classificação da copa (a carreira passa por aqui depois do Pagamento); `null` sem copa em andamento. */
export function standingsButton(api: ScreenApi, d: ResultsScreenData): FocusItem | null {
  const champ = d.champ;
  if (!champ || !(d.mode === 'cup' || d.mode === 'career')) return null;
  const cup = api.ctx.cups.find((c) => c.id === champ.cupId);
  if (!cup) return null;
  return button(t('ui.results.standings'), () => api.go('standings', { champ, humans: d.humans, cup, career: d.mode === 'career' }), 'btn-primary');
}

/** Os três primeiros que terminaram, com carro e pintura (a do humano; a IA corre com a de fábrica), para o pódio 3D. */
export function podiumEntries(d: ResultsScreenData): PodiumEntry[] {
  return [...d.results]
    .filter((r) => r.finished && r.position >= 1 && r.position <= 3)
    .sort((a, b) => a.position - b.position)
    .map((r) => ({
      place: r.position as 1 | 2 | 3, carId: r.carDefId,
      paint: r.seat >= 0 ? paintColors(d.humans.find((x) => x.seat === r.seat)?.paint) : null,
    }));
}

/** O plano do pós-corrida desta corrida: chegada e pódio 3D (fora do Retrô) e, na carreira com relatório, o Pagamento. */
export function postRacePlan(api: ScreenApi, d: ResultsScreenData): PostStepId[] {
  return planPostRace({
    mode: d.mode,
    podium: api.ctx.settings.renderStyle !== 'retro' && podiumEntries(d).length > 0,
    payout: d.mode === 'career' && !!api.ctx.save.career?.lastReport,
  });
}

/** O botão A de algum controle está apertado agora (o menu só recebe bordas; segurar se vê aqui). */
export function gamepadAHeld(api: ScreenApi): boolean {
  const input = api.ctx.input;
  for (const dev of input?.devices?.() ?? []) {
    if (!dev.connected || !dev.id.startsWith('gp')) continue;
    if (input.peek(dev.id)?.buttons.includes(0)) return true;
  }
  return false;
}

export function resultsScreen(api: ScreenApi, data?: ScreenData): ScreenInstance {
  const d = data as ResultsScreenData | undefined;
  if (!d || !('results' in d)) {
    const back = button(t('ui.results.menu'), () => api.emit({ type: 'toMain' }));
    const list = createFocusList([back], { sfx: api.sfx });
    return { el: screenFrame('results', t('ui.results.title'), back.el), nav: (nav) => listNav(list, nav, api.sfx) };
  }
  const { ctx } = api;
  const carName = (id: string) => ctx.cars.find((c) => c.id === id)?.name ?? id;
  // Marca nova: "PRIMEIRA MARCA" quando não havia marca anterior; "RECORDE" só quando bateu uma.
  const recordOf = (seat: number, kind: 'lap' | 'race') => d.newRecords.find((r) => r.seat === seat && r.kind === kind);
  const badge = (seat: number, kind: 'lap' | 'race') => {
    const rec = seat >= 0 ? recordOf(seat, kind) : undefined;
    if (!rec) return null;
    return h('span', { class: rec.first ? 'record-badge first' : 'record-badge', text: t(rec.first ? 'ui.results.firstMark' : 'ui.results.record') });
  };
  const rows = [...d.results].sort((a, b) => a.position - b.position);
  const cupLike = d.mode === 'cup' || d.mode === 'career';
  // Rival da copa (src/game/rivals.ts): linha marcada na tabela e o cartão do duelo em cima.
  const rivalName = cupLike && d.champ ? cupRival(d.champ.cupId).name : null;
  const isRival = (r: RaceResultRow) => r.seat < 0 && r.name === rivalName;

  // O pós-corrida (N4): chegada → pódio → pagamento → a decisão. Só corrida de verdade tem sequência; festa e contra-relógio não.
  const post: PostRace = sequenceFor(d, () => postRacePlan(api, d));
  const sequenced = post.plan.length > 0;
  const podium = post.plan.includes('podium') ? podiumEntries(d) : [];
  // A tabela de 20 linhas fica recolhida: o top 3 e a linha de cada humano ("VER TODOS" abre as 20).
  const isMine = (r: RaceResultRow) => r.seat >= 0 || isVipRow(d, r);
  const collapsedRows = rows.filter((r) => r.position <= 3 || isMine(r));
  const collapsible = sequenced && collapsedRows.length < rows.length;
  let expanded = false;

  const buildRow = (r: RaceResultRow, delay: number) => h('tr', { class: isMine(r) ? 'human' : isRival(r) ? 'rival' : '', style: `${isVipRow(d, r) ? `--seat:${VIP_COLOR}` : rowStyle(d.humans, r.seat, ctx.settings.colorPalette)};--rv:${delay}` },
    positionCell(r.position),
    h('td', {}, r.name, isRival(r) ? rivalTag() : null, r.seat >= 0 ? assistMark(seatAssist(d.humans, r.seat)) : null),
    h('td', { class: 'muted-cell', text: carName(r.carDefId) }),
    h('td', { class: 'mono' }, r.finished ? formatTicks(r.totalTicks) : t('ui.results.dnf'), badge(r.seat, 'race')),
    h('td', { class: 'mono' }, formatTicks(r.bestLapTicks), badge(r.seat, 'lap')),
    h('td', { class: 'mono num', text: String(r.points) }),
  );
  /** As linhas à vista: na chegada elas entram de baixo para cima no pódio (3º, 2º, 1º), depois as dos humanos. */
  const bodyRows = () => (collapsible && !expanded ? collapsedRows : rows).map((r) => buildRow(r, collapsible && !expanded ? (r.position <= 3 ? 3 - r.position : 3) : 0));
  const tbody = h('tbody', {}, bodyRows());
  const table = h('table', { class: 'table results-table' },
    h('thead', {}, h('tr', {},
      h('th', { text: '#' }), h('th', { text: t('ui.results.name') }), h('th', { text: t('ui.results.car') }),
      h('th', { text: t('ui.results.time') }), h('th', { text: t('ui.results.bestLap') }), h('th', { class: 'num', text: t('ui.results.points') }),
    )),
    tbody,
  );

  const extras: HTMLElement[] = [];
  const coop = d.champ ? d.champ.coop : isCoop(d.humans);
  if (cupLike && d.champ?.lastVerdict) {
    const ok = d.champ.lastVerdict === 'qualified';
    extras.push(h('div', { class: `verdict ${ok ? 'good' : 'bad'}`, text: ok ? t('ui.results.qualified') : t('ui.results.eliminated') }));
  }
  const rival = cupLike ? rivalRaceCard(d.champ, d.results) : null;
  if (rival) extras.push(rival);
  if (coop && d.humans.length > 0) {
    const teamId = d.humans[0].teamId;
    extras.push(h('p', { class: 'team-line' }, icon('users'), h('span', { text: t('ui.results.team', { team: t('core.team.human'), points: teamRaceScore(d.results, teamId), rank: teamRaceRank(d.results, teamId) }) })));
  }

  const stamp = stampNews(d.newStamp ?? null, ctx.save.stamps);
  if (stamp) extras.push(stamp);
  const party = partyResultsParts(api, d);
  extras.push(...party.extras);
  const items: FocusItem[] = [];
  if (party.items) items.push(...party.items);
  else if (cupLike && d.champ) {
    items.push(standingsButton(api, d) ?? button(t('ui.results.menu'), () => api.emit({ type: 'toMain' })));
  } else if (d.mode === 'quick') {
    // Corrida rápida: "Mais uma?" na próxima pista, com os mesmos humanos (assentos, carros e pinturas).
    const next = nextQuickTrackId(ctx.cups, d.trackDef.id);
    extras.push(h('p', { class: 'status-line' }, icon('flag'), h('span', { text: t('ui.results.nextTrack', { track: trackName(next) }) })));
    items.push(button(t('ui.results.again'), () => api.emit({ type: 'startQuick', trackId: next, laps: ctx.settings.quickLaps, humans: d.humans }), 'btn-primary'));
    items.push(button(t('ui.results.retry'), () => api.emit({ type: 'retryRace' })));
    items.push(button(t('ui.results.menu'), () => api.emit({ type: 'toMain' })));
  } else {
    items.push(button(t('ui.results.retry'), () => api.emit({ type: 'retryRace' }), 'btn-primary'));
    items.push(button(t('ui.results.menu'), () => api.emit({ type: 'toMain' })));
  }
  // "VER TODOS (20)": o último item, para o botão principal continuar sendo o primeiro foco.
  const toggle = collapsible ? button(t('ui.results.showAll', { n: rows.length }), () => setExpanded(!expanded)) : null;
  if (toggle) items.push(toggle);
  const list = createFocusList(items, { sfx: api.sfx });
  const unlocked = achievementsPanel(d, ctx.settings.colorPalette);
  const wrap = h('div', { class: 'table-wrap glass' }, table);

  // A janela do pódio 3D e a cortina que a esconde na chegada (o palco é uma tela atrás da interface: a cortina é opaca).
  const curtain = podium.length > 0 ? h('div', { class: 'results-podium-curtain' }, icon('trophy'), h('span', { text: t('ui.results.podium') })) : null;
  const podiumEl = podium.length > 0 ? h('div', { class: 'results-podium stage-window' }, curtain) : null;
  const hint = h('p', { class: 'hint payout-skip results-skip', text: t('ui.results.skip') });
  hint.addEventListener('click', () => skipAll());

  const el = screenFrame('results', null,
    titleRow(t('ui.results.title'), trackName(d.trackDef.id, d.trackDef.name)),
    h('div', { class: 'results-head' }, extras),
    unlocked,
    podiumEl,
    wrap,
    sequenced ? hint : null,
    h('div', { class: 'actions' }, items.map((i) => i.el)),
  );
  if (podiumEl) el.classList.add('stage3d');

  let handle: StageHandle | null = null;
  if (podiumEl) {
    const first = d.humans[0];
    handle = mountPodium(podiumEl, podium, {
      id: 'results:podium', quality: ctx.settings.quality, reduceEffects: ctx.settings.reduceEffects,
      ring: first ? seatColor(first.seat, ctx.settings.colorPalette) : undefined,
    });
  }

  function setExpanded(on: boolean): void {
    expanded = on;
    tbody.replaceChildren(...bodyRows());
    el.classList.toggle('expanded', on);
    if (toggle) toggle.el.textContent = on ? t('ui.results.showTop') : t('ui.results.showAll', { n: rows.length });
    if (on) revealRow(wrap, table.querySelector('tr.human'));
    else wrap.scrollTop = 0;
  }

  const hold = createHoldSkip();
  let left = false;
  function paint(): void {
    const step = post.step;
    el.setAttribute('data-post-ready', post.ready ? '1' : '0');
    el.setAttribute('data-post-step', step ?? 'ready');
    // O pódio aparece quando a chegada acaba; pulado ou pronto, já está à mostra.
    const podiumAt = post.plan.indexOf('podium');
    curtain?.classList.toggle('up', !post.ready && podiumAt >= 0 && post.stepIndex < podiumAt);
    el.classList.toggle('arrival', step === 'arrival');
    hint.classList.toggle('done', post.ready);
    for (const i of items) i.el.classList.toggle('pending', !post.ready);
  }
  function skipAll(): void {
    if (post.ready) return;
    post.skip();
    paint();
    // Pulou: com o Pagamento no plano, é ele que fecha a sequência (já com os números finais).
    if (post.plan.includes('payout')) goPayout();
  }
  function goPayout(): void {
    if (left) return;
    left = true;
    api.go('payout', d);
  }
  paint();

  let revealed = false;
  return {
    el,
    nav(nav) {
      // Enter segurado (a repetição do teclado vira `start`) e o Start do controle pulam a sequência; o confirmar solto, com ela
      // andando, é engolido: quem martela o botão na chegada não larga a próxima corrida por acidente.
      if (nav.start && !post.ready) { skipAll(); return; }
      const guarded = nav.confirm && !guardConfirm(post);
      listNav(list, guarded ? { ...nav, confirm: false } : nav, api.sfx);
    },
    update(dt) {
      if (!el.isConnected) return;
      if (!post.ready) {
        if (hold.observe(dt, gamepadAHeld(api))) { skipAll(); return; }
        const before = post.step;
        post.advance(dt);
        // O Pagamento é outra tela: a sequência chega nele sozinha.
        if (post.step === 'payout' && before !== 'payout') goPayout();
        paint();
      }
      // No primeiro quadro já montado: a tabela completa pode não caber e o foco fica nos botões — rola até o primeiro humano.
      if (revealed) return;
      revealed = true;
      if (!sequenced) revealRow(wrap, table.querySelector('tr.human'));
    },
    destroy() {
      handle?.release();
      handle = null;
    },
  };
}

/**
 * Carimbo ganho nesta corrida (copa de estado concluída pela primeira vez): o carimbo com a sigla e "Bahia carimbado
 * no passaporte!"; se ele fechou a região, uma etiqueta "Região Nordeste completa!" ao lado. Uma linha só (o
 * resultado é apertado).
 */
export function stampNews(state: string | null, stamps: readonly string[]): HTMLElement | null {
  if (!state) return null;
  const region = BRAZIL_REGIONS.find((r) => r.states.includes(state));
  const regionDone = !!region && region.states.every((s) => s === state || stamps.includes(s));
  return h('div', { class: 'stamp-news', attrs: { 'data-region': region?.id ?? '' } },
    h('span', { class: 'stamp-news-mark', attrs: { title: t('passport.results.stamp') } }, h('span', { text: state })),
    h('span', { class: 'stamp-news-text', text: t('core.passport.stamped', { state: t(`core.state.${state}`) }) }),
    regionDone && region ? h('span', { class: 'stamp-news-region', text: t('passport.results.regionDone', { region: t(`core.region.${region.id}`) }) }) : null,
  );
}

/** Rola `wrap` (só ele, não a tela) até `row` ficar visível abaixo do cabeçalho fixo da tabela. */
function revealRow(wrap: HTMLElement, row: Element | null): void {
  if (!row) return;
  const w = wrap.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  const head = wrap.querySelector('thead')?.getBoundingClientRect().height ?? 0;
  if (r.bottom > w.bottom) wrap.scrollTop += r.bottom - w.bottom + r.height / 2;
  else if (r.top < w.top + head) wrap.scrollTop -= w.top + head - r.top;
}

/** Acima disto os cartões ficam compactos (só o nome): a tabela não pode sumir da tela. */
const FULL_CHIPS_MAX = 4;

/** Conquistas desbloqueadas nesta corrida, com a cor de quem as ganhou. */
function achievementsPanel(d: ResultsScreenData, palette: ColorPalette): HTMLElement | null {
  const list = d.achievements ?? [];
  if (list.length === 0) return null;
  const many = list.length > FULL_CHIPS_MAX;
  return h('div', { class: `results-ach glass${many ? ' many' : ''}` },
    h('span', { class: 'results-ach-title' }, icon('trophy'), h('span', { text: t('stats.results.title') })),
    h('div', { class: 'results-ach-list' }, list.map((u) => h('div', { class: 'ach-chip', attrs: { title: achievementDescription(u.id) } },
      h('span', { class: 'ach-chip-seats' }, u.seats.map((seat) => h('i', {
        class: 'seat-dot', style: `--seat:${humanColor(d.humans, seat, palette) ?? 'var(--accent)'}`,
        title: d.humans.find((x) => x.seat === seat)?.name ?? '',
      }))),
      h('span', { class: 'ach-chip-text' },
        h('strong', { text: achievementName(u.id) }),
        h('span', { text: achievementDescription(u.id) }),
      ),
    ))),
  );
}

export function standingsScreen(api: ScreenApi, data?: ScreenData): ScreenInstance {
  const d = data as StandingsScreenData | undefined;
  if (!d || !('champ' in d) || !('cup' in d)) {
    const back = button(t('ui.standings.menu'), () => api.emit({ type: 'toMain' }));
    const list = createFocusList([back], { sfx: api.sfx });
    return { el: screenFrame('standings', t('ui.standings.title'), back.el), nav: (nav) => listNav(list, nav, api.sfx) };
  }
  const { champ, humans, cup } = d;
  const raceCount = cup.trackIds.length;
  const rivalName = cupRival(champ.cupId).name;
  // Top 10, os humanos e o rival da copa (mesmo fora do top 10).
  const top = champ.standings.filter((s, i) => i < 10 || s.seat >= 0 || s.name === rivalName);
  const driverTable = h('table', { class: 'table standings-table' },
    h('thead', {}, h('tr', {},
      h('th', { text: '#' }), h('th', { text: t('ui.results.name') }), h('th', { class: 'num', text: t('ui.standings.points') }), h('th', { class: 'num', text: t('ui.standings.wins') }),
      Array.from({ length: raceCount }, (_, i) => h('th', { class: 'num', text: t('ui.standings.race', { n: i + 1 }) })),
    )),
    h('tbody', {}, top.map((s: StandingRow) => h('tr', { class: s.seat >= 0 ? 'human' : s.name === rivalName ? 'rival' : '', style: rowStyle(humans, s.seat, api.ctx.settings.colorPalette) },
      positionCell(champ.standings.indexOf(s) + 1),
      h('td', {}, s.name, s.seat < 0 && s.name === rivalName ? rivalTag() : null),
      h('td', { class: 'mono num strong', text: String(s.points) }),
      h('td', { class: 'mono num', text: String(s.wins) }),
      s.positions.map((p) => h('td', { class: 'mono num', text: p > 0 ? String(p) : '–' })),
    ))),
  );
  const teamTable = h('table', { class: 'table teams-table' },
    h('thead', {}, h('tr', {}, h('th', { text: '#' }), h('th', { text: t('ui.standings.teams') }), h('th', { class: 'num', text: t('ui.standings.points') }))),
    h('tbody', {}, champ.teams.map((tm, i) => h('tr', { class: tm.isHuman ? 'human' : '', style: tm.isHuman && humans.length > 0 ? `--seat:${seatColor(humans[0].seat, api.ctx.settings.colorPalette)}` : '' },
      positionCell(i + 1),
      h('td', { text: tm.name }),
      h('td', { class: 'mono num strong', text: String(tm.points) }),
    ))),
  );

  const next = nextTrackId(champ);
  const nextDef = next ? api.ctx.tracks.find((x) => x.id === next) : undefined;
  let status: HTMLElement;
  if (champ.completed) status = h('div', { class: 'verdict good big' }, icon('trophy'), h('span', { text: t('ui.standings.champion') }));
  else if (champ.eliminated) status = h('div', { class: 'verdict bad big', text: t('ui.standings.eliminated') });
  else status = h('p', { class: 'status-line' }, icon('flag'), h('span', { text: t('ui.standings.next', { n: champ.raceIndex + 1, m: raceCount, track: next ? trackName(next, nextDef?.name) : '?' }) }));

  const items: FocusItem[] = [];
  // Carreira: depois da classificação vem sempre a garagem (prêmio, compras, próxima corrida ou copa).
  if (d.career) items.push(button(t('ui.standings.garage'), () => api.emit({ type: 'nextRace' }), 'btn-primary'));
  else if (next && !champ.eliminated && !champ.completed) items.push(button(t('ui.standings.nextBtn'), () => api.emit({ type: 'nextRace' }), 'btn-primary'));
  else if (champ.eliminated) {
    // Eliminado: recomeça a mesma copa com os mesmos humanos (a sessão regrava a copa salva do zero).
    items.push(button(t('ui.standings.restart'), () => api.emit({ type: 'startCup', cupId: cup.id, humans }), 'btn-primary'));
    items.push(button(t('ui.standings.menu'), () => api.emit({ type: 'toMain' })));
  } else {
    // Campeão: a copa que esta abriu (a corrente é linear); na última, só o menu.
    const nextCup = champ.completed ? api.ctx.cups.find((c) => c.requires === cup.id && api.ctx.isCupUnlocked(c.id)) : undefined;
    if (nextCup) items.push(button(t('ui.standings.nextCup'), () => api.emit({ type: 'startCup', cupId: nextCup.id, humans }), 'btn-primary'));
    items.push(button(t('ui.standings.menu'), () => api.emit({ type: 'toMain' }), nextCup ? '' : 'btn-primary'));
  }
  const list = createFocusList(items, { sfx: api.sfx });
  const el = screenFrame('standings', null,
    titleRow(t('ui.standings.title'), t(`core.cup.${cup.id}`)),
    h('div', { class: 'results-head' }, status, rivalStandingsCard(champ)),
    h('div', { class: 'standings-columns' },
      h('div', { class: 'table-wrap glass' }, h('h2', { class: 'sub-title', text: t('ui.standings.drivers') }), driverTable),
      h('div', { class: 'table-wrap glass' }, h('h2', { class: 'sub-title', text: t('ui.standings.teams') }), teamTable),
    ),
    h('div', { class: 'actions' }, items.map((i) => i.el)),
  );
  return { el, nav: (nav) => listNav(list, nav, api.sfx) };
}
