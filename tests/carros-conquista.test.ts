// V6c, lote 2: os 4 nacionais novos (Caipora, Pampeiro, Barão à venda; Furgãozinho da Firma por CONQUISTA). Preço e loja, o carro de conquista
// (não se compra, libera com a conquista "Hora de entrega" = 10 vitórias sem comprar nenhum carro), a IA fora do sorteio e o save aditivo.
import { describe, expect, it } from 'vitest';
import { buyCar, newCareer } from '../src/core/career';
import { AI_CAR_POOL, CARS } from '../src/core/data/cars';
import { evaluateAchievements, newTelemetry, openAchievements } from '../src/game/achievements';
import { carAvailable, syncConquestCars } from '../src/game/career-save';
import type { SaveData } from '../src/game/contracts';
import { ACHIEVEMENTS } from '../src/game/desktop';
import { nextGoals } from '../src/game/goals';
import { emptyProgress } from '../src/game/progression';
import { sanitizeSave } from '../src/game/save';
import { setLanguage, t } from '../src/i18n';
import '../src/i18n/core';
import '../src/career/strings';
import '../src/stats/strings';
import { human, quickRace, run, syntheticTrack } from './helpers';

const duo = [human(0), human(1)];

const FOR_SALE = { caipora: 9_000, pampeiro: 13_000, barao: 14_000 } as const;
const fresh = (): SaveData => sanitizeSave({});

describe('os 3 nacionais à venda', () => {
  it('estão na vitrine com o preço certo, no estilo certo, e a lista segue em preço crescente', () => {
    for (const [id, price] of Object.entries(FOR_SALE)) expect(CARS.find((c) => c.id === id)?.price, id).toBe(price);
    expect(CARS.find((c) => c.id === 'barao')?.body).toBe('sedan');
    expect(CARS.find((c) => c.id === 'caipora')?.body).toBe('hatch');
    expect(CARS.find((c) => c.id === 'pampeiro')?.body).toBe('hatch');
    const paid = CARS.filter((c) => c.price > 0).map((c) => c.price);
    expect(paid).toEqual([...paid].sort((a, b) => a - b));
    expect(new Set(paid).size).toBe(paid.length);
  });

  it('só se jogam depois de comprados (trancados em save novo), e a IA não os sorteia', () => {
    const save = fresh();
    for (const id of Object.keys(FOR_SALE)) expect(carAvailable(save, CARS.find((c) => c.id === id)!), id).toBe(false);
    expect(AI_CAR_POOL.map((c) => c.id)).toEqual(['falcao', 'trovao', 'tornado', 'camelo', 'saci', 'tatu', 'boto']);
  });
});

describe('Furgãozinho da Firma: carro de conquista', () => {
  const furgao = () => CARS.find((c) => c.id === 'furgao')!;

  it('é um carro `micro` de conquista "HORA_DE_ENTREGA", que não se compra na Expedição', () => {
    expect(furgao().body).toBe('micro');
    expect(furgao().conquest).toBe('HORA_DE_ENTREGA');
    const career = newCareer([human(0)]);
    career.wallets[0] = 999_999;
    expect(buyCar(career, 0, 'furgao')).not.toBe('ok');
    expect(career.wallets[0]).toBe(999_999);
    expect(career.drivers[0].garage.owned).not.toContain('furgao');
  });

  it('a conquista existe na lista da Steam e tem texto PT e EN', () => {
    expect(ACHIEVEMENTS.map((a) => a.id)).toContain('HORA_DE_ENTREGA');
    for (const lang of ['pt', 'en'] as const) { setLanguage(lang); expect(t('stats.achDesc.HORA_DE_ENTREGA'), lang).not.toBe('stats.achDesc.HORA_DE_ENTREGA'); }
    setLanguage('pt');
  });

  it('libera com a conquista (qualquer modo) e entra na garagem da carreira; sem a conquista, fica trancado', () => {
    const save = fresh();
    expect(carAvailable(save, furgao())).toBe(false);
    save.achievements.push('HORA_DE_ENTREGA');
    expect(carAvailable(save, furgao())).toBe(true);
    save.career = newCareer(duo);
    expect(syncConquestCars(save)).toBe(true);
    for (const d of save.career.drivers) expect(d.garage.owned).toContain('furgao');
    expect(save.carsUnlocked).toContain('furgao');
    expect(syncConquestCars(save)).toBe(false); // idempotente
  });

  it('save antigo abre igual: nenhum id novo no save, e o save com a conquista sobrevive à limpeza', () => {
    const old = sanitizeSave({ carsUnlocked: ['curupira'], achievements: ['PRIMEIRA_VITORIA'] });
    expect(old.carsUnlocked).toEqual(['curupira']);
    const withIt = sanitizeSave({ carsUnlocked: ['furgao'], achievements: ['HORA_DE_ENTREGA'] });
    expect(withIt.carsUnlocked).toEqual(['furgao']);
    expect(withIt.achievements).toContain('HORA_DE_ENTREGA');
  });

  it('o objetivo da Expedição ("junte para comprar") nunca sugere o furgão', () => {
    const career = newCareer([human(0)]);
    career.wallets[0] = 38_000;
    const cheap = { ...furgao(), price: 1 }; // o mais barato da vitrine: seria a meta, se não fosse de conquista
    const g = nextGoals({ career, save: fresh(), cars: [cheap] });
    expect(JSON.stringify(g)).not.toContain('furgao');
  });
});

describe('HORA_DE_ENTREGA: 10 vitórias sem comprar nenhum carro', () => {
  function finished() {
    const { state } = (() => {
      const q = quickRace({ track: syntheticTrack([{ op: 'straight', length: 300 }]), humans: [human(0)], totalCars: 4, laps: 1, seed: 11 });
      run(q.state, q.track, 60 * 240);
      return q;
    })();
    return state;
  }
  const withWins = (wins: number, carsUnlocked: string[] = []): SaveData => {
    const s = fresh();
    s.stats.totals.wins = wins; s.stats.players = [{ ...s.stats.totals, name: 'P1' }];
    s.carsUnlocked = carsUnlocked;
    return s;
  };
  const ids = (save: SaveData) => { const st = finished(); return evaluateAchievements(save, 'quick', st, st.results ?? [], st.config.humans, newTelemetry(), false, null, 'profissional', null, []); };

  it('10 vitórias e nenhum carro comprado: sai; 9, ou 10 com um carro comprado: não', () => {
    expect(ids(withWins(10))).toContain('HORA_DE_ENTREGA');
    expect(ids(withWins(9))).not.toContain('HORA_DE_ENTREGA');
    expect(ids(withWins(10, ['curupira']))).not.toContain('HORA_DE_ENTREGA');
  });

  it('o furgão já liberado não conta como "carro comprado" (nem como CARRO_NOVO / COLECIONADOR)', () => {
    const save = withWins(10, ['furgao']);
    const got = ids(save);
    expect(got).not.toContain('CARRO_NOVO');
    expect(got).not.toContain('COLECIONADOR');
    const all = CARS.filter((c) => c.price > 0 && !c.conquest).map((c) => c.id);
    expect(ids(withWins(0, all))).toContain('COLECIONADOR'); // todos os À VENDA bastam, sem o de conquista
  });

  it('na abertura do jogo: quem já tem 10 vitórias e nunca comprou ganha a conquista', () => {
    expect(openAchievements(withWins(10), emptyProgress())).toContain('HORA_DE_ENTREGA');
    expect(openAchievements(withWins(3), emptyProgress())).not.toContain('HORA_DE_ENTREGA');
  });
});
