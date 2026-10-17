// Tipos compartilhados do núcleo. O estado da corrida é JSON puro (sem Map/Set/classes) para
// que serializar seja `JSON.stringify` e o multiplayer em lockstep possa comparar hashes.
import type { RngState } from './rng';

// ───────────────────────────── Pista ─────────────────────────────

export type SceneryId = 'tropical' | 'desert' | 'city_night' | 'alpine' | 'coast' | 'savanna';
export type TimeOfDay = 'day' | 'dusk' | 'night';

/** Operações do "DSL" de pista. Comprimentos em segmentos. */
export type TrackOp =
  | { op: 'straight'; length: number }
  | { op: 'curve'; length: number; curve: number; hill?: number }
  | { op: 'hill'; length: number; height: number }
  | { op: 's'; length: number; curve: number }
  | { op: 'pit'; length: number }
  /** Curva constante, sem rampa de entrada nem de saída (desenhos em cartum, docs/PISTAS.md). O builder é da K5. */
  | { op: 'bend'; length: number; curve: number; hill?: number };

export interface TrackDef {
  id: string;
  name: string;
  country: string;
  scenery: SceneryId;
  timeOfDay: TimeOfDay;
  laps: number;
  /** 1 (fácil) a 5 (difícil), só informativo para a interface. */
  difficulty: number;
  ops: TrackOp[];
}

export type SpriteKind =
  | 'tree' | 'pine' | 'palm' | 'cactus' | 'bush' | 'boulder' | 'building' | 'tower'
  | 'lamp' | 'billboard' | 'sign_left' | 'sign_right' | 'grandstand' | 'banner_start'
  | 'pit_wall' | 'pit_sign' | 'cone';

export interface SpriteRef {
  kind: SpriteKind;
  /** Deslocamento lateral em meias-larguras de pista: -1 e 1 são as bordas do asfalto. */
  x: number;
  /** Escala relativa (1 = tamanho padrão do sprite). */
  scale: number;
  /** Bater nele derruba a velocidade. */
  solid: boolean;
  /** Variante visual (0..n), para texto de outdoor, cor de prédio etc. */
  variant: number;
}

export interface Segment {
  index: number;
  /** Posição do início do segmento ao longo da pista. */
  z: number;
  /** Curvatura: negativo vira à esquerda, positivo à direita. */
  curve: number;
  /** Elevação no início e no fim do segmento. */
  y0: number;
  y1: number;
  /** Alternância de cor (faixas de zebra). */
  band: 0 | 1;
  /** Este trecho tem box (lateral direita, x ≥ PIT_X). */
  pit: boolean;
  sprites: SpriteRef[];
}

export interface Track {
  def: TrackDef;
  segments: Segment[];
  /** Comprimento total (segments.length * SEGMENT_LENGTH). */
  length: number;
  /** Segmento em que fica a linha de largada/chegada. */
  startIndex: number;
}

// ───────────────────────────── Carros e pilotos ─────────────────────────────

/**
 * Estilo de carroceria: cada um é um modelo 3D próprio em src/render/cars/styles/<estilo>.ts. Todos ocupam a mesma pegada
 * de colisão (~4,4 × 1,9 m; constants.ts), para o que se vê bater com o que a física calcula.
 */
export type CarBody =
  | 'gt' | 'muscle' | 'hatch' | 'sedan' | 'electric' | 'rally' | 'hyper'
  | 'classic' | 'wedge' | 'pickup' | 'prototype' | 'micro' | 'roadster';

