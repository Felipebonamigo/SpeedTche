// A sessão: liga simulação, entrada, renderização, áudio e menus. Laço de passo fixo (60 Hz)
// com renderização a cada quadro. Nada aqui é determinístico por obrigação — só o núcleo é.
import { COUNTDOWN_TICKS, TICK_RATE } from '../core/constants';
import { createChampionship, nextTrackId } from '../core/championship';
import { CARS } from '../core/data/cars';
import { CUPS, cupDef } from '../core/data/cups';
import { seatColor } from '../core/data/drivers';
import { createRace, formatTicks } from '../core/sim/race';
import { advanceAfterFlag, type AfterFlag } from './after-flag';
import { finishMessage } from './finish-message';
import { lapMessage } from './lap-message';
import { getTrack, TRACKS, trackDef } from '../core/track';
import { hashString } from '../core/rng';
import type { CarLook, ChampionshipState, HumanEntry, PlayerInput, RaceConfig, RaceState, SimEvent, Track } from '../core/types';
import { NEUTRAL_INPUT } from '../core/types';
import { setLanguage, t } from '../i18n';
import '../i18n/core';
import './strings';
import { applyAccessibility } from '../access/apply';
import { assistedHumans, withRaceAssists } from '../access/humans';
import { createAudio } from '../audio/audio';
import { songForScenery } from '../audio/music';
import { createRenderer } from '../render/renderer';
import { createRetroRenderer } from '../render-pseudo3d/renderer';
import { trackOutline } from '../render/minimap';
import { createInput } from '../ui/input';
import { createMenus } from '../ui/menus';
import { createOnlineHud } from '../ui/screens/online';
import { addBalloon, ageBalloons, audibleFor, createVoiceRace, hornGain, newWheel, observeVoice, stepWheel, tauntCooldownTicks, tauntText, TAUNT_SHOW_SECONDS, type VoiceCue, type VoiceRace } from '../voice/voice';
import { createVoiceHud, type VoiceHud } from '../voice/hud';
import { isMuted } from '../voice/prefs';
import { createTutorialPanel } from '../ui/screens/tutorial';
import { createTipsHud, describeTip, newTipMemory, observeTips, tipOf, tipsEnabled, type TipMemory, type TipsHud } from '../render/hud-tips';
import { systemLayout } from '../ui/remap/labels';
import { newTelemetry, openAchievements, type RaceTelemetry } from './achievements';
import { saveCupProgress } from './career-save';
import { compactHumans, createCareerSession } from './career-session';
import { rollSession } from './expedition';
import type { AudioEngine, CarColors, HudMessage, InputProvider, MenuEvent, Menus, RaceDriver, RaceMode, RenderFrame, Renderer, RenderStyle, SaveData, Settings, ViewportSpec } from './contracts';
import { DEFAULT_SETTINGS } from './contracts';
import { getDesktop, isDesktop, setFullscreen, syncSteamOnOpen } from './desktop';
import { reportError } from './errors';
import { startGhost, type GhostHooks } from './ghost-session';
import { cupDuels, gridRival, rivalFaceOf, rivalSpeech, type Rival, type RivalScore } from './rivals';
import { scoreOf } from './stars';
import { createRivalTalk, observeRivalTalk, rivalByName, rivalReply, rivalTalkText, type RivalTalk } from './rival-talk';
import { createOnlineController, type OnlineController } from './online-session';
import { createPartySession, isPartyRaceMode } from './party-session';
import { raceVisuals, withoutLook } from './paints';
import { carIndexOfSeat } from '../core/modes';
import { createFeelTracker, createScrapeMemory, observeFeel, observeScrapes, type FeelTracker, type ScrapeCue, type ScrapeMemory } from './race-feel';
import { countdownCue } from '../render/hud-model';
import { getActivePlaylog, playlogRace } from './playlog';
import { loadProgress, saveProgress, type ProgressData } from './progression';
import { settleRace, stepObserved, type RaceOutcome } from './raceEnd';
import { newRumbleMemory, rumbleCues } from './rumble';
import { isCupUnlocked, loadSave, saveSave } from './save';
import { loadSettings, saveSettings } from './settings';
import { switchCamera } from './camera-switch';
import { DEFAULT_CAMERA_MODE, pickCameraMode } from '../render/camera-base';
import { applyAssistChoice, markOffered, newAssistOffer, offerDue, recordRaceEnd } from './assist-offer';
import { createTutorialSession, type TutorialSession } from './tutorial-session';

const DT = 1 / TICK_RATE;
const MAX_STEPS_PER_FRAME = 4;
/** Depois do último humano cruzar a linha, quanto tempo a corrida fica na tela antes do resultado. */
const RESULTS_DELAY = 3.0;
/** Quanto tempo a fala do rival fica no HUD (uma frase de ~80 caracteres, lida do sofá). */
const RIVAL_LINE_TTL = 4.5;
/** A resposta do rival à provocação (N6) é uma fala dele, mais comprida que as frases prontas: o balão dura mais, e a buzinada dele soa mais baixo. */
const RIVAL_REPLY_TTL = 3.5;
const RIVAL_REPLY_HORN_GAIN = 0.5;
const RIVAL_COLOR = '#ff4d4d';
/** Conquista no HUD: fica até o resultado cobrir a corrida. */
const ACHIEVEMENT_TTL = RESULTS_DELAY + 0.5;

