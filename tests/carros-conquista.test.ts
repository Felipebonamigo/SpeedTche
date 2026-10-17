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
import { lockText } from '../src/ui/screens/progress';
import '../src/progress/strings';
import { setLanguage, t } from '../src/i18n';
import '../src/i18n/core';
import '../src/career/strings';
import '../src/stats/strings';
import { human, quickRace, run, syntheticTrack } from './helpers';
import type { ProgressNews } from '../src/game/progression';
import { MASTERY_XP } from '../src/game/progression';

const duo = [human(0), human(1)];

const FOR_SALE = {
  caipora: 9_000, pampeiro: 13_000, barao: 14_000,
  jabuti: 7_000, lambari: 9_500, besouro: 10_000, paodeforma: 18_000, trilheiro: 22_500, // lote 3 (preços únicos: o Lambari 9,5 e o Trilheiro 22,5 fogem do Caipora e do Pororoca)
} as const;
const fresh = (): SaveData => sanitizeSave({});

describe('os 8 nacionais à venda', () => {
  it('estão na vitrine com o preço certo, no estilo certo, e a lista segue em preço crescente', () => {
    for (const [id, price] of Object.entries(FOR_SALE)) expect(CARS.find((c) => c.id === id)?.price, id).toBe(price);
    expect(CARS.find((c) => c.id === 'barao')?.body).toBe('sedan');
    expect(CARS.find((c) => c.id === 'besouro')?.body).toBe('classic');
    expect(CARS.find((c) => c.id === 'lambari')?.body).toBe('classic');
    expect(CARS.find((c) => c.id === 'jabuti')?.body).toBe('micro');
    expect(CARS.find((c) => c.id === 'paodeforma')?.body).toBe('pickup');
    expect(CARS.find((c) => c.id === 'trilheiro')?.body).toBe('pickup');
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


describe('o cadeado dos carros de conquista diz a conquista de cada um', () => {
  it('Furgão: "Hora de entrega"; Gaúcho: "Cavalo de aço"; PT e EN; o carro à venda segue com o preço', () => {
    const car = (id: string) => CARS.find((c) => c.id === id)!;
    for (const lang of ['pt', 'en'] as const) {
      setLanguage(lang);
      expect(lockText(car('furgao')), lang).toMatch(lang === 'pt' ? /Hora de entrega/ : /Delivery Time/);
      expect(lockText(car('gaucho')), lang).toMatch(lang === 'pt' ? /Cavalo de aço/ : /Iron Horse/);
    }
    setLanguage('pt');
    expect(lockText(car('jabuti'))).toContain('7.000');
  });
});

describe('Gaúcho V8: carro de conquista "Cavalo de aço" (Maestria 3 com o Trovão V12)', () => {
  const gaucho = () => CARS.find((c) => c.id === 'gaucho')!;
  const news = (carId: string, after: number): ProgressNews[] => [{ seat: 0, name: 'P1', carId, xp: 50, pilotXp: 0, level: { before: 1, after: 1 }, carXp: 0, mastery: { before: 0, after }, unlocks: [] }];
  function finished() {
    const q = quickRace({ track: syntheticTrack([{ op: 'straight', length: 300 }]), humans: [human(0)], totalCars: 4, laps: 1, seed: 11 });
    run(q.state, q.track, 60 * 240);
    return q.state;
  }
  const ids = (progress: ProgressNews[]) => { const st = finished(); return evaluateAchievements(fresh(), 'quick', st, st.results ?? [], st.config.humans, newTelemetry(), false, null, 'profissional', null, progress); };

  it('é um carro `muscle` de conquista, fora da loja, e a conquista está na Steam com texto PT e EN', () => {
    expect(gaucho().body).toBe('muscle');
    expect(gaucho().conquest).toBe('CAVALO_DE_ACO');
    expect(CARS.filter((c) => c.conquest).map((c) => c.id).sort()).toEqual(['furgao', 'gaucho']);
    expect(ACHIEVEMENTS.map((a) => a.id)).toContain('CAVALO_DE_ACO');
    for (const lang of ['pt', 'en'] as const) { setLanguage(lang); expect(t('stats.achDesc.CAVALO_DE_ACO'), lang).not.toBe('stats.achDesc.CAVALO_DE_ACO'); }
    setLanguage('pt');
    const career = newCareer([human(0)]);
    career.wallets[0] = 999_999;
    expect(buyCar(career, 0, 'gaucho')).not.toBe('ok');
  });

  it('a regra: chegar à Maestria 3 com o Trovão V12 (o V8 do jogo); outro carro ou Maestria 2 não vale', () => {
    expect(ids(news('trovao', 3))).toContain('CAVALO_DE_ACO');
    expect(ids(news('trovao', 5))).toContain('CAVALO_DE_ACO');
    expect(ids(news('trovao', 2))).not.toContain('CAVALO_DE_ACO');
    expect(ids(news('falcao', 5))).not.toContain('CAVALO_DE_ACO');
    expect(ids([])).not.toContain('CAVALO_DE_ACO');
  });

  it('na abertura: quem já tem XP de Maestria 3 no Trovão ganha; libera o carro (corrida avulsa e garagem)', () => {
    const progress = { profiles: [{ name: 'P1', cars: { trovao: MASTERY_XP[2] } }] };
    expect(openAchievements(fresh(), progress)).toContain('CAVALO_DE_ACO');
    expect(openAchievements(fresh(), { profiles: [{ name: 'P1', cars: { trovao: MASTERY_XP[2] - 1 } }] })).not.toContain('CAVALO_DE_ACO');
    const save = fresh();
    expect(carAvailable(save, gaucho())).toBe(false);
    save.achievements.push('CAVALO_DE_ACO');
    save.career = newCareer(duo);
    expect(syncConquestCars(save)).toBe(true);
    expect(carAvailable(save, gaucho())).toBe(true);
    for (const d of save.career.drivers) expect(d.garage.owned).toContain('gaucho');
  });

  it('o carro de conquista liberado não vira CARRO_NOVO nem entra em HORA_DE_ENTREGA como compra', () => {
    const save = withBought(['gaucho']);
    expect(openAchievements(save, emptyProgress())).not.toContain('CARRO_NOVO');
  });
});
function withBought(list: string[]): SaveData { const sv = fresh(); sv.carsUnlocked = list; return sv; }
