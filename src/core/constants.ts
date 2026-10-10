// Constantes do núcleo. Tudo em unidades de mundo: um segmento de pista tem SEGMENT_LENGTH
// unidades; velocidades são unidades por segundo; o passo da simulação é fixo (TICK_RATE).
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const SEGMENT_LENGTH = 200;
/** Metade da largura da estrada. `x` normalizado: -1 e +1 são as bordas do asfalto. */
export const ROAD_HALF_WIDTH = 2000;
/** Velocidade de referência: 6000 u/s = 30 segmentos por segundo = 300 km/h no velocímetro. */
export const REFERENCE_SPEED = 6000;
/** Velocidade → km/h no velocímetro. */
export const SPEED_TO_KMH = 300 / REFERENCE_SPEED;

export const MAX_CARS = 20;
export const MAX_SEATS = 4;

/*
 * Pegada de colisão do carro (docs/FISICA.md). O carro na tela mede 4,4 × 1,9 m em todos os estilos
 * (src/render/cars.ts; o contrato está em CarBody, types.ts) e, na escala da tela (src/render/units.ts),
 * 1 m = 50 u em z e 1/7 em x. A caixa de colisão é um pouco menor que a visual — 4,0 m (91%) × 1,82 m (96%) —
 * para perdoar o raspão: as pontas do carro afinam (o bico tem 1,24 m de largura), então uma caixa do tamanho
 * cheio bateria quina com quina onde a tela mostra ar, e o carro gira até 0,08 rad ao esterçar, o que a caixa
 * alinhada à pista não acompanha. Na largura o perdão é menor porque o vão lateral é o que a câmera de
 * perseguição mais mostra. Era 120 u × 0,22 (2,4 × 3,08 m): lado a lado batia com 1,2 m de ar entre as
 * latarias, e em fila um entrava 2 m no outro antes de bater (tests/collisions.test.ts).
 */
/** Comprimento de colisão, em unidades de mundo: em fila, dois carros se tocam com os centros a esta distância. */
export const CAR_LENGTH = 200;
/** Meia largura de colisão em `x` normalizado: lado a lado, os centros se tocam a 2 × isto (0,26 = 1,82 m). */
export const CAR_HALF_WIDTH = 0.13;
/**
 * Raspão de lado: cada um perde até SIDE_CONTACT_LOSS da velocidade por tick de contato, na proporção do QUADRADO
 * da sobreposição lateral daquele tick sobre SIDE_CONTACT_FULL_OVERLAP (a energia de uma batida cresce com o
 * quadrado da velocidade com que um entra no outro). Uma guinada forte contra o outro custa os 3% de antes; dois
 * carros apenas encostados, um esterçando contra o outro, quase não perdem — com perda fixa de 3% por tick eles se
 * seguravam a ~15% da máxima (o "travamento lado a lado", docs/FISICA.md).
 */
export const SIDE_CONTACT_LOSS = 0.03;
/** Sobreposição lateral (em x) que já conta como batida lateral cheia: 0,06 (0,42 m), o tranco fixo antigo por tick. */
export const SIDE_CONTACT_FULL_OVERLAP = 0.06;
/**
 * A separação deixa os dois carros esta folga além do encosto (em x e em unidades de z): sem ela, o arredondamento
 * pode deixar uma sobreposição residual (~1e-17) que contaria como contato de novo no tick seguinte.
 */
export const COLLISION_SLOP_X = 0.002;
export const COLLISION_SLOP_Z = 1;
/** Passadas por tick na resolução das colisões (engavetamento: quem recua pode cair dentro de quem vinha atrás). */
export const COLLISION_PASSES = 3;

export const CENTRIFUGAL = 0.3;
export const OFFROAD_LIMIT_FACTOR = 0.35; // velocidade máxima fora da pista, fração da máxima
export const OFFROAD_DECEL_FACTOR = 0.6;  // desaceleração fora da pista, fração da máxima por s
export const OFFROAD_X = 1.05;            // |x| a partir do qual o carro está na grama

export const NITRO_PER_RACE = 3;
export const NITRO_DURATION_TICKS = 150;  // 2,5 s
export const NITRO_SPEED_MULT = 1.28;
export const NITRO_ACCEL_MULT = 2.2;