interface ActiveRace {
  state: RaceState;
  track: Track;
  mode: RaceMode;
  humans: HumanEntry[];
  messages: Map<number, HudMessage[]>;
  telemetry: RaceTelemetry;
  /** Segundos desde o fim da corrida (para o atraso do resultado). */
  overFor: number;
  seed: number;
  /** Contas fechadas no tick em que a corrida acabou (raceEnd.ts: settleRace); o resultado aparece depois. */
  outcome: RaceOutcome | null;
  /** Fonte das entradas por tick: null = controles deste computador; online = lockstep. */
  driver: RaceDriver | null;
  /** Assentos jogados neste computador (os únicos com viewport, HUD e som de jogador). */
  localSeats: number[];
  /** Fantasma do contra-relógio local (ghost-session.ts); null nas outras corridas. */
  ghost: GhostHooks | null;
  /** Visual de cada carro (índice = state.cars), montado na largada a partir de `humans` (paints.ts: raceLooks), e as cores dele (`paints`, para o Retrô). */
  looks: Array<CarLook | null>;
  paints: Array<CarColors | null>;
  /** Bordas (nitro, marchas) lidas num quadro de tela em que não coube nenhum passo da física; valem no próximo passo. */
  /** Cópia só de exibição que segue andando depois da bandeirada (o estado real fica parado); some com a corrida. */
  afterFlag?: AfterFlag;
  /** Termômetro de emoção por carro humano local (race-feel.ts) e se a corrida já foi para o diário (playlog.ts). */
  feel: Record<number, FeelTracker>;
  logged: boolean;
  /** Raspão de lado derivado do estado (race-feel.ts: observeScrapes) e a conversa do rival (rival-talk.ts; null sem rival). Só visual: fora do estado. */
  scrapes: ScrapeMemory;
  talk: RivalTalk | null;
  /** Voz do carro (N6): buzina, roda de frases e balões. Só visual e sonoro: fora do estado da corrida (voice.ts). */
  voice: VoiceRace;
  /** Dicas da 1ª corrida (O3, render/hud-tips.ts): só na 1ª corrida local de copa/Expedição; null nas outras. Só visual: fora do estado. */
  tips: TipMemory | null;
  heldEdges?: Array<Pick<PlayerInput, 'nitro' | 'gearUp' | 'gearDown' | 'taunt'> | undefined>;
  /** Online: o atraso de entrada do lockstep, em ticks; 0 no sofá e no tutorial. A contagem (luzes, bipes, "JÁ!") anda adiantada por ele (N1). */
  inputLead: number;
}

export interface Session {
  readonly settings: Settings;
  readonly renderer: Renderer;
  readonly input: InputProvider;
  readonly audio: AudioEngine;
  readonly online: OnlineController;
  /** Preenchido logo depois da criação (os menus precisam da sessão para emitir eventos). */
  menus: Menus;
  /** Tutorial de 90 segundos ("Como jogar"); preenchido junto com os menus. */
  tutorial: TutorialSession;
  race: ActiveRace | null;
  paused: boolean;
  /** Multiplicador de velocidade da simulação (playtest). */
  speed: number;
  start(): void;
  stop(): void;
  frame(now: number): void;
  handleMenuEvent(e: MenuEvent): void;
  startQuick(trackId: string, laps: number, humans: HumanEntry[], timeTrial?: boolean): void;
  startCup(cupId: string, humans: HumanEntry[]): void;
  /** Só para o playtest automatizado: liga assentos ao teclado sem passar pelo lobby. */
  debugBind(seat: number, device: 'kb1' | 'kb2'): void;
  /** O save em memória (playtest-layout monta o pior caso do menu principal sem recarregar a página). */
  debugSave(): SaveData;
  /** A maestria em memória (O5; o playtest-layout monta o pior caso da aba Nível). */
  debugProgress(): ProgressData;
  /** Só para o playtest: avança N ticks da corrida agora, com a entrada atual, sem esperar quadros. */
  debugStep(ticks: number): void;
}

function randomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

/** O renderizador do estilo escolhido: o 3D moderno (Three.js) ou o pseudo-3D Retrô (canvas 2D). */
function makeRenderer(style: RenderStyle, canvas: HTMLCanvasElement, hudRoot: HTMLElement): Renderer {
  return style === 'retro' ? createRetroRenderer(canvas, hudRoot) : createRenderer(canvas, hudRoot);
}