export interface CarDef {
  id: string;
  name: string;
  /** Cor base em hex (#rrggbb), usada pelo renderizador procedural. */
  color: string;
  /** Estilo de carroceria (modelo 3D). */
  body: CarBody;
  /** Segunda cor (faixas, aerofólio, detalhes); sem ela o renderizador escolhe uma que combine. */
  accent?: string;
  /** Velocidade máxima em unidades por segundo (REFERENCE_SPEED = 300 km/h). */
  topSpeed: number;
  /** Aceleração em unidades por segundo ao quadrado. */
  accel: number;
  /** Força de frenagem (positiva). */
  brake: number;
  /** 0..1: quanto o carro responde ao volante e resiste à força centrífuga. */
  handling: number;
  /** Combustível gasto por unidade de distância na velocidade máxima (tanque = 1). */
  fuelPerUnit: number;
  /** Texto curto de apresentação. */
  blurb: string;
  /** Carro de CONQUISTA (V6c): não se compra; libera quando o save tem esta conquista. O `price` dele é só nominal (> 0 mantém o carro trancado até lá). */
  conquest?: string;
  /** Preço na carreira; 0 = sempre liberado. Os outros ficam liberados em todo modo depois de comprados. */
  price: number;
}

/** Peças que a carreira melhora, cada uma do nível 0 ao UPGRADE_MAX_LEVEL (docs/CARREIRA.md). */
export type UpgradePart = 'engine' | 'turbo' | 'tires' | 'brakes' | 'tank' | 'nitro';
export type UpgradeLevels = Record<UpgradePart, number>;

/**
 * Atributos de desempenho efetivos de um carro na corrida: o CarDef com as melhorias aplicadas.
 * Calculados em createRace e guardados no estado; física, IA, colisões e co-op leem daqui (carStats).
 */
export interface CarStats {
  topSpeed: number;
  accel: number;
  brake: number;
  handling: number;
  fuelPerUnit: number;
  /**
   * Nível de enchimento da barra de nitro (onda N, N1): 1 de fábrica, +1 por nível da peça de nitro da carreira (1 a 4). Cada nível
   * faz a barra encher +UPGRADE_NITRO_FILL (15%) mais por ganho (`nitroFillMult`, sim/stats.ts). Inteiro de propósito: a garagem
   * desenha um pontinho por unidade.
   */
  nitro: number;
}

export type Difficulty = 'amador' | 'profissional' | 'campeao';

export interface CoopAssists {
  /** Todos os nitros da equipe vão para um cofre comum. */
  sharedNitro: boolean;
  /** Companheiro que passa perto de um parado dá um empurrão. */
  tow: boolean;
  /** Vácuo atrás de companheiro rende mais. */
  teamDraft: boolean;
  /** O último humano da equipe ganha um pouco de velocidade quando fica longe. */
  catchup: boolean;
}

/**
 * Direção assistida de um humano (sim/assist.ts): nenhuma, freio automático antes das curvas
 * fortes, volante que segura o carro no asfalto, ou completa (o jogador só acelera e usa nitro).
 */
export type AssistLevel = 'none' | 'brake' | 'steer' | 'full';

export interface HumanEntry {
  /** Assento local 0..3. */
  seat: number;
  name: string;
  carId: string;
  /** Todos os humanos no mesmo time = cooperativo; times diferentes = versus. */
  teamId: number;
  /** Cor do jogador na interface (hex). */
  color: string;
  /** Melhorias do carro (carreira); ausente = carro de fábrica. */
  upgrades?: UpgradeLevels;
  /** Direção assistida deste jogador; ausente = 'none'. Vai na config, então vale igual em todo cliente online. */
  assist?: AssistLevel;
  /**
   * Visual do carro (pintura, acabamento, roda, faixa, chama; src/game/cosmetics.ts); ausente = o de fábrica. Só aparência: a
   * sessão e o online o tiram (`withoutLook`) antes de montar a RaceConfig — o núcleo nunca o vê e o estado da corrida não o carrega.
   */
  look?: CarLook;
}

/**
 * O pacote de aparência de um carro (onda N, N3), em forma CANÔNICA: chave ausente = padrão. Só dados, sem lógica: o catálogo, o
 * saneador e as cores moram em src/game/cosmetics.ts. Os valores são ids do catálogo (texto), conferidos na fronteira (save e rede).
 */