/*
 * Derrapagem (onda M, frente M1; o design e a razão de cada número estão em docs/ondas/M/M1.md). Segura-se o botão com o
 * volante para um lado, numa velocidade boa: o carro "desliza" — a centrífuga cai a ×0,55, o volante puxa para dentro e a
 * velocidade perde um pouco —, a carga sobe em 3 níveis enquanto ele está numa curva forte do mesmo lado, e soltar dá um
 * impulso menor que o nitro. Constantes de AJUSTE FINO (o balance é que as acerta): DRIFT_DRAG_PER_SECOND e
 * AI_DRIFT_CORNER_GAIN; as outras são o contrato do cronograma.
 */
/** Entra na derrapagem com velocidade a partir desta fração da máxima do carro… */
export const DRIFT_MIN_SPEED_FACTOR = 0.45;
/** …e se mantém até cair abaixo desta (histerese: a perda de velocidade da própria derrapagem não a cancela na borda). */
export const DRIFT_KEEP_SPEED_FACTOR = 0.35;
/** |volante| mínimo para entrar; o lado da derrapagem é o sinal do volante. Segurar o botão com o volante no meio não entra. */
export const DRIFT_ENTRY_STEER = 0.3;
/** Enquanto derrapa, a força centrífuga da curva vale esta fração. */
export const DRIFT_CENTRIFUGAL_MULT = 0.55;
/** Enquanto derrapa, o volante efetivo ganha isto para o lado da derrapagem ("puxa para dentro"); esterçar contra anula. */
export const DRIFT_PULL = 0.4;
/** Perda de velocidade enquanto derrapa: fração da velocidade máxima por segundo (pequena: ~12 km/h/s num carro de 300 km/h). */
export const DRIFT_DRAG_PER_SECOND = 0.04;
/** A carga só sobe com o segmento nesta curva (|curva|) ou mais, para o lado da derrapagem. */
export const DRIFT_CHARGE_MIN_CURVE = 1.0;
/** Carga (ticks derrapando em curva forte) para o nível 1 (azul), 2 (laranja) e 3 (roxa): 0,75 s, 1,67 s e 2,67 s. */
export const DRIFT_LEVEL_TICKS: readonly number[] = [45, 100, 160];
/** Impulso ao soltar, por nível: 0,5, 1,0 e 1,5 s (o nitro dura 2,5 s). */
export const DRIFT_BOOST_TICKS: readonly number[] = [30, 60, 90];
/**
 * Durante o impulso: velocidade máxima e aceleração, as duas menores que as do nitro (1,28 e 2,2). Sem multiplicador de
 * consumo próprio (o nitro tem 1,6): a velocidade maior já gasta mais por tick, e com um ×1,3 a antecedência do aviso de
 * combustível do jogador de pé no fundo caía de 0,10 para 0,09 volta em 4 pistas (tests/fuel.test.ts).
 */
export const DRIFT_BOOST_SPEED_MULT = 1.12;
export const DRIFT_BOOST_ACCEL_MULT = 1.8;

export const GEAR_COUNT = 5;
/** Fração da velocidade máxima que cada marcha alcança (manual). */
export const GEAR_TOP = [0.22, 0.42, 0.62, 0.82, 1.0];
/** Multiplicador de aceleração por marcha (marcha baixa acelera mais). */
export const GEAR_ACCEL = [1.7, 1.45, 1.2, 1.0, 0.85];

export const COUNTDOWN_TICKS = 3 * TICK_RATE + 30; // 3 s de contagem + meio segundo de "JÁ"
/**
 * Distância entre as filas do grid (centro a centro): 400 u = 8 m, a de um grid de verdade — 3,6 m de vão na tela
 * entre a traseira de um carro e o bico do de trás. Eram 260 u (0,8 m de vão): com a colisão do tamanho do carro,
 * quem arrancava melhor batia no da frente nos primeiros metros, e as batidas da largada (iguais para todas as
 * personalidades) apagavam a diferença entre elas (onda F, docs/FISICA.md; tests/rivals.test.ts).
 */
export const GRID_ROW_GAP = 400;
/** Grid: o primeiro carro larga esta distância antes da linha, e cada fila tem um carro em cada lado (x = ±GRID_LANE_X).
 *  A pintura das vagas no chão (src/render/road-textures.ts) lê estas constantes — não repita os números lá. */
