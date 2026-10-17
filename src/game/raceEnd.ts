// Os dois ganchos da sessão para estatísticas e conquistas, fora de session.ts para rodarem nos
// testes em Node (a sessão precisa de DOM e WebGL): o passo observado de cada tick e o fechamento
// das contas no tick em que a corrida acaba. A sessão só liga os efeitos (Steam, HUD, save).
import { applyRaceResult } from '../core/championship';
import { stepRace } from '../core/sim/race';
import type { ChampionshipState, HumanEntry, PlayerInput, RaceResultRow, RaceState, SimEvent, Track } from '../core/types';
import { achievementMessages, observeTick, unlockAchievements, type AchievementUnlock, type RaceTelemetry } from './achievements';
import type { HudMessage, RaceMode, SaveData } from './contracts';
import { syncConquestCars } from './career-save';
import { reportError } from './errors';
import { settleProgress, type ProgressData, type ProgressNews } from './progression';
import { markCupCompleted, recordRaceResults, rememberLobby, type NewRecord } from './save';
import { settleStars } from './stars';
import { recordRaceStats } from './stats';

/** O que a corrida deixou: recordes novos e conquistas, para o resultado. */
export interface RaceOutcome {
  newRecords: NewRecord[];
  achievements: AchievementUnlock[];
  /** Sigla do estado carimbado no passaporte nesta corrida (copa de estado concluída pela primeira vez), ou null. */
  newStamp?: string | null;
  /** O5: o que a corrida rendeu em nível e maestria a cada humano local (vazio sem progresso). */
  progress?: ProgressNews[];
}

/** A parte da corrida ativa da sessão que o fechamento lê (e marca). */
export interface SettleTarget {
  state: RaceState;
  track: Track;
  mode: RaceMode;
  humans: HumanEntry[];
  telemetry: RaceTelemetry;
  outcome: RaceOutcome | null;
}

export interface SettleEffects {
  /** Conquista desbloqueada (Steam). */
  achievement(id: string): void;
  /** Mensagem no HUD de um assento. */
  hud(seat: number, message: HudMessage): void;
  /** Grava o save. */
  persist(): void;
  /** O5: grava o progresso (a chave própria, progression.ts); chamado uma vez, se houver progresso. */
  persistProgress?(): void;
}

export interface SettleOptions {
  champ: ChampionshipState | null;
  difficulty: string;
  /** Segundos da mensagem de conquista no HUD. */
  hudTtl: number;
  effects: SettleEffects;
  /**
   * Online: só os assentos deste computador entram em recordes, estatísticas e conquistas (os outros
   * humanos são de outros computadores, que contam do lado deles). Ausente/null = jogo local, todos.
   */
  localSeats?: readonly number[] | null;
  /** Copa normal: chamado depois de somar a corrida, para salvar o progresso do "Continuar". */
  afterCup?: (champ: ChampionshipState) => void;
  /** Carreira: paga o prêmio e avança a copa da carreira; devolve o id da copa que acabou de ser concluída, ou null. */
  careerFinished?: (results: RaceResultRow[]) => string | null;
  /** Carreira: a copa como ficou depois de careerFinished (para a conquista do rival). */
  careerChamp?: () => ChampionshipState | null;
  /** O5: a maestria por perfil e carro (progression.ts); ausente = sem progresso (o nível vem das estatísticas e aparece mesmo assim). */
  progress?: ProgressData;
}

/**
 * Um tick como a sessão faz: simula e observa a telemetria ANTES de alguém tratar os eventos,
 * para que o tick que fecha a corrida (chegada, nitro na bandeirada) já esteja contado quando o
 * race_over chamar settleRace. Devolve os eventos do tick.
 */
export function stepObserved(r: Pick<SettleTarget, 'state' | 'track' | 'telemetry'>, inputs: ReadonlyArray<PlayerInput | undefined>): readonly SimEvent[] {
  stepRace(r.state, r.track, inputs);
  observeTick(r.telemetry, r.state, r.track);
  return r.state.events;
}

