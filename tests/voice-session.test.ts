// N6: a voz do carro ligada à sessão (docs/ondas/N/N6.md, §4.4–§4.5 e §6 "Balão e sessão"). Roda em Node: o renderizador (WebGL)
// e os menus (DOM) são dublês; entrada, simulação, opções, voz e áudio são os de verdade. O som é espiado em `audio.horn`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionAudio } from '../src/audio/audio';
import type { MenuContext, MenuNav, MenuScreen, Menus, Renderer } from '../src/game/contracts';
import { createSession, type Session } from '../src/game/session';
import { createRivalTalk } from '../src/game/rival-talk';
import { driverKey } from '../src/game/rivals';
import { TAUNT_MIN_GAP_TICKS, TAUNT_SHOW_SECONDS, WHEEL_OPEN_SECONDS, tauntText } from '../src/voice/voice';
import { human } from './helpers';

vi.mock('../src/render/renderer', () => ({
  createRenderer: (canvas: HTMLCanvasElement): Renderer => ({
    canvas, resize: () => undefined, render: () => undefined, renderIdle: () => undefined, dispose: () => undefined,
  }),
}));

vi.mock('../src/ui/menus', () => ({
  createMenus: (ctx: MenuContext): Menus => {
    let current: MenuScreen | null = null;
    return {
      show: (screen: MenuScreen) => { current = screen; },
      hide: () => { current = null; },
      current: () => current,
      navigate: (nav: MenuNav) => { void nav; void ctx; },
      update: () => undefined,
      refreshLanguage: () => undefined,
    };
  },
}));

/** Janela mínima para a sessão e a entrada: ouvintes, tamanho e a Gamepad API vazia. */
function fakeWindow() {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  const win = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener: (type: string, fn: (e: unknown) => void) => { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
    removeEventListener: (type: string, fn: (e: unknown) => void) => { listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)); },
    navigator: { getGamepads: () => [null, null, null, null] },
  };
  const key = (type: 'keydown' | 'keyup', code: string) => {
    const e = { code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: null, preventDefault: () => undefined };
    for (const fn of listeners.get(type) ?? []) fn(e);
  };
  return { win, down: (code: string) => key('keydown', code), up: (code: string) => key('keyup', code) };
}

const element = {} as HTMLElement;
let w: ReturnType<typeof fakeWindow>;
let session: Session;
let now = 0;
let horn: ReturnType<typeof vi.spyOn>;

/** Um quadro da sessão, a 60 Hz (um tick por quadro). */
function frame(ms = 1000 / 60): void {
  now += ms;
  session.frame(now);
}
function frames(n: number): void { for (let i = 0; i < n; i++) frame(); }

const voice = () => {
  const v = session.race?.voice;
  if (!v) throw new Error('corrida sem voz');
  return v;
};

beforeEach(() => {
  w = fakeWindow();
  vi.stubGlobal('window', w.win);
  session = createSession({} as HTMLCanvasElement, element, element);
  horn = vi.spyOn(session.audio as SessionAudio, 'horn');
  now = 1000;
});

afterEach(() => {
  session.input.dispose();
  vi.unstubAllGlobals();
});

/** Inicia uma corrida de um jogador no teclado 1 e leva a sessão ao "JÁ". */
function startRacing(carId = 'trovao'): void {
  session.input.bindSeat(0, 'kb1');
  session.startQuick('copacabana', 2, [human(0, 0, carId)]);
  frame();
  session.debugStep(60 * 5);
  expect(session.race?.state.phase).toBe('racing');
}

describe('sessão: buzina', () => {
  it('apertar H (teclado 1) buzina UMA vez com o carro do jogador; segurar não repete; soltar e apertar logo de novo não', () => {
    startRacing('trovao');
    w.down('KeyH');
    frames(10);
    expect(horn).toHaveBeenCalledTimes(1);
    expect(horn).toHaveBeenCalledWith('trovao', 1);
    w.up('KeyH');
    frames(2);
    w.down('KeyH');
    frames(2);
    expect(horn).toHaveBeenCalledTimes(1); // dentro do intervalo mínimo
    w.up('KeyH');
    frames(40);
    w.down('KeyH');
    frames(2);
    expect(horn).toHaveBeenCalledTimes(2);
  });

  it('a buzina de cada carro é a dele (o Tornado buzina como Tornado)', () => {
    startRacing('tornado');
    w.down('KeyH');
    frames(3);
    expect(horn).toHaveBeenCalledWith('tornado', 1);
  });

  it('buzinar não muda a corrida: o mesmo carro, a mesma entrada, o mesmo estado com e sem buzina', () => {
    const snapshot = (withHorn: boolean): string => {
      vi.spyOn(Math, 'random').mockReturnValue(0.42);
      vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      const s = createSession({} as HTMLCanvasElement, element, element);
      s.input.bindSeat(0, 'kb1');
      s.startQuick('copacabana', 2, [human(0, 0, 'falcao')]);
      let t = 5000;
      const step = () => { t += 1000 / 60; s.frame(t); };
      for (let i = 0; i < 260; i++) step();
      w.down('ArrowUp');
      for (let i = 0; i < 120; i++) { if (withHorn && i % 40 === 0) w.down('KeyH'); if (withHorn && i % 40 === 10) w.up('KeyH'); step(); }
      w.up('ArrowUp'); w.up('KeyH');
      const car = s.race?.state.cars.find((c) => c.seat === 0);
      return JSON.stringify([s.race?.state.tick, car?.z, car?.x, car?.speed, car?.fuel]);
    };
    const quiet = snapshot(false);
    const loud = snapshot(true);
    vi.restoreAllMocks();
    expect(loud).toBe(quiet);
  });
});

