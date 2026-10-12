// Tela Pagamento (onda N, N4; docs/ondas/N/N4.md §4.3): o dinheiro que a corrida da carreira rendeu, contado na tela. Uma coluna por
// piloto (posição, prêmio ou ajuda de custo e, no versus, a carteira dele), a coluna da equipe e a linha do cofre no co-op, a moeda que
// cai do prêmio na carteira e o "Já dá para: Turbo nível 2!". Só MOSTRA: os números são os que `settleCareerRace` já creditou
// (`payout-model.ts`); nada aqui muda dinheiro, carteira ou relatório. O relógio é o do pós-corrida (`post-race.ts`), o mesmo do
// resultado que abre esta tela; reduzir efeitos tira as moedas e o clarão e deixa só o número.
import { seatColor } from '../../core/data/drivers';
import { createHoldSkip, guardConfirm, sequenceFor, type PostRace } from '../../game/post-race';
import { payoutFrame, payoutModel, payoutTimeline, type PayoutBuy, type PayoutFrame, type PayoutModel, type PayoutTimeline } from '../../game/payout-model';
import type { ResultsScreenData } from '../../game/contracts';
import '../../career/strings';
import { t } from '../../i18n';
import './payout.css';
import { button, createFocusList, h, listNav, screenFrame, trackName, type FocusItem, type ScreenApi, type ScreenData, type ScreenInstance } from './common';
import { formatMoney } from './garage';
import { medal } from './icons';
import { profileKey } from '../../game/stats';
import { portrait, type Face } from '../art/portraits';
import { goalLabel, starsRow } from './star-widgets';
import { gamepadAHeld, postRacePlan, standingsButton, titleRow } from './results';

/** O tique da contagem não toca mais que isto por segundo (a contagem muda a cada quadro). */
const COUNT_TICK_GAP = 0.07;
/** A carteira "salta" por tanto tempo quando uma moeda cai nela. */
const BUMP_SECONDS = 0.14;

/** O texto de "Já dá para" de um item: a peça no nível que a compra leva, ou o nome do carro. */
function buyItem(api: ScreenApi, buy: PayoutBuy): string {
  if (buy.kind === 'car') return api.ctx.cars.find((c) => c.id === buy.carId)?.name ?? buy.carId;
  return t('career.payout.partLevel', { part: t(`career.garage.part.${buy.part}`), level: buy.level ?? 1 });
}

