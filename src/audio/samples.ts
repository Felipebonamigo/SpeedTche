// Amostras de áudio CC0 (onda L, L5): os efeitos principais (impacto, vidro, metal arrastando, interface) tocam uma
// gravação decodificada por `decodeAudioData`; a SÍNTESE de sfx.ts continua sendo a reserva. Amostra que ainda não
// carregou, que o navegador não decodificou ou que não existe devolve `false` do `play`, e quem chamou toca a síntese de
// sempre — nunca fica mudo nem lança. Os arquivos moram em src/assets/audio/ (licença por arquivo em docs/ARTE.md) e
// entram como data URL (o Electron carrega a página por file://, onde fetch de arquivo é bloqueado: mesmo caminho dos .glb).

/** Uma amostra por papel; o arquivo de cada uma está em `SAMPLE_FILES`. */
export type SampleId = 'collisionMed' | 'collisionHeavy' | 'crashSoft' | 'crashGlass' | 'scrape' | 'uiMove' | 'uiConfirm' | 'uiBack';

export const SAMPLE_FILES: Readonly<Record<SampleId, string>> = {
  collisionMed: 'impactPlate_medium_000.ogg',
  collisionHeavy: 'impactPlate_heavy_000.ogg',
  crashSoft: 'impactPunch_heavy_000.ogg',
  crashGlass: 'impactGlass_heavy_000.ogg',
  scrape: 'impactMetal_light_000.ogg',
  uiMove: 'tick_001.ogg',
  uiConfirm: 'confirmation_001.ogg',
  uiBack: 'back_001.ogg',
};

export const SAMPLE_IDS = Object.keys(SAMPLE_FILES) as SampleId[];

/** Bytes de uma data URL em base64; `null` se não for uma (ou se o base64 estiver quebrado). */
export function dataUrlToBytes(url: string): ArrayBuffer | null {
  const m = /^data:[^;,]*(?:;[^;,]*)*;base64,([A-Za-z0-9+/=\s]*)$/.exec(url);
  if (!m) return null;
  try {
    const bin = atob(m[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  } catch {
    return null;
  }
}

export interface PlayOpts {
  /** Instante do contexto (`ctx.currentTime` por padrão). */
  at?: number;
  /** Ganho da amostra (1 = como gravada). */
  gain: number;
  /** Velocidade de reprodução (varia o tom: 1 = original). */
  rate?: number;
  /** Destino diferente do padrão do banco (a interface vai por fora do abafamento da pausa). */
  dest?: AudioNode;
}

export interface SampleBank {
  /** Resolve quando todas as amostras terminaram de carregar (com sucesso ou não); nunca rejeita. */
  readonly loaded: Promise<void>;
  ready(id: SampleId): boolean;
  /** Toca a amostra; `false` se ela não está pronta (o chamador cai na síntese). */
  play(id: SampleId, opts: PlayOpts): boolean;
}

/** `load` devolve a data URL do arquivo da amostra (sample-assets.ts); em teste, qualquer coisa. */
export function createSampleBank(ctx: AudioContext, dest: AudioNode, load: (id: SampleId) => Promise<string>, ids: readonly SampleId[] = SAMPLE_IDS): SampleBank {
  const buffers = new Map<SampleId, AudioBuffer>();
  const loadOne = async (id: SampleId): Promise<void> => {
    try {
      if (typeof ctx.decodeAudioData !== 'function') return;
      const bytes = dataUrlToBytes(await load(id));
      if (!bytes) return;
      buffers.set(id, await ctx.decodeAudioData(bytes));
    } catch {
      // arquivo ausente ou formato que este navegador não decodifica: a síntese cobre
    }
  };
  const loaded = Promise.all(ids.map(loadOne)).then(() => undefined);
  return {
    loaded,
    ready: (id) => buffers.has(id),
    play(id, opts) {
      const buffer = buffers.get(id);
      if (!buffer) return false;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      if (opts.rate !== undefined) src.playbackRate.value = opts.rate;
      const g = ctx.createGain();
      g.gain.value = opts.gain;
      src.connect(g);
      g.connect(opts.dest ?? dest);
      src.start(opts.at ?? ctx.currentTime);
      return true;
    },
  };
}
