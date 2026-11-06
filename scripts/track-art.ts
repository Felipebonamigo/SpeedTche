// Os desenhos das pistas em curva (docs/PISTAS.md, "Pistas com desenho"): silhuetas de cartum em traço contínuo —
// arcos e Béziers, como um ícone ilustrado — que scripts/shape-to-track.ts transforma nos `ops` de
// src/core/track/tracks.ts seguindo a curvatura do traço inteiro (não só as quinas de um polígono). Coordenadas da tela
// (x para a direita, y para BAIXO), num quadro de ~100; o contorno é HORÁRIO e `start` é um ponto num trecho reto que
// SOBE na vertical (o minimapa começa apontando para cima; os 40 segmentos do box ficam ali). Desenho simétrico: só a
// metade da direita, do alto do eixo (x = 50) até o pé dele, e `sym` espelha.

export type P = [number, number];

/** Caneta: traço denso (de ~0,25 em 0,25) que os comandos acrescentam a partir do ponto atual. */
export class Pen {
  readonly pts: P[];
  constructor(x: number, y: number) { this.pts = [[x, y]]; }
  private get at(): P { return this.pts[this.pts.length - 1]; }
  /** Reta até (x, y). */
  L(x: number, y: number): this {
    const [x0, y0] = this.at;
    const n = Math.max(1, Math.ceil(Math.hypot(x - x0, y - y0) / 0.25));
    for (let i = 1; i <= n; i++) this.pts.push([x0 + ((x - x0) * i) / n, y0 + ((y - y0) * i) / n]);
    return this;
  }
  /** Bézier cúbica com os controles (x1, y1) e (x2, y2) até (x, y). */
  C(x1: number, y1: number, x2: number, y2: number, x: number, y: number): this {
    const [x0, y0] = this.at;
    const n = Math.max(16, Math.ceil((Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x - x2, y - y2)) / 0.25));
    for (let i = 1; i <= n; i++) {
      const t = i / n; const u = 1 - t;
      this.pts.push([
        u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
        u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
      ]);
    }
    return this;
  }
  /** Bézier quadrática com o controle (x1, y1) até (x, y). */
  Q(x1: number, y1: number, x: number, y: number): this {
    const [x0, y0] = this.at;
    return this.C(x0 + ((x1 - x0) * 2) / 3, y0 + ((y1 - y0) * 2) / 3, x + ((x1 - x) * 2) / 3, y + ((y1 - y) * 2) / 3, x, y);
  }
  /**
   * Arco de círculo de centro (cx, cy) e raio r, do ângulo `a0` ao `a1` (graus; 0 = direita, 90 = BAIXO: crescente é
   * horário na tela). Começa no ponto atual (liga com uma reta se não estiver lá).
   */
  arc(cx: number, cy: number, r: number, a0: number, a1: number): this {
    const p0: P = [cx + r * Math.cos((a0 * Math.PI) / 180), cy + r * Math.sin((a0 * Math.PI) / 180)];
    if (Math.hypot(p0[0] - this.at[0], p0[1] - this.at[1]) > 1e-6) this.L(p0[0], p0[1]);
    const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 1.5));
    for (let i = 1; i <= n; i++) {
      const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
      this.pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return this;
  }
}

/**
 * Desenho simétrico no eixo x = 50: `right` é a metade da direita, do alto do eixo até o pé dele (horário); a da
 * esquerda é o espelho, de volta do pé até o alto.
 */
export function sym(right: P[]): P[] {
  const left = right.slice(1, -1).reverse().map(([x, y]) => [100 - x, y] as P);
  return [...right, ...left];
}

/**
 * Polígono fechado de quinas arredondadas: cada vértice [x, y, raio?] vira uma curva (quadrática) que começa `raio` antes
 * dele e termina `raio` depois; o raio padrão é `r`. Serve aos objetos de arestas retas (o MASP, a fortaleza, o
 * convento) que o cartum só amacia. O primeiro vértice não pode ficar no meio de uma reta: o traço começa logo depois
 * da quina dele e fecha no mesmo ponto.
 */
export function softPoly(corners: Array<[number, number, number?]>, r: number): P[] {
  const n = corners.length;
  const cut = (i: number) => {
    const [x, y, ri = r] = corners[i];
    const [px, py] = corners[(i + n - 1) % n]; const [nx, ny] = corners[(i + 1) % n];
    const din = Math.hypot(x - px, y - py); const dout = Math.hypot(nx - x, ny - y);
    const rr = Math.min(ri, din / 2, dout / 2);
    return { c: [x, y] as P, a: [x - ((x - px) / din) * rr, y - ((y - py) / din) * rr] as P, b: [x + ((nx - x) / dout) * rr, y + ((ny - y) / dout) * rr] as P };
  };
  const first = cut(0);
  const pen = new Pen(first.b[0], first.b[1]);
  for (let i = 1; i < n; i++) { const k = cut(i); pen.L(k.a[0], k.a[1]).Q(k.c[0], k.c[1], k.b[0], k.b[1]); }
  pen.L(first.a[0], first.a[1]).Q(first.c[0], first.c[1], first.b[0], first.b[1]);
  return pen.pts;
}

export interface Art {
  /** Estado (sigla) e o que o desenho representa — vão para a folha de desenhos. */
  state: string;
  what: string;
  /** O traço fechado, horário. */
  pts: P[];
  /** Onde fica a largada: o ponto do traço mais perto dele, num trecho reto que sobe. */
  start: P;
}

