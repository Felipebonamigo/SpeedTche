// A escolha de quem silenciar na sala online (src/voice/mute.ts, N6): o modelo puro por trás do seletor "Voz dos outros" da
// lista da sala — andar pelos jogadores de OUTROS computadores e silenciar/ouvir o escolhido. Persistência: prefs.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../src/i18n';
import { writeJson } from '../src/game/storage';
import { createMuteModel } from '../src/voice/mute';
import { isMuted, MUTED_KEY } from '../src/voice/prefs';

let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } });
  writeJson(MUTED_KEY, []);
  store.clear();
  setLanguage('pt');
});

describe('modelo do seletor de silenciar', () => {
  it('sem ninguém de outro computador, o valor é um traço e nada se silencia', () => {
    const m = createMuteModel(() => []);
    expect(m.value()).toBe('—');
    expect(m.toggle()).toBeNull();
    m.step(1);
    expect(m.value()).toBe('—');
  });

  it('anda pelos jogadores (com volta) e mostra quem está ouvindo ou silenciado', () => {
    const names = ['Bia', 'Caio', 'Dedé'];
    const m = createMuteModel(() => names);
    expect(m.value()).toBe('Bia: ouvindo');
    m.step(1);
    expect(m.value()).toBe('Caio: ouvindo');
    m.step(1); m.step(1);
    expect(m.value()).toBe('Bia: ouvindo'); // deu a volta
    m.step(-1);
    expect(m.value()).toBe('Dedé: ouvindo');
  });

  it('alternar silencia o escolhido e persiste; de novo, volta a ouvir', () => {
    const m = createMuteModel(() => ['Bia', 'Caio']);
    expect(m.toggle()).toEqual({ name: 'Bia', muted: true });
    expect(isMuted('Bia')).toBe(true);
    expect(isMuted('Caio')).toBe(false);
    expect(m.value()).toBe('Bia: silenciado');
    expect(JSON.parse(store.get(MUTED_KEY) ?? 'null')).toEqual(['bia']);
    expect(m.toggle()).toEqual({ name: 'Bia', muted: false });
    expect(isMuted('Bia')).toBe(false);
    expect(m.value()).toBe('Bia: ouvindo');
  });

  it('a lista de jogadores muda (alguém entra ou sai): o índice se ajusta e não estoura', () => {
    let names = ['Bia', 'Caio', 'Dedé'];
    const m = createMuteModel(() => names);
    m.step(1); m.step(1);
    expect(m.value()).toBe('Dedé: ouvindo');
    names = ['Bia'];
    expect(m.value()).toBe('Bia: ouvindo');
    names = [];
    expect(m.value()).toBe('—');
    names = ['Eva', 'Fê'];
    expect(m.value()).toBe('Eva: ouvindo');
  });

  it('o texto acompanha o idioma', () => {
    const m = createMuteModel(() => ['Bia']);
    m.toggle();
    setLanguage('en');
    expect(m.value()).toBe('Bia: muted');
    expect(m.label()).toBe('Others’ voice');
    setLanguage('pt');
    expect(m.label()).toBe('Voz dos outros');
  });
});
