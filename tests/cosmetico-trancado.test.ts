// O5 (docs/ondas/O/O5.md §4.2): três itens do catálogo da N3 viram prêmio da maestria do carro — aro dourado (1), cromado (3), camaleão (5).
// O cadeado é SÓ do seletor: ←→ pula o item trancado para aquele perfil e carro; o valor atual nunca é pulado (quem já usava continua com
// ele), e o save e a rede seguem aceitando todo id do catálogo (nada é apagado).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARS } from '../src/core/data/cars';
import { DEFAULT_SETTINGS, type DeviceId, type SaveData, type Settings } from '../src/game/contracts';
import { parseLook, sanitizeLook, stepLook, type LookField } from '../src/game/cosmetics';
import { seatLook } from '../src/game/paints';
import { cosmeticUnlocked, emptyProgress, type ProgressData } from '../src/game/progression';
import { sanitizeSave } from '../src/game/save';
import type { LobbyState, ScreenApi, ScreenInstance } from '../src/ui/screens/common';
import { lobbyScreen } from '../src/ui/screens/lobby';
import '../src/ui/strings';
import { fakeInput, installDocument, NAV } from './ui-fake';

const progressWith = (cars: Record<string, number>, name = 'Ana'): ProgressData => ({ profiles: [{ name, cars }] });
const allow = (data: ProgressData | undefined, name: string, carId: string) => (f: LookField, v: string) => cosmeticUnlocked(data, name, carId, f, v);

/** Os valores que ←→ visita num campo, partindo do padrão, até voltar. */
function cycle(field: LookField, carId: string, allowed?: (f: LookField, v: string) => boolean): string[] {
  let look = null as ReturnType<typeof stepLook>;
  const seen: string[] = [];
  for (let i = 0; i < 40; i++) {
    look = stepLook(look, field, 1, carId, allowed);
    const v = look?.[field] ?? '';
    if (seen.includes(v)) break;
    seen.push(v);
  }
  return seen;
}

describe('stepLook com o cadeado', () => {
  it('sem maestria: o seletor pula o aro dourado, o cromado e o camaleão; o resto anda como antes', () => {
    const none = allow(emptyProgress(), 'Ana', 'falcao');
    expect(cycle('rim', 'falcao', none)).toEqual(['prata', 'grafite', 'acento', '']);
    expect(cycle('finish', 'falcao', none)).toEqual(['metalico', 'perolado', 'fosco', '']);
    expect(cycle('stripe', 'falcao', none)).toEqual(cycle('stripe', 'falcao'));
    // Sem o filtro (quem não passa nenhum: testes da N3, a rede), o catálogo inteiro.
    expect(cycle('finish', 'falcao')).toEqual(['metalico', 'perolado', 'fosco', 'cromado', 'camaleao', '']);
  });
  it('com a maestria daquele carro e perfil: o item volta a aparecer, na ordem do catálogo', () => {
    expect(cycle('rim', 'falcao', allow(progressWith({ falcao: 150 }), 'Ana', 'falcao'))).toEqual(['prata', 'grafite', 'dourado', 'acento', '']);
    expect(cycle('finish', 'falcao', allow(progressWith({ falcao: 800 }), 'ana', 'falcao'))).toEqual(['metalico', 'perolado', 'fosco', 'cromado', '']);
    expect(cycle('finish', 'falcao', allow(progressWith({ falcao: 2200 }), 'Ana', 'falcao'))).toEqual(['metalico', 'perolado', 'fosco', 'cromado', 'camaleao', '']);
    // Outro carro ou outro perfil: trancado.
    expect(cycle('rim', 'trovao', allow(progressWith({ falcao: 2200 }), 'Ana', 'trovao'))).not.toContain('dourado');
    expect(cycle('rim', 'falcao', allow(progressWith({ falcao: 2200 }), 'Bia', 'falcao'))).not.toContain('dourado');
  });
  it('o valor atual nunca é pulado: quem já usava cromado (save da 0.1.4) continua nele, e sai dele para os vizinhos', () => {
    const none = allow(emptyProgress(), 'Ana', 'falcao');
    const look = { finish: 'cromado' };
    expect(stepLook(look, 'finish', 1, 'falcao', none)).toEqual(null); // cromado → (camaleão trancado) → brilho, o padrão
    expect(stepLook(look, 'finish', -1, 'falcao', none)).toEqual({ finish: 'fosco' });
    // Mexer em OUTRO campo não tira o cromado.
    expect(stepLook(look, 'rim', 1, 'falcao', none)).toEqual({ finish: 'cromado', rim: 'prata' });
  });
  it('save e rede continuam aceitando os prêmios (nada é apagado nem recusado)', () => {
    expect(sanitizeLook({ finish: 'camaleao', rim: 'dourado' }, 'falcao')).toEqual({ finish: 'camaleao', rim: 'dourado' });
    expect(parseLook({ finish: 'cromado', rim: 'dourado' }, 'falcao')).toEqual({ look: { finish: 'cromado', rim: 'dourado' } });
  });
});

describe('lobby: o editor do visual respeita a maestria do perfil do assento', () => {
  beforeEach(() => { installDocument(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  function setup(progress: ProgressData | undefined, name = 'Ana') {
    const save: SaveData = sanitizeSave({ seatNames: [name, 'P2', 'P3', 'P4'] });
    const settings: Settings = { ...DEFAULT_SETTINGS, seatAssists: [...DEFAULT_SETTINGS.seatAssists] };
    const lobby: LobbyState = { mode: 'quick', versus: false, seats: [null, null, null, null] };
    const a = {
      ctx: { cars: CARS, save, settings, input: fakeInput(['kb1', null, null, null] as Array<DeviceId | null>), cups: [], tracks: [], progress },
      lobby, go: () => undefined, back: () => undefined, emit: () => undefined, sfx: () => undefined, refresh: () => undefined,
    } as unknown as ScreenApi;
    const screen = lobbyScreen(a);
    return { save, screen };
  }
  const press = (screen: ScreenInstance, key: 'down' | 'right' | 'confirm') => screen.nav({ ...NAV, [key]: true, device: 'kb1' });
  /** Abre o editor (carro → pintura → direção → Visual) e desce até o campo do aro (paint, color, accent, finish, wheel, rim). */
  function toRim(screen: ScreenInstance) {
    press(screen, 'down'); press(screen, 'down'); press(screen, 'down'); press(screen, 'confirm');
    for (let i = 0; i < 5; i++) press(screen, 'down');
  }
  const rims = (save: SaveData, screen: ScreenInstance) => {
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) { press(screen, 'right'); seen.push(seatLook(save, 0, 'falcao')?.rim ?? ''); }
    return seen;
  };

  it('sem maestria o aro dourado não aparece; com a maestria 1 do Falcão, aparece', () => {
    const a = setup(emptyProgress());
    toRim(a.screen);
    expect(rims(a.save, a.screen)).not.toContain('dourado');
    const b = setup(progressWith({ falcao: 150 }));
    toRim(b.screen);
    expect(rims(b.save, b.screen)).toContain('dourado');
  });
  it('sem progresso nenhum no contexto (tela montada sem sessão): os prêmios ficam trancados', () => {
    const a = setup(undefined);
    toRim(a.screen);
    expect(rims(a.save, a.screen)).not.toContain('dourado');
  });
});