// ───────────────────────────── os desenhos ─────────────────────────────

/** RJ · Cristo Redentor: braços abertos com a túnica caindo das mangas, cabeça redonda, o manto que abre até o pedestal. */
function cristo(): Art {
  const r = new Pen(50, 7.5)
    .arc(50, 16, 8.5, -90, 56) // cabeça
    .C(55.2, 25.4, 56.5, 26.4, 59, 26.9) // pescoço até o ombro
    .C(69, 27.1, 80, 27.2, 88.5, 27.6) // braço, por cima
    .C(93.8, 27.8, 94.6, 35.6, 88.6, 35.8) // a mão
    .C(77, 36.4, 59.5, 41, 58.3, 55) // a manga caindo até a cintura
    .C(57.6, 64, 59.8, 76, 61.6, 85.5) // o manto abrindo
    .L(64, 85.5).L(64, 100.5).L(50, 100.5); // pedestal (reta de 15: os 40 segmentos do box cabem retos)
  return { state: 'RJ', what: 'Cristo Redentor', pts: sym(r.pts), start: [36, 97] };
}

/**
 * SP · MASP: a caixa larga suspensa nos dois pórticos, com o vão livre embaixo. A viga do teto passa um pouco dos pilares
 * (o que faz o prédio ler como prédio e não como mesa). Largada no pilar esquerdo, do lado de fora.
 */
function masp(): Art {
  const pts = softPoly([
    [4, 84], [4, 25], [0, 25, 1.8], [0, 17, 2.4], [100, 17, 2.4], [100, 25, 1.8], [96, 25], // viga do teto e o pilar direito
    [96, 84], [87, 84], [87, 62, 4], [13, 62, 4], [13, 84], // o vão livre
  ], 3.4);
  return { state: 'SP', what: 'MASP', pts, start: [4, 76] };
}

/**
 * MG · Igreja da Pampulha, de perfil: a abóbada parabólica da nave e as três menores, em onda, com vãos arredondados
 * entre elas; a marquise fina que leva à torre em trapézio invertido (com o vão do chão por baixo). Largada na parede
 * esquerda da nave.
 */
function pampulha(): Art {
  const r = new Pen(3, 72).L(3, 52)
    .C(3, 0, 35, 0, 35, 52) // a nave
    .L(35, 58.9).arc(37.1, 58.9, 2.1, 180, 0) // o vão entre a nave e a 1ª menor
    .L(39.2, 50).C(39.2, 24, 51.2, 24, 51.2, 50) // 1ª menor
    .L(51.2, 61).arc(53.3, 61, 2.1, 180, 0)
    .L(55.4, 57).C(55.4, 38, 64.4, 38, 64.4, 57) // 2ª
    .L(64.4, 63.5).arc(66.5, 63.5, 2.1, 180, 0)
    .L(68.6, 60).C(68.6, 48, 75.6, 48, 75.6, 60) // 3ª
    .L(83.5, 60) // a marquise, por cima
    .L(81, 19).Q(80.6, 15, 84.5, 15).L(93.5, 15).Q(97.4, 15, 97, 19) // a torre: topo largo
    .L(92.5, 75.5).L(88.8, 75.5) // até o pé, estreito
    .L(84.5, 65).L(77, 65).L(77, 75.5) // o vão por baixo da marquise
    .L(6, 75.5).Q(3, 75.5, 3, 72);
  return { state: 'MG', what: 'Igreja da Pampulha', pts: r.pts, start: [3, 68] };
}

/**
 * ES · Convento da Penha: o morro em domo (encosta suave à esquerda, paredão íngreme do lado direito) e, no topo, o
 * convento: a caixa baixa da igreja com a torre de ponta. Largada na reta do pé esquerdo do morro.
 */
function penha(): Art {
  const r = new Pen(2, 86).L(2, 70)
    .C(2, 52, 14, 39, 31, 37) // a encosta
    .L(33, 37).L(33, 26).L(51, 26) // a parede da igreja e o telhado
    .L(51, 14).L(57, 3).L(63, 14) // a torre, com a ponta
    .L(63, 26).L(69, 26).L(69, 37) // o telhado até a ponta direita
    .L(71, 37).C(80, 37, 85, 47, 88, 62) // o topo do paredão
    .C(90, 72, 91, 80, 93, 86) // o paredão
    .Q(93, 90, 89, 90).L(6, 90).Q(2, 90, 2, 86); // o pé
  return { state: 'ES', what: 'Convento da Penha', pts: r.pts, start: [2, 82] };
}

/**
 * SC · Ponte Hercílio Luz: as duas torres com capitel e o cabo pênsil que desce em curva até tocar o chão no meio (o "M"
 * da ponte); dos topos, os estais descem em faixa até os blocos de ancoragem nas pontas. Simétrica: desenhada a metade da
 * direita, do alto do cabo (eixo) até o pé dele. Largada na lateral esquerda da torre esquerda, do lado de fora.
 */