export interface CarLook {
  /** Id da paleta (src/game/paints.ts); ausente = original (a cor de fábrica do carro). */
  paint?: string;
  /** Cor livre da carroceria ('#rrggbb' minúsculo, já com a saturação mínima). Vence a da pintura. */
  color?: string;
  /** Cor livre do detalhe (faixas, aerofólio, pinças). Vence a da pintura. */
  accent?: string;
  /** 'metalico' | 'perolado' | 'fosco' | 'cromado' | 'camaleao'; ausente = brilho (o de sempre). */
  finish?: string;
  /** Um dos 9 desenhos de roda, da lista do estilo do carro; ausente = a roda do estilo. */
  wheel?: string;
  /** 'prata' | 'grafite' | 'dourado' | 'acento'; ausente = o aro de fábrica da roda. */
  rim?: string;
  /** 'nenhuma' | 'a' | 'b' | 'ab'; ausente = a faixa do modelo. */
  stripe?: string;
  /** Cor da chama do nitro (id do catálogo); ausente = o azul tingido pelo detalhe. */
  flame?: string;
}

export interface RaceConfig {
  trackId: string;
  laps: number;
  humans: HumanEntry[];
  /** Total de carros na pista, humanos incluídos. */
  totalCars: number;
  difficulty: Difficulty;
  manualGear: boolean;
  assists: CoopAssists;
  seed: number;
  /** Semente do elenco da IA (nomes e carros). Fixa por copa, para a classificação fazer sentido. */
  rosterSeed?: number;
  /** Contra-relógio: só humanos, sem combustível. */
  timeTrial?: boolean;
  /** Nível de melhoria dos carros da IA (0..3, pode ser fracionário); a carreira sobe por copa. Ausente = 0. */
  aiLevel?: number;
  /**
   * Nome do rival principal da copa (src/game/rivals.ts). createRace garante que ele está no grid e dá
   * a ele um bônus leve de habilidade. Ausente = corrida sem rival (rápida, contra-relógio, online).
   */
  rival?: string;
  /** Modo de festa com regra no núcleo (src/core/modes.ts, docs/MODOS.md); ausente = corrida normal. Só local. */
  mode?: CoreMode;
  /**
   * Ritmo da IA na carreira, em degraus de dificuldade (careerAiPace em src/core/career.ts, onda K3): negativo = mais
   * lenta que a dificuldade escolhida, positivo = mais rápida. Ausente = 0 (o comportamento de antes); quem lê usa
   * `config.aiPace ?? 0`, como o `aiLevel`. Sem padrão gravado, de propósito: o 0 gravado no deserializeRace quebra os
   * testes de ida e volta (determinism, modes, assist); gravado no createRace, muda as impressões do sim-golden.
   */
  aiPace?: number;
}

/** Escolta (a equipe protege um VIP da IA) ou revezamento (um carro por dupla, troca no box). */
export type CoreMode = 'escort' | 'relay';

// ───────────────────────────── Estado ─────────────────────────────

export interface PlayerInput {
  /** -1 (esquerda) a 1 (direita). */
  steer: number;
  throttle: boolean;
  brake: boolean;
  /** Borda: verdadeiro só no tick em que foi apertado. */
  nitro: boolean;
  gearUp: boolean;
  gearDown: boolean;
  /**
   * Derrapar: o botão SEGURADO (nível, não borda). Opcional de propósito, como `takeover`: ausente vale falso, e quem monta
   * um PlayerInput sem saber da derrapagem continua válido. Vai na rede no bit 32 (src/net/protocol.ts).
   */
  drift?: boolean;
  /**
   * Buzina (N6): o botão SEGURADO (nível). Opcional, como `drift`. É só som e balão: o núcleo NUNCA lê este campo nem `taunt`
   * (o `hashRace` e o `sim-golden` de quem buzina são os de quem não buzina); a sessão os vê em `stepOnce`, no mesmo tick em todas
   * as máquinas. Vai na rede no bit 64 (src/net/protocol.ts).
   */
  horn?: boolean;
  /**
   * Frase de provocação (N6): o índice 0..7 da frase pronta escolhida na roda, presente SÓ no tick em que foi escolhida (borda).
   * Vai na rede nos bits 8–11 como índice + 1. Ver `horn`: o núcleo não a lê.
   */
  taunt?: number;
  /**
   * Comando, não tecla: a IA assume este carro a partir deste tick (online, quando o jogador não
   * volta — src/net/lockstep.ts). Vem no fluxo de entradas para a tomada passar pelo stepRace.
   */
  takeover?: boolean;
}

