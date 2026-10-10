// O caminho do visual do carro (docs/CARROS.md "Pintura", docs/ondas/N/N3.md): a escolha de cada assento para cada carro (guardada no
// save como `seatLooks`) e o visual de cada carro na pista. A paleta e o catálogo moram em cosmetics.ts (aqui são reexportados: quem
// importava a paleta daqui continua importando). Só aparência: o look vai no HumanEntry da sessão e do online, mas NUNCA na RaceConfig nem
// no estado da corrida — `withoutLook` o tira antes de `createRace`, e o renderizador o recebe pronto em `RenderFrame.looks` (raceLooks)
// e, para o Retrô e para quem só quer as cores, em `RenderFrame.paints` (racePaints). Sem DOM nem Three: os testes usam direto.
import { carDef } from '../core/data/cars';
import type { CarDef, CarLook, CarState, HumanEntry } from '../core/types';
import type { CarColors, SaveData } from './contracts';
import {
  factoryColors, isPaintId, lookColors, nextPaint, normalizeLook, ORIGINAL_PAINT, paintColors, sanitizeLook, SEAT_SLOTS,
} from './cosmetics';

export {
  isPaintId, nextPaint, ORIGINAL_PAINT, PAINT_IDS, PAINTS, paintColors, type PaintDef,
} from './cosmetics';

/** O carro com a pintura aplicada, para os desenhos dos menus (silhuetas). A Original devolve o próprio carro. Aceita o id da paleta ou o look inteiro. */
export function paintedCar<T extends Pick<CarDef, 'color' | 'accent'>>(car: T, paint: string | CarLook | null | undefined): T {
  const c = typeof paint === 'string' || paint == null ? paintColors(paint) : lookColors(paint, factoryColors(car));
  return c ? { ...car, color: c.color, accent: c.accent } : car;
}

/**
 * `base` com o look, só quando ele não é o de fábrica: quem não personalizou manda a mesma mensagem/save de antes (como `withAssist`
 * em net/protocol.ts). Confia no que recebe (quem lê de fora usa `sanitizeLook`/`parseLook`), mas o põe na forma canônica.
 */
export function withLook<T extends { carId?: string }>(base: T, look: CarLook | null | undefined): T & { look?: CarLook } {
  const { look: _drop, ...rest } = base as T & { look?: CarLook };
  const canon = normalizeLook(look, base.carId);
  return canon ? { ...(rest as T), look: canon } : (rest as T);
}

/** Cópias sem o look: os humanos que entram na RaceConfig (o estado da corrida não carrega cosmético). */
export function withoutLook<T extends { look?: CarLook }>(list: readonly T[]): T[] {
  return list.map((h) => {
    const { look: _drop, ...rest } = h;
    return rest as T;
  });
}

// ───────────────────────────── Save: por assento e por carro ─────────────────────────────

/** O look que o assento escolheu para o carro (null = o de fábrica). */
export function seatLook(save: Pick<SaveData, 'seatLooks'>, seat: number, carId: string): CarLook | null {
  const m = save.seatLooks[seat];
  return m && Object.hasOwn(m, carId) ? sanitizeLook(m[carId], carId) : null;
}

/**
 * Grava o look do assento para o carro. Troca os objetos em vez de mexer neles (o save padrão é compartilhado); o look de fábrica sai
 * do mapa, então só quem personalizou ocupa o save.
 */
export function setSeatLook(save: Pick<SaveData, 'seatLooks'>, seat: number, carId: string, look: CarLook | null): void {
  if (seat < 0 || seat >= SEAT_SLOTS) return;
  const lists = Array.from({ length: SEAT_SLOTS }, (_, i) => save.seatLooks[i] ?? {});
  const { [carId]: _old, ...rest } = lists[seat];
  const canon = sanitizeLook(look, carId);
  lists[seat] = canon ? { ...rest, [carId]: canon } : rest;
  save.seatLooks = lists;
}

/** A pintura (id da paleta) do look que o assento escolheu para o carro; a Original quando não pintou. */
export function seatPaint(save: Pick<SaveData, 'seatLooks'>, seat: number, carId: string): string {
  return seatLook(save, seat, carId)?.paint ?? ORIGINAL_PAINT;
}

/** Troca só a pintura da paleta do look do assento (acabamento, roda, faixa… ficam como estão). */
export function setSeatPaint(save: Pick<SaveData, 'seatLooks'>, seat: number, carId: string, id: string): void {
  setSeatLook(save, seat, carId, { ...seatLook(save, seat, carId), paint: isPaintId(id) ? id : ORIGINAL_PAINT });
}

/** ←/→ na linha "Pintura": a próxima (ou a anterior) da paleta, já gravada para o assento e o carro. Devolve a nova. */
export function stepSeatPaint(save: Pick<SaveData, 'seatLooks'>, seat: number, carId: string, dir: -1 | 1): string {
  const id = nextPaint(seatPaint(save, seat, carId), dir);
  setSeatPaint(save, seat, carId, id);
  return id;
}