function hercilio(): Art {
  const r = new Pen(50, 50)
    .C(57, 50, 64, 32, 70.5, 14) // o cabo, por cima, até o topo da torre
    .L(70.5, 8).L(81, 8).L(81, 14).L(78, 16.5).L(78, 19) // o capitel
    .C(87, 22, 94, 36, 95, 52).L(100, 52).L(100, 62).L(87, 62).L(87, 53) // o estai, o bloco de ancoragem
    .C(88, 44, 86, 33, 78, 29) // o estai, por baixo, de volta à torre
    .L(78, 62).L(72, 62).L(72, 30) // a torre
    .C(66, 42, 58, 62, 50, 62); // o cabo, por baixo, até o chão no meio
  return { state: 'SC', what: 'Ponte Hercílio Luz', pts: sym(r.pts), start: [22, 58] };
}

/**
 * RS · A cuia de chimarrão, de lado: o bojo redondo, a cintura, a boca com o lábio largo e a bomba saindo em diagonal (é ela
 * que diz "chimarrão"), com o bocal alargado na ponta. A lateral esquerda do bojo tem uns 16 de reta para a largada (o pé
 * reto de docs/PISTAS.md); o resto é curva.
 */
function cuia(): Art {
  const r = new Pen(40, 92).L(32, 92)
    .C(20, 92, 11, 86, 11, 74).L(11, 58) // o pé reto da largada
    .C(11, 50, 14, 44, 16, 38) // o ombro do bojo até a cintura
    .C(16, 33, 8, 34, 8, 28).Q(8, 23, 17, 23) // o lábio largo, à esquerda
    .L(39.4, 23).L(59.53, 2.38).arc(62, 5, 3.6, -133.4, 46.6).L(46.6, 23) // a bomba, com o bocal
    .L(69, 23).Q(78, 23, 78, 28).C(78, 34, 70, 33, 70, 38) // o lábio, à direita, e a cintura
    .C(72, 44, 77, 50, 77, 64).C(77, 82, 66, 92, 52, 92).L(40.5, 92); // o bojo, à direita, e o fundo
  return { state: 'RS', what: 'cuia de chimarrão', pts: r.pts, start: [11, 70] };
}

/** Ponto de cima (menor y) em que dois círculos [cx, cy, r] se cortam. */
function upperCut(a: [number, number, number], b: [number, number, number]): P {
  const dx = b[0] - a[0]; const dy = b[1] - a[1]; const d = Math.hypot(dx, dy);
  const t = (a[2] * a[2] - b[2] * b[2] + d * d) / (2 * d); const h = Math.sqrt(a[2] * a[2] - t * t);
  const mx = a[0] + (dx * t) / d; const my = a[1] + (dy * t) / d;
  const p1: P = [mx - (dy * h) / d, my + (dx * h) / d]; const p2: P = [mx + (dy * h) / d, my - (dx * h) / d];
  return p1[1] < p2[1] ? p1 : p2;
}

/**
 * Tufos: o contorno de cima de círculos que se sobrepõem, da esquerda para a direita (horário), com a quina em cada
 * encontro. O primeiro arco começa em `from` (graus) e o último termina em `to`.
 */