describe('sessão: a roda e a frase', () => {
  /** Segura a buzina o bastante para abrir a roda. */
  function openWheel(): void {
    w.down('KeyH');
    frames(Math.ceil(WHEEL_OPEN_SECONDS * 60) + 3);
    expect(voice().wheels[0].open).toBe(true);
  }

  it('segurar H abre a roda; marcha acima (M) marca a primeira frase; soltar cria o balão de 2 s com o texto certo', () => {
    startRacing();
    expect(voice().balloons).toHaveLength(0);
    openWheel();
    expect(voice().wheels[0].selected).toBe(-1);
    w.down('KeyM'); frame(); w.up('KeyM'); frame();
    expect(voice().wheels[0].selected).toBe(0);
    w.up('KeyH');
    frames(2);
    expect(voice().wheels[0].open).toBe(false);
    expect(voice().balloons).toHaveLength(1);
    expect(voice().balloons[0]).toMatchObject({ seat: 0, name: 'P1', text: tauntText(0), own: true });
    expect(voice().balloons[0].ttl).toBeGreaterThan(TAUNT_SHOW_SECONDS - 0.2);
    expect(voice().balloons[0].ttl).toBeLessThanOrEqual(TAUNT_SHOW_SECONDS);
    // O balão some em 2 s.
    frames(Math.ceil(TAUNT_SHOW_SECONDS * 60) + 5);
    expect(voice().balloons).toHaveLength(0);
  });

  it('o gancho de playtest (debugStep) também lê a roda: o toque de marcha que ele fecha no próprio poll não se perde', () => {
    startRacing();
    openWheel();
    w.down('KeyM'); w.up('KeyM'); // o toque cai entre dois quadros: quem fizer o próximo poll() fecha a borda
    session.debugStep(1);
    expect(voice().wheels[0].selected).toBe(0);
    w.up('KeyH');
    session.debugStep(2);
    expect(voice().balloons).toHaveLength(1);
    expect(voice().balloons[0].text).toBe(tauntText(0));
  });

  it('com a roda aberta, a marcha é da roda e não chega à física; fechada, o câmbio manual troca de marcha normalmente', () => {
    session.settings.manualGear = true;
    startRacing();
    const car = () => session.race!.state.cars.find((c) => c.seat === 0)!;
    const g0 = car().gear;
    openWheel();
    w.down('KeyM'); frame(); w.up('KeyM'); frame();
    expect(car().gear).toBe(g0);
    w.up('KeyH');
    frames(3);
    w.down('KeyM'); frame(); w.up('KeyM'); frames(2);
    expect(car().gear).toBe(g0 + 1);
  });

  it('a frase (borda) não se perde num quadro em que não coube nenhum passo da física (monitor de 144 Hz)', () => {
    startRacing();
    openWheel();
    w.down('KeyM'); frame(); w.up('KeyM'); frame();
    w.up('KeyH');
    frame(2); // 2 ms: o acumulador não chega a um tick — o quadro que soltou a buzina não roda passo
    expect(voice().balloons).toHaveLength(0);
    frames(2); // o passo vem nos quadros seguintes e a frase ainda está lá
    expect(voice().balloons).toHaveLength(1);
    // Uma vez só: nada de balão repetido nos quadros seguintes.
    frames(10);
    expect(voice().balloons).toHaveLength(1);
  });

  it('1 frase a cada 5 s: a segunda, logo depois, é descartada (a roda avisa quanto falta); passados 5 s, volta a valer', () => {
    startRacing();
    const say = () => { openWheel(); w.down('KeyM'); frame(); w.up('KeyM'); frame(); w.up('KeyH'); frames(3); };
    say();
    expect(voice().balloons).toHaveLength(1);
    frames(Math.ceil(TAUNT_SHOW_SECONDS * 60) + 5); // o balão some, o intervalo ainda não acabou
    expect(voice().balloons).toHaveLength(0);
    say();
    expect(voice().balloons).toHaveLength(0);
    session.debugStep(TAUNT_MIN_GAP_TICKS);
    say();
    expect(voice().balloons).toHaveLength(1);
  });

  it('pausar fecha a roda (nada fica aberto atrás do menu)', () => {
    startRacing();
    openWheel();
    w.down('Escape'); frame(); w.up('Escape'); frame();
    expect(session.paused).toBe(true);
    expect(voice().wheels[0].open).toBe(false);
  });
});