export const GRID_FRONT_GAP = 600;
export const GRID_LANE_X = 0.45;
export const FUEL_CAPACITY = 1;
export const FUEL_EMPTY_SPEED_FACTOR = 0.2;
/**
 * Aviso de combustível baixo ("entre no box"): quando o tanque já não garante esta quantidade de
 * voltas em aceleração total. Proporcional à volta porque um nível fixo (eram 25%) chega tarde nas
 * voltas longas; acima de 1 porque o jogador de pé no fundo gasta ~0,95–1,0 disso por volta, e a
 * sobra (0,15 volta, ~12 s) é o tempo de ver o aviso e ir para o box (sim/fuel.ts, tests/fuel.test.ts).
 */
export const FUEL_LOW_LAPS = 1.15;
/** Folga da IA sobre o consumo medido ao decidir se passa reto pelo box (sim/fuel.ts). */
export const FUEL_PIT_MARGIN = 1.15;
export const PIT_X = 1.55;                 // centro do box, em `x` normalizado
export const PIT_SPEED_LIMIT_FACTOR = 0.25;
export const PIT_REFUEL_PER_SECOND = 0.35;

export const DRAFT_DISTANCE = SEGMENT_LENGTH * 6;
export const DRAFT_LATERAL = 0.3;
export const DRAFT_ACCEL_MULT = 1.35;
export const DRAFT_TOP_MULT = 1.03;
export const TEAM_DRAFT_TOP_MULT = 1.06;
/**
 * Alcance do vácuo de equipe (entre humanos do mesmo time): maior que o do vácuo comum para a fila com o
 * parceiro render algo de verdade (onda D: com 6 segmentos e 0,3 de lado quase nunca se mantinha).
 */
export const TEAM_DRAFT_DISTANCE = SEGMENT_LENGTH * 15;
export const TEAM_DRAFT_LATERAL = 0.5;

/**
 * Abaixo disso o companheiro aceita empurrão. Acima de FUEL_EMPTY_SPEED_FACTOR (0,2, que o elástico e o vácuo
 * sobem a 0,21) e de SPRITE_CRASH_SPEED_FACTOR (0,25): o carro seco e o que bateu numa árvore são socorridos.
 */
export const TOW_MIN_SPEED_FACTOR = 0.3;
/** Quem empurra precisa andar acima disto (fração da própria máxima): num engavetamento lento ninguém empurra ninguém. */
export const TOW_GIVER_MIN_FACTOR = 0.6;
export const TOW_DISTANCE = SEGMENT_LENGTH * 2;
export const TOW_LATERAL = 0.7;
export const TOW_SPEED_FACTOR = 0.8;
export const TOW_COOLDOWN_TICKS = 3 * TICK_RATE;

// Escolta (modo de festa, src/core/modes.ts e docs/MODOS.md).
/** Velocidade máxima do VIP, fração da do carro dele: mais lento que os rivais, precisa de escolta. */
export const ESCORT_VIP_TOP_FACTOR = 0.99;
/**
 * Habilidade do VIP dentro da faixa da dificuldade (0 = a do pior rival, 1 = a do melhor). Calibrada na onda C
 * (docs/MODOS.md): com a do melhor rival, amador e profissional passavam de 88% de sucesso.
 */
export const ESCORT_VIP_SKILL = { amador: 0.8, profissional: 0.7, campeao: 1 } as const;
/** O VIP precisa terminar nesta posição ou melhor. */
export const ESCORT_GOAL_POSITION = 3;
/** Empurrão no VIP: um companheiro até esta distância atrás dele, na mesma faixa… */
export const ESCORT_PUSH_DISTANCE = SEGMENT_LENGTH * 2;
export const ESCORT_PUSH_LATERAL = 0.45;
/** …leva o VIP a esta fração da própria velocidade… */
export const ESCORT_PUSH_SPEED_FACTOR = 0.97;
/** …até este múltiplo da velocidade máxima do VIP. */
export const ESCORT_PUSH_TOP_CAP = 1.12;

export const CATCHUP_DISTANCE = SEGMENT_LENGTH * 60;
export const CATCHUP_TOP_MULT = 1.05;

export const COLLISION_COOLDOWN_TICKS = 20;
export const SPRITE_CRASH_SPEED_FACTOR = 0.25;

/** Pontos por posição (1º…10º); a partir do 11º, zero. */
export const POINTS_TABLE = [20, 15, 12, 10, 8, 6, 4, 3, 2, 1];
/** Posição mínima para seguir na copa (modo solo/versus). */
export const QUALIFY_POSITION = 5;
/** Colocação mínima da equipe entre as equipes para seguir na copa (modo cooperativo). */
export const TEAM_QUALIFY_RANK = 3;
/** Depois que o primeiro humano cruza a linha, os outros têm este tempo para terminar. */
export const FINISH_GRACE_TICKS = 45 * TICK_RATE;