export const NEUTRAL_INPUT: Readonly<PlayerInput> = Object.freeze({
  steer: 0, throttle: false, brake: false, nitro: false, gearUp: false, gearDown: false,
});

/**
 * Personalidade de um piloto da IA (data/drivers.ts; comportamento em sim/ai.ts e sim/personality.ts):
 * limpo, agressivo, bloqueador (fecha a porta de um humano logo atrás) e errático (às vezes erra a frenagem).
 */
export type Personality = 'clean' | 'aggressive' | 'blocker' | 'erratic';

export interface AiBrain {
  /** 0..1, multiplica a velocidade-alvo. */
  skill: number;
  /** Faixa preferida (-0.7..0.7). */
  laneX: number;
  /** Tick em que pode mudar de faixa de novo. */
  laneUntil: number;
  /** Quantos ticks de pista à frente ele olha para frear em curva. */
  lookahead: number;
  aggression: number;
  /**
   * Combustível e progresso onde começou a volta em que a IA mede o próprio consumo (largada, saída
   * do box ou fim da volta medida anterior). Opcionais de propósito: ausente = ainda não mediu, e
   * sim/fuel.ts preenche na primeira decisão — vale para estado antigo e para cérebro criado no meio
   * da corrida (sem valor padrão em deserializeRace).
   */
  fuelMark?: number;
  progressMark?: number;
  /** Gasto por unidade de pista na última volta inteira medida (sim/fuel.ts). */
  lapBurn?: number;
  /**
   * Personalidade fixa do piloto. Ausente = piloto neutro (o comportamento de antes das personalidades):
   * piloto automático do humano, IA que assume um assento no online e estado antigo — por isso sem valor
   * padrão em deserializeRace.
   */
  personality?: Personality;
  /** Bloqueador: ticks seguidos fechando a porta nesta investida, e até que tick descansa (sim/personality.ts). */
  blockTicks?: number;
  blockRestUntil?: number;
}

export interface CarState {
  id: number;
  /** Assento do humano (0..3) ou -1 para a IA. */
  seat: number;
  name: string;
  teamId: number;
  carId: string;
  /** Posição ao longo da pista, 0 ≤ z < track.length. */
  z: number;
  /** Lateral normalizado (-1..1 asfalto). */
  x: number;
  speed: number;
  gear: number;
  fuel: number;
  /**
   * A barra de nitro (onda N, N1; docs/ondas/N/N1.md), em unidades inteiras: NITRO_CHARGE_COST (1000) é uma carga, NITRO_METER_MAX o teto.
   * Larga com NITRO_START_METER (1 carga) e enche com o mini-turbo, o estilingue do vácuo, o raspão, a ultrapassagem limpa e a largada
   * perfeita. Substitui o `nitroLeft` (cargas). Com `assists.sharedNitro` o humano gasta e ganha na barra da equipe (`teamNitro`).
   */
  nitroMeter: number;
  /**
   * Acelerador apertado, em ticks seguidos, enquanto a largada ainda não foi decidida (zera ao soltar e quando ela é decidida):
   * a janela da largada-foguete e o dado do motor subindo na contagem (N6).
   */
  throttleHeld: number;
  /** A largada-foguete: LAUNCH_PENDING (0), LAUNCH_PERFECT (1: arranque de nitro e a barra enche) ou LAUNCH_NONE (2). Decide uma vez por corrida. */
  launch: number;
  /** Ticks seguidos no vácuo. Negativo = resfriamento do estilingue (sobe 1 por tick até 0, no vácuo ou fora dele). */
  draftTicks: number;
  /** Ticks até poder ganhar nitro de novo por raspão ou ultrapassagem (anti-farm; um só para os dois). */
  gainLock: number;
  nitroTicks: number;
  /** Volta atual (1 = primeira). */
  lap: number;
  /** Ticks das voltas completadas. */
  lapTicks: number[];
  lapStartTick: number;
  finished: boolean;
  finishTick: number;
  /** Posição na corrida (1 = líder), atualizada a cada tick. */
  position: number;
  /** Progresso total = (lap - 1) * length + z, para ordenar. */
  progress: number;
  inPit: boolean;
  collisionCooldown: number;
  towCooldown: number;
  /** Ticks restantes do "empurrão"/derrapagem para efeitos visuais. */
  skidTicks: number;
  /** Última direção do volante (-1, 0, 1) para a pose do sprite. */
  steerPose: number;
  /**
   * Derrapagem (onda M, M1; docs/ondas/M/M1.md): o lado da derrapagem (-1, 0 ou 1; 0 = não derrapa), fixo da entrada à saída.
   * Os 4 campos entram no hashRace e têm padrão 0 no deserializeRace: sem isso a checagem de dessincronia não os vê.
   */
  driftDir: number;
  /** Ticks desde a entrada na derrapagem (conta o tick da entrada); 0 fora dela. */
  driftTicks: number;
  /** Ticks de carga: só sobe com o carro numa curva forte para o lado da derrapagem; o nível (0..3) é driftLevel(). */
  driftCharge: number;
  /** Ticks restantes do impulso de saída da derrapagem (0 = sem impulso). Menor que o nitro em tudo. */
  driftBoostTicks: number;
  ai: AiBrain | null;
  /** Atributos efetivos (carro + melhorias), fixos durante a corrida. Ler por carStats(car). */
  stats: CarStats;
}

