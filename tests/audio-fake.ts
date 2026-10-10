// AudioContext de mentira que REGISTRA o que o código de áudio cria e agenda (osciladores, ganhos, filtros, fontes de ruído),
// para provar o áudio por parâmetros (frequências, tipos de onda, ganhos, instantes) sem placa de som (docs/ondas/N/N6.md).
export class FakeParam {
  value: number;
  /** Cada agendamento, na ordem: o que o código pediu a este parâmetro. */
  readonly calls: Array<{ kind: string; value: number; at: number }> = [];
  constructor(initial = 0) { this.value = initial; }
  setValueAtTime(v: number, at: number): this { this.value = v; this.calls.push({ kind: 'set', value: v, at }); return this; }
  setTargetAtTime(v: number, at: number): this { this.value = v; this.calls.push({ kind: 'target', value: v, at }); return this; }
  linearRampToValueAtTime(v: number, at: number): this { this.value = v; this.calls.push({ kind: 'linear', value: v, at }); return this; }
  exponentialRampToValueAtTime(v: number, at: number): this { this.value = v; this.calls.push({ kind: 'exp', value: v, at }); return this; }
  cancelScheduledValues(): this { return this; }
}

export class FakeNode {
  readonly connections: unknown[] = [];
  connect(n: unknown): unknown { this.connections.push(n); return n; }
  disconnect(): void { this.connections.length = 0; }
}

export class FakeOsc extends FakeNode {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam(440);
  readonly detune = new FakeParam(0);
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  onended: (() => void) | null = null;
  start(at = 0): void { this.startedAt = at; }
  stop(at = 0): void { this.stoppedAt = at; }
}

export class FakeGain extends FakeNode { readonly gain = new FakeParam(1); }

export class FakeFilter extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
}

export class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  onended: (() => void) | null = null;
  start(at = 0): void { this.startedAt = at; }
  stop(at = 0): void { this.stoppedAt = at; }
}

export interface FakeAudio {
  ctx: AudioContext;
  dest: AudioNode;
  currentTime: number;
  readonly oscillators: FakeOsc[];
  readonly gains: FakeGain[];
  readonly filters: FakeFilter[];
  readonly sources: FakeSource[];
}

export function fakeAudio(): FakeAudio {
  const oscillators: FakeOsc[] = [];
  const gains: FakeGain[] = [];
  const filters: FakeFilter[] = [];
  const sources: FakeSource[] = [];
  const state = {
    currentTime: 0,
    sampleRate: 8000,
    createOscillator() { const o = new FakeOsc(); oscillators.push(o); return o; },
    createGain() { const g = new FakeGain(); gains.push(g); return g; },
    createBiquadFilter() { const f = new FakeFilter(); filters.push(f); return f; },
    createBufferSource() { const s = new FakeSource(); sources.push(s); return s; },
    createBuffer(_channels: number, length: number) { const data = new Float32Array(length); return { getChannelData: () => data, length }; },
  };
  const dest = new FakeNode() as unknown as AudioNode;
  const out: FakeAudio = {
    ctx: state as unknown as AudioContext, dest,
    get currentTime() { return state.currentTime; }, set currentTime(v: number) { state.currentTime = v; },
    oscillators, gains, filters, sources,
  };
  return out;
}