// Melhorias da carreira, por nível (0..UPGRADE_MAX_LEVEL). Preços e prêmios moram em career.ts.
export const UPGRADE_MAX_LEVEL = 3;
/** Motor: velocidade máxima +2,5% por nível. */
export const UPGRADE_ENGINE_TOP = 0.025;
/** Turbo: aceleração +8% por nível. */
export const UPGRADE_TURBO_ACCEL = 0.08;
/** Pneus: dirigibilidade +0,04 por nível, até HANDLING_MAX. */
export const UPGRADE_TIRES_HANDLING = 0.04;
export const HANDLING_MAX = 1;
/** Freios: frenagem +12% por nível. */
export const UPGRADE_BRAKES = 0.12;
/** Tanque: consumo −10% por nível. */
export const UPGRADE_TANK_FUEL = 0.1;
/** Nitro: +1 carga por nível. */
export const UPGRADE_NITRO_CHARGES = 1;

// Personalidades e rivais da IA (sim/personality.ts, docs/RIVAIS.md). A tabela de cada personalidade
// mora em data/drivers.ts (PERSONALITY_TUNING).
/** Curva a partir da qual a IA freia para ela (sim/ai.ts); abaixo disto o trecho é reta para ela. */
export const AI_BRAKE_CURVE = 1.5;
/**
 * A IA e a direção assistida só derrapam num trecho de curva forte (≥ AI_BRAKE_CURVE, do mesmo lado) de pelo menos este
 * tamanho em segmentos: o necessário para a carga chegar ao 1º nível (DRIFT_LEVEL_TICKS[0] = 45 ticks a ~0,8 da máxima ≈ 18
 * segmentos). Com 10 (o 1º palpite do cartão), medido em 10 pistas: 20% das derrapagens da IA acabavam sem impulso — perdiam
 * velocidade (DRIFT_DRAG_PER_SECOND) sem nada em troca, e em Copacabana e Noite em Sampa (curvas de 10 a 17 segmentos) nenhuma
 * dava impulso. O quartil baixo das 109 pistas tem 7 segmentos, a mediana 43.
 */
export const AI_DRIFT_MIN_SEGMENTS = 18;
/** A IA solta o botão (e leva o impulso) quando faltam menos que isto segmentos do trecho, ou a curva troca de lado. */
export const AI_DRIFT_RELEASE_SEGMENTS = 3;
/**
 * Quanto do ganho de aderência da derrapagem a IA e a direção assistida (steer, full) usam ao decidir a velocidade das curvas:
 * 0 = freiam como sem derrapar, 1 = usam tudo (holdableSpeedFraction com ×0,55). É o botão de RITMO da frente e fica em 0
 * (provisório, a calibragem final é da O2), pelo que o `npm run balance -- corrida profissional 11 12 13` mediu (109 pistas,
 * média das sementes; docs/ondas/M/M1.md, §11): com 0,6 a IA ficava ~7% mais rápida e as ultrapassagens por minuto caíam 6%
 * (todo carro passa a segurar a curva forte, o handling deixa de separar o grid); com 0,25, −4,0% de volta e −2% de
 * ultrapassagens; com 0 o ritmo não muda (volta −0,2%), as batidas traseiras caem ~11% e a derrapagem da IA é só o impulso na
 * saída das curvas. Quem ganha a aderência é o jogador que derrapa (o botão do jogador vale o ganho inteiro).
 */
export const AI_DRIFT_CORNER_GAIN = 0;
/** Só usa o limite com derrapagem se ele deixar a IA com velocidade para entrar nela (DRIFT_MIN_SPEED_FACTOR e uma folga). */
export const AI_DRIFT_LIMIT_MIN = DRIFT_MIN_SPEED_FACTOR + 0.1;
/** Faixa lateral mais longe do centro que a IA usa para ultrapassar (sim/ai.ts). */
export const AI_PASS_LANE_MAX = 0.7;
/**
 * Distância lateral entre centros que a faixa de ultrapassagem precisa deixar para passar sem encostar: a largura
 * de colisão e uma sobra de 0,04 (28 cm). Perto da borda, AI_PASS_LANE_MAX come a folga e a IA passa pelo outro lado.
 */
