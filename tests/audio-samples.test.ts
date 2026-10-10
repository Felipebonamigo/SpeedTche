// Amostras de áudio CC0 por decodeAudioData (src/audio/samples.ts, onda L, L5). A síntese continua sendo a reserva: amostra
// que ainda não carregou, que não decodificou ou que não existe devolve `false` e o chamador toca a síntese de sempre.
// Aqui: o banco com um AudioContext falso, e o inventário dos arquivos embutidos (licença por arquivo em docs/ARTE.md).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSfx } from '../src/audio/sfx';
import { createSampleBank, dataUrlToBytes, SAMPLE_FILES, SAMPLE_IDS, type PlayOpts, type SampleBank, type SampleId } from '../src/audio/samples';
import { loadSampleUrl } from '../src/audio/sample-assets';

const AUDIO_DIR = join(__dirname, '..', 'src', 'assets', 'audio');

/** AudioContext falso: só o que o banco usa. */
function fakeCtx(decode: (bytes: ArrayBuffer) => Promise<unknown> = async () => ({ duration: 0.2 })) {
  const sources: Array<{ buffer: unknown; started: number | null; connected: unknown[]; playbackRate: { value: number } }> = [];
  const gains: Array<{ gain: { value: number }; connected: unknown[] }> = [];
  const ctx = {
    currentTime: 1,
    decodeAudioData: vi.fn(decode),
    createBufferSource() {
      const s = { buffer: null as unknown, started: null as number | null, connected: [] as unknown[], playbackRate: { value: 1 }, connect(n: unknown) { s.connected.push(n); return n; }, start(at: number) { s.started = at; } };
      sources.push(s);
      return s;
    },
    createGain() {
      const g = { gain: { value: 1 }, connected: [] as unknown[], connect(n: unknown) { g.connected.push(n); return n; } };
      gains.push(g);
      return g;
    },
  };
  return { ctx: ctx as unknown as AudioContext, raw: ctx, sources, gains };
}

const URL_OK = 'data:audio/ogg;base64,T2dnUw=='; // "OggS"
const loadOk = async () => URL_OK;

describe('dataUrlToBytes', () => {
  it('decodifica o base64 de uma data URL e recusa o que não é uma', () => {
    expect(new TextDecoder().decode(dataUrlToBytes(URL_OK) as ArrayBuffer)).toBe('OggS');
    expect(dataUrlToBytes('https://exemplo.com/x.ogg')).toBeNull();
    expect(dataUrlToBytes('data:audio/ogg;base64,@@@')).toBeNull();
  });
});