/**
 * Fecha as contas no tick em que a corrida acaba (evento race_over): recordes, copa, estatísticas,
 * conquistas e save. As estatísticas entram ANTES das conquistas: as cumulativas (MARATONA,
 * DEZ_VITORIAS, GIRO_COMPLETO) leem o save já com esta corrida somada. As conquistas vão já para
 * o HUD de quem as ganhou (mensagem 'good'). Idempotente.
 */
export function settleRace(save: SaveData, r: SettleTarget, o: SettleOptions): RaceOutcome {
  if (r.outcome) return r.outcome;
  // Marcado antes de qualquer efeito: se um passo lançar, a próxima chamada (a sessão chama de novo
  // no quadro seguinte) devolve o que já foi fechado em vez de somar a corrida outra vez, e o
  // resultado aparece. O que já entrou no save é gravado mesmo assim (finally).
  const out: RaceOutcome = { newRecords: [], achievements: [], newStamp: null, progress: [] };
  r.outcome = out;
  const stampsBefore = save.stamps.length;
  let progressTouched = false;
  try {
    const results = r.state.results ?? [];
    const local = o.localSeats ?? null;
    const mine = local ? results.filter((row) => row.seat < 0 || local.includes(row.seat)) : results;
    const localHumans = local ? r.humans.filter((h) => local.includes(h.seat)) : r.humans;
    out.newRecords = recordRaceResults(save, mine, localHumans, r.track.def.id, r.state.config.laps, r.mode);
    if (!local) rememberLobby(save, r.humans);
    const contributions = recordRaceStats(save.stats, { mode: r.mode, state: r.state, results: mine, humans: localHumans, telemetry: r.telemetry });
    // O5: nível (das estatísticas, já com a corrida) e maestria do carro. Antes das conquistas (SUBIU_DE_NIVEL e as de coleção leem o que
    // rendeu); uma falha aqui é registrada e não leva junto o que vem depois (copa, conquistas, estrelas, gravação).
    if (o.progress) {
      progressTouched = true;
      try { out.progress = settleProgress(o.progress, save.stats, { state: r.state, contributions }); } catch (e) { reportError(e); out.progress = []; }
    }
    let cupJustCompleted: string | null = null;
    let cupChamp: ChampionshipState | null = null;
    if (o.champ && r.mode === 'cup') {
      cupChamp = o.champ;
      applyRaceResult(o.champ, results, r.humans);
      if (o.champ.completed) { markCupCompleted(save, o.champ.cupId); cupJustCompleted = o.champ.cupId; }
      o.afterCup?.(o.champ);
    }
    if (r.mode === 'career' && o.careerFinished) {
      cupJustCompleted = o.careerFinished(results);
      if (cupJustCompleted) markCupCompleted(save, cupJustCompleted);
      cupChamp = o.careerChamp?.() ?? null;
    }
    if (save.stamps.length > stampsBefore) out.newStamp = save.stamps[save.stamps.length - 1];
    out.achievements = unlockAchievements(save, r.mode, r.state, mine, r.humans, r.telemetry, r.track.def.timeOfDay === 'night', cupJustCompleted, o.difficulty, cupChamp, out.progress);
    for (const u of out.achievements) {
      save.achievements.push(u.id);
      o.effects.achievement(u.id);
    }
    syncConquestCars(save); // V6c: a conquista de um carro já o põe nas garagens
    for (const [seat, text] of achievementMessages(out.achievements)) o.effects.hud(seat, { text, kind: 'good', ttl: o.hudTtl });
    // O4: estrelas e placar do rival, por perfil. Por último: uma falha aqui não perde nada do que já foi somado acima (o `finally` grava).
    settleStars(save.stars, { mode: r.mode, trackId: r.track.def.id, results: mine, humans: localHumans, telemetry: r.telemetry, rival: r.state.config.rival, champ: cupChamp });
  } finally {
    o.effects.persist();
    if (progressTouched) o.effects.persistProgress?.();
  }
  return out;
}