export const AI_PASS_CLEARANCE = CAR_HALF_WIDTH * 2 + 0.04;
/**
 * A IA não esterça para dentro de um carro a menos disto em z que esteja no caminho da faixa que ela quer
 * (sim/ai.ts: sideBlocker): o comprimento do carro na tela (220 u = 4,4 m entre centros), o mesmo "do lado" do
 * BLOCK_ALONGSIDE. Com 1,25 × a caixa o bloqueador parava de fechar a porta antes da hora (tests/rivals.test.ts).
 */
export const AI_SIDE_LOOK = CAR_LENGTH * 1.1;
/** Bônus de habilidade do rival principal da copa (a habilidade vai de ~0,8 a ~1,03). */
export const RIVAL_SKILL_BONUS = 0.02;
/** Bloqueador: vigia humanos até esta distância atrás e nesta janela lateral. */
export const BLOCK_RANGE = SEGMENT_LENGTH * 3;
export const BLOCK_LATERAL_WINDOW = 0.9;
/**
 * Humano a menos disto atrás já pôs o bico do lado: o bloqueador respeita o desvio e não fecha mais. É o comprimento
 * do carro na tela (220 u = 4,4 m entre centros: o bico de um na traseira do outro), um pouco antes do contato
 * (CAR_LENGTH). Era 1,5 × 120 = 180 u (3,6 m, o bico já 0,8 m do lado); 1,5 × a caixa nova (6 m) desistia cedo
 * demais e o bloqueador deixava de segurar o humano (tests/rivals.test.ts, onda F).
 */
export const BLOCK_ALONGSIDE = CAR_LENGTH * 1.1;
/** Tempo máximo fechando a porta numa investida; depois descansa BLOCK_REST_TICKS sem bloquear ninguém. */
export const BLOCK_MAX_TICKS = 4 * TICK_RATE;
export const BLOCK_REST_TICKS = 8 * TICK_RATE;
/** Até onde o bloqueador vai para o lado (fica no asfalto e não empurra ninguém para a grama). */
export const BLOCK_MAX_X = 0.7;
/** Quanto a faixa do bloqueador anda por tick atrás do humano (0,72/s): dá para enganar e passar. */
export const BLOCK_LATERAL_RATE = 0.012;
/**
 * Erro de frenagem (por trecho de curva): o piloto acha que a curva segura MISTAKE_CORNER_SPEED vezes mais,
 * freia MISTAKE_BRAKE_LATE vezes mais tarde e, nos primeiros MISTAKE_WIDE_SEGMENTS segmentos do trecho,
 * abre para fora até MISTAKE_WIDE_X (a grama começa em OFFROAD_X) antes de se recuperar.
 */
export const MISTAKE_CORNER_SPEED = 1.2;
export const MISTAKE_BRAKE_LATE = 2;
export const MISTAKE_WIDE_SEGMENTS = 20;
export const MISTAKE_WIDE_X = 1.08;
// Direção assistida (sim/assist.ts; docs/ASSISTENCIAS.md). Entram na impressão do conteúdo do online.
/** Margem do freio automático sobre o limite de cada curva quando quem esterça é o jogador (erra mais que a IA). */
export const ASSIST_GRIP_BRAKE = 0.9;
/** Margem do freio automático quando a assistência também esterça (assistência completa). */
export const ASSIST_GRIP_FULL = 1.05;
/** Segmentos que o freio automático olha à frente (mais 30 em velocidade máxima, como a IA). */
export const ASSIST_LOOKAHEAD = 26;
/** A partir deste |x| o volante assistido empurra de volta para o asfalto (a grama começa em OFFROAD_X). */
export const ASSIST_EDGE_X = 0.7;
/** Força do empurrão da borda por unidade de x além de ASSIST_EDGE_X (6: segura o volante todo para fora antes de 0,9). */
export const ASSIST_EDGE_GAIN = 6;
/** Volante do jogador acima disto sobrepõe a assistência completa. */
export const ASSIST_STEER_DEADZONE = 0.15;
/** Faixa em que a assistência completa mantém o carro quando o jogador solta o volante. */
export const ASSIST_LANE_LIMIT = 0.55;
/**
 * Volante assistido sozinho: só tira velocidade onde nem o volante todo seguraria a curva (o mesmo
 * ponto de frenagem, com margem acima do limite do volante).
 */
export const ASSIST_GRIP_STEER = 1.1;