describe('sessão: o rival da copa responde', () => {
  it('depois de uma provocação, de vez em quando o rival responde com um balão dele (e uma buzinada do carro dele); sem rival, nunca', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.37);
    startRacing();
    const r = session.race!;
    const me = r.state.cars.find((c) => c.seat === 0)!;
    /** O rival é o carro da IA mais perto do humano (a resposta só vale a até 3 posições), com a conversa dele ligada. */
    const pickRival = () => {
      const rival = r.state.cars.filter((c) => c.seat < 0).sort((a, b) => Math.abs(a.position - me.position) - Math.abs(b.position - me.position))[0];
      r.state.config.rival = rival.name;
      r.talk = createRivalTalk(null);
      r.talk.introDone = true; // a apresentação dele é outra fala, e já passou
      return rival;
    };
    const say = () => { w.down('KeyH'); frames(Math.ceil(WHEEL_OPEN_SECONDS * 60) + 3); w.down('KeyM'); frame(); w.up('KeyM'); frame(); w.up('KeyH'); frames(3); };
    // Sem rival (corrida rápida): ninguém responde.
    r.state.config.rival = undefined;
    r.talk = null;
    say();
    expect(voice().balloons.map((b) => b.seat)).toEqual([0]);
    session.debugStep(TAUNT_MIN_GAP_TICKS + 120);
    let reply: { seat: number; name: string; text: string; own: boolean } | undefined;
    let rival = pickRival();
    for (let attempt = 0; attempt < 40 && !reply; attempt++) {
      rival = pickRival();
      say();
      reply = voice().balloons.find((b) => b.seat === -1);
      if (!reply) session.debugStep(TAUNT_MIN_GAP_TICKS + 30);
    }
    expect(reply, 'o rival nunca respondeu em 40 tentativas').toBeDefined();
    expect(reply).toMatchObject({ seat: -1, name: rival.name, own: false });
    expect(reply?.text.length).toBeGreaterThan(5);
    expect(horn).toHaveBeenCalledWith(rival.carId, expect.any(Number));
    // A resposta conta como fala dele: a conversa guarda o intervalo mínimo.
    expect(session.race?.talk?.lines).toBe(1);
    vi.restoreAllMocks();
  });
});

describe('sessão: o rival cita o placar do perfil (O4)', () => {
  /** O rival é o carro da IA mais perto do humano; o placar do perfil P1 contra ele é 1 × 4 (ele vence). */
  function setup() {
    startRacing();
    const r = session.race!;
    const me = r.state.cars.find((c) => c.seat === 0)!;
    const rival = r.state.cars.filter((c) => c.seat < 0).sort((a, b) => Math.abs(a.position - me.position) - Math.abs(b.position - me.position))[0];
    r.state.config.rival = rival.name;
    session.debugSave().stars = { profiles: [{ name: 'P1', tracks: {}, rivals: { [driverKey(rival.name)]: { you: 1, rival: 4 } } }], last: [] };
    return { r, rival };
  }

  it('a apresentação na pista sai com o placar (4 × 1)', () => {
    const { r, rival } = setup();
    r.talk = createRivalTalk(null);
    frames(5); // `debugStep` limpa as mensagens ao fim; os quadros as deixam à mostra
    const said = (r.messages.get(0) ?? []).map((m) => m.text).find((x) => x.startsWith(`${rival.name}:`));
    expect(said, 'o rival não falou').toBeDefined();
    expect(said).toContain('4 × 1');
  });

  it('sem placar gravado, a fala é a de sempre (sem "×")', () => {
    const { r, rival } = setup();
    session.debugSave().stars = { profiles: [], last: [] };
    r.talk = createRivalTalk(null);
    frames(5); // `debugStep` limpa as mensagens ao fim; os quadros as deixam à mostra
    const said = (r.messages.get(0) ?? []).map((m) => m.text).find((x) => x.startsWith(`${rival.name}:`));
    expect(said).toBeDefined();
    expect(said).not.toContain('×');
  });

  it('a resposta à buzina é um balão com o rosto dele e o placar', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.37);
    const { r } = setup();
    const say = () => { w.down('KeyH'); frames(Math.ceil(WHEEL_OPEN_SECONDS * 60) + 3); w.down('KeyM'); frame(); w.up('KeyM'); frame(); w.up('KeyH'); frames(3); };
    let reply: { text: string; face?: string } | undefined;
    for (let attempt = 0; attempt < 40 && !reply; attempt++) {
      r.talk = createRivalTalk(null);
      r.talk.introDone = true;
      say();
      reply = voice().balloons.find((b) => b.seat === -1);
      if (!reply) session.debugStep(TAUNT_MIN_GAP_TICKS + 30);
    }
    expect(reply, 'o rival nunca respondeu').toBeDefined();
    expect(['taunt', 'win', 'lose']).toContain(reply?.face);
    expect(reply?.text).toContain('4 × 1'); // a resposta é provocação ou revanche: as duas citam o placar
    vi.restoreAllMocks();
  });
});
