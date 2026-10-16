// Lobby: um cartão por assento (grade 2×2), cada um navegado pelo próprio dispositivo; o
// Jogador 1 configura a corrida no painel da direita. Entrar/sair de assento vem do
// InputProvider (`joinPressed`/`leavePressed`) no `update()`; navegação vem do teclado (DOM)
// e do gamepad (`navigate`), sempre com o `device` que apertou.
import '../../career/strings';
import './garage.css';
import './lobby.css';
import '../../access/strings';
import { assistedHumans } from '../../access/humans';
import { seatColor } from '../../core/data/drivers';
import { ASSIST_LEVELS } from '../../core/sim/assist';
import type { CarDef, CarLook, HumanEntry } from '../../core/types';
import type { CarColors, DeviceId, MenuContext, MenuNav, SaveData } from '../../game/contracts';
import { carAvailable } from '../../game/career-save';
import '../../cosmetics/strings';
import { factoryColors, lookColors, stepLook, type LookField } from '../../game/cosmetics';
import { ORIGINAL_PAINT, seatLook, seatPaint, setSeatLook, stepSeatPaint, withLook } from '../../game/paints';
import { NAME_MAX_LENGTH, saveSave } from '../../game/save';
import { t } from '../../i18n';
import { isPartyMode, lobbyHidesCar, lobbyHidesDriver, lobbyTeamLabel, partySeatsProblem, versusAllowed } from '../../party/rules';
import { isKeyboard } from '../input';
import { arrowButton, button, carCard, createFocusList, h, listNav, screenFrame, selector, type FocusItem, type FocusList, type LobbySeat, type LobbyState, type ScreenApi, type ScreenInstance, type Selector } from './common';
import { icon } from './icons';
import { commitSettings, raceOptionSelectors } from './options';
import { lookButton, lookEditor, lookSummary, paintSelector } from './paint';
import { carLocked, lockRow } from './progress';
import { cosmeticUnlocked } from '../../game/progression';
import { mountShowroom, type StageHandle } from '../../render/stage-mount';

export const LOBBY_SEATS = 4;

/** O carro trancado (O5) no palco 3D do lobby: grafite fosco, sem o visual do assento (T8). */
export const LOCKED_PAINT: Readonly<CarColors> = Object.freeze({ color: '#3b404b', accent: '#2a2e36' });

/** Carros escolhíveis no lobby: os livres e os comprados em alguma carreira (a mesma regra do online). */
export function availableCars(ctx: Pick<MenuContext, 'cars' | 'save'>): CarDef[] {
  return ctx.cars.filter((c) => carAvailable(ctx.save, c));
}

/**
 * O carro da corrida de um assento (O5): o que ele tem à mostra, se liberado; senão o primeiro livre. O lobby percorre os 14 (o trancado
 * aparece com o cadeado em vez de sumir), mas nenhum HumanEntry sai com carro trancado. `carIndex` é o índice em `ctx.cars`.
 */
function raceCarOf(ctx: Pick<MenuContext, 'cars' | 'save'>, carIndex: number): CarDef {
  const shown = ctx.cars[carIndex];
  return shown && carAvailable(ctx.save, shown) ? shown : availableCars(ctx)[0] ?? ctx.cars[0];
}

/** Pilotos do jogo salvo que o lobby de "Continuar" religa (nome, carro e pintura, na ordem dos assentos). */
export function resumeRoster(lobby: LobbyState, save: SaveData): Array<{ name: string; carId: string | null; look?: CarLook }> {
  if (!lobby.resume) return [];
  if (lobby.mode === 'career') return save.career?.drivers.map((d) => ({ name: d.name, carId: null })) ?? [];
  return save.cupInProgress?.humans.map((h) => ({ name: h.name, carId: h.carId, look: h.look })) ?? [];
}

export function maxSeats(lobby: LobbyState, save?: SaveData): number {
  if (lobby.mode === 'timetrial') return 1;
  const roster = save ? resumeRoster(lobby, save) : [];
  return roster.length > 0 ? roster.length : LOBBY_SEATS;
}

export function occupiedSeats(lobby: LobbyState): LobbySeat[] {
  return lobby.seats.filter((s): s is LobbySeat => s !== null).sort((a, b) => a.seat - b.seat);
}

export function seatOfDevice(lobby: LobbyState, device: DeviceId): number {
  return lobby.seats.findIndex((s) => s !== null && s.device === device);
}