/** Humanos montados do save (carreira, tutorial): cada um com o look que o assento dele guardou para o carro. */
export function looksFromSave(humans: readonly HumanEntry[], save: Pick<SaveData, 'seatLooks'>): HumanEntry[] {
  return humans.map((h) => withLook(h, seatLook(save, h.seat, h.carId)));
}

// ───────────────────────────── Na pista ─────────────────────────────

/**
 * O que se VÊ de um look para decidir se dois carros se confundem: pintura, cores livres, faixa e acabamento (a roda, o aro e a chama
 * são detalhe pequeno). A faixa conta (N3): dois com a mesma pintura e faixas diferentes já se distinguem.
 */
function identity(look: CarLook | null): string {
  return [look?.paint ?? ORIGINAL_PAINT, look?.color ?? '', look?.accent ?? '', look?.stripe ?? '', look?.finish ?? ''].join('|');
}

/** O mesmo look com outra pintura da paleta e SEM as cores livres (senão a troca não apareceria). */
function repainted(look: CarLook | null, paint: string): CarLook | null {
  const { color: _c, accent: _a, ...rest } = look ?? {};
  return normalizeLook({ ...rest, paint });
}

/**
 * O look de cada carro da corrida (índice = `cars`): a IA e o VIP da escolta de fábrica (null); cada humano com o dele (o do HumanEntry
 * do assento que larga com o carro — no revezamento, o primeiro da dupla). Dois humanos com o mesmo carro e a mesma identidade visual
 * (pintura, cores livres, faixa e acabamento) sairiam iguais: o de assento maior ganha, só nesta corrida, a próxima pintura da paleta que
 * ninguém com aquele carro escolheu (e perde as cores livres). Pura e só da largada: no online todo computador chega à mesma lista.
 */
export function raceLooks(cars: ReadonlyArray<Pick<CarState, 'seat' | 'carId'>>, humans: readonly HumanEntry[]): Array<CarLook | null> {
  const out: Array<CarLook | null> = cars.map(() => null);
  const drivers = cars
    .map((c, index) => ({ index, seat: c.seat, carId: c.carId }))
    .filter((d) => d.seat >= 0)
    .sort((a, b) => a.seat - b.seat);
  const chosen = drivers.map((d) => sanitizeLook(humans.find((h) => h.seat === d.seat)?.look, d.carId));
  const given = new Map<string, Set<string>>(); // carro → identidades já na pista (só render; o núcleo não vê)
  drivers.forEach((d, k) => {
    const taken = given.get(d.carId) ?? new Set<string>();
    let look = chosen[k];
    if (taken.has(identity(look))) {
      // Reserva as escolhas de propósito dos outros com o mesmo carro: a troca não toma o visual de ninguém.
      const reserved = new Set(drivers.flatMap((o, j) => (o.carId === d.carId ? [identity(chosen[j])] : [])));
      const start = look?.paint ?? ORIGINAL_PAINT;
      let next = nextPaint(start, 1);
      let candidate = repainted(look, next);
      while ((taken.has(identity(candidate)) || reserved.has(identity(candidate))) && next !== start) {
        next = nextPaint(next, 1);
        candidate = repainted(look, next);
      }
      look = candidate;
    }
    taken.add(identity(look));
    given.set(d.carId, taken);
    out[d.index] = look;
  });
  return out;
}

/** O look de cada carro reduzido às cores (o par pintura + detalhe que o Retrô e `RenderFrame.paints` usam); null = as de fábrica. */
export function paintsOfLooks(cars: ReadonlyArray<Pick<CarState, 'carId'>>, looks: ReadonlyArray<CarLook | null>): Array<CarColors | null> {
  return cars.map((c, i) => lookColors(looks[i], factoryColors(carDef(c.carId))));
}

/** O visual de cada carro da largada e as cores dele, de uma vez (o que a sessão guarda e manda no `RenderFrame`). */
export function raceVisuals(cars: ReadonlyArray<Pick<CarState, 'seat' | 'carId'>>, humans: readonly HumanEntry[]): { looks: Array<CarLook | null>; paints: Array<CarColors | null> } {
  const looks = raceLooks(cars, humans);
  return { looks, paints: paintsOfLooks(cars, looks) };
}

/** A pintura (cores) de cada carro: o que `raceLooks` decidiu, reduzido ao par de cores. Mantida para o Retrô, o bench e quem só lê cores. */
export function racePaints(cars: ReadonlyArray<Pick<CarState, 'seat' | 'carId'>>, humans: readonly HumanEntry[]): Array<CarColors | null> {
  return paintsOfLooks(cars, raceLooks(cars, humans));
}