export type RacePhase = 'countdown' | 'racing' | 'finished';

/** De onde veio um ganho da barra de nitro. */
export type NitroSource = 'drift' | 'sling' | 'scrape' | 'overtake' | 'launch';

export type SimEvent =
  | { type: 'countdown'; value: number }
  | { type: 'go' }
  | { type: 'lap'; carId: number; lap: number; lapTicks: number; best: boolean }
  | { type: 'finish'; carId: number; position: number }
  | { type: 'nitro'; carId: number }
  | { type: 'nitro_denied'; carId: number }
  | { type: 'collision'; carId: number; otherId: number; strength: number }
  | { type: 'crash'; carId: number; sprite: SpriteKind }
  | { type: 'offroad'; carId: number; entering: boolean }
  | { type: 'tow'; carId: number; byId: number }
  | { type: 'pit_enter'; carId: number }
  | { type: 'pit_exit'; carId: number }
  | { type: 'fuel_low'; carId: number }
  | { type: 'fuel_empty'; carId: number }
  | { type: 'gear'; carId: number; gear: number }
  /** Derrapagem: a carga subiu para o nível `level` (1 azul, 2 laranja, 3 roxa). */
  | { type: 'drift_charge'; carId: number; level: number }
  /** Derrapagem: soltou o botão com carga; o impulso de saída do nível `level` começou. */
  | { type: 'drift_boost'; carId: number; level: number }
  /** A barra de nitro encheu `amount` (o que realmente entrou, já com a peça e o teto) por `source`. */
  | { type: 'nitro_gain'; carId: number; source: NitroSource; amount: number }
  /** O carro `carId` passou o carro `otherId` (calculado no núcleo, positions.ts). `clean`: sem batida recente e andando. */
  | { type: 'overtake'; carId: number; otherId: number; clean: boolean }
  /** Largada-foguete perfeita (só ela emite): o arranque de nitro começou. */
  | { type: 'launch'; carId: number }
  /** Revezamento (src/core/modes.ts): a volta fechou e a troca está liberada no box. */
  | { type: 'relay_due'; carId: number }
  /** Revezamento: o controle do carro passou de um assento para o outro, no box. */
  | { type: 'relay_swap'; carId: number; fromSeat: number; toSeat: number }
  /** Revezamento: o carro passou pelo box sem entrar; quem dirige segue mais uma volta. */
  | { type: 'relay_missed'; carId: number }
  | { type: 'race_over' };

