// Câmeras selecionáveis (frente nc/cameras): Alta (padrão), Baixa (a de sempre), Capô e Frente. Só renderização e entrada local —
// nada disto entra no núcleo nem na rede. Cobre: os modos e o ciclo, o campo aditivo nas opções, o limite de cada deslocamento dinâmico
// por câmera (modelado em scenery/sight.ts), o ponto de montagem de cada carro (cars/mount.ts) e a régua de visão dos marcos por câmera.
import { describe, expect, it } from 'vitest';
import { CAR_BODIES } from '../src/core/data/cars';
import { DEFAULT_SETTINGS } from '../src/game/contracts';
import { sanitizeSettings } from '../src/game/settings';
import {
  CAMERA_MODES, CAMERA_POSES, CHASE_CAMERA, DEFAULT_CAMERA_MODE, isMountedCamera, nextCameraMode, pickCameraMode,
} from '../src/render/camera-base';
import { buildModel } from '../src/render/cars/models';
import { carMount, CUT_BIT, cutFlags, readCutFlags } from '../src/render/cars/mount';
import {
  CAMERA_DYNAMICS, CAMERA_RIGS, cameraFovFor, cameraLoweringFor, cameraLowering, sightRoad, sightSeconds, tremorScaleFor, type BlockHeight,
} from '../src/render/scenery/sight';
import { mapGamepad, mapKeyboard, NEUTRAL_RAW } from '../src/ui/input';
import { BIND_ACTIONS, DEFAULT_BINDINGS, sanitizeBindings } from '../src/ui/remap/bindings';
import { syntheticTrack } from './helpers';

describe('os quatro modos', () => {
  it('a ordem é Alta → Baixa → Capô → Frente e a padrão é a Alta', () => {
    expect([...CAMERA_MODES]).toEqual(['high', 'low', 'hood', 'bumper']);
    expect(DEFAULT_CAMERA_MODE).toBe('high');
  });

  it('o ciclo dá a volta: Alta → Baixa → Capô → Frente → Alta', () => {
    expect(nextCameraMode('high')).toBe('low');
    expect(nextCameraMode('low')).toBe('hood');
    expect(nextCameraMode('hood')).toBe('bumper');
    expect(nextCameraMode('bumper')).toBe('high');
  });

  it('pickCameraMode aceita só os quatro e cai na Alta com lixo', () => {
    for (const m of CAMERA_MODES) expect(pickCameraMode(m, 'high')).toBe(m);
    for (const bad of ['', 'chase', 7, null, undefined, {}, ['hood']]) expect(pickCameraMode(bad, 'high')).toBe('high');
  });

  it('a Alta é a pose B do quadro-alvo; a Baixa é a CHASE_CAMERA de sempre (não mudou)', () => {
    expect(CHASE_CAMERA).toEqual({ baseFov: 62, speedFov: 13, nitroFov: 8, height: 2.05, back: 7.8, lookAhead: 18, lookY: 0.85 });
    expect(CAMERA_POSES.low).toEqual(CHASE_CAMERA);
    expect(CAMERA_POSES.high).toMatchObject({ baseFov: 36, height: 2.5, back: 7.8, lookY: 0.7 });
  });

  it('só Capô e Frente são presas ao carro', () => {
    expect(CAMERA_MODES.filter(isMountedCamera)).toEqual(['hood', 'bumper']);
  });
});