function scallop(pen: Pen, circles: Array<[number, number, number]>, from: number, to: number): Pen {
  const ang = (c: [number, number, number], p: P) => (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI;
  let a0 = from;
  circles.forEach((c, i) => {
    let a1 = to;
    if (i < circles.length - 1) a1 = ang(c, upperCut(c, circles[i + 1]));
    while (a1 <= a0) a1 += 360;
    pen.arc(c[0], c[1], c[2], a0, a1);
    if (i < circles.length - 1) a0 = ang(circles[i + 1], upperCut(c, circles[i + 1]));
  });
  return pen;
}

/**
 * PR · Araucária: o tronco reto, a copa em taça aberta (candelabro) com a borda de tufos redondos e a face de baixo
 * levemente côncava, e um galho menor, de tufo na ponta, mais embaixo. Simétrica: desenhada a metade da direita, do alto do eixo ao pé
 * do tronco. Largada no tronco, do lado esquerdo, perto do chão.
 */
function araucaria(): Art {
  const r = scallop(new Pen(50, 5), [[50, 14, 9], [65, 16, 8.5], [80, 21, 8]], -90, 50)
    .C(76, 32, 64, 40, 55, 47) // a face de baixo da copa, levemente côncava
    .L(55, 61).C(59, 61, 61, 57, 62.8, 53).arc(68, 56, 6, -150, 110).C(62, 67, 59, 70, 55, 70) // o galho, com o tufo na ponta
    .L(55, 96).L(50, 96); // o tronco
  return { state: 'PR', what: 'araucária', pts: sym(r.pts), start: [45, 90] };
}

/**
 * DF · O avião do Plano Piloto visto de cima, bico para cima: a fuselagem de nariz redondo (o Eixo Monumental), as asas
 * arqueadas para trás de pontas redondas (o Eixo Rodoviário) e a cauda. Simétrico: desenhada a metade da direita, do bico
 * ao pé da cauda. Largada na lateral reta da fuselagem, atrás da asa esquerda.
 */
function aviao(): Art {
  const r = new Pen(50, 3).C(53.5, 3, 55.5, 6.5, 55.5, 13).L(55.5, 32) // o nariz e a fuselagem
    .C(70, 33, 85, 43, 94, 55).C(97, 59, 95, 64, 91, 63) // a asa, por cima, e a ponta redonda
    .C(82, 59, 70, 52, 55.5, 50) // a asa, por baixo, de volta à fuselagem
    .L(55.5, 76).C(60, 78, 66, 82, 68, 86).C(69, 90, 65, 92, 61, 90.5) // a cauda: o estabilizador
    .L(55.5, 88).C(55.5, 93, 54, 96, 50, 96); // o cone de cauda
  return { state: 'DF', what: 'avião do Plano Piloto', pts: sym(r.pts), start: [44.5, 68] };
}

/**
 * GO · A gota d'água das águas termais: fundo redondo, a ponta fina que se curva para a direita no alto. A lateral esquerda
 * da parte larga tem uns 17 de reta para a largada.
 */
function gota(): Art {
  const r = new Pen(50, 95)
    .C(34, 95, 18, 86, 18, 72).L(18, 55) // o fundo, à esquerda, e a reta da largada
    .C(18, 36, 40, 24, 50, 12).C(54, 8, 58, 5, 63, 3) // o flanco esquerdo até a ponta curva
    .C(61, 14, 82, 32, 82, 56) // o flanco direito
    .C(82, 84, 68, 95, 50.5, 95); // o fundo, à direita
  return { state: 'GO', what: 'gota d\'água', pts: r.pts, start: [18, 68] };
}

/**
 * MS · A piraputanga nadando para a direita: a cauda bifurcada (a largada fica na borda de trás do lobo de baixo), o corpo
 * oval, a barbatana dorsal redonda, a boca aberta e as barbatanas de baixo (a anal e a pélvica). Curvas longas de
 * propósito: pista de mata, e sem elas o cenário passa do orçamento (docs/PISTAS.md, "Pistas com desenho").
 */
function peixe(): Art {
  const r = new Pen(13, 83).Q(5, 83, 5, 77).L(5, 61) // o lobo de baixo da cauda: a borda de trás é a reta da largada
    .C(5, 58, 14, 54, 24, 53).arc(24, 49, 4, 90, -90).C(14, 44, 5, 40, 5, 37).L(5, 25).Q(5, 18, 12, 19) // a forquilha e o lobo de cima
    .C(20, 21, 26, 30, 32, 37) // a cauda até o pedúnculo
    .C(38, 33, 40, 27, 46, 24).C(46, 14, 52, 9, 60, 9).C(68, 9, 70, 20, 74, 26) // as costas e a dorsal
    .C(86, 26, 96, 34, 98, 48).L(93, 51.5).L(98.5, 55.5) // a cabeça e a boca aberta
    .C(97, 62, 88, 68, 74, 69) // o queixo e a barriga
    .C(70, 72, 66, 82, 58, 82).C(57, 78, 55, 73, 51, 70) // a anal
    .C(48, 76, 44, 79, 40, 77).C(40, 73, 42, 70, 40, 68) // a pélvica
    .C(36, 66, 33, 63, 32, 60).C(26, 66, 20, 74, 13, 83); // o pedúnculo e o lobo de baixo, por baixo
  return { state: 'MS', what: 'peixe (piraputanga)', pts: r.pts, start: [5, 72.5] };
}

// ───────────────────────────── rodada 2 (O1) ─────────────────────────────

/**
 * Pata, garra ou raio: um dedo de ponta redonda que sai do corpo entre `p0` e `p1` (nessa ordem no traço) até a ponta
 * `tip`, com meia-largura `w` na ponta. Vai pela borda de `p0`, dá a volta na ponta (horário) e volta pela borda de `p1`.
 */
function stub(pen: Pen, p0: P, p1: P, tip: P, w: number): Pen {
  const mx = (p0[0] + p1[0]) / 2; const my = (p0[1] + p1[1]) / 2;
  const d = Math.hypot(tip[0] - mx, tip[1] - my); const dx = (tip[0] - mx) / d; const dy = (tip[1] - my) / d;
  const nx = dy; const ny = -dx; // a normal do lado de p0
  const cx = tip[0] - dx * w; const cy = tip[1] - dy * w; // o centro da ponta redonda
  const a0 = (Math.atan2(ny, nx) * 180) / Math.PI;
  pen.L(p0[0], p0[1]).L(cx + nx * w, cy + ny * w).arc(cx, cy, w, a0, a0 + 180).L(p1[0], p1[1]);
  return pen;
}

/**
 * MT · O jacaré do Pantanal visto de cima, cabeça para cima: o focinho comprido e redondo, os olhos salientes, as quatro
 * patas curtas dobradas para fora e a cauda que afina em S. Simétrico: desenhada a metade da direita, da ponta do focinho
 * à ponta da cauda. Largada no flanco reto do corpo, do lado esquerdo, entre as patas.
 */
function jacare(): Art {
  const r = new Pen(50, 3)
    .C(54.5, 3, 57.5, 7, 57.5, 13) // o focinho
    .C(57.5, 18, 58.5, 21, 61.5, 24).C(63.5, 26, 63, 30, 60.5, 32) // o olho, saliente, e a nuca
    .L(60.5, 36).C(68, 34, 75, 30, 81, 26).C(87, 22, 92, 27, 87, 32).C(81, 37, 70, 39, 61.5, 40) // a pata da frente, dobrada
    .L(61.5, 60) // o flanco reto (a largada, espelhada)
    .C(70, 61, 80, 64, 86, 70).C(91, 75, 85, 80, 80, 76).C(74, 71, 66, 68, 60, 66) // a pata de trás
    .C(60, 74, 57, 82, 54, 89).C(52.5, 93, 51.5, 96, 50, 98); // a cauda em S, afinando
  return { state: 'MT', what: 'jacaré do Pantanal', pts: sym(r.pts), start: [38.5, 54] };
}

/**
 * BA · A caravela de Cabral, de lado, proa para a direita: o casco em sorriso com o castelo de popa, três mastros finos
 * com velas bojudas (a do meio, a maior, com a flâmula no alto) e a proa que sobe. Largada na popa, reta.
 */
function caravela(): Art {
  const r = new Pen(6, 78).L(6, 50) // a popa (reta da largada)
    .Q(6, 46, 10, 46).L(18, 46).Q(21, 46, 21, 50).L(21, 56) // o castelo de popa
    .L(24, 56).L(24, 22).Q(24, 19, 26, 19).Q(28, 19, 28, 22).L(28, 26) // o mastro de ré
    .C(36, 26, 41, 32, 41, 36).C(41, 40, 36, 45, 28, 45).L(28, 56) // a vela de ré, bojuda
    .L(46, 56).L(46, 8).Q(46, 5, 48, 5).Q(50, 5, 50, 8).L(50, 7.5) // o mastro grande
    .L(61, 10).L(50, 12.5).L(50, 15) // a flâmula
    .C(60, 15, 65, 26, 65, 33).C(65, 42, 60, 51, 50, 51).L(50, 56) // a vela grande
    .L(70, 56).L(70, 20).Q(70, 17, 72, 17).Q(74, 17, 74, 20).L(74, 26) // o mastro de proa
    .C(82, 26, 86, 32, 86, 36).C(86, 41, 82, 46, 74, 46).L(74, 56) // a vela de proa
    .L(84, 56).C(90, 55, 94, 52, 96, 46).C(99, 51, 97, 61, 92, 69) // a proa que sobe e a face dela
    .C(84, 80, 62, 88, 38, 88).C(24, 88, 12, 85, 6, 78); // o casco em sorriso
  return { state: 'BA', what: 'caravela de Cabral', pts: r.pts, start: [6, 64] };
}

/**
 * SE · O caranguejo dos mangues de Aracaju, visto de cima: o corpo oval largo, os olhos nas hastes, as duas garras
 * grandes abertas para cima e três patas de cada lado, embaixo. Simétrico: desenhada a metade da direita, do vão entre
 * os olhos ao fundo do corpo. Largada no flanco reto, entre a garra e as patas, do lado esquerdo.
 */
function caranguejo(): Art {
  const r = new Pen(50, 40).L(53, 40).L(53, 32).arc(56.5, 31, 3.5, 180, 360).L(60, 40) // a haste e o olho
    .Q(61, 40, 62, 41).C(66, 37, 70, 34, 73, 30) // o braço da garra
    .C(74, 25, 74, 20, 76, 15).arc(78.5, 14, 2.5, 200, 380).C(81, 20, 81, 24, 82, 27) // o dedo de dentro e a boca da garra
    .C(84, 22, 86, 14, 89, 8).arc(92, 7, 3.5, 220, 400).C(100, 18, 100, 30, 96, 36) // o dedo de fora, a volta
    .C(93, 38, 86, 38, 80, 38).L(78, 38).L(78, 66); // a base da garra e o flanco reto (a largada, espelhada)
  // As três patas: base no corpo (do flanco ao fundo) e ponta para fora.
  const e = (a: number): P => [50 + 28 * Math.cos((a * Math.PI) / 180), 64 + 26 * Math.sin((a * Math.PI) / 180)];
  const leg = (b0: number, b1: number, dir: number, len: number) => {
    const m = e((b0 + b1) / 2);
    stub(r, e(b0), e(b1), [m[0] + len * Math.cos((dir * Math.PI) / 180), m[1] + len * Math.sin((dir * Math.PI) / 180)], 2.6);
  };
  leg(8, 21, 12, 16); leg(29, 42, 40, 15); leg(50, 63, 66, 13);
  r.C(60, 88, 55, 90, 50, 90); // o fundo do corpo
  return { state: 'SE', what: 'caranguejo', pts: sym(r.pts), start: [22, 61] };
}

/**
 * AL · A jangada: a vela triangular bojuda presa ao mastro (com a flâmula no topo, ao vento) e a jangada de toras embaixo,
 * com a proa que sobe. Largada no mastro, do lado esquerdo.
 */
function jangada(): Art {
  const r = new Pen(40, 75).L(40, 13) // o mastro (reta da largada)
    .L(27, 9.5).L(40, 6) // a flâmula
    .L(40, 3).Q(40, 1, 42, 1).Q(44, 1, 44, 3).L(44, 9) // o topo do mastro
    .C(62, 11, 82, 36, 86, 62).Q(87, 67, 82, 67).L(44, 67) // a vela bojuda e o pé dela
    .L(44, 75) // o mastro até a jangada
    .L(84, 75).C(91, 75, 95, 71, 96, 65).C(99, 70, 99, 80, 94, 86) // a proa que sobe
    .L(12, 86).C(6, 86, 4, 80, 6, 75).L(40, 75); // as toras e a popa
  return { state: 'AL', what: 'jangada', pts: r.pts, start: [40, 50] };
}

/**
 * PE · A sombrinha de frevo: a cúpula com a ponteira no alto, a borda em 6 gomos redondos e o cabo com o gancho em J.
 * Largada no cabo, do lado esquerdo.
 */
function sombrinha(): Art {
  const r = new Pen(48, 84).L(48, 50); // o cabo, lado esquerdo (reta da largada)
  const gomo = (x0: number, x1: number) => r.Q((x0 + x1) / 2, 58, x1, 50);
  gomo(48, 34); gomo(34, 20); gomo(20, 6); // os gomos da esquerda
  r.C(5, 32, 24, 10, 47, 8).L(47, 3).Q(47, 1, 50, 1).Q(53, 1, 53, 3).L(53, 8).C(76, 10, 95, 32, 94, 50); // a cúpula e a ponteira
  gomo(94, 80); gomo(80, 66); gomo(66, 52); // os gomos da direita
  r.L(52, 84).arc(41, 84, 11, 0, 180).arc(32, 84, 2, 180, 360).arc(41, 84, 7, 180, 0); // o cabo e o gancho em J
  return { state: 'PE', what: 'sombrinha de frevo', pts: r.pts, start: [48, 68] };
}

/**
 * PB · O balão junino: o topo redondo, o corpo que afina até a boca, a saia da boca e a bucha pendurada embaixo.
 * Simétrico: desenhada a metade da direita, do topo à bucha. Largada no flanco reto do corpo, do lado esquerdo.
 */
function balao(): Art {
  const r = new Pen(50, 4).C(60, 4, 74, 8, 78, 18).C(80, 24, 80, 27, 80, 30).L(80, 46) // o topo e o flanco reto
    .C(80, 56, 70, 62, 63, 68).L(61, 70).L(62, 72).L(62, 76) // afinando até a boca e a saia
    .L(53, 76).L(53, 80).L(58, 80).C(58, 86, 55, 90, 50, 90); // a bucha
  return { state: 'PB', what: 'balão junino', pts: sym(r.pts), start: [20, 38] };
}

/**
 * RN · O cajueiro de Pirangi (o maior do mundo): a copa larga e baixa de tufos e os galhos que descem até o chão em arcos,
 * o tronco grosso no meio. Simétrico: desenhada a metade da direita, do alto da copa ao chão. Largada no tronco, do lado
 * esquerdo. (O caju — fruta em sino e castanha — não se lê numa linha só, docs/PISTAS.md.)
 */
function cajueiro(): Art {
  const r = scallop(new Pen(50, 6), [[50, 20, 14], [66, 20, 12], [80, 26, 11], [91, 36, 9]], -90, 60) // a copa
    .C(99, 52, 98, 66, 95, 80).C(94, 86, 93, 90, 92, 92).L(84, 92) // o galho que desce em arco até o chão
    .C(86, 80, 88, 66, 84, 54).C(82, 48, 76, 46, 68, 46).L(58, 46) // a volta do galho e a face de baixo da copa
    .L(58, 92).L(50, 92); // o tronco
  return { state: 'RN', what: 'cajueiro de Pirangi', pts: sym(r.pts), start: [42, 70] };
}

/**
 * CE · A lua crescente das falésias, pontas para a direita: o dorso é um arco de círculo e o vão, um arco de um círculo
 * deslocado; as pontas são finas e redondas. Uma corda reta no dorso, à esquerda, para a largada.
 */
function lua(): Art {
  const A: [number, number, number] = [50, 50, 45]; const B: [number, number, number] = [76.06, 50, 38.06];
  const at = (c: [number, number, number], a: number): P => [c[0] + c[2] * Math.cos((a * Math.PI) / 180), c[1] + c[2] * Math.sin((a * Math.PI) / 180)];
  const i0 = at(B, 262); const i1 = at(B, 98); const o0 = at(A, 70); const o1 = at(A, 290);
  const r = new Pen(i0[0], i0[1])
    .arc(B[0], B[1], B[2], 262, 98) // o vão (anti-horário na tela: é côncavo)
    .Q(75, 89.5, o0[0], o0[1]) // a ponta de baixo, redonda
    .arc(A[0], A[1], A[2], 70, 170).L(at(A, 190)[0], at(A, 190)[1]).arc(A[0], A[1], A[2], 190, 290) // o dorso, com a corda reta da largada
    .Q(75, 10.5, i0[0], i0[1]); // a ponta de cima
  void i1; void o1;
  return { state: 'CE', what: 'lua crescente', pts: r.pts, start: [5.68, 53] };
}

/**
 * PI · A capivara da Serra da Capivara, de lado, olhando para a direita: o corpo de barril, o focinho largo e rombudo, a
 * orelha pequena e as quatro patinhas curtas. Largada na traseira, reta.
 */
function capivara(): Art {
  const r = new Pen(8, 60).L(8, 40) // a traseira (reta da largada)
    .C(8, 30, 16, 24, 30, 23).C(44, 22, 56, 23, 66, 24) // o lombo
    .C(68, 20, 70, 15, 73, 15).C(76, 15, 77, 20, 77, 24) // a orelha
    .C(84, 24, 92, 27, 96, 34).C(99, 40, 98, 48, 95, 54).C(92, 58, 86, 60, 80, 61).C(76, 62, 74, 64, 73, 68) // a cabeça e o focinho
    .L(73, 84).Q(73, 88, 70, 88).L(66, 88).Q(63, 88, 63, 84).L(63, 72) // a pata da frente, de fora
    .L(59, 72).L(59, 84).Q(59, 88, 56, 88).L(52, 88).Q(49, 88, 49, 84).L(49, 72) // a pata da frente, de dentro
    .C(44, 74, 38, 74, 34, 72) // a barriga
    .L(34, 84).Q(34, 88, 31, 88).L(27, 88).Q(24, 88, 24, 84).L(24, 72) // a pata de trás, de dentro
    .L(20, 72).L(20, 84).Q(20, 88, 17, 88).L(13, 88).Q(10, 88, 10, 84).L(10, 70).C(9, 66, 8, 63, 8, 60); // a pata de trás, de fora
  return { state: 'PI', what: 'capivara', pts: r.pts, start: [8, 50] };
}

// ───────────────────────────── rodada 3 (O1) ─────────────────────────────

/**
 * MA · A cabeça do boi do bumba-meu-boi, de frente: os chifres largos em curva para cima, as orelhas para os lados, a
 * cara que afina até o focinho arredondado. Simétrica: desenhada a metade da direita, da testa ao queixo. Largada na
 * bochecha reta, do lado esquerdo.
 */
function boi(): Art {
  const r = new Pen(50, 30).C(54, 29, 57, 29, 60, 30) // a testa
    .C(64, 26, 68, 16, 77, 8).Q(80, 5, 82, 8).C(80, 16, 76, 26, 71, 33) // o chifre, subindo e virando para dentro
    .C(78, 30, 86, 30, 92, 33).Q(96, 35, 92, 39).C(86, 40, 79, 40, 72, 40) // a orelha
    .L(72, 54) // a bochecha reta (a largada, espelhada)
    .C(72, 62, 68, 70, 64, 80).C(62, 88, 56, 94, 50, 94); // a cara e o focinho
  return { state: 'MA', what: 'cabeça de boi (bumba-meu-boi)', pts: sym(r.pts), start: [28, 51] };
}

/**
 * PA · O Mercado de Ferro do Ver-o-Peso, de frente: o corpo comprido e as quatro torres de ponta cônica (duas nas pontas,
 * duas no meio). Simétrico: desenhada a metade da direita, do meio do telhado ao chão. Largada na parede da esquerda.
 */
function veropeso(): Art {
  const r = new Pen(50, 46).L(56, 46).L(56, 30) // o telhado e a torre do meio
    .C(57, 24, 60, 18, 61.5, 13).Q(62, 11.5, 62.5, 13).C(64, 18, 67, 24, 68, 30) // a ponta cônica
    .L(68, 46).L(82, 46).L(82, 30) // o telhado e a torre da ponta
    .C(83, 22, 86, 14, 88.5, 8).Q(89, 6.5, 89.5, 8).C(92, 14, 95, 22, 96, 30) // a ponta cônica, mais alta
    .L(96, 88).L(50, 88); // a parede e o chão
  return { state: 'PA', what: 'Mercado de Ferro do Ver-o-Peso', pts: sym(r.pts), start: [4, 70] };
}

/**
 * AM · O Teatro Amazonas: a cúpula em sino com a lanterna no alto, o tambor e o prédio largo embaixo. Simétrico:
 * desenhada a metade da direita, da lanterna ao chão. Largada na parede da esquerda.
 */
function teatro(): Art {
  const r = new Pen(50, 2).Q(53, 2, 53, 5).L(53, 13).L(57, 13) // a lanterna
    .C(60, 13, 67, 18, 69, 30).C(70, 38, 70, 44, 74, 48) // a cúpula em sino, que abre embaixo
    .L(76, 48).L(76, 60) // o tambor
    .L(96, 60).L(96, 90).L(50, 90); // o prédio
  return { state: 'AM', what: 'cúpula do Teatro Amazonas', pts: sym(r.pts), start: [4, 76] };
}

/**
 * AP · A planta da Fortaleza de São José de Macapá: o quadrado das muralhas e os quatro baluartes em ponta de flecha
 * (flanco, face, ponta, face, flanco), com as quinas amaciadas. Largada na muralha oeste.
 */
function fortaleza(): Art {
  const pts = softPoly([
    [22, 66], [22, 34], [12, 34], [4, 4, 3], [34, 12], [34, 22], // a muralha oeste e o baluarte noroeste
    [66, 22], [66, 12], [96, 4, 3], [88, 34], [78, 34], // o baluarte nordeste
    [78, 66], [88, 66], [96, 96, 3], [66, 88], [66, 78], // o baluarte sudeste
    [34, 78], [34, 88], [4, 96, 3], [12, 66], // o baluarte sudoeste
  ], 2);
  return { state: 'AP', what: 'Fortaleza de São José', pts, start: [22, 50] };
}

/**
 * RR · O tepui do Monte Roraima: a mesa de topo achatado (borda levemente ondulada), os paredões e o talude largo até a
 * base. Largada no paredão oeste.
 */
function tepui(): Art {
  const r = new Pen(16, 56).L(16, 24).Q(16, 20, 20, 20) // o paredão oeste (reta da largada)
    .C(26, 18, 32, 21, 40, 20).C(48, 19, 54, 22, 62, 20).C(70, 18, 76, 21, 80, 20).Q(84, 20, 84, 24) // o topo
    .L(84, 32).C(84, 42, 85, 50, 86, 56) // o paredão leste
    .C(88, 64, 94, 78, 98, 86).Q(99, 88, 96, 88).L(4, 88).Q(1, 88, 2, 86).C(6, 76, 12, 64, 16, 56); // os taludes e a base
  return { state: 'RR', what: 'tepui (Monte Roraima)', pts: r.pts, start: [16, 42] };
}

/**
 * RO · A maria-fumaça da Madeira-Mamoré, de lado, indo para a direita: a cabine, a caldeira redonda com o domo, a chaminé
 * em funil com a nuvem de fumaça, o limpa-trilhos e as três rodas grandes. Largada na traseira da cabine.
 */
function locomotiva(): Art {
  const r = new Pen(6, 72).L(6, 28).Q(6, 24, 10, 24).L(28, 24).Q(32, 24, 32, 28).L(32, 46) // a cabine
    .L(48, 46).arc(53, 46, 5, 180, 360).L(70, 46) // a caldeira com o domo
    .L(71, 30).L(68, 22) // a chaminé em funil
    .C(62, 22, 58, 16, 62, 12).C(64, 6, 74, 6, 76, 10).C(80, 4, 90, 6, 88, 14).C(90, 18, 86, 22, 82, 22) // a nuvem de fumaça
    .L(79, 30).L(80, 46).L(86, 46).C(90, 46, 92, 50, 92, 56).L(92, 70) // a frente da caldeira
    .L(98, 86).L(88, 86).L(88, 80).Q(88, 78, 86, 78).L(83, 78) // o limpa-trilhos
    .arc(74, 78, 9, 0, 180).L(62, 78).arc(53, 78, 9, 0, 180).L(41, 78).arc(32, 78, 9, 0, 180) // as rodas
    .L(10, 78).Q(6, 78, 6, 75).L(6, 72);
  return { state: 'RO', what: 'locomotiva da Madeira-Mamoré', pts: r.pts, start: [6, 50] };
}

/**
 * AC · A gameleira de Rio Branco (a figueira centenária que dá nome à pista): a copa em nuvem de tufos redondos, o tronco
 * grosso e as raízes abertas com o vão entre elas. Simétrica: desenhada a metade da direita, do alto da copa ao chão.
 * Largada no tronco, do lado esquerdo.
 */
function gameleira(): Art {
  const r = scallop(new Pen(50, 3), [[50, 16, 13], [66, 18, 11], [78, 26, 10], [86, 38, 9], [88, 50, 8]], -90, 90) // a copa
    .C(82, 64, 70, 65, 60, 64).L(60, 84) // a face de baixo da copa e o tronco
    .C(60, 86, 68, 90, 76, 93).Q(79, 94.5, 78, 96).L(68, 96).C(67, 94, 64, 93, 61, 93).C(58, 93, 57, 95, 57, 96).L(50, 96); // a raiz, com o vão
  return { state: 'AC', what: 'gameleira', pts: sym(r.pts), start: [40, 74] };
}

/**
 * TO · O sol da bandeira do Tocantins: o disco com 12 raios de lados paralelos e ponta arredondada. O raio de cima tem o
 * lado esquerdo vertical: é a largada.
 */
function sol(): Art {
  const C: P = [50, 50]; const disc = 25; const w = 4;
  const rad = (a: number) => (a * Math.PI) / 180;
  const delta = (Math.asin(w / disc) * 180) / Math.PI;
  let pen: Pen | null = null;
  for (let k = 0; k < 12; k++) {
    const a = -90 + 30 * k; const tipAt = k % 2 === 0 ? 54 : 40; // compridos e curtos alternados
    const dx = Math.cos(rad(a)); const dy = Math.sin(rad(a)); const nx = Math.sin(rad(a)); const ny = -Math.cos(rad(a)); // a normal da esquerda
    const bl: P = [C[0] + disc * Math.cos(rad(a - delta)), C[1] + disc * Math.sin(rad(a - delta))];
    const tc: P = [C[0] + dx * (tipAt - w), C[1] + dy * (tipAt - w)];
    if (!pen) pen = new Pen(bl[0], bl[1]); else pen.arc(C[0], C[1], disc, a - 30 + delta, a - delta).L(bl[0], bl[1]);
    pen.L(tc[0] + nx * w, tc[1] + ny * w).arc(tc[0], tc[1], w, a + 270, a + 450).L(C[0] + disc * Math.cos(rad(a + delta)), C[1] + disc * Math.sin(rad(a + delta)));
  }
  pen!.arc(C[0], C[1], disc, 240 + delta, 270 - delta);
  return { state: 'TO', what: 'sol do Tocantins', pts: pen!.pts, start: [46, 19.5] };
}

export const ART: Readonly<Record<string, () => Art>> = {
  // rodada 1 (onda K)
  copacabana: cristo,
  sampa_noite: masp,
  pampulha,
  convento_penha: penha,
  floripa: hercilio,
  cuia_gaucha: cuia,
  curitiba: araucaria,
  brasilia: aviao,
  caldas_novas: gota,
  bonito: peixe,
  // rodada 2 (O1)
  transpantaneira: jacare,
  porto_seguro: caravela,
  aracaju: caranguejo,
  maceio: jangada,
  olinda: sombrinha,
  campina_grande: balao,
  cajueiro_pirangi: cajueiro,
  canoa_quebrada: lua,
  serra_capivara: capivara,
  // rodada 3 (O1)
  sao_luis: boi,
  belem: veropeso,
  manaus: teatro,
  macapa: fortaleza,
  monte_roraima: tepui,
  porto_velho: locomotiva,
  rio_branco: gameleira,
  palmas: sol,
};