export function payoutScreen(api: ScreenApi, data?: ScreenData): ScreenInstance {
  const d = data as ResultsScreenData | undefined;
  const career = api.ctx.save.career;
  const report = career?.lastReport ?? null;
  if (!d || !('results' in d) || !career || !report) {
    // Sem corrida de carreira para pagar (não deveria chegar aqui): um caminho de volta, como as outras telas vazias.
    const back = button(t('ui.results.menu'), () => api.emit({ type: 'toMain' }));
    const list = createFocusList([back], { sfx: api.sfx });
    return { el: screenFrame('payout', t('career.payout.title'), h('div', { class: 'actions' }, back.el)), nav: (nav) => listNav(list, nav, api.sfx) };
  }

  const reduce = api.ctx.settings.reduceEffects;
  const model: PayoutModel = payoutModel(career, report);
  const timeline: PayoutTimeline = payoutTimeline(model, reduce);
  // O mesmo relógio do resultado; chamada direto (pelo teste de layout, por exemplo), nasce já no passo do pagamento.
  const post: PostRace = sequenceFor(d, () => postRacePlan(api, d));
  post.enterStep('payout');

  // O4: o que as estrelas gravaram para ESTA corrida (por nome do perfil); de outra pista, é de uma corrida velha e não entra.
  const starsOf = (name: string) => api.ctx.save.stars.last.find((l) => l.trackId === d.trackDef.id && profileKey(l.name) === profileKey(name));
  const palette = api.ctx.settings.colorPalette;
  const carName = (id: string) => api.ctx.cars.find((c) => c.id === id)?.name ?? id;

  // ───── DOM ─────
  const prizeEls: HTMLElement[] = [];
  const walletEls: HTMLElement[] = [];
  const colEls: HTMLElement[] = [];
  const columns = model.columns.map((c, i) => {
    const prizeVal = h('b', { class: 'pc-prize-val mono', text: '' });
    prizeEls.push(prizeVal);
    const stars = starsOf(c.name);
    const lines: Array<HTMLElement | null> = [
      h('div', { class: 'pc-head' },
        h('i', { class: 'seat-dot', style: `--seat:${seatColor(c.driver, palette)}` }),
        h('strong', { class: 'pc-name', text: c.name })),
      h('small', { class: 'pc-car muted', text: carName(c.carId) }),
      // As estrelas na mesma linha da posição: a coluna não ganha altura (o Pagamento de 4 pilotos é a tela mais alta).
      h('div', { class: 'pc-pos' }, medal(c.position), h('span', { text: t('career.payout.position', { pos: c.position }) }),
        stars ? h('span', { class: 'pc-stars' }, starsRow(stars.got, { fresh: stars.got & ~stars.was, calm: reduce })) : null),
      h('div', { class: 'pc-line' }, h('span', { class: 'pc-label', text: t(c.kind === 'allowance' ? 'career.payout.allowance' : 'career.payout.prize') }), prizeVal),
    ];
    if (c.wallet) {
      const walletVal = h('b', { class: 'pc-wallet-val mono', text: '' });
      walletEls[i] = walletVal;
      lines.push(h('div', { class: 'pc-wallet' }, h('span', { class: 'pc-label', text: t('career.payout.wallet') }), walletVal));
    }
    const col = h('div', { class: 'payout-col glass', style: `--seat:${seatColor(c.driver, palette)}` }, lines);
    colEls.push(col);
    return col;
  });

  let teamVal: HTMLElement | null = null;
  if (model.team) {
    teamVal = h('b', { class: 'pc-prize-val pc-team-val mono', text: '' });
    columns.push(h('div', { class: 'payout-col team glass' },
      h('div', { class: 'pc-head' }, h('strong', { class: 'pc-name', text: t('career.payout.team') })),
      h('small', { class: 'pc-car muted', text: t('career.payout.teamRank', { rank: model.team.rank }) }),
      h('div', { class: 'pc-pos' }, medal(model.team.rank), h('span', { text: t('career.payout.position', { pos: model.team.rank }) })),
      h('div', { class: 'pc-line' }, h('span', { class: 'pc-label', text: t('career.payout.teamBonus') }), teamVal),
    ));
  }

  let vaultVal: HTMLElement | null = null;
  const vaultEl = model.vault
    ? h('div', { class: 'payout-vault glass' },
      h('span', { class: 'pc-label', text: t('career.payout.vault') }),
      (vaultVal = h('b', { class: 'pv-val mono', text: '' })))
    : null;
  if (vaultVal) walletEls[0] = vaultVal;

  // O objetivo da pista e o rival com a cara do duelo (perdeu se algum humano o venceu; senão venceu).
  const earned = model.columns.map((c) => starsOf(c.name)).filter((l): l is NonNullable<typeof l> => l !== undefined);
  const rivalName = earned.find((l) => l.rival)?.rival ?? null;
  const rivalFace: Face = earned.some((l) => l.duel === 'win') ? 'lose' : 'win';
  const goalEl = earned.length > 0
    ? h('div', { class: 'payout-goal glass' },
      rivalName ? h('span', { class: 'rival-face', attrs: { 'data-face': rivalFace } }, portrait(rivalName, rivalFace, 28)) : null,
      h('span', { class: 'payout-goal-text', text: t('stars.goalLine', { goal: goalLabel(d.trackDef.id) }) }))
    : null;

  const buyText = h('span', { class: 'payout-buy-text', text: '' });
  const buyEl = h('div', { class: 'payout-buy' }, buyText);
  const hint = h('p', { class: 'hint payout-skip', text: t('career.payout.skip') });
  const coinLayer = h('div', { class: 'payout-coins', attrs: { 'aria-hidden': 'true' } });
  const coinEls = timeline.coins.map(() => coinLayer.appendChild(h('span', { class: 'payout-coin' })));

  const items: FocusItem[] = [];
  const next = standingsButton(api, d);
  items.push(next ?? button(t('ui.results.menu'), () => api.emit({ type: 'toMain' }), 'btn-primary'));
  const list = createFocusList(items, { sfx: api.sfx });

  const board = h('div', { class: 'payout-board' },
    h('div', { class: 'payout-cols', style: `--n:${columns.length}` }, columns),
    vaultEl,
    goalEl,
    buyEl,
  );
  const verdict = model.eliminated ? h('div', { class: 'verdict bad', text: t('career.payout.eliminated') }) : null;
  const el = screenFrame('payout', null,
    titleRow(t('career.payout.title'), trackName(d.trackDef.id, d.trackDef.name)),
    h('div', { class: 'results-head' }, verdict),
    board,
    hint,
    h('div', { class: 'actions' }, items.map((i) => i.el)),
    coinLayer,
  );
  hint.addEventListener('click', () => { skipAll(); });

  // ───── Quadro ─────
  let lastLanded = 0;
  let lastBuy = false;
  /** O instante (do relógio do passo) do último tique da contagem. */
  let lastTick = -1;
  let lastText = '';
  let bump = 0;
  let geometry: Array<{ sx: number; sy: number; tx: number; ty: number }> | null = null;
  const hold = createHoldSkip();

  /** Onde o relógio está dentro do passo: 0 antes de começar, a duração depois de pronto. */
  const clock = () => (post.step === 'payout' ? post.stepTime : post.ready ? timeline.duration : 0);

  function centerOf(node: HTMLElement | null, layer: DOMRect): { x: number; y: number } {
    const r = node?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2 - layer.left, y: r.top + r.height / 2 - layer.top } : { x: 0, y: 0 };
  }

  function measureCoins(): void {
    const layer = coinLayer.getBoundingClientRect();
    geometry = timeline.coins.map((c) => {
      const from = centerOf(c.source < 0 ? teamVal : prizeEls[c.source] ?? null, layer);
      const to = centerOf(walletEls[c.target] ?? null, layer);
      return { sx: from.x, sy: from.y, tx: to.x, ty: to.y };
    });
  }

  function show(f: PayoutFrame, now: number, quiet: boolean): void {
    let signature = '';
    model.columns.forEach((c, i) => {
      const v = `+${formatMoney(f.rows[i])}`;
      signature += v;
      if (prizeEls[i].textContent !== v) prizeEls[i].textContent = v;
    });
    if (teamVal) { const v = `+${formatMoney(f.team)}`; signature += v; if (teamVal.textContent !== v) teamVal.textContent = v; }
    f.wallets.forEach((w, i) => {
      const v = formatMoney(w);
      signature += v;
      const node = walletEls[i];
      if (node && node.textContent !== v) node.textContent = v;
    });
    // O tique acompanha o número que muda.
    if (!quiet && signature !== lastText && now - lastTick >= COUNT_TICK_GAP) { api.sfx('count'); lastTick = now; }
    lastText = signature;
    // A moeda que pousa.
    if (!reduce && !quiet && f.landed > lastLanded) { api.sfx('coin'); bump = BUMP_SECONDS; }
    lastLanded = f.landed;
    // As moedas em voo (cada uma de uma vez só: as que pousaram ou não saíram ficam escondidas).
    if (!reduce) {
      const flyingNow = new Set<number>();
      if (f.flying.length > 0 && !geometry) measureCoins();
      for (const fl of f.flying) {
        flyingNow.add(fl.coin);
        const g = geometry?.[fl.coin];
        const node = coinEls[fl.coin];
        if (!g || !node) continue;
        const p = fl.progress;
        const x = g.sx + (g.tx - g.sx) * p;
        const y = g.sy + (g.ty - g.sy) * p * p - 46 * Math.sin(Math.PI * p) * (1 - p);
        node.style.opacity = '1';
        node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      }
      coinEls.forEach((node, i) => { if (!flyingNow.has(i)) node.style.opacity = '0'; });
    }
    // "Já dá para".
    if (f.buy !== lastBuy) {
      lastBuy = f.buy;
      buyEl.classList.toggle('on', f.buy);
      // O item mais caro entre os que o dinheiro novo passou a comprar (no versus, cada carteira tem o seu).
      const options = (model.vault ? [model.vault.canBuy] : model.columns.map((c) => c.wallet?.canBuy ?? null)).filter((b): b is PayoutBuy => b !== null);
      const owner = options.reduce<PayoutBuy | null>((best, b) => (!best || b.price > best.price ? b : best), null);
      if (f.buy && owner) {
        const withName = model.columns.length > 1;
        const item = buyItem(api, owner);
        buyText.textContent = withName
          ? t('career.payout.canBuyWho', { item, name: model.columns.find((c) => c.driver === owner.driver)?.name ?? '' })
          : t('career.payout.canBuy', { item });
        if (!quiet) api.sfx('chime');
      }
    }
    buyEl.style.setProperty('--flash', f.flash.toFixed(3));
  }

  function renderNow(quiet: boolean): void {
    const now = clock();
    const f = payoutFrame(timeline, model, now);
    show(f, now, quiet);
    const done = post.ready;
    el.setAttribute('data-post-ready', done ? '1' : '0');
    el.setAttribute('data-post-elapsed', post.elapsed.toFixed(2));
    el.setAttribute('data-post-skipped', post.skipped ? '1' : '0');
    hint.classList.toggle('done', done);
    for (const i of items) i.el.classList.toggle('pending', !done);
  }

  function skipAll(): void {
    if (post.ready) return;
    post.skip();
    renderNow(true);
  }

  renderNow(true);

  return {
    el,
    nav(nav) {
      // Enter segurado (a repetição do teclado vira `start`) e o Start do controle pulam; o confirmar solto, com a contagem andando, é engolido.
      if (nav.start && !post.ready) { skipAll(); return; }
      const guarded = nav.confirm && !guardConfirm(post);
      listNav(list, guarded ? { ...nav, confirm: false } : nav, api.sfx, () => { post.skip(); api.back(); });
    },
    update(dt) {
      if (!el.isConnected) return;
      if (!post.ready) {
        if (hold.observe(dt, gamepadAHeld(api))) { skipAll(); return; }
        post.advance(dt);
      }
      if (bump > 0) bump = Math.max(0, bump - dt);
      for (const w of walletEls) w?.classList.toggle('bump', !reduce && bump > 0);
      renderNow(false);
    },
  };
}