describe('a escolha é por assento e é campo aditivo das opções', () => {
  it('padrão: Alta nos quatro assentos', () => {
    expect(DEFAULT_SETTINGS.seatCameras).toEqual(['high', 'high', 'high', 'high']);
  });

  it('save de antes (fixture literal, sem seatCameras) abre intacto e cai na Alta', () => {
    const antigo = '{"language":"pt","masterVolume":0.5,"quality":"medium","seatAssists":["brake","none","none","none"],"reduceEffects":true,"lockFps30":true}';
    const s = sanitizeSettings(JSON.parse(antigo));
    expect(s.seatCameras).toEqual(['high', 'high', 'high', 'high']);
    expect(s.masterVolume).toBe(0.5);
    expect(s.quality).toBe('medium');
    expect(s.seatAssists).toEqual(['brake', 'none', 'none', 'none']);
    expect(s.reduceEffects).toBe(true);
    expect(s.lockFps30).toBe(true);
  });

  it('o que foi escolhido volta igual; entrada ruim vira Alta, por posição', () => {
    expect(sanitizeSettings({ seatCameras: ['hood', 'bumper', 'low', 'high'] }).seatCameras).toEqual(['hood', 'bumper', 'low', 'high']);
    expect(sanitizeSettings({ seatCameras: ['hood', 'xx', 3] }).seatCameras).toEqual(['hood', 'high', 'high', 'high']);
    expect(sanitizeSettings({ seatCameras: 'hood' }).seatCameras).toEqual(['high', 'high', 'high', 'high']);
    expect(sanitizeSettings({ seatCameras: ['hood', 'hood', 'hood', 'hood', 'bumper'] }).seatCameras).toHaveLength(4);
  });

  it('a 0.1.4 abre o save novo: o campo novo é só uma chave a mais e nenhuma chave antiga mudou de forma', () => {
    const novo = JSON.parse(JSON.stringify(sanitizeSettings({ seatCameras: ['bumper', 'hood', 'low', 'high'] }))) as Record<string, unknown>;
    // A 0.1.4 monta o objeto só com as chaves que conhece: uma chave a mais é ignorada.
    expect(Object.keys(novo)).toContain('seatCameras');
    const controles = novo.controls as Record<string, Record<string, unknown>>;
    for (const dev of ['kb1', 'kb2', 'gamepad']) {
      for (const a of ['throttle', 'brake', 'left', 'right', 'nitro', 'gearUp', 'gearDown', 'drift', 'lookBack', 'horn', 'pause']) {
        expect(Array.isArray(controles[dev][a]), `${dev}.${a}`).toBe(true);
      }
    }
  });
});

describe('a ação remapeável camera', () => {
  it('é a 12ª e última (depois da pausa: nenhum mapa antigo perde um botão para ela), e os padrões são C (teclado 1), V (teclado 2) e Select/Back (botão 8)', () => {
    expect([...BIND_ACTIONS]).toEqual(['throttle', 'brake', 'left', 'right', 'nitro', 'gearUp', 'gearDown', 'drift', 'lookBack', 'horn', 'pause', 'camera']);
    expect(DEFAULT_BINDINGS.kb1.camera).toEqual(['KeyC']);
    expect(DEFAULT_BINDINGS.kb2.camera).toEqual(['KeyV']);
    expect(DEFAULT_BINDINGS.gamepad.camera).toEqual([8]);
  });

  it('nenhum padrão colide dentro do dispositivo, nem entre os dois teclados', () => {
    for (const dev of ['kb1', 'kb2', 'gamepad'] as const) {
      const all = BIND_ACTIONS.flatMap((a) => DEFAULT_BINDINGS[dev][a] as Array<string | number>);
      expect(new Set(all).size, dev).toBe(all.length);
    }
    const k1 = new Set(BIND_ACTIONS.flatMap((a) => DEFAULT_BINDINGS.kb1[a]));
    for (const a of BIND_ACTIONS) if (a !== 'pause') for (const c of DEFAULT_BINDINGS.kb2[a]) expect(k1.has(c), c).toBe(false);
  });

  it('mapa salvo de antes (11 ações) ganha a câmera no padrão e não perde nenhum botão', () => {
    const antigo = { kb1: { throttle: ['ArrowUp'], horn: ['KeyH'] }, kb2: { nitro: ['KeyC'] }, gamepad: { horn: [10] } };
    const b = sanitizeBindings(antigo);
    expect(b.kb1.camera).toEqual(['KeyC']);
    expect(b.kb2.nitro).toEqual(['KeyC']); // quem já usava C em outra ação mantém...
    expect(b.kb2.camera).not.toContain('KeyC'); // ...e a câmera ganha outra tecla livre
    expect(b.kb2.camera).toHaveLength(1);
    expect(b.gamepad.camera).toEqual([8]);
  });

  it('C, V e o botão 8 acionam a câmera (borda, fora do PlayerInput da rede)', () => {
    expect(mapKeyboard(new Set(['KeyC']), 'kb1').camera).toBe(true);
    expect(mapKeyboard(new Set(['KeyV']), 'kb2').camera).toBe(true);
    expect(mapKeyboard(new Set(['KeyV']), 'kb1').camera).toBe(false);
    const buttons = Array.from({ length: 16 }, (_, i) => i === 8);
    expect(mapGamepad(buttons, [0, 0, 0, 0]).camera).toBe(true);
    expect(NEUTRAL_RAW.camera).toBe(false);
  });
});