describe('banco de amostras', () => {
  it('decodifica cada amostra uma vez, e só depois de decodificada ela toca', async () => {
    const f = fakeCtx();
    const dest = {} as AudioNode;
    const bank = createSampleBank(f.ctx, dest, loadOk, ['collisionMed', 'uiMove']);
    expect(bank.ready('collisionMed')).toBe(false);
    expect(bank.play('collisionMed', { at: 2, gain: 0.5 })).toBe(false); // ainda carregando: cai na síntese
    expect(f.sources).toHaveLength(0);
    await bank.loaded;
    expect(f.raw.decodeAudioData).toHaveBeenCalledTimes(2);
    expect(bank.ready('collisionMed')).toBe(true);
    expect(bank.play('collisionMed', { at: 2, gain: 0.5, rate: 1.2 })).toBe(true);
    expect(f.sources).toHaveLength(1);
    expect(f.sources[0].started).toBe(2);
    expect(f.sources[0].playbackRate.value).toBe(1.2);
    expect(f.gains[0].gain.value).toBe(0.5);
    expect(f.gains[0].connected).toEqual([dest]);
  });

  it('o destino pode ser trocado por chamada (a interface soa limpa, fora do abafamento da pausa)', async () => {
    const f = fakeCtx();
    const sfx = {} as AudioNode; const ui = {} as AudioNode;
    const bank = createSampleBank(f.ctx, sfx, loadOk, ['uiMove']);
    await bank.loaded;
    bank.play('uiMove', { gain: 1, dest: ui });
    expect(f.gains[0].connected).toEqual([ui]);
  });

  it('falha ao decodificar (ou ao carregar) deixa a amostra "não pronta", sem lançar nem travar o resto', async () => {
    const f = fakeCtx(async (b) => { if (b.byteLength === 4) throw new Error('EncodingError'); return { duration: 1 }; });
    let n = 0;
    const loader = async (id: SampleId) => { if (id === 'collisionHeavy') throw new Error('sem arquivo'); n++; return URL_OK; };
    const bank = createSampleBank(f.ctx, {} as AudioNode, loader, ['collisionMed', 'collisionHeavy', 'uiBack']);
    await expect(bank.loaded).resolves.toBeUndefined();
    expect(n).toBe(2);
    expect(bank.ready('collisionMed')).toBe(false); // decodeAudioData recusou
    expect(bank.ready('collisionHeavy')).toBe(false); // o arquivo não veio
    expect(bank.play('collisionMed', { gain: 1 })).toBe(false);
    expect(bank.play('collisionHeavy', { gain: 1 })).toBe(false);
  });

  it('sem decodeAudioData no contexto (ambiente sem WebAudio completo) o banco fica mudo e seguro', async () => {
    const f = fakeCtx();
    (f.raw as { decodeAudioData?: unknown }).decodeAudioData = undefined;
    const bank = createSampleBank(f.ctx, {} as AudioNode, loadOk, ['uiMove']);
    await bank.loaded;
    expect(bank.play('uiMove', { gain: 1 })).toBe(false);
  });
});

describe('inventário das amostras embutidas', () => {
  it('cada amostra do jogo tem arquivo, é um Ogg pequeno e vem pelo carregador embutido', async () => {
    expect(SAMPLE_IDS.length).toBeGreaterThanOrEqual(6);
    for (const id of SAMPLE_IDS) {
      const file = SAMPLE_FILES[id];
      const bytes = readFileSync(join(AUDIO_DIR, file));
      expect(bytes.subarray(0, 4).toString('latin1'), file).toBe('OggS');
      expect(bytes.length, file).toBeLessThan(80 * 1024);
      const url = await loadSampleUrl(id);
      expect(url.startsWith('data:'), id).toBe(true);
      expect(dataUrlToBytes(url)?.byteLength, id).toBe(bytes.length);
    }
  });

  it('todo arquivo de áudio embutido tem a licença registrada em docs/ARTE.md, e a licença CC0 vai junto', () => {
    const doc = readFileSync(join(__dirname, '..', 'docs', 'ARTE.md'), 'utf8');
    const files = readdirSync(AUDIO_DIR).filter((n) => /\.(ogg|wav|mp3)$/i.test(n));
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const f of files) {
      expect(doc, f).toContain(f);
      expect(statSync(join(AUDIO_DIR, f)).size, f).toBeLessThan(80 * 1024);
    }
    for (const lic of ['LICENSE-Kenney-ImpactSounds-CC0.txt', 'LICENSE-Kenney-InterfaceSounds-CC0.txt']) expect(readFileSync(join(AUDIO_DIR, lic), 'utf8')).toContain('Creative Commons Zero, CC0');
    expect(doc).toContain('kenney.nl');
    expect(doc).toContain('CC0');
    // o que NÃO veio em amostra (pneu, zum, torcida) fica registrado como pendência, não esquecido
    expect(doc).toMatch(/pneu/i);
    expect(doc).toMatch(/torcida/i);
  });
});

// ───────────────────────────── Os efeitos: amostra quando pronta, síntese quando não ─────────────────────────────