export function createSession(canvas: HTMLCanvasElement, hudRoot: HTMLElement, uiRoot: HTMLElement): Session {
  const settings = loadSettings();
  const save = loadSave();
  // N5: o que a sessão anterior rendeu vira o quadro "Desde a última vez" do menu (src/game/expedition.ts); grava o ponto de partida desta.
  rollSession(save, new Date().toISOString());
  saveSave(save);
  setLanguage(settings.language);
  // O5: a maestria (chave própria; o nível sai das estatísticas do save), as conquistas de estado que o save já merece (quem comprou ou
  // subiu de nível na 0.1.4) e, no Electron, o reenvio de TODA conquista guardada e o nome da Steam no P1 (src/game/desktop.ts).
  const progress = loadProgress();
  const opened = openAchievements(save, progress);
  if (opened.length > 0) { save.achievements.push(...opened); saveSave(save); }
  void syncSteamOnOpen(getDesktop(), save, () => saveSave(save));

  let renderer: Renderer = makeRenderer(settings.renderStyle, canvas, hudRoot);
  /**
   * Estilo do renderizador em uso. A tela de Opções edita o próprio objeto `settings` antes de avisar, então
   * comparar o que chega com `settings` nunca vê a troca: compara-se com o que está desenhando.
   */
  let activeStyle = settings.renderStyle;
  applyAccessibility(settings, hudRoot, uiRoot);
  const input = createInput(window, { bindings: () => settings.controls, vibration: () => settings.vibration });
  const rumbleMemory = newRumbleMemory();
  const audio = createAudio();
  audio.setVolumes(settings.masterVolume, settings.musicVolume, settings.sfxVolume);

  let champ: ChampionshipState | null = null;
  let cupSeed = 0;
  let lastNow = 0;
  let accumulator = 0;
  let elapsed = 0;
  let running = false;
  let rafId = 0;
  /** Roda de frases e balões (voice/hud.ts): criado na primeira vez que alguém fala ou abre a roda; nunca em Node. */
  let voiceHud: VoiceHud | null = null;
  /** Overlay das dicas da 1ª corrida (render/hud-tips.ts): nasce na primeira dica; nunca em Node. */
  let tipsHud: TipsHud | null = null;
  /** Oferta de assistência depois de 2 eliminações seguidas (assist-offer.ts): a conta vive na sessão; `held` é a largada que a pergunta segurou. */
  const assistOffer = newAssistOffer();
  let held: { event: MenuEvent; seats: number[] } | null = null;
  let idleTrack: Track = getTrack(TRACKS[0].id);
  let idleTimer = 0;

  // Online: a sessão empresta a corrida (beginRace com um driver de lockstep) e os menus.
  const online = createOnlineController({
    settings, save, input, progress,
    startRace: (config, localSeats, driver, state, humans) => beginRace(config, 'quick', humans ?? config.humans, { driver, localSeats, state }),
    raceState: () => session.race?.state ?? null,
    clearRace: () => { if (session.race) logRace(session.race); session.race = null; session.paused = false; },
    showScreen: () => menus.show('online'),
    hideScreen: () => menus.hide(),
    menuOpen: () => menus.current() !== null,
    exitToMain: () => toMain(),
    persistSettings: () => saveSettings(settings),
    persistSave: () => saveSave(save),
    // Aba em segundo plano/janela minimizada: sem requestAnimationFrame, o online anda pela rede.
    hidden: () => document.visibilityState === 'hidden',
    runHidden: (dt) => { const r = session.race; if (r?.driver) r.driver.advance(dt, readInputs(r), (i) => stepOnce(r, i)); },
  }, { hud: createOnlineHud });

  const session: Session = {
    settings, input, audio, online,
    get renderer() { return renderer; },
    menus: null as unknown as Menus,
    tutorial: null as unknown as TutorialSession,
    race: null, paused: false, speed: 1,
    start, stop, frame, handleMenuEvent, startQuick, startCup,
    debugBind(seat, device) { input.bindSeat(seat, device); },
    debugSave: () => save,
    debugProgress: () => progress,
    debugStep(ticks) {
      const r = session.race;
      if (!r || session.paused) return;
      input.poll();
      stepVoice(r, 0); // este poll() também fecha as bordas (uma marcha da roda): quem faz o poll dá o passo da roda
      const inputs = readInputs(r);
      if (r.driver) { r.driver.force(ticks, inputs, (i) => stepOnce(r, i)); for (const list of r.messages.values()) list.length = 0; return; }
      for (let i = 0; i < ticks && r.state.phase !== 'finished'; i++) {
        stepOnce(r, inputs);
        for (const h of r.humans) { const inp = inputs[h.seat]; if (inp && inp !== NEUTRAL_INPUT) inputs[h.seat] = { ...inp, nitro: false, gearUp: false, gearDown: false, taunt: undefined }; }
      }
      for (const list of r.messages.values()) list.length = 0;
    },
  };

  // Festa: os menus leem o torneio daqui; os menus em si nascem depois (o host os busca na hora).
  const party = createPartySession({
    get menus() { return menus; }, settings, input, baseConfig, randomSeed,
    beginRace: (config, mode, humans) => beginRace(config, mode, humans),
  });
  const menus = createMenus({
    root: uiRoot, input, settings, save, cups: CUPS, tracks: TRACKS, cars: CARS,
    isCupUnlocked: (cupId) => isCupUnlocked(save, cupId, CUPS),
    trackOutline, audio, isDesktop: isDesktop(), online, party, progress,
    onEvent: handleMenuEvent,
  });
  session.menus = menus;
  const career = createCareerSession({
    save, settings, menus, input, baseConfig, beginRace, toIdle, randomSeed, persist: () => saveSave(save),
  });
  session.tutorial = createTutorialSession({
    save, settings, menus, input, toIdle, startExpedition: (humans, resume) => career.start(humans, resume), randomSeed, persist: () => saveSave(save),
    beginRace: (config, humans, driver, state) => beginRace(config, 'quick', humans, { driver, localSeats: humans.map((h) => h.seat), state }),
    hud: pushMessage,
    panel: createTutorialPanel(hudRoot),
  });

  /**
   * Opções › Visual: troca o renderizador na hora (moderno ↔ Retrô). Um canvas não aceita WebGL e 2D ao
   * mesmo tempo, então o antigo é descartado e um canvas novo toma o lugar dele no DOM.
   */
  function swapRenderer(): void {
    const old = renderer.canvas;
    renderer.dispose();
    const fresh = document.createElement('canvas');
    fresh.id = old.id;
    fresh.className = old.className;
    old.replaceWith(fresh);
    renderer = makeRenderer(settings.renderStyle, fresh, hudRoot);
    activeStyle = settings.renderStyle;
    resize();
  }

  function resize(): void {
    renderer.resize(window.innerWidth, window.innerHeight, Math.min(2, window.devicePixelRatio || 1));
  }
  window.addEventListener('resize', resize);
  // Fechar a aba ou a janela no meio da corrida a registra como abandonada (o localStorage é síncrono).
  window.addEventListener('pagehide', () => { if (session.race) logRace(session.race); });
  resize();

  // ───────────────────────────── Corrida ─────────────────────────────

  function baseConfig(trackId: string, laps: number, humans: HumanEntry[], seed: number): RaceConfig {
    return {
      // O visual fica com os humanos da sessão (r.humans → RenderFrame.looks): a config e o estado não o carregam.
      trackId, laps, humans: assistedHumans(withoutLook(humans), settings.seatAssists), totalCars: Math.max(humans.length, settings.totalCars),
      difficulty: settings.difficulty, manualGear: settings.manualGear, assists: { ...settings.assists }, seed,
    };
  }

  function beginRace(config: RaceConfig, mode: RaceMode, humans: HumanEntry[], net?: { driver: RaceDriver; localSeats: number[]; state?: RaceState }): void {
    // Os modos de festa são só locais: uma corrida em rede nunca nasce com eles (docs/MODOS.md).
    if (net && (isPartyRaceMode(mode) || config.mode)) { net.driver.dispose(); console.warn(t('party.onlineRefused')); toMain(); return; }
    if (session.race) logRace(session.race);
    const track = getTrack(config.trackId);
    const state = net?.state ?? createRace(config, track);
    const localSeats = net ? net.localSeats : humans.map((h) => h.seat);
    const messages = new Map<number, HudMessage[]>();
    for (const seat of localSeats) messages.set(seat, []);
    const ghost = startGhost(mode, net !== undefined, config.trackId, humans, { settings, hud: (seat, m) => pushMessage(seat, m.text, m.kind, m.ttl) });
    session.race = {
      state, track, mode, humans, messages, telemetry: newTelemetry(), overFor: 0, seed: config.seed, outcome: null, driver: net?.driver ?? null, localSeats, ghost,
      ...raceVisuals(state.cars, humans),
      feel: Object.fromEntries(localSeats.map((s) => carIndexOfSeat(state, s)).filter((c) => c >= 0).map((c) => [c, createFeelTracker(c)])), logged: false,
      scrapes: createScrapeMemory(), talk: config.rival ? createRivalTalk(previousDuel(champ)) : null, voice: createVoiceRace(),
      tips: tipsEnabled(save, mode, net !== undefined) ? newTipMemory() : null,
      inputLead: net && net.driver === online ? Math.max(0, online.status().delayTicks) : 0,
    };
    getActivePlaylog()?.raceStarted({ mode, trackId: config.trackId, humans: localSeats.length });
    session.paused = false;
    accumulator = 0;
    menus.hide();
    const music = settings.music === 'auto' ? songForScenery(track.def.scenery, track.def.timeOfDay) : settings.music;
    audio.setMusic(music === 'off' ? null : music);
    getDesktop()?.richPresence(`${track.def.name} · ${humans.length}P`).catch(() => undefined);
  }

  /** O rival da copa terminou à frente do melhor humano na corrida anterior? (a "revanche" do rival na pista). null = sem dado. */
  function previousDuel(c: ChampionshipState | null): boolean | null {
    const duels = c ? cupDuels(c) : [];
    return duels.length ? duels[duels.length - 1] : null;
  }

  function startQuick(trackId: string, laps: number, humans: HumanEntry[], timeTrial = false): void {
    trackDef(trackId);
    champ = null;
    const config = baseConfig(trackId, laps, humans, randomSeed());
    if (timeTrial) { config.timeTrial = true; config.totalCars = humans.length; }
    beginRace(config, timeTrial ? 'timetrial' : 'quick', humans);
  }

  function startCup(cupId: string, lobbyHumans: HumanEntry[]): void {
    const cup = cupDef(cupId);
    // Assentos contíguos: a copa fica salva (1.7a) e o "Continuar" religa a partir do P1.
    const humans = compactHumans(input, lobbyHumans, settings.seatAssists);
    champ = createChampionship(cupId, humans);
    cupSeed = hashString(cupId + ':' + randomSeed());
    saveCupProgress(save, champ, cupSeed, humans);
    saveSave(save);
    const trackId = cup.trackIds[0];
    const laps = trackDef(trackId).laps;
    const config = baseConfig(trackId, laps, humans, randomSeed());
    config.rosterSeed = cupSeed;
    config.rival = gridRival(champ);
    beginRace(config, 'cup', humans);
  }

  /** Menu principal → Continuar: retoma a copa salva na próxima corrida (o lobby já religou os assentos). */
  function continueCup(): void {
    const saved = save.cupInProgress;
    if (!saved) { toMain(); return; }
    champ = JSON.parse(JSON.stringify(saved.champ)) as ChampionshipState;
    cupSeed = saved.cupSeed;
    nextCupRace(saved.humans);
  }

  function nextCupRace(humans: HumanEntry[] = session.race?.humans ?? []): void {
    if (!champ) return;
    const trackId = nextTrackId(champ);
    if (!trackId || champ.eliminated) { toMain(); return; }
    const config = baseConfig(trackId, trackDef(trackId).laps, humans, randomSeed());
    config.rosterSeed = cupSeed;
    config.rival = gridRival(champ);
    beginRace(config, 'cup', humans);
  }

  function retryRace(fresh = false): void {
    const r = session.race;
    if (!r) { toMain(); return; }
    const config: RaceConfig = { ...r.state.config, seed: randomSeed() };
    // Depois da oferta de assistência (O3) a nova largada já sai com a dificuldade e a assistência que o jogador acabou de escolher.
    if (fresh) { config.difficulty = settings.difficulty; config.humans = assistedHumans(withoutLook(r.humans), settings.seatAssists); }
    beginRace(config, r.mode, r.humans);
  }

  /** Sai da corrida para os menus (fundo animado e música de menu), sem mexer nos assentos; fecha o online se houver. */
  function toIdle(): void {
    if (session.race) logRace(session.race);
    const driver = session.race?.driver;
    session.race = null;
    driver?.dispose();
    session.paused = false;
    champ = null;
    idleTrack = getTrack(TRACKS[Math.floor(Math.random() * TRACKS.length)].id);
    audio.setMusic(settings.music === 'auto' ? songForScenery('coast', 'dusk') : settings.music === 'off' ? null : settings.music);
  }

  function toMain(): void {
    party.abandon();
    toIdle();
    for (let seat = 0; seat < 4; seat++) input.unbindSeat(seat);
    menus.show('main');
  }

  function pushMessage(seat: number, text: string, kind: HudMessage['kind'], ttl: number): void {
    const list = session.race?.messages.get(seat);
    if (!list) return;
    // Uma "big" por vez: a nova substitui a anterior.
    if (kind === 'big') for (let i = list.length - 1; i >= 0; i--) if (list[i].kind === 'big') list.splice(i, 1);
    list.push({ text, kind, ttl });
  }

  function broadcast(text: string, kind: HudMessage['kind'], ttl: number): void {
    for (const seat of session.race?.messages.keys() ?? []) pushMessage(seat, text, kind, ttl);
  }

  function seatOf(state: RaceState, carId: number): number {
    const car = state.cars[carId];
    return car ? car.seat : -1;
  }

  function handleEvent(r: ActiveRace, e: SimEvent): void {
    const { state } = r;
    const laps = state.config.laps;
    switch (e.type) {
      case 'countdown': broadcast(String(e.value), 'big', 0.9); audio.onEvent(e, 0); return;
      case 'go': broadcast(t('session.go'), 'big', 0.8); audio.onEvent(e, 0); return;
      case 'race_over': audio.onEvent(e, 0); settle(r); return;
      default: break;
    }
    for (const m of party.eventMessages(r.mode, state, e)) pushMessage(m.seat, m.message.text, m.message.kind, m.message.ttl);
    const carSeat = 'carId' in e ? seatOf(state, e.carId) : -1;
    // Online, o carro de outro computador soa como o de um adversário.
    const seat = r.localSeats.includes(carSeat) ? carSeat : -1;
    audio.onEvent(e, seat);
    if (seat < 0) return;
    switch (e.type) {
      case 'lap': {
        r.telemetry.nitrosThisLap.set(seat, 0);
        if (!r.telemetry.offroadThisLap.has(seat) && e.lapTicks > 0) r.telemetry.perfectLap.add(seat);
        r.telemetry.offroadThisLap.delete(seat);
        const lapText = lapMessage(e.lap, laps);
        if (lapText) pushMessage(seat, lapText, 'big', 1.5);
        if (e.best && e.lap > 2) pushMessage(seat, t('session.bestLap', { time: formatTicks(e.lapTicks) }), 'good', 2);
        break;
      }
      case 'finish':
        pushMessage(seat, finishMessage(state, e.carId, e.position), 'big', 4);
        break;
      case 'nitro': {
        const n = (r.telemetry.nitrosThisLap.get(seat) ?? 0) + 1;
        r.telemetry.nitrosThisLap.set(seat, n);
        r.telemetry.maxNitrosInLap.set(seat, Math.max(n, r.telemetry.maxNitrosInLap.get(seat) ?? 0));
        break;
      }
      case 'nitro_denied': pushMessage(seat, t('session.noNitro'), 'warn', 0.8); break;
      case 'tow': {
        const by = state.cars[e.byId];
        pushMessage(seat, t('session.tow', { name: by?.name ?? '?' }), 'good', 2);
        if (by && by.seat >= 0) r.telemetry.gaveTow.add(by.seat);
        break;
      }
      case 'fuel_low': pushMessage(seat, t('session.fuelLow'), 'warn', 3); break;
      case 'fuel_empty': pushMessage(seat, t('session.fuelEmpty'), 'warn', 3); break;
      case 'pit_enter': r.telemetry.pitted.add(seat); pushMessage(seat, t('session.pitEnter'), 'info', 2); break;
      case 'pit_exit': pushMessage(seat, t('session.pitExit'), 'info', 1.5); break;
      case 'offroad': if (e.entering) r.telemetry.offroadThisLap.add(seat); break;
      default: break;
    }
  }

  /**
   * Fecha as contas no race_over (raceEnd.ts). As conquistas vão já para o HUD de quem as
   * ganhou — a corrida ainda fica RESULTS_DELAY na tela antes do resultado. Idempotente.
   */
  function settle(r: ActiveRace): RaceOutcome {
    return settleRace(save, r, {
      champ, difficulty: settings.difficulty, hudTtl: ACHIEVEMENT_TTL,
      effects: {
        achievement: (id) => { getDesktop()?.achievement(id).catch(() => undefined); },
        hud: (seat, m) => pushMessage(seat, m.text, m.kind, m.ttl),
        persist: () => saveSave(save),
        persistProgress: () => saveProgress(progress),
      },
      progress,
      localSeats: r.driver ? r.localSeats : null,
      afterCup: (c) => saveCupProgress(save, c, cupSeed, r.humans),
      careerChamp: () => champ,
      careerFinished: (results) => {
        const out = career.raceFinished(results);
        champ = out.champ;
        return out.cupCompleted;
      },
    });
  }

  /** Registra a corrida no diário uma vez só; o que não chegou ao race_over entra como abandonada. */
  function logRace(r: ActiveRace): void {
    if (r.logged) return;
    r.logged = true;
    getActivePlaylog()?.raceEnded(playlogRace(r, { abandoned: r.state.phase !== 'finished', champ }));
  }

  function finishRace(r: ActiveRace): void {
    const { newRecords, achievements, newStamp, progress: news } = settle(r);
    recordRaceEnd(assistOffer, r.mode, champ?.eliminated === true);
    logRace(r);
    const data = { mode: r.mode, trackDef: r.track.def, results: r.state.results ?? [], humans: withRaceAssists(r.humans, r.state.config.humans), champ, newRecords, achievements, party: party.raceFinished(r.mode, r.state), newStamp: newStamp ?? null, progress: news ?? [] };
    if (r.driver) r.driver.finished(data);
    else menus.show('results', data);
    audio.update(null, 0);
  }

  // ───────────────────────────── Laço ─────────────────────────────

  function readInputs(r: ActiveRace): PlayerInput[] {
    const inputs: PlayerInput[] = [];
    for (const seat of r.localSeats) inputs[seat] = session.paused ? NEUTRAL_INPUT : withVoice(r, seat, input.readSeat(seat));
    return inputs;
  }

  /**
   * A roda de frases (voice.ts) já deu o passo deste quadro (`stepVoice`): aqui só se LÊ o que ela decidiu — a frase escolhida
   * (borda, só neste quadro) e as marchas que são dela e não da física. Não anda estado: `readInputs` roda 2× por quadro com driver.
   */
  function withVoice(r: ActiveRace, seat: number, base: PlayerInput): PlayerInput {
    const v = r.voice.seatInput[seat];
    if (!v || base === NEUTRAL_INPUT || (!v.consume && v.taunt === undefined)) return base;
    return { ...base, ...(v.consume ? { gearUp: false, gearDown: false } : {}), ...(v.taunt !== undefined ? { taunt: v.taunt } : {}) };
  }

  /** Um passo da roda de cada jogador local, UMA vez por quadro de tela (logo depois do `poll`). Fechada na pausa e atrás de qualquer menu. */
  function stepVoice(r: ActiveRace, dt: number): void {
    const blocked = session.paused || menus.current() !== null;
    for (const seat of r.localSeats) {
      const wheel = (r.voice.wheels[seat] ??= newWheel());
      if (blocked) { Object.assign(wheel, newWheel()); r.voice.seatInput[seat] = undefined; continue; }
      const raw = input.readSeat(seat);
      const can = tauntCooldownTicks(r.voice.mem, seat, r.state.tick) === 0;
      const step = stepWheel(wheel, { horn: raw.horn === true, gearUp: raw.gearUp, gearDown: raw.gearDown }, dt, can);
      r.voice.seatInput[seat] = { taunt: step.taunt ?? undefined, consume: step.consumeGears };
    }
  }

  /** O placar do perfil deste assento contra o rival (O4: o rival o cita). Undefined sem humano no assento. */
  function scoreFor(r: ActiveRace, seat: number, rival: Rival): RivalScore | undefined {
    const name = r.humans.find((h) => h.seat === seat)?.name;
    return name ? scoreOf(save.stars, name, rival.key) : undefined;
  }

  /** Uma buzinada ou frase que contou neste tick (voice.ts: observeVoice): o mesmo tick em todos os computadores. */
  function handleVoiceCue(r: ActiveRace, cue: VoiceCue): void {
    const local = r.localSeats.includes(cue.seat);
    const human = r.humans.find((h) => h.seat === cue.seat);
    const name = human?.name ?? r.state.cars[cue.carIndex]?.name ?? '';
    if (!audibleFor(local, name, isMuted)) return;
    if (cue.type === 'horn') { audio.horn?.(cue.carId, hornGain(local)); return; } // dublês de teste podem não ter
    addBalloon(r.voice, { seat: cue.seat, name, color: seatColor(cue.seat, settings.colorPalette), text: tauntText(cue.index), ttl: TAUNT_SHOW_SECONDS, own: local });
    // O rival da copa responde de vez em quando a quem o provoca (rival-talk.ts: mesmo intervalo mínimo e teto das falas dele).
    const rivalName = r.state.config.rival;
    const kind = local && r.talk && rivalName ? rivalReply(r.talk, r.state, cue.seat) : null;
    if (kind && rivalName) {
      const rival = rivalByName(rivalName);
      addBalloon(r.voice, { seat: -1, name: rival.name, color: RIVAL_COLOR, text: rivalSpeech(rival, kind, scoreFor(r, cue.seat, rival)), ttl: RIVAL_REPLY_TTL, own: false, face: rivalFaceOf(kind) });
      const rivalCar = r.state.cars.find((c) => c.seat < 0 && c.name === rivalName);
      if (rivalCar) audio.horn?.(rivalCar.carId, RIVAL_REPLY_HORN_GAIN);
    }
  }

  function stepOnce(r: ActiveRace, inputs: PlayerInput[]): void {
    // Online, a contagem anda adiantada pelo atraso de entrada (hud-model.ts: countdownCue): o bipe e o "JÁ!" saem no tick DESENHADO,
    // junto da luz, e os eventos `countdown` e `go` do núcleo (que saem `inputLead` ticks depois) não tocam de novo.
    const lead = r.inputLead;
    const cue = lead > 0 ? countdownCue(r.state.tick, lead) : null;
    const events = stepObserved(r, inputs); // observa antes: o tick que fecha a corrida já conta
    for (const f of Object.values(r.feel)) observeFeel(f, r.state);
    if (cue) handleEvent(r, cue);
    for (const e of events) { if (lead > 0 && (e.type === 'countdown' || e.type === 'go')) continue; handleEvent(r, e); }
    r.ghost?.afterTick(r.state);
    // Sinais que o núcleo não emite: o raspão de lado (derivado do estado) e a fala do rival na pista. Só visual e sonoro.
    const scrapes = observeScrapes(r.scrapes, r.state);
    for (const sc of scrapes) if (involvesLocalSeat(r, sc)) audio.scrape?.(sc.strength); // dublês de teste podem não ter
    for (const c of rumbleCues(r.state, rumbleMemory, scrapes)) input.rumble(c.seat, c.strength, c.ms);
    for (const cue of observeVoice(r.voice.mem, r.state, inputs)) handleVoiceCue(r, cue);
    if (r.tips) observeTips(r.tips, r.state, r.track, inputs);
    if (r.talk && r.state.config.rival) {
      const rival = rivalByName(r.state.config.rival);
      for (const cue of observeRivalTalk(r.talk, r.state, r.localSeats)) pushMessage(cue.seat, rivalTalkText(rival, cue.kind, scoreFor(r, cue.seat, rival)), 'info', RIVAL_LINE_TTL);
    }
  }

  function involvesLocalSeat(r: ActiveRace, sc: ScrapeCue): boolean {
    return [sc.a, sc.b].some((id) => { const c = r.state.cars.find((x) => x.id === id); return c !== undefined && c.seat >= 0 && r.localSeats.includes(c.seat); });
  }

  function buildFrame(r: ActiveRace): RenderFrame {
    const viewports: ViewportSpec[] = r.humans
      .filter((h) => r.localSeats.includes(h.seat))
      .sort((a, b) => a.seat - b.seat)
      .map((h) => {
        const own = r.messages.get(h.seat) ?? [];
        const fixed = party.hudLines(r.mode, r.state, h.seat);
        return {
          seat: h.seat, carIndex: carIndexOfSeat(r.state, h.seat), color: seatColor(h.seat, settings.colorPalette), name: h.name,
          messages: fixed.length ? [...fixed, ...own] : own,
          camera: pickCameraMode(settings.seatCameras?.[h.seat], DEFAULT_CAMERA_MODE),
        };
      });
    return {
      state: r.afterFlag?.display ?? r.state, track: r.track, viewports,
      options: { quality: settings.quality, showMinimap: settings.showMinimap, screenShake: settings.screenShake, reduceEffects: settings.reduceEffects, cartoonEffects: settings.cartoonEffects, palette: settings.colorPalette, landmarkCaptions: settings.landmarkCaptions },
      time: elapsed, paused: session.paused, coop: r.humans.length >= 2 && r.humans.every((h) => h.teamId === r.humans[0].teamId),
      showHud: menus.current() === null || menus.current() === 'pause' || (r.driver !== null && online.quitOpen),
      ghost: r.ghost?.frame(r.state),
      paints: r.paints,
      looks: r.looks,
      ...(r.inputLead > 0 ? { inputLead: r.inputLead } : {}),
    };
  }

  /** O overlay de voz: só nasce quando há algo a mostrar (roda aberta ou balão vivo) e some com a corrida. */
  function drawVoice(r: ActiveRace | null, f: RenderFrame | null): void {
    if (!r || !f) { voiceHud?.hide(); return; }
    if (!voiceHud && r.voice.balloons.length === 0 && !r.voice.wheels.some((w) => w?.open)) return; // nada a mostrar e nada criado: nem aloca
    const wheels = f.viewports.map((vp) => {
      const w = r.voice.wheels[vp.seat];
      if (!w || !w.open) return null;
      return { selected: w.selected, wait: tauntCooldownTicks(r.voice.mem, vp.seat, r.state.tick) / TICK_RATE };
    });
    if (!voiceHud && (r.voice.balloons.length > 0 || wheels.some((w) => w !== null))) voiceHud = createVoiceHud(hudRoot);
    voiceHud?.update({
      width: window.innerWidth, height: window.innerHeight, viewports: f.viewports.map((vp) => ({ seat: vp.seat, color: vp.color, name: vp.name })), wheels,
      balloons: r.voice.balloons, paused: session.paused || !f.showHud, reduceEffects: f.options.reduceEffects === true,
    });
  }

  /** O overlay das dicas da 1ª corrida: um cartão por viewport local, com as teclas do dispositivo e do remapeamento de cada jogador. */
  function drawTips(r: ActiveRace | null, f: RenderFrame | null): void {
    if (!r?.tips || !f) { tipsHud?.hide(); return; }
    if (!tipsHud) tipsHud = createTipsHud(hudRoot);
    const devices = input.devices();
    const layout = systemLayout();
    tipsHud?.update({
      width: window.innerWidth, height: window.innerHeight, paused: session.paused || !f.showHud, reduceEffects: f.options.reduceEffects === true,
      viewports: f.viewports.map((vp) => {
        const view = r.tips ? tipOf(r.tips, vp.seat) : null;
        const device = input.seatDevice(vp.seat);
        const padName = devices.find((d) => d.id === device)?.label ?? '';
        return { seat: vp.seat, color: vp.color, tip: view ? describeTip(view, device, settings.controls, padName, layout) : null };
      }),
    });
  }

  function frame(now: number): void {
    const dtRaw = lastNow ? Math.min(0.25, (now - lastNow) / 1000) : DT;
    lastNow = now;
    elapsed += dtRaw;
    input.poll();

    const r = session.race;
    const menuOpen = menus.current() !== null;

    if (r && !menuOpen && !session.paused) {
      const seat = input.pausePressed();
      if (seat >= 0 && r.state.phase !== 'finished') {
        if (r.driver) r.driver.pauseKey(); // online não pausa: pergunta se quer sair
        else { session.paused = true; menus.show('pause'); }
      }
    }
    // Trocar a câmera (ação `camera`): só entrada local e visual — nada vai ao núcleo nem à rede, e vale também online e no sofá.
    // O Retrô (pseudo-3D) ignora a escolha: a tecla não troca nada ali (e não mostra aviso que não vale).
    if (r && !menuOpen && !session.paused && input.cameraPressed && settings.renderStyle !== 'retro') {
      for (const seat of r.localSeats) {
        if (!input.cameraPressed(seat)) continue;
        if (!Array.isArray(settings.seatCameras)) settings.seatCameras = [...DEFAULT_SETTINGS.seatCameras];
        const sw = switchCamera(settings.seatCameras, seat);
        if (!sw) continue;
        saveSettings(settings);
        pushMessage(seat, sw.text, 'info', 1.4);
      }
    }
    if (r) stepVoice(r, dtRaw); // a roda de frases anda uma vez por quadro, antes de qualquer leitura das entradas

    if (r && !session.paused) {
      // Online, o lockstep decide quantos ticks rodam (e espera a rede); o acumulador local fica parado.
      if (r.driver) r.driver.advance(dtRaw * session.speed, readInputs(r), (i) => stepOnce(r, i));
      else accumulator += dtRaw * session.speed;
      let steps = 0;
      const inputs = readInputs(r);
      // O monitor rápido tem quadros sem passo (144 Hz: 2,4 quadros por passo): sem isto o aperto do nitro morria ali.
      for (const h of r.humans) {
        const held = r.heldEdges?.[h.seat]; const i = inputs[h.seat];
        if (held && i && i !== NEUTRAL_INPUT) inputs[h.seat] = { ...i, nitro: i.nitro || held.nitro, gearUp: i.gearUp || held.gearUp, gearDown: i.gearDown || held.gearDown, taunt: i.taunt ?? held.taunt };
      }
      while (accumulator >= DT && steps < MAX_STEPS_PER_FRAME * session.speed) {
        stepOnce(r, inputs);
        // As bordas (nitro, marcha, frase) valem só no primeiro passo do quadro.
        for (const h of r.humans) { const i = inputs[h.seat]; if (i && i !== NEUTRAL_INPUT) inputs[h.seat] = { ...i, nitro: false, gearUp: false, gearDown: false, taunt: undefined }; }
        accumulator -= DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME * session.speed) accumulator = 0; // não tenta recuperar quadros perdidos
      r.heldEdges = [];
      if (steps === 0 && !r.driver) for (const h of r.humans) { const i = inputs[h.seat]; if (i && i !== NEUTRAL_INPUT && (i.nitro || i.gearUp || i.gearDown || i.taunt !== undefined)) r.heldEdges[h.seat] = { nitro: i.nitro, gearUp: i.gearUp, gearDown: i.gearDown, taunt: i.taunt }; }
      for (const list of r.messages.values()) {
        for (let i = list.length - 1; i >= 0; i--) { list[i].ttl -= dtRaw; if (list[i].ttl <= 0) list.splice(i, 1); }
      }
      ageBalloons(r.voice, dtRaw);
      if (r.state.phase === 'finished' && menus.current() === null) {
        r.overFor += dtRaw;
        r.afterFlag = advanceAfterFlag(r.afterFlag, r.state, r.track, dtRaw * session.speed);
        if (r.overFor >= RESULTS_DELAY) finishRace(r);
      }
    }

    if (r) {
      const f = buildFrame(r);
      renderer.render(f);
      audio.update(session.paused ? { ...f, paused: true } : f, dtRaw);
      drawVoice(r, f);
      drawTips(r, f);
    } else {
      idleTimer += dtRaw;
      renderer.renderIdle(idleTimer, idleTrack);
      audio.update(null, dtRaw);
      drawVoice(null, null);
      drawTips(null, null);
    }

    // Só o menu que já estava aberto recebe as bordas deste quadro: a pausa (ou o resultado) que
    // acabou de abrir não pode receber o mesmo botão — com a pausa no A ou no B, ela fecharia na hora.
    if (menuOpen) menus.navigate(input.menuNav());
    menus.update(dtRaw);
  }

  function loop(now: number): void {
    if (!running) return;
    try { frame(now); } catch (err) { console.error(err); reportError(err, 'loop'); }
    rafId = requestAnimationFrame(loop);
  }

  function start(): void {
    if (running) return;
    running = true;
    menus.show('title');
    rafId = requestAnimationFrame(loop);
  }

  function stop(): void {
    running = false;
    cancelAnimationFrame(rafId);
  }

  // ───────────────────────────── Eventos dos menus ─────────────────────────────

  function applySettings(next: Settings): void {
    const languageChanged = next.language !== settings.language;
    const fullscreenChanged = next.fullscreen !== settings.fullscreen;
    Object.assign(settings, next, { assists: { ...next.assists }, seatAssists: [...next.seatAssists] });
    saveSettings(settings);
    applyAccessibility(settings, hudRoot, uiRoot);
    audio.setVolumes(settings.masterVolume, settings.musicVolume, settings.sfxVolume);
    if (languageChanged) { setLanguage(settings.language); menus.refreshLanguage(); }
    if (fullscreenChanged) setFullscreen(settings.fullscreen).catch(() => undefined);
    if (settings.renderStyle !== activeStyle) swapRenderer();
    if (!session.race) {
      audio.setMusic(settings.music === 'auto' ? songForScenery('coast', 'dusk') : settings.music === 'off' ? null : settings.music);
    } else if (settings.music !== 'auto') {
      audio.setMusic(settings.music === 'off' ? null : settings.music);
    }
  }

  /** Os eventos que largam uma corrida de copa/Expedição: é neles que a oferta de assistência, se estiver na hora, passa na frente. */
  const RACE_STARTS: ReadonlySet<MenuEvent['type']> = new Set(['startCup', 'continueCup', 'nextRace', 'retryRace', 'careerRace']);

  function holdForAssistOffer(e: MenuEvent): boolean {
    if (!RACE_STARTS.has(e.type)) return false;
    const seats = ('humans' in e ? e.humans : session.race?.humans ?? []).map((h) => h.seat);
    const due = offerDue(assistOffer, settings.difficulty, settings.seatAssists, seats);
    if (!due) return false;
    markOffered(assistOffer); // uma vez por sessão, aceita ou recusada
    held = { event: e, seats };
    menus.show('assistOffer', due);
    return true;
  }

  function answerAssistOffer(choice: 'brake' | 'amateur' | 'no'): void {
    const pending = held;
    held = null;
    if (!pending) return;
    if (choice !== 'no') applySettings(applyAssistChoice(choice, settings, pending.seats));
    if (pending.event.type === 'retryRace' && choice !== 'no') { menus.hide(); retryRace(true); return; }
    handleMenuEvent(pending.event);
  }

  function handleMenuEvent(e: MenuEvent): void {
    if (getActivePlaylog()?.askSurveyBefore(e, session.race !== null && session.race.state.phase !== 'finished')) { menus.show('survey'); return; }
    if (holdForAssistOffer(e)) return;
    switch (e.type) {
      case 'assistOfferAnswer': answerAssistOffer(e.choice); break;
      case 'startCup': startCup(e.cupId, e.humans); break;
      case 'startQuick': startQuick(e.trackId, e.laps, e.humans); break;
      case 'startTimeTrial': startQuick(e.trackId, settings.quickLaps, e.humans, true); break;
      case 'nextRace': if (session.race?.mode === 'career') career.showGarage(); else nextCupRace(); break;
      case 'continueCup': continueCup(); break;
      case 'startParty': champ = null; party.startMode(e.mode, e.trackId, e.laps, e.humans); break;
      case 'startTournament': champ = null; toIdle(); party.startTournament(e.setup, e.seats); break;
      case 'tournamentHeat': party.runHeat(); break;
      case 'startCareer': career.start(e.humans, e.resume); break;
      case 'careerRace': career.race(); break;
      case 'startTutorial': session.tutorial.start(e.humans); break;
      case 'tutorialFirstCup': session.tutorial.firstCup(); break;
      case 'retryRace': retryRace(); break;
      case 'restart': retryRace(); break;
      case 'resume': session.paused = false; menus.hide(); break;
      case 'toMain': toMain(); break;
      case 'settingsChanged': applySettings(e.settings); break;
      case 'quitApp': getDesktop()?.quit().catch(() => undefined); break;
      default: break;
    }
  }

  return session;
}

/** Exposto para o playtest automatizado (window.nc). */
export const SESSION_CONSTANTS = { COUNTDOWN_TICKS, TICK_RATE };