describe('deslocamentos dinâmicos: o limite de cada câmera (M5)', () => {
  const D = CAMERA_DYNAMICS;
  const speeds = Array.from({ length: 25 }, (_, i) => i * 0.05);

  it('Alta e Baixa baixam até 0,32 m (igual à de sempre) e o piso fica acima de 1,6 m; Capô e Frente não baixam', () => {
    for (const m of ['high', 'low'] as const) {
      expect(CAMERA_RIGS[m].lowerMax).toBeCloseTo(D.lower.max, 9);
      for (const sf of speeds) expect(cameraLoweringFor(m, sf)).toBeCloseTo(cameraLowering(sf), 9);
      expect(CAMERA_POSES[m].height - cameraLoweringFor(m, 1.2)).toBeGreaterThanOrEqual(1.6);
    }
    for (const m of ['hood', 'bumper'] as const) for (const sf of speeds) expect(cameraLoweringFor(m, sf), m).toBe(0);
  });

  it('o FOV nunca passa do teto absoluto, nunca fica abaixo da base, e reduzir efeitos tira o FOV dinâmico do Capô e da Frente', () => {
    for (const m of CAMERA_MODES) {
      for (const speedFov of [0, CAMERA_POSES[m].speedFov * 1.2]) {
        for (const nitro of [0, CAMERA_POSES[m].nitroFov + D.fov.springMax]) {
          for (const reduce of [false, true]) {
            const f = cameraFovFor(m, speedFov, nitro, reduce);
            expect(f, `${m} ${speedFov} ${nitro} ${reduce}`).toBeLessThanOrEqual(D.fov.hardMax);
            expect(f).toBeGreaterThanOrEqual(CAMERA_POSES[m].baseFov);
          }
        }
      }
    }
    for (const m of ['hood', 'bumper'] as const) {
      const full = cameraFovFor(m, CAMERA_POSES[m].speedFov * 1.2, CAMERA_POSES[m].nitroFov, false) - CAMERA_POSES[m].baseFov;
      const reduced = cameraFovFor(m, CAMERA_POSES[m].speedFov * 1.2, CAMERA_POSES[m].nitroFov, true) - CAMERA_POSES[m].baseFov;
      expect(reduced, m).toBeLessThanOrEqual(full * 0.35);
    }
  });

  it('presas ao carro: sem cresta, sem órbita, menos tremor e menos rolagem que as de perseguição', () => {
    for (const m of ['hood', 'bumper'] as const) {
      expect(CAMERA_RIGS[m].crest, m).toBe(0);
      expect(CAMERA_RIGS[m].orbit, m).toBe(false);
      expect(CAMERA_RIGS[m].rollScale, m).toBeLessThanOrEqual(0.5);
      expect(tremorScaleFor(m, false), m).toBeLessThan(1);
      expect(tremorScaleFor(m, true), m).toBe(0);
    }
    for (const m of ['high', 'low'] as const) {
      expect(CAMERA_RIGS[m].orbit).toBe(true);
      expect(CAMERA_RIGS[m].rollScale).toBe(1);
      expect(tremorScaleFor(m, false)).toBe(1);
    }
  });
});