/** AudioContext que aceita qualquer chamada (a síntese real encadeia nós) e conta osciladores e fontes de buffer. */
function countingCtx() {
  const counts = { oscillators: 0, buffers: 0 };
  const deep = (): unknown => new Proxy(function () { /* nó falso */ }, { get: (_t, k) => (k === 'currentTime' ? 0 : k === 'sampleRate' ? 44100 : deep()), apply: () => deep(), set: () => true });
  const ctx = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'currentTime') return 0;
      if (k === 'sampleRate') return 44100;
      if (k === 'createOscillator') return () => { counts.oscillators++; return deep(); };
      if (k === 'createBufferSource') return () => { counts.buffers++; return deep(); };
      return () => deep();
    },
  }) as unknown as AudioContext;
  return { ctx, counts };
}

/** Banco falso que registra o que pediram e responde `ready` a todos (ou a nenhum). */
function fakeBank(ready: boolean) {
  const plays: Array<{ id: SampleId; opts: PlayOpts }> = [];
  const bank: SampleBank = { loaded: Promise.resolve(), ready: () => ready, play(id, opts) { plays.push({ id, opts }); return ready; } };
  return { bank, plays };
}

describe('sfx.ts com amostras', () => {
  const dest = {} as AudioNode; const ui = {} as AudioNode;
  const collision = (strength: number) => ({ type: 'collision', carId: 0, otherId: 1, strength }) as const;

  it('batida forte usa a amostra pesada, a fraca a média, e com a amostra pronta não há oscilador de reserva', () => {
    const { ctx, counts } = countingCtx(); const { bank, plays } = fakeBank(true);
    const sfx = createSfx(ctx, dest, ui, bank);
    sfx.play(collision(0.9), 0);
    sfx.play(collision(0.3), 0);
    expect(plays.map((p) => p.id)).toEqual(['collisionHeavy', 'collisionMed']);
    expect(plays[0].opts.gain).toBeGreaterThan(plays[1].opts.gain);
    expect(counts.oscillators).toBe(0);
  });

  it('sem a amostra pronta a batida cai na síntese de sempre', () => {
    const { ctx, counts } = countingCtx(); const { bank } = fakeBank(false);
    createSfx(ctx, dest, ui, bank).play(collision(0.9), 0);
    expect(counts.oscillators).toBeGreaterThan(0);
  });

  it('batida no cenário: vidro para prédio e poste, a pancada macia para árvore', () => {
    const { ctx } = countingCtx(); const { bank, plays } = fakeBank(true);
    const sfx = createSfx(ctx, dest, ui, bank);
    sfx.play({ type: 'crash', carId: 0, sprite: 'building' }, 0);
    sfx.play({ type: 'crash', carId: 0, sprite: 'tree' }, 0);
    expect(plays.map((p) => p.id)).toEqual(['crashGlass', 'crashSoft']);
  });

  it('a interface vai pelo destino da interface, fora do abafamento da pausa', () => {
    const { ctx } = countingCtx(); const { bank, plays } = fakeBank(true);
    const sfx = createSfx(ctx, dest, ui, bank);
    sfx.ui('move'); sfx.ui('confirm'); sfx.ui('back');
    expect(plays.map((p) => p.id)).toEqual(['uiMove', 'uiConfirm', 'uiBack']);
    for (const p of plays) expect(p.opts.dest).toBe(ui);
  });

  it('raspão: o metal da amostra (mais forte com a velocidade); sem ela, só o ruído sintético', () => {
    const a = countingCtx(); const withSample = fakeBank(true);
    const sfx = createSfx(a.ctx, dest, ui, withSample.bank);
    sfx.scrape(0.2); sfx.scrape(1);
    expect(withSample.plays.map((p) => p.id)).toEqual(['scrape', 'scrape']);
    expect(withSample.plays[1].opts.gain).toBeGreaterThan(withSample.plays[0].opts.gain);
    const b = countingCtx(); const without = fakeBank(false);
    expect(() => createSfx(b.ctx, dest, ui, without.bank).scrape(0.5)).not.toThrow();
    expect(b.counts.buffers).toBeGreaterThan(0); // o ruído de reserva
  });
});