export function canStart(lobby: LobbyState, save?: SaveData): boolean {
  const seats = occupiedSeats(lobby);
  // Continuar: todos os pilotos do jogo salvo precisam estar sentados.
  if (lobby.resume && save && seats.length !== maxSeats(lobby, save)) return false;
  if (partySeatsProblem(lobby.mode, seats.length)) return false;
  return lobby.seats[0] !== null && seats.length > 0 && seats.every((s) => s.ready);
}

/**
 * Humanos da corrida a partir do lobby: co-op = todos no time 0; versus = time = assento; a direção assistida e a
 * pintura que cada assento escolheu para o carro dele (a Original não entra no objeto).
 */
export function lobbyHumans(api: ScreenApi): HumanEntry[] {
  const { settings, save } = api.ctx;
  const seats = occupiedSeats(api.lobby);
  // Modo que não admite versus (escolta; revezamento com uma dupla) corre em equipe mesmo com o seletor esquecido.
  const versus = api.lobby.versus && versusAllowed(api.lobby.mode, seats.length);
  return assistedHumans(seats.map((s) => {
    const carId = raceCarOf(api.ctx, s.carIndex).id;
    return withLook({
      seat: s.seat,
      name: s.name.trim() || `P${s.seat + 1}`,
      carId,
      teamId: versus ? s.seat : 0,
      color: seatColor(s.seat, settings.colorPalette),
    }, seatLook(save, s.seat, carId));
  }), settings.seatAssists);
}

function newSeat(api: ScreenApi, seat: number, device: DeviceId): LobbySeat {
  const { save } = api.ctx;
  const cars = api.ctx.cars;
  const saved = resumeRoster(api.lobby, save)[seat];
  // O carro guardado do assento só se estiver liberado (O5: o lobby mostra o trancado, mas não começa nele); o da copa salva, sempre.
  const wanted = saved?.carId ?? save.seatCars[seat];
  const carId = saved?.carId || cars.some((c) => c.id === wanted && carAvailable(save, c)) ? wanted : raceCarOf(api.ctx, -1).id;
  const carIndex = Math.max(0, cars.findIndex((c) => c.id === carId));
  return { seat, device, name: saved?.name ?? save.seatNames[seat] ?? `P${seat + 1}`, carIndex, ready: false, cursor: startCursor(api.lobby) };
}

/**
 * Onde o cursor de um assento começa: no carro (1) normalmente; no PRONTO quando não há carro nem
 * nome a escolher — no "Continuar" e no torneio o PRONTO é o item 0 (na carreira nova, [nome, PRONTO] → 1).
 */
export function startCursor(lobby: LobbyState): number {
  return lobby.resume || lobbyHidesDriver(lobby.mode) ? 0 : 1;
}

/** Alinha o lobby com os assentos do InputProvider (quem já estava ligado continua no lugar). */
function syncWithInput(api: ScreenApi): void {
  const { lobby } = api;
  const limit = maxSeats(lobby, api.ctx.save);
  for (let seat = 0; seat < LOBBY_SEATS; seat++) {
    const device = api.ctx.input.seatDevice(seat);
    if (seat >= limit) {
      if (device) api.ctx.input.unbindSeat(seat);
      lobby.seats[seat] = null;
      continue;
    }
    const existing = lobby.seats[seat];
    if (!device) lobby.seats[seat] = null;
    else if (!existing || existing.device !== device) lobby.seats[seat] = newSeat(api, seat, device);
  }
  if (lobby.mode === 'timetrial' || (isPartyMode(lobby.mode) && lobby.mode !== 'relay')) lobby.versus = false;
  // Continuar: o modo é o do jogo salvo (co-op = todos no mesmo time).
  if (lobby.resume) {
    // Quem já estava sentado (voltou de outra tela) mostra o nome e o carro do jogo salvo.
    const roster = resumeRoster(lobby, api.ctx.save);
    const cars = api.ctx.cars;
    lobby.seats.forEach((s, i) => {
      const r = roster[i];
      if (!s || !r) return;
      s.name = r.name;
      if (r.carId) s.carIndex = Math.max(0, cars.findIndex((c) => c.id === r.carId));
    });
    const { career, cupInProgress } = api.ctx.save;
    if (lobby.mode === 'career' && career) lobby.versus = !career.coop && career.drivers.length > 1;
    else if (cupInProgress) lobby.versus = cupInProgress.humans.some((h) => h.teamId !== cupInProgress.humans[0].teamId);
  }
}