describe('o ponto de montagem em cada um dos 13 modelos', () => {
  const near = 0.3; // camera.near do ChaseCamera
  for (const body of CAR_BODIES) {
    const model = buildModel(body);
    const m = carMount(model.shell.getAttribute('position').array as ArrayLike<number>);

    it(`${body}: a câmera de capô fica sobre o capô, dentro da caixa do carro, e o corte esconde a cabine`, () => {
      expect(m.hood.y - m.hoodTop).toBeGreaterThanOrEqual(near + 0.1); // o capô não encosta no plano próximo
      expect(m.hood.cutY).toBeLessThan(m.roofY - 0.1); // o teto some
      expect(m.hood.cutY).toBeGreaterThanOrEqual(m.hoodTop); // o capô fica
      expect(m.hood.cutY).toBeLessThan(m.hood.y); // a câmera fica acima do corte
      expect(Math.abs(m.hood.x)).toBe(0);
      const o = CAMERA_DYNAMICS.orbit;
      expect(Math.abs(m.hood.z)).toBeLessThanOrEqual(o.halfLength);
      expect(m.hood.z).toBeGreaterThan(m.noseZ); // atrás do bico
    });

    it(`${body}: a câmera da frente fica rente ao chão, na ponta do bico e dentro da caixa do carro`, () => {
      expect(m.bumper.y).toBeGreaterThan(0.25);
      expect(m.bumper.y).toBeLessThan(0.6);
      // O olho fica na borda dianteira da caixa de colisão (o bico de alguns modelos passa dela): como a carroceria inteira some, o bico à frente do olho não corta no plano próximo.
      expect(m.bumper.z).toBeLessThanOrEqual(-CAMERA_DYNAMICS.orbit.halfLength + 0.5);
      expect(m.bumper.z).toBeGreaterThanOrEqual(-CAMERA_DYNAMICS.orbit.halfLength);
      expect(m.bumper.cutY).toBeLessThanOrEqual(0.05); // a carroceria inteira some: nada de bico cortado pelo plano próximo
    });
  }

  it('o corte viaja num número só junto com os outros bits da instância e volta igual', () => {
    for (const cut of [0, 0.05, 0.83, 1.07, 2.5]) {
      for (const base of [0, 1, 6, 8 | 2 | 1, 5 << 3]) {
        const f = cutFlags(base, cut);
        expect(f & CUT_BIT).toBe(CUT_BIT);
        expect(f & 63).toBe(base & 63);
        expect(readCutFlags(f)).toBeCloseTo(Math.round(cut * 100) / 100, 9);
      }
    }
    expect(readCutFlags(5)).toBeNull(); // sem o bit: nada cortado
    expect(cutFlags(0, 999) >> 7).toBeLessThanOrEqual(255);
  });
});

describe('a régua de visão dos marcos conhece a câmera ativa', () => {
  const n = 1000;
  const k = 500 + n;
  const track = syntheticTrack([{ op: 'straight', length: 6000 }]);
  const nothing: BlockHeight = () => 0;
  const road = sightRoad(track, nothing, 0, () => false);
  const box = { minX: -10, maxX: 10, minZ: -10, maxZ: 10, maxY: 20 };

  it('sem o parâmetro vale a Baixa: o resultado de antes não muda', () => {
    for (const lat of [-60, -150, 150]) {
      expect(sightSeconds(road, k, 0.5, lat, 0, 0, box, false)).toBe(sightSeconds(road, k, 0.5, lat, 0, 0, box, false, -Infinity, 0, 'low'));
    }
  });

  it('a Alta (FOV estreito) enxerga um marco de lado por menos tempo que a Baixa; a lateral abre o corredor', () => {
    const baixa = sightSeconds(road, k, 0.5, -150, 0, 0, box, false, -Infinity, 0, 'low');
    const alta = sightSeconds(road, k, 0.5, -150, 0, 0, box, false, -Infinity, 0, 'high');
    expect(baixa).toBeGreaterThan(0);
    expect(alta).toBeLessThan(baixa);
  });

  it('as quatro câmeras devolvem um número finito e não negativo', () => {
    for (const m of CAMERA_MODES) {
      const s = sightSeconds(road, k, 0.5, -80, 0, 0, box, false, -Infinity, 0, m);
      expect(Number.isFinite(s), m).toBe(true);
      expect(s, m).toBeGreaterThanOrEqual(0);
    }
  });
});