export interface RaceResultRow {
  carId: number;
  seat: number;
  name: string;
  teamId: number;
  carDefId: string;
  position: number;
  finished: boolean;
  totalTicks: number;
  bestLapTicks: number;
  points: number;
}

export interface RaceState {
  tick: number;
  phase: RacePhase;
  config: RaceConfig;
  trackId: string;
  trackLength: number;
  cars: CarState[];
  rng: RngState;
  /** A barra de nitro da equipe, em unidades (só usada com assists.sharedNitro): 1 carga por humano do time na largada, teto NITRO_METER_MAX por humano. */
  teamNitro: Record<number, number>;
  /** Tick em que a corrida começou de fato (fim da contagem). */
  startTick: number;
  /** Tick em que o primeiro humano terminou (-1 se nenhum). */
  firstHumanFinishTick: number;
  /** Eventos gerados no último tick (limpos a cada passo). */
  events: SimEvent[];
  results: RaceResultRow[] | null;
  /** Estado dos modos de festa com regra no núcleo (src/core/modes.ts); ausente = corrida normal. */
  party?: PartyState;
}

/** Revezamento: um carro de dupla e de quem é a vez. */
export interface RelayCar {
  carId: number;
  /** Os assentos da dupla, na ordem em que revezam (o primeiro larga). */
  seats: number[];
  /** Índice em `seats` de quem dirige agora (é o `seat` do carro). */
  active: number;
  /** A volta fechou e a troca espera o box. */
  due: boolean;
  /** Com a troca pendente, o carro já chegou ao trecho do box (sair dele sem entrar perde a troca). */
  sawPit: boolean;
  swaps: number;
}

export interface PartyState {
  /** Escolta: id do carro VIP (-1 fora da escolta). */
  vipId: number;
  /** Escolta: id de quem empurra o VIP agora (-1 = ninguém); o evento sai só quando o empurrão começa. */
  pushBy: number;
  /** Revezamento: um por carro de dupla (vazio fora do revezamento). */
  relay: RelayCar[];
}

// ───────────────────────────── Campeonato ─────────────────────────────

export interface CupDef {
  id: string;
  name: string;
  country: string;
  flag: string;
  trackIds: string[];
  /** Copa que precisa ter sido vencida (ou qualificada) para destravar esta. */
  requires: string | null;
  /** Etapa: a Expedição Brasil (um estado por copa) ou o Mundial (um país por copa). */
  stage: CupStage;
  /** Expedição Brasil: região (a tela agrupa por ela) e sigla do estado (o carimbo do passaporte). */
  region?: BrazilRegion;
  state?: string;
}

export type CupStage = 'brasil' | 'mundial';
export type BrazilRegion = 'sudeste' | 'sul' | 'centro_oeste' | 'nordeste' | 'norte';

export interface StandingRow {
  /** Nome estável do participante (humanos: "seat:N"; IA: nome do piloto). */
  key: string;
  name: string;
  seat: number;
  teamId: number;
  points: number;
  wins: number;
  /** Posições por corrida (0 = não correu). */
  positions: number[];
}

export interface TeamStandingRow {
  teamId: number;
  name: string;
  points: number;
  isHuman: boolean;
}

export interface ChampionshipState {
  cupId: string;
  /** Índice da próxima corrida a disputar. */
  raceIndex: number;
  standings: StandingRow[];
  teams: TeamStandingRow[];
  /** Modo cooperativo: todos os humanos no time 0. */
  coop: boolean;
  /** Eliminado (não cumpriu a regra de classificação). */
  eliminated: boolean;
  /** Copa concluída (todas as corridas disputadas sem eliminação). */
  completed: boolean;
  /** Resultado da última corrida (para a tela de resultados). */
  lastRace: RaceResultRow[] | null;
  /** Qual regra derrubou o jogador na última corrida, para a mensagem da interface. */
  lastVerdict: 'qualified' | 'eliminated' | null;
}