export function lobbyScreen(api: ScreenApi): ScreenInstance {
  const { ctx, lobby } = api;
  const { input, save } = ctx;
  // O5: os 14 carros; o trancado aparece com o cadeado e "Compre na Expedição por $ X" (não pode ser escolhido: PRONTO e INICIAR recusam).
  const cars = ctx.cars;
  const career = lobby.mode === 'career';
  const resume = lobby.resume === true;
  syncWithInput(api);

  const body = h('div', { class: 'lobby-body' });
  const chip = resume ? `${t(`ui.main.${lobby.mode}`)} · ${t('career.lobby.resume')}` : t(`ui.main.${lobby.mode}`);
  const el = screenFrame('lobby', null,
    h('div', { class: 'lobby-head' },
      h('h1', { class: 'screen-title', text: t('ui.lobby.title') }),
      h('span', { class: 'chip', text: chip }),
      h('span', { class: 'lobby-help', text: resume ? t('career.lobby.resumeHint', { n: maxSeats(lobby, save) }) : t('ui.lobby.joinHint') }),
    ),
    body,
  );
  let lists: Array<FocusList | null> = [null, null, null, null];
  /**
   * O editor do visual (N3) aberto: um painel por cima do lobby, para UM assento por vez, só com o dispositivo dele (docs/ondas/N/N3.md, §4.7).
   * Em cartão 2×2 não cabem oito linhas sem cortar o rótulo (o playtest-layout mediu): o painel tem o lobby inteiro. Enquanto ele está aberto
   * os outros assentos esperam (o que valem são o editor e o Voltar do dono), e nenhum outro abre o dele.
   */
  let editingSeat: number | null = null;
  /** O cursor do assento antes de abrir o editor (a lista dele troca para a do editor e volta ao mesmo item). */
  let cursorBefore = 0;
  /** O P1 acabou de ficar PRONTO: o próximo render põe o cursor dele em INICIAR (o render reconstrói as listas). */
  let focusStartNext = false;
  /** Assentos com um carro trancado à mostra, onde o carro se escolhe aqui (refeito a cada render): esses não ficam PRONTOS. */
  const lockedSeats = new Set<number>();
  /**
   * O carro de cada assento no palco 3D (T8; `mountShowroom`, N2), como a garagem: fora do Retrô, na janela `.car-stage` do cartão. O painel
   * leva a qualidade das Opções (a Baixa desenha sem pós) e o "reduzir efeitos" (o prato não gira). `stageEls`/`slotEls` medem o buraco no
   * vidro de cada cartão (`syncHoles`), por onde o canvas aparece.
   */
  const use3d = ctx.settings.renderStyle !== 'retro';
  const stages: Array<StageHandle | null> = [null, null, null, null];
  const stageEls: Array<HTMLElement | null> = [null, null, null, null];
  const slotEls: Array<HTMLElement | null> = [null, null, null, null];

  const saveCursors = () => {
    lobby.seats.forEach((s, i) => { const l = lists[i]; if (s && l && l.index >= 0) s.cursor = l.index; });
  };

  const deviceLabel = (device: DeviceId) => input.devices().find((d) => d.id === device)?.label ?? device;

  const join = (seat: number, device: DeviceId) => {
    if (editingSeat === seat) editingSeat = null;
    input.bindSeat(seat, device);
    lobby.seats[seat] = newSeat(api, seat, device);
    api.sfx('confirm');
    render();
  };

  const leave = (seat: number) => {
    if (editingSeat === seat) editingSeat = null;
    input.unbindSeat(seat);
    lobby.seats[seat] = null;
    api.sfx('back');
    render();
  };

  /** ←/→ num campo do visual: grava no save do assento para o carro dele (a pintura da paleta é a de sempre, as demais mexem no look). */
  const stepField = (s: LobbySeat, field: LookField, dir: -1 | 1) => {
    if (s.ready) return;
    const carId = (cars[s.carIndex] ?? cars[0]).id;
    // O5: os prêmios da maestria (aro dourado, cromado, camaleão) só aparecem para o perfil do assento com a maestria daquele carro.
    const name = s.name.trim() || `P${s.seat + 1}`;
    if (field === 'paint') stepSeatPaint(save, s.seat, carId, dir);
    else setSeatLook(save, s.seat, carId, stepLook(seatLook(save, s.seat, carId), field, dir, carId, (f, v) => cosmeticUnlocked(ctx.progress, name, carId, f, v)));
    saveSave(save);
  };

  /** Abre/fecha o editor do visual do assento: a lista de foco dele troca para a do editor e volta ao mesmo item. */
  const openEditor = (s: LobbySeat) => {
    if (editingSeat !== null) return;
    cursorBefore = lists[s.seat]?.index ?? s.cursor;
    lists[s.seat] = null; // o render não regrava o cursor desta lista (o do editor começa em cima)
    s.cursor = 0;
    editingSeat = s.seat;
    api.sfx('confirm');
    render();
  };
  const closeEditor = (s: LobbySeat) => {
    if (editingSeat !== s.seat) return;
    lists[s.seat] = null;
    s.cursor = cursorBefore;
    editingSeat = null;
    api.sfx('back');
    render();
  };

  const toggleReady = (s: LobbySeat) => {
    if (!s.ready && lockedSeats.has(s.seat)) { api.sfx('back'); return; }
    if (editingSeat === s.seat) editingSeat = null;
    s.ready = !s.ready;
    api.sfx(s.ready ? 'confirm' : 'back');
    if (s.ready && s.seat === 0) focusStartNext = true;
    render();
  };

  /** Confirmar no carro, na pintura ou na direção: só dá PRONTO, nunca tira (tirar é o botão PRONTO). */
  const markReady = (s: LobbySeat) => {
    if (s.ready) return;
    if (lockedSeats.has(s.seat)) { api.sfx('back'); return; }
    if (editingSeat === s.seat) editingSeat = null;
    s.ready = true;
    api.sfx('confirm');
    if (s.seat === 0) focusStartNext = true;
    render();
  };

  const start = () => {
    if (!canStart(lobby, save) || occupiedSeats(lobby).some((s) => lockedSeats.has(s.seat))) { api.sfx('back'); return; }
    api.sfx('confirm');
    if (career) api.emit({ type: 'startCareer', humans: lobbyHumans(api), resume });
    else if (resume) api.emit({ type: 'continueCup' });
    else if (lobby.mode === 'tournament') api.go('tournament');
    else api.go(lobby.mode === 'cup' ? 'cups' : 'tracks');
  };

  function occupiedSlot(s: LobbySeat): { el: HTMLElement; items: FocusItem[] } {
    const color = seatColor(s.seat, ctx.settings.colorPalette);
    const nameInput = h('input', {
      class: 'name-input',
      attrs: { type: 'text', maxlength: String(NAME_MAX_LENGTH), value: s.name, spellcheck: 'false', autocomplete: 'off', 'aria-label': t('ui.lobby.name'), title: t('ui.lobby.name') },
      on: { input: () => { s.name = nameInput.value; } },
    });
    // Continuar: o nome é o do jogo salvo (está na classificação), sem edição. Torneio: vem da inscrição.
    const hidesDriver = lobbyHidesDriver(lobby.mode);
    const rank = occupiedSeats(lobby).indexOf(s);
    const partner = lobbyHidesCar(lobby.mode, rank) ? occupiedSeats(lobby)[rank - 1] : undefined;
    // O nome mora no cabeçalho do cartão, ao lado do P1: a linha "Nome" saiu para caber a pintura embaixo do carro.
    const nameRow: FocusItem | null = resume || hidesDriver ? null : {
      el: h('span', { class: 'slot-name' }, nameInput),
      activate: () => { nameInput.focus(); nameInput.select(); },
    };
    const nameEl = hidesDriver ? null : nameRow ? nameRow.el : h('strong', { class: 'slot-name static', text: s.name, title: t('ui.lobby.name') });
    // Pintura: a que este assento guardou para o carro à mostra (save.seatLooks); no "Continuar", a da copa salva.
    const carNow = () => cars[s.carIndex] ?? cars[0];
    const paintNow = () => (resume ? resumeRoster(lobby, save)[s.seat]?.look?.paint ?? ORIGINAL_PAINT : seatPaint(save, s.seat, carNow().id));
    // O visual inteiro (N3): o desenho do carro mostra a cor e o detalhe dele; no "Continuar", o da copa salva.
    const lookNow = () => (resume ? resumeRoster(lobby, save)[s.seat]?.look ?? null : seatLook(save, s.seat, carNow().id));
    let paintItem: Selector | null = null;
    const lockedNow = () => carLocked(save, carNow());
    // Carreira: carro e melhorias ficam na garagem. Copa retomada: o carro é o da copa salva.
    const choosesCar = !(career || resume || hidesDriver || partner);
    // O cartão mostra o carro (escolhido aqui ou o da copa retomada); nos outros casos vai uma nota no lugar dele.
    const showsCar = !(career || hidesDriver || partner);
    const grey = () => choosesCar && lockedNow();
    const paint3d = (): CarColors | null => (grey() ? LOCKED_PAINT : lookColors(lookNow(), factoryColors(carNow())));
    const card = (): HTMLElement => {
      if (!use3d || !showsCar) return carCard(carNow(), cars, lookNow());
      const win = h('div', { class: 'car-stage', attrs: { 'data-car': carNow().id, 'data-color': paint3d()?.color ?? carNow().color } });
      stageEls[s.seat] = win;
      stages[s.seat] = mountShowroom(win, {
        id: `lobby:P${s.seat + 1}`, carId: carNow().id, paint: paint3d(), look: grey() ? null : lookNow(),
        quality: ctx.settings.quality, reduceEffects: ctx.settings.reduceEffects, ring: color,
      });
      return carCard(carNow(), cars, lookNow(), win);
    };
    const heroBody = h('div', { class: 'car-hero-body' }, card());
    const showCar = () => heroBody.replaceChildren(card());
    const changeCar = (dir: -1 | 1) => {
      if (s.ready) return;
      const was = lockedNow();
      s.carIndex = (s.carIndex + dir + cars.length) % cars.length;
      // Com um trancado no meio (entrou, saiu ou foi de um para outro): a linha da pintura vira a do cadeado, ou volta, ou troca de preço;
      // o cartão é refeito (a captura do playtest-layout mostrou o preço do carro anterior ficando na linha).
      if (was || lockedNow()) { render(); return; }
      showCar();
      paintItem?.refresh();
    };
    const isLocked = choosesCar && lockedNow();
    if (isLocked) lockedSeats.add(s.seat);
    const carItem: FocusItem | null = !choosesCar ? null : {
      el: h('div', { class: `car-hero${s.ready ? ' locked' : ''}${isLocked ? ' is-locked' : ''}`, attrs: isLocked ? { 'data-locked': '1' } : {} },
        arrowButton(-1, () => { changeCar(-1); api.sfx('move'); }),
        heroBody,
        arrowButton(1, () => { changeCar(1); api.sfx('move'); }),
      ),
      adjust: changeCar,
      activate: () => markReady(s),
    };
    // A pintura só onde o carro se escolhe aqui (carreira: na garagem; copa retomada: a da copa salva). Carro trancado (O5): no lugar dela, a
    // linha do cadeado (o mesmo item de foco: ←→ troca o carro, confirmar recusa).
    const lockItem: FocusItem | null = carItem && isLocked ? lockRow(carNow(), changeCar, () => api.sfx('back')) : null;
    paintItem = carItem && !isLocked ? paintSelector({
      current: paintNow,
      car: carNow,
      onAdjust: (dir) => {
        if (s.ready) return;
        stepSeatPaint(save, s.seat, carNow().id, dir);
        saveSave(save);
        showCar();
      },
      sfx: api.sfx,
      onActivate: () => markReady(s),
      cls: s.ready ? 'locked' : '',
    }) : null;
    // O visual inteiro: um botão (só o ícone: a altura e a largura do cartão 2×2 não comportam texto) que abre o editor por cima do lobby. Só onde o carro
    // se escolhe aqui, como a pintura; mora no rodapé, ao lado do PRONTO. O resumo do que mudou fica na dica do mouse e em `data-summary`.
    const lookItem: FocusItem | null = carItem ? lookButton(lookSummary(lookNow()), () => { if (!s.ready && !isLocked) openEditor(s); else if (isLocked) api.sfx('back'); }, s.ready || isLocked ? 'locked' : '') : null;
    const carEl = carItem ? carItem.el
      : career ? h('div', { class: 'car-hero locked lobby-note' }, icon('flag'), h('span', { text: t('career.lobby.carNote') }))
      : hidesDriver ? h('div', { class: 'car-hero locked lobby-note' }, icon('users'), h('span', { text: t('party.lobby.tournamentNote') }))
      : partner ? h('div', { class: 'car-hero locked lobby-note' }, icon('users'), h('span', { text: t('party.lobby.partnerCar', { name: partner.name.trim() || `P${partner.seat + 1}` }) }))
      : h('div', { class: 'car-hero locked' }, heroBody);
    // Direção assistida do assento (grava nas opções); confirmar aqui é PRONTO, como no carro.
    // (A sessão troca o array a cada mudança de opções: sempre lido de ctx.settings, nunca guardado.)
    const assistOf = () => ctx.settings.seatAssists[s.seat] ?? 'none';
    const assistItem = selector(t('access.lobby.assist'), () => t(`access.level.${assistOf()}`), (dir) => {
      if (s.ready) return;
      const i = ASSIST_LEVELS.indexOf(assistOf());
      ctx.settings.seatAssists[s.seat] = ASSIST_LEVELS[(i + dir + ASSIST_LEVELS.length) % ASSIST_LEVELS.length];
      commitSettings(api);
    }, { sfx: api.sfx, onActivate: () => markReady(s), cls: `sel-assist${s.ready ? ' locked' : ''}` });
    const ready = button(t('ui.lobby.ready'), () => toggleReady(s), s.ready ? 'btn-ready on' : 'btn-ready');
    if (s.ready) ready.el.prepend(icon('check'));
    const team = lobbyTeamLabel(lobby.mode, rank)
      ?? (lobby.versus ? t('ui.lobby.teamN', { n: s.seat + 1 }) : t('core.team.human'));
    const slot = h('div', { class: `slot occupied glass${s.ready ? ' ready' : ''}${use3d && showsCar ? ' has-stage' : ''}`, style: `--seat:${color}` },
      h('div', { class: 'slot-head' },
        h('span', { class: 'seat-badge', text: `P${s.seat + 1}` }),
        nameEl,
        h('span', { class: 'slot-device', title: deviceLabel(s.device) }, icon(isKeyboard(s.device) ? 'keyboard' : 'gamepad'), h('span', { text: deviceLabel(s.device) })),
        s.ready ? h('span', { class: 'slot-state on' }, icon('check'), t('ui.lobby.ready')) : null,
      ),
      carEl,
      paintItem?.el,
      lockItem?.el,
      assistItem.el,
      h('div', { class: 'slot-foot' },
        h('span', { class: 'slot-team' }, icon('users'), h('span', { text: team })),
        lookItem?.el,
        ready.el,
      ),
    );
    slotEls[s.seat] = slot;
    return { el: slot, items: [nameRow, carItem, paintItem ?? lockItem, assistItem, lookItem, ready].filter((x): x is FocusItem => x !== null) };
  }

  function emptySlot(seat: number): HTMLElement {
    const slot = h('div', { class: 'slot empty glass', style: `--seat:${seatColor(seat, ctx.settings.colorPalette)}` },
      h('span', { class: 'seat-badge', text: `P${seat + 1}` }),
      h('span', { class: 'slot-empty-icons' }, icon('keyboard'), icon('gamepad')),
      h('p', { class: 'slot-join', text: t('ui.lobby.join') }),
    );
    slot.addEventListener('click', () => {
      // Com o mouse: entra com o primeiro teclado livre.
      const free = (['kb1', 'kb2'] as const).find((id) => seatOfDevice(lobby, id) < 0);
      if (free && lobby.seats[seat] === null) join(seat, free);
    });
    return slot;
  }

  function panel(): { el: HTMLElement; items: FocusItem[] } {
    const tt = lobby.mode === 'timetrial';
    const items: FocusItem[] = [];
    // Sozinho no sofá: sem Modo (versus de um?) e sem as 4 assistências de co-op, que só valem com companheiro.
    const n = occupiedSeats(lobby).length;
    if (!tt && !resume && n >= 2 && versusAllowed(lobby.mode, n)) {
      items.push(selector(t('ui.lobby.mode'), () => (lobby.versus ? t('ui.lobby.versus') : t('ui.lobby.coop')), () => { lobby.versus = !lobby.versus; render(); }, { sfx: api.sfx }));
    }
    items.push(...raceOptionSelectors(api, () => commitSettings(api), {
      difficulty: !tt, gear: true, totalCars: !tt, quickLaps: lobby.mode === 'quick' || isPartyMode(lobby.mode), assists: !tt && !lobby.versus && lobby.mode !== 'tournament' && n >= 2, lapsLabel: t('ui.lobby.laps'),
    }));
    const startBtn = button(t('ui.lobby.start'), start, 'btn-primary btn-start');
    startBtn.disabled = !canStart(lobby, save);
    if (startBtn.disabled) startBtn.el.classList.add('disabled');
    const backBtn = button(t('ui.common.back'), () => { api.sfx('back'); api.back(); });
    items.push(startBtn, backBtn);
    const p1dev = lobby.seats[0]?.device;
    const startHint = p1dev && isKeyboard(p1dev) ? t('ui.lobby.startHint.kb') : t('ui.lobby.startHint.pad');
    const fixedMode = resume ? h('p', { class: 'hint lobby-fixed', text: t('career.lobby.fixedMode', { mode: maxSeats(lobby, save) === 1 ? t('career.mode.solo') : lobby.versus ? t('ui.lobby.versus') : t('ui.lobby.coop') }) }) : null;
    const panelEl = h('div', { class: 'lobby-panel glass' },
      h('h2', { class: 'sub-title', text: t('ui.lobby.options') }),
      fixedMode,
      h('div', { class: 'lobby-options' }, items.slice(0, items.length - 2).map((i) => i.el)),
      h('p', { class: 'hint', text: canStart(lobby, save) ? startHint : partySeatsProblem(lobby.mode, occupiedSeats(lobby).length) ?? t('ui.lobby.waitHint') }),
      h('div', { class: 'lobby-actions' }, startBtn.el, backBtn.el),
    );
    return { el: panelEl, items };
  }

  function render(): void {
    saveCursors();
    lists = [null, null, null, null];
    lockedSeats.clear();
    stageEls.fill(null);
    slotEls.fill(null);
    const limit = maxSeats(lobby, save);
    const slotsEl = h('div', { class: `lobby-slots seats-${limit}` });
    const slotItems: Array<FocusItem[]> = [];
    for (let seat = 0; seat < limit; seat++) {
      const s = lobby.seats[seat];
      if (s) {
        const slot = occupiedSlot(s);
        slotsEl.appendChild(slot.el);
        slotItems[seat] = slot.items;
      } else {
        slotsEl.appendChild(emptySlot(seat));
      }
    }
    const p1 = lobby.seats[0];
    let panelEl: HTMLElement;
    if (p1) {
      const pn = panel();
      panelEl = pn.el;
      slotItems[0] = [...(slotItems[0] ?? []), ...pn.items];
      // INICIAR e Voltar são os dois últimos itens do P1: depois do PRONTO, o cursor vai para INICIAR.
      if (focusStartNext) { p1.cursor = slotItems[0].length - 2; focusStartNext = false; }
    } else {
      const backBtn = button(t('ui.common.back'), () => { api.sfx('back'); api.back(); });
      panelEl = h('div', { class: 'lobby-panel glass waiting' },
        h('h2', { class: 'sub-title', text: t('ui.lobby.options') }),
        h('p', { class: 'hint', text: t('ui.lobby.needP1') }),
        h('div', { class: 'lobby-actions' }, backBtn.el),
      );
      createFocusList([backBtn], { sfx: api.sfx });
    }
    // O editor do visual aberto: o painel por cima do lobby e a lista de foco do dono dele trocada pela do editor.
    let overlay: HTMLElement | null = null;
    const editor = editingSeat !== null && lobby.seats[editingSeat] ? buildEditor(lobby.seats[editingSeat] as LobbySeat) : null;
    if (editor && editingSeat !== null) {
      const owner = lobby.seats[editingSeat] as LobbySeat;
      overlay = h('div', { class: 'look-overlay', style: `--seat:${seatColor(owner.seat, ctx.settings.colorPalette)}` },
        h('div', { class: 'look-panel glass' },
          h('div', { class: 'look-panel-head' }, h('span', { class: 'seat-badge', text: `P${owner.seat + 1}` }), h('span', { class: 'look-panel-title', text: `${t('look.title')} · ${carOfSeat(owner).name}` })),
          editor.el,
        ));
      slotItems[editingSeat] = editor.items;
    }
    for (let seat = 0; seat < limit; seat++) {
      const s = lobby.seats[seat];
      const items = slotItems[seat];
      if (s && items) lists[seat] = createFocusList(items, { start: Math.min(s.cursor, items.length - 1), sfx: api.sfx });
    }
    body.replaceChildren(slotsEl, panelEl, ...(overlay ? [overlay] : []));
    // O assento que saiu (ou que agora mostra uma nota no lugar do carro) solta o painel do palco; sem nenhum, a tela volta ao fundo do tema.
    stages.forEach((st, seat) => { if (st && !stageEls[seat]) { st.release(); stages[seat] = null; } });
    el.classList.toggle('stage3d', stages.some((st) => st !== null));
  }

  /** O buraco no vidro de cada cartão (máscara CSS, como a garagem): onde está a janela do palco o cartão não cobre o canvas. */
  function syncHoles(): void {
    slotEls.forEach((p, seat) => {
      const win = stageEls[seat];
      if (!p || !win || typeof p.getBoundingClientRect !== 'function' || typeof win.getBoundingClientRect !== 'function') return;
      const a = p.getBoundingClientRect(); const b = win.getBoundingClientRect();
      const x = Math.round(b.left - a.left - (p.clientLeft || 0)); const y = Math.round(b.top - a.top - (p.clientTop || 0));
      const key = `${x},${y},${Math.round(b.width)},${Math.round(b.height)}`;
      if (p.getAttribute('data-hole') === key) return;
      p.setAttribute('data-hole', key);
      p.style.setProperty('--hx', `${x}px`); p.style.setProperty('--hy', `${y}px`);
      p.style.setProperty('--hw', `${Math.round(b.width)}px`); p.style.setProperty('--hh', `${Math.round(b.height)}px`);
    });
  }

  const carOfSeat = (s: LobbySeat): CarDef => cars[s.carIndex] ?? cars[0];
  const lookOfSeat = (s: LobbySeat): CarLook | null => (resume ? resumeRoster(lobby, save)[s.seat]?.look ?? null : seatLook(save, s.seat, carOfSeat(s).id));
  function buildEditor(s: LobbySeat) {
    return lookEditor({ car: () => carOfSeat(s), look: () => lookOfSeat(s), onStep: (field, dir) => stepField(s, field, dir), onClose: () => closeEditor(s), sfx: api.sfx });
  }

  render();
  // A borda que abriu esta tela (Enter no menu, Esc na seleção de pista) ainda está fechada no
  // primeiro quadro: sem esta carência, o Esc que volta da seleção tiraria o P1 do assento.
  let armed = false;

  return {
    el,
    nav(nav: MenuNav) {
      const device = nav.device;
      if (!device) return;
      const seat = seatOfDevice(lobby, device);
      if (seat < 0) {
        // Sem assento: só sai do lobby quando ele está vazio (entrar é via joinPressed).
        if (nav.back && occupiedSeats(lobby).length === 0) { api.sfx('back'); api.back(); }
        return;
      }
      // Start (controle) ou confirmar segurado (teclado, keyNav): quem não está pronto fica, e larga se todos estiverem.
      if (nav.start && editingSeat === null) {
        const me = lobby.seats[seat];
        if (me && !me.ready) markReady(me);
        start();
        return;
      }
      // Com o editor do visual de um assento aberto, só o dono dele navega (e o Start do controle não larga a corrida por baixo do painel).
      if (editingSeat !== null && seat !== editingSeat) return;
      const list = lists[seat];
      const s = lobby.seats[seat];
      if (!list || !s) return;
      // Voltar de quem tem assento é sair do assento, e isso vem de leavePressed() no update().
      listNav(list, { ...nav, back: false }, api.sfx);
      s.cursor = list.index;
    },
    update() {
      syncHoles();
      if (!armed) { armed = true; return; }
      const joining = input.joinPressed();
      if (joining) {
        const limit = maxSeats(lobby, save);
        const free = lobby.seats.findIndex((s, i) => s === null && i < limit);
        if (free >= 0) join(free, joining);
      }
      const leaving = input.leavePressed();
      if (leaving) {
        const seat = seatOfDevice(lobby, leaving);
        // Voltar com o editor do visual aberto o fecha; só depois dele sair do assento.
        const me = seat >= 0 ? lobby.seats[seat] : null;
        if (me && editingSeat === seat) closeEditor(me);
        else if (seat >= 0 && editingSeat === null) leave(seat);
      }
    },
    destroy() {
      for (const st of stages) st?.release();
      stages.fill(null);
    },
  };
}