// ───────────────────────────── Entrada e troca em corrida ─────────────────────────────
import { setLanguage, t } from '../src/i18n';
import { cameraName, switchCamera } from '../src/game/camera-switch';
import { createInput } from '../src/ui/input';
import { actionLabel } from '../src/ui/remap/labels';
import '../src/game/strings';

function fakeWindow() {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  const target = {
    addEventListener: (type: string, fn: (e: unknown) => void) => { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
    removeEventListener: (type: string, fn: (e: unknown) => void) => { listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)); },
    navigator: { getGamepads: () => [] },
  };
  const key = (type: 'keydown' | 'keyup', code: string) => {
    const e = { code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: null, preventDefault: () => undefined };
    for (const fn of listeners.get(type) ?? []) fn(e);
  };
  return { target: target as unknown as Window, down: (code: string) => key('keydown', code), up: (code: string) => key('keyup', code) };
}

describe('a tecla de câmera pelo provedor de entrada', () => {
  it('C no teclado 1 é uma borda (um quadro por aperto), V no teclado 2, e nada disto chega ao PlayerInput', () => {
    const w = fakeWindow();
    const input = createInput(w.target);
    input.bindSeat(0, 'kb1');
    input.bindSeat(1, 'kb2');
    w.down('KeyC');
    input.poll();
    expect(input.cameraPressed?.(0)).toBe(true);
    expect(input.cameraPressed?.(1)).toBe(false);
    input.poll(); // segurada: não repete
    expect(input.cameraPressed?.(0)).toBe(false);
    w.up('KeyC');
    w.down('KeyV');
    input.poll();
    expect(input.cameraPressed?.(1)).toBe(true);
    expect(input.cameraPressed?.(0)).toBe(false);
    expect('camera' in input.readSeat(0)).toBe(false);
    expect(input.cameraPressed?.(3)).toBe(false); // assento sem dispositivo
    input.dispose();
  });
});

describe('trocar a câmera em corrida', () => {
  it('cicla Alta → Baixa → Capô → Frente → Alta, só no assento que apertou, e devolve o aviso', () => {
    setLanguage('pt');
    const seatCameras: Array<'high' | 'low' | 'hood' | 'bumper'> = ['high', 'high', 'bumper', 'high'];
    const a = switchCamera(seatCameras, 0);
    expect(a).toEqual({ mode: 'low', text: 'Câmera: Baixa' });
    expect(seatCameras).toEqual(['low', 'high', 'bumper', 'high']);
    expect(switchCamera(seatCameras, 0)?.text).toBe('Câmera: Capô');
    expect(switchCamera(seatCameras, 0)?.text).toBe('Câmera: Frente');
    expect(switchCamera(seatCameras, 0)?.text).toBe('Câmera: Alta');
    expect(switchCamera(seatCameras, 2)?.mode).toBe('high'); // Frente → Alta, no assento 2
    expect(seatCameras).toEqual(['high', 'high', 'high', 'high']);
    expect(switchCamera(seatCameras, 9)).toBeNull(); // assento que não existe
  });

  it('o aviso e o nome da ação existem em PT e EN', () => {
    setLanguage('en');
    expect(cameraName('hood')).toBe('Hood');
    expect(t('session.camera', { name: cameraName('bumper') })).toBe('Camera: Front');
    expect(actionLabel('camera')).toBe('Camera');
    setLanguage('pt');
    expect(cameraName('high')).toBe('Alta');
    expect(actionLabel('camera')).toBe('Câmera');
  });
});
