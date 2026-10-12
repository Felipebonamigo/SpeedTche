// O relógio do pós-corrida (onda N, N4; docs/ondas/N/N4.md): chegada → pódio → pagamento → a decisão de "próxima". Puro, sem DOM:
// as telas (results.ts, payout.ts) só leem em que passo a sequência está e há quanto tempo, e o teste de Node prova o orçamento.
//
// Regras: avança sozinho; no máximo POST_RACE_BUDGET (15 s, contando os 3 s da bandeirada que a sessão já dá antes do resultado) até a
// decisão; segurar o botão pula tudo; e **a próxima corrida nunca larga sozinha** (terminado o último passo a sequência fica `ready` e
// espera uma entrada). Só corrida de verdade (rápida, copa, carreira) tem
// sequência; contra-relógio e modos de festa ficam como eram (pronto na hora).
import type { RaceMode } from './contracts';

export type PostStepId = 'arrival' | 'podium' | 'payout';

/** Quanto cada passo dura, em segundos. */
export const POST_STEP_SECONDS: Readonly<Record<PostStepId, number>> = { arrival: 2, podium: 3.5, payout: 6.5 };

/**
 * A bandeirada: o tempo que a sessão deixa a corrida na tela depois de o último humano cruzar a linha, antes do resultado
 * (`RESULTS_DELAY` em session.ts; tests/post-race.test.ts confere que os dois valores andam juntos). É a "chegada" do orçamento.
 */
export const POST_FLAG_SECONDS = 3;

/** Da bandeirada à decisão de "próxima": o teto de quem espera sem apertar nada (a bandeirada mais o pior plano, 12 s, dá 15 s). */
export const POST_RACE_BUDGET = 15;

/**
 * Um quadro não conta mais que isto: a aba que volta do segundo plano (o `requestAnimationFrame` parou) manda um `dt` de dezenas de
 * segundos, e a sequência não pode pular passos por causa disso. Acima de 4 quadros/s a sequência anda em tempo real.
 */
export const POST_FRAME_MAX = 0.25;

/** Segurar o botão por este tempo, seguido, pula a sequência inteira. */
export const HOLD_SKIP_SECONDS = 0.45;

const ORDER: readonly PostStepId[] = ['arrival', 'podium', 'payout'];

/** Os modos em que o fim da corrida tem sequência. */
const SEQUENCED: ReadonlySet<RaceMode> = new Set<RaceMode>(['quick', 'cup', 'career']);

export interface PostRacePlanOptions {
  mode: RaceMode;
  /** Há pódio 3D (fora do Retrô). */
  podium: boolean;
  /** Há relatório de pagamento (carreira com a corrida já somada). */
  payout: boolean;
}

/** Os passos desta corrida, na ordem. Vazio = nada a mostrar, pronto na hora. */
export function planPostRace(o: PostRacePlanOptions): PostStepId[] {
  if (!SEQUENCED.has(o.mode)) return [];
  const steps: PostStepId[] = ['arrival'];
  if (o.podium) steps.push('podium');
  if (o.payout && o.mode === 'career') steps.push('payout');
  return steps;
}

/** A duração do plano inteiro, em segundos. */
export function planSeconds(plan: readonly PostStepId[]): number {
  return plan.reduce((sum, s) => sum + POST_STEP_SECONDS[s], 0);
}

export interface PostRace {
  readonly plan: readonly PostStepId[];
  /** O passo em andamento; `null` quando a sequência terminou (ou o plano é vazio). */
  readonly step: PostStepId | null;
  /** Índice do passo em andamento no plano (`plan.length` quando pronta). */
  readonly stepIndex: number;
  /** Segundos dentro do passo atual. */
  readonly stepTime: number;
  /** Segundos desde o começo da sequência. */
  readonly elapsed: number;
  /** Terminou (sozinha ou pulada): as entradas valem e a decisão de "próxima" está à mão. */
  readonly ready: boolean;
  /** Foi pulada em vez de esperada. */
  readonly skipped: boolean;
  advance(dt: number): void;
  /** Vai ao fim de uma vez. */
  skip(): void;
  /** Salta para o começo de `id`, se a sequência ainda não chegou nele (nunca volta atrás). */
  enterStep(id: PostStepId): void;
}

export function createPostRace(plan: readonly PostStepId[]): PostRace {
  const steps = ORDER.filter((s) => plan.includes(s));
  const state = { index: 0, stepTime: 0, elapsed: 0, skipped: false };

  const post: PostRace = {
    plan: steps,
    get step() { return state.index < steps.length ? steps[state.index] : null; },
    get stepIndex() { return state.index; },
    get stepTime() { return state.stepTime; },
    get elapsed() { return state.elapsed; },
    get ready() { return state.index >= steps.length; },
    get skipped() { return state.skipped; },
    advance(dt) {
      if (post.ready || !(dt > 0)) return;
      let left = Math.min(dt, POST_FRAME_MAX);
      state.elapsed += left;
      while (left > 0 && state.index < steps.length) {
        const room = POST_STEP_SECONDS[steps[state.index]] - state.stepTime;
        if (left < room) { state.stepTime += left; return; }
        left -= room;
        state.index++;
        state.stepTime = 0;
      }
    },
    skip() {
      if (post.ready) return;
      state.index = steps.length;
      state.stepTime = 0;
      state.skipped = true;
    },
    enterStep(id) {
      const target = steps.indexOf(id);
      if (target < 0 || target <= state.index || post.ready) return;
      let elapsed = 0;
      for (let i = 0; i < target; i++) elapsed += POST_STEP_SECONDS[steps[i]];
      state.index = target;
      state.stepTime = 0;
      state.elapsed = Math.max(state.elapsed, elapsed);
    },
  };
  return post;
}

/**
 * Confirmar (Enter, A) com a sequência andando é engolido: quem martela o botão na linha de chegada não larga a próxima corrida por
 * acidente. O clique do mouse é deliberado e não passa por aqui. Devolve se o confirmar vale.
 */
export function guardConfirm(post: PostRace): boolean {
  return post.ready;
}

export interface HoldSkip {
  /** Um quadro: `held` é se o botão está apertado agora. Devolve `true` uma única vez, ao completar o tempo segurado. */
  observe(dt: number, held: boolean): boolean;
}

/**
 * Detector de "segurar para pular". O botão só conta depois de ter sido visto **solto** (o A de acelerar ainda preso na chegada
 * pularia a sequência no primeiro quadro), e soltar no meio zera o tempo.
 */
export function createHoldSkip(seconds: number = HOLD_SKIP_SECONDS): HoldSkip {
  let armed = false;
  let heldFor = 0;
  let fired = false;
  return {
    observe(dt, held) {
      if (!held) { armed = true; heldFor = 0; fired = false; return false; }
      if (!armed || fired) return false;
      heldFor += dt;
      if (heldFor + 1e-9 < seconds) return false;
      fired = true;
      return true;
    },
  };
}

const sequences = new WeakMap<object, PostRace>();

/**
 * A sequência de uma corrida, guardada pelo objeto de dados do resultado: o resultado, o Pagamento (que o resultado abre) e a volta
 * dele (VOLTAR, troca de idioma) enxergam o MESMO relógio, em vez de recomeçar a sequência a cada vez que a tela é remontada.
 */
export function sequenceFor(key: object, plan: () => PostStepId[]): PostRace {
  let post = sequences.get(key);
  if (!post) {
    post = createPostRace(plan());
    sequences.set(key, post);
  }
  return post;
}
