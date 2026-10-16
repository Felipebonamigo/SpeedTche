// T8 (docs/ondas/T8-pontas.md, item 4): o lobby mostra o carro de cada assento no palco 3D (`mountShowroom`, N2) no lugar da silhueta SVG,
// como a garagem — fora do Retrô. O painel leva o carro à mostra, o visual inteiro do assento, a qualidade das Opções (a Baixa desenha sem
// pós) e o "reduzir efeitos" (o prato não gira); o carro trancado (O5) aparece acinzentado. DOM falso (tests/ui-fake.ts); o registro do palco
// é o de verdade.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARS } from '../src/core/data/cars';
import { seatColor } from '../src/core/data/drivers';
import { DEFAULT_SETTINGS, type DeviceId, type SaveData, type Settings } from '../src/game/contracts';
import { PAINT_IDS, seatLook, setSeatLook } from '../src/game/paints';
import { sanitizeSave } from '../src/game/save';
import { setLanguage } from '../src/i18n';
import { stageBus } from '../src/render/stage-bus';
import type { LobbyState, ScreenApi, ScreenInstance } from '../src/ui/screens/common';
import { LOCKED_PAINT, lobbyScreen } from '../src/ui/screens/lobby';
import '../src/ui/strings';
import { all, fakeInput, hasClass, installDocument, NAV, type FakeEl } from './ui-fake';

function setup(opts: { settings?: Partial<Settings>; bound?: Array<DeviceId | null>; save?: SaveData } = {}) {
  const save = opts.save ?? sanitizeSave({});
  const settings: Settings = { ...DEFAULT_SETTINGS, seatAssists: [...DEFAULT_SETTINGS.seatAssists], ...opts.settings };
  const lobby: LobbyState = { mode: 'quick', versus: false, seats: [null, null, null, null] };
  const bound = opts.bound ?? ['kb1', null, null, null];
  const api = {
    ctx: { cars: CARS, save, settings, input: fakeInput(bound), cups: [], tracks: [], isCupUnlocked: () => true },
    lobby, go: () => undefined, back: () => undefined, emit: () => undefined, sfx: () => undefined, refresh: () => undefined,
  } as unknown as ScreenApi;
  const screen = lobbyScreen(api);
  const slots = (): FakeEl[] => all(screen.el, hasClass('slot')).filter(hasClass('occupied'));
  const carId = (i = 0) => all(slots()[i], hasClass('car-card'))[0]?.getAttribute('data-car');
  return { save, settings, api, screen, slots, carId, lobby };
}
const press = (screen: ScreenInstance, device: DeviceId, key: 'up' | 'down' | 'left' | 'right' | 'confirm') => screen.nav({ ...NAV, [key]: true, device });
const svgs = (el: FakeEl): FakeEl[] => all(el, hasClass('car-visual')).flatMap((v) => all(v, (e) => e.tag === 'svg' && e.innerHTML.includes('<path')));

beforeEach(() => { stageBus.clear(); installDocument(); setLanguage('pt'); });
afterEach(() => { stageBus.clear(); vi.unstubAllGlobals(); setLanguage('pt'); });

describe('lobby: o carro no palco 3D', () => {
  it('3D: cada assento ocupado tem a janela do palco e nenhuma silhueta SVG; o registro tem um painel por assento, com o carro à mostra', () => {
    const r = setup({ bound: ['kb1', 'kb2', null, null] });
    expect(r.slots()).toHaveLength(2);
    for (const s of r.slots()) {
      expect(all(s, hasClass('car-stage'))).toHaveLength(1);
      expect(svgs(s)).toHaveLength(0);
    }
    expect(stageBus.all().map((p) => p.id).sort()).toEqual(['lobby:P1', 'lobby:P2']);
    expect(stageBus.panel('lobby:P1').carId).toBe(r.carId(0));
    expect(stageBus.panel('lobby:P2').carId).toBe(r.carId(1));
    expect(r.screen.el.classList.contains('stage3d')).toBe(true);
  });

  it('o painel leva o visual inteiro do assento, a cor do assento, a qualidade e o "reduzir efeitos" das Opções', () => {
    const save = sanitizeSave({});
    setSeatLook(save, 0, 'falcao', { paint: PAINT_IDS[2], finish: 'cromado', wheel: 'mag', rim: 'dourado' });
    const r = setup({ save, settings: { quality: 'low', reduceEffects: true } });
    expect(r.carId()).toBe('falcao');
    const p = stageBus.panel('lobby:P1');
    expect(p.look).toEqual(seatLook(save, 0, 'falcao'));
    expect(p.quality).toBe('low');
    expect(p.reduceEffects).toBe(true);
    expect(p.ring).toBe(seatColor(0, r.settings.colorPalette));
  });

  it('←→ troca o carro e o painel acompanha; a pintura trocada chega ao painel', () => {
    const r = setup();
    const p = stageBus.panel('lobby:P1');
    press(r.screen, 'kb1', 'right');
    expect(p.carId).toBe(r.carId());
    expect(p.carId).not.toBe('falcao');
    press(r.screen, 'kb1', 'left');
    expect(p.carId).toBe('falcao');
    press(r.screen, 'kb1', 'down'); // a linha da pintura
    press(r.screen, 'kb1', 'right');
    expect(p.look?.paint).toBe(PAINT_IDS[1]);
    expect(all(r.slots()[0], hasClass('car-stage'))[0]?.getAttribute('data-color')).toBe(p.paint?.color);
  });

  it('carro trancado (O5): o palco o mostra acinzentado, sem o visual do assento', () => {
    const r = setup();
    for (let i = 0; i < CARS.length * 2 && r.carId() !== 'curupira'; i++) press(r.screen, 'kb1', 'right');
    expect(r.carId()).toBe('curupira');
    const p = stageBus.panel('lobby:P1');
    expect(p.carId).toBe('curupira');
    expect(p.paint).toEqual(LOCKED_PAINT);
    expect(p.look).toBeNull();
  });

  it('sair do assento solta o painel dele; sair da tela (destroy) solta todos', () => {
    const r = setup({ bound: ['kb1', 'kb2', null, null] });
    expect(stageBus.all()).toHaveLength(2);
    r.api.ctx.input.unbindSeat(1);
    r.lobby.seats[1] = null;
    press(r.screen, 'kb1', 'confirm'); // PRONTO: refaz a tela
    expect(stageBus.all().map((p) => p.id)).toEqual(['lobby:P1']);
    r.screen.destroy?.();
    expect(stageBus.all()).toHaveLength(0);
  });

  it('Retrô: a silhueta SVG continua e não há janela de palco nem painel no registro', () => {
    const r = setup({ settings: { renderStyle: 'retro' } });
    expect(svgs(r.slots()[0]).length).toBeGreaterThan(0);
    expect(all(r.slots()[0], hasClass('car-stage'))).toHaveLength(0);
    expect(stageBus.all()).toHaveLength(0);
  });
});
