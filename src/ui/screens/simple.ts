// Telas simples: título, menu principal, pausa, créditos e carregando.
import '../../career/strings';
import '../../dealership/strings';
import type { DeviceId, MenuScreen, RaceMode } from '../../game/contracts';
import { t } from '../../i18n';
import '../../net/strings';
import '../../party/strings';
import '../fonts.css';
import '../../expedition/strings';
import { expeditionRoute, savedFreeCup } from '../../game/expedition';
import { logoClassicoMarkup, logoMarkup, type LogoSize } from '../logo';
import { TEMA_PADRAO } from '../temas/tema';
import '../passport/strings';
import { button, createFocusList, h, listNav, screenFrame, type FocusItem, type ScreenApi, type ScreenInstance } from './common';
import { goalsFor, goalsPanel, recapPanel } from './home-panels';
import { startCursor } from './lobby';
import { shouldOfferTutorial, tutorialOfferCard } from './tutorial';

/** O logo (ui/logo.ts): SVG inline. O do tema padrão; com ?tema=classico (sem o atributo), o provisório antigo, até a próxima versão. */
function logo(size: LogoSize): HTMLElement {
  const wrap = h('div', { class: `logo-wrap logo-wrap-${size}` });
  const classico = typeof document !== 'undefined' && document.documentElement?.getAttribute?.('data-tema') !== TEMA_PADRAO;
  wrap.innerHTML = classico ? logoClassicoMarkup(size) : logoMarkup(size); // marcação constante nossa (logo.ts), nunca dado do usuário
  return wrap;
}

export function titleScreen(api: ScreenApi): ScreenInstance {
  const enter = () => { api.sfx('confirm'); api.go('main'); };
  const el = screenFrame('title', null,
    h('div', { class: 'title-center' },
      logo('big'),
      h('p', { class: 'title-sub', text: t('ui.title.subtitle') }),
    ),
    h('p', { class: 'title-press pulse', text: t('ui.title.press') }),
    h('p', { class: 'title-foot', text: t('ui.title.foot') }),
  );
  el.addEventListener('click', enter);
  return {
    el,
    nav(nav) {
      if (nav.confirm || nav.start) enter();
    },
  };
}

/**
 * Entra num modo de corrida a partir de um menu: sorteia o lobby novo e, se o P1 ainda não tem dispositivo, senta o P1 com o que
 * está confirmando agora. Compartilhada pelo menu principal e por "Jogar livre".
 */
function enterMode(api: ScreenApi, device: DeviceId | null, m: RaceMode, resume = false): void {
  api.lobby.mode = m;
  api.lobby.resume = resume;
  // Lobby novo: quem continua sentado desde a última corrida volta como "não pronto" (senão
  // um Enter distraído no menu já cairia em INICIAR).
  for (const seat of api.lobby.seats) if (seat) { seat.ready = false; seat.cursor = startCursor(api.lobby); }
  // Enter ou A num modo já senta o P1 com esse dispositivo (com o sofá vazio; quem já está sentado fica).
  const input = api.ctx.input;
  if (device && [0, 1, 2, 3].every((i) => input.seatDevice(i) === null)) input.bindSeat(0, device);
  api.go('lobby');
}

interface HomeEntry { label: string; hint: string; run: () => void; cls?: string; badge?: string }

/**
 * O menu principal (onda N, N5): cinco cartões (Expedição, Jogar junto, Jogar livre, Garagem, Passaporte) e, num canto, o resto
 * (Recordes, Como jogar, Opções, Controles, Créditos e, no Electron, Sair). A ordem do foco é a do DOM: cartões, canto, e por
 * último o cartão "Primeira vez?". Desenho: docs/ondas/N/N5.md §4.3.
 */
export function mainScreen(api: ScreenApi): ScreenInstance {
  /** Dispositivo da tecla ou botão que está confirmando agora (só dentro do nav: o clique do mouse não senta ninguém). */
  let lastDevice: DeviceId | null = null;
  const mode = (m: RaceMode, resume = false) => () => enterMode(api, lastDevice, m, resume);
  const open = (s: MenuScreen) => () => api.go(s);
  const { save } = api.ctx;
  const route = expeditionRoute(save);
  const freeCup = savedFreeCup(save);
  const cupText = (id: string) => t(`core.cup.${id}`);
  const expeditionHint = route.kind === 'new'
    ? t('expedition.card.expedition.hint.new')
    : route.completed
      ? t('expedition.card.expedition.hint.done')
      : t('expedition.card.expedition.hint.continue', {
        cup: cupText(save.career?.cupId ?? ''), n: Math.min((save.career?.champ?.raceIndex ?? 0) + 1, api.ctx.cups.find((c) => c.id === save.career?.cupId)?.trackIds.length ?? 1),
        m: api.ctx.cups.find((c) => c.id === save.career?.cupId)?.trackIds.length ?? 1,
      });
  const cards: HomeEntry[] = [
    // Expedição nova: lobby direto. Em andamento: CONTINUA direto (um Enter até o lobby de religar os controles, como o antigo "Continuar" da copa).
    // Concluída: o resumo, de onde se começa outra. O resumo e o "Nova Expedição" de quem está no meio ficam em Garagem > Resumo da Expedição.
    { label: t('expedition.card.expedition'), hint: expeditionHint, run: route.kind === 'new' ? mode('career') : route.completed ? open('career') : mode('career', true) },
    { label: t('expedition.card.together'), hint: t('expedition.card.together.hint'), run: open('party') },
    {
      label: t('expedition.card.free'),
      hint: freeCup ? t('expedition.card.free.hint.cup', { cup: cupText(freeCup.cupId), n: Math.min(freeCup.raceIndex + 1, freeCup.raceCount), m: freeCup.raceCount }) : t('expedition.card.free.hint'),
      run: open('free'), badge: freeCup ? t('expedition.card.free.badge') : undefined,
    },
    { label: t('expedition.card.garage'), hint: t('expedition.card.garage.hint'), run: open('garageHub') },
    { label: t('passport.menu'), hint: t('passport.menu.hint'), run: open('passport') },
  ];
  const corner: HomeEntry[] = [
    { label: t('ui.main.records'), hint: t('ui.main.hint.records'), run: open('records') },
    { label: t('tutorial.menu'), hint: t('tutorial.menu.hint'), run: open('tutorial') },
    { label: t('ui.main.options'), hint: t('ui.main.hint.options'), run: open('options') },
    { label: t('ui.main.controls'), hint: t('ui.main.hint.controls'), run: open('controls') },
    { label: t('ui.main.credits'), hint: t('ui.main.hint.credits'), run: open('credits') },
  ];
  if (api.ctx.isDesktop) corner.push({ label: t('ui.main.quit'), hint: t('ui.main.hint.quit'), run: () => api.emit({ type: 'quitApp' }), cls: 'btn-quit' });
  const entries = [...cards, ...corner];
  const cardButtons: FocusItem[] = cards.map((e) => {
    const b = button(e.label, e.run, 'btn-main btn-card');
    if (e.badge) b.el.appendChild(h('span', { class: 'card-badge', text: e.badge }));
    return b;
  });
  const cornerButtons: FocusItem[] = corner.map((e) => button(e.label, e.run, `btn-main btn-corner ${e.cls ?? ''}`.trim()));
  const buttons = [...cardButtons, ...cornerButtons];
  const firstCorner = cardButtons.length;
  // "Primeira vez?": o último item da lista de foco, à direita; o foco inicial continua no 1º cartão.
  const offer = shouldOfferTutorial(save) ? tutorialOfferCard(api) : null;
  const items: FocusItem[] = offer ? [...buttons, offer] : buttons;
  const heroTitle = h('h2', { class: 'main-hero-title', text: entries[0].label });
  const heroHint = h('p', { class: 'main-hint', text: entries[0].hint });
  const versus = !!save.career && !save.career.coop && save.career.drivers.length > 1;
  const recap = recapPanel(save.recap);
  const list = createFocusList(items, { sfx: api.sfx });
  const syncHint = () => {
    const e = entries[list.index];
    if (!e) return;
    heroTitle.textContent = e.label;
    heroHint.textContent = e.hint;
  };
  buttons.forEach((it, i) => it.el.addEventListener('mousemove', () => { heroTitle.textContent = entries[i].label; heroHint.textContent = entries[i].hint; }));
  const el = screenFrame('main', null,
    h('div', { class: 'main-layout' },
      h('div', { class: 'main-left glass' },
        logo('small'),
        h('div', { class: 'menu-list' }, cardButtons.map((i) => i.el)),
        h('div', { class: 'main-corner' }, cornerButtons.map((i) => i.el)),
      ),
      h('div', { class: 'main-right' }, heroTitle, heroHint, goalsPanel(goalsFor(save, api.ctx.cups, api.ctx.cars), versus), recap, offer ? offer.el : null),
    ),
  );
  return {
    el,
    nav(nav) {
      const last = items.length - 1;
      const at = list.index;
      const inCorner = at >= firstCorner && at < buttons.length;
      // → de um cartão salta ao 1º do canto, e dentro do canto anda de botão em botão; depois do último, ao cartão "Primeira vez?".
      // ← do canto volta (do 1º do canto, ao 1º cartão); ← no cartão do tutorial volta ao 1º cartão.
      if (nav.right) {
        if (at < firstCorner) { if (list.set(firstCorner)) api.sfx('move'); syncHint(); return; }
        if (inCorner) { if (at < buttons.length - 1 || offer) { if (list.set(at + 1)) api.sfx('move'); } syncHint(); return; }
      }
      if (nav.left) {
        if (inCorner) { if (list.set(at > firstCorner ? at - 1 : 0)) api.sfx('move'); syncHint(); return; }
        if (offer && at === last) { if (list.set(0)) api.sfx('move'); syncHint(); return; }
      }
      lastDevice = nav.device;
      listNav(list, nav, api.sfx, () => api.go('title'));
      lastDevice = null;
      syncHint();
    },
  };
}

interface SubEntry { label: string; hint: string; run: () => void; cls?: string }

/** Submenu de lista (Jogar livre, Garagem): o painel de vidro com os itens, a dica do item em foco e VOLTAR. */
function listMenuScreen(api: ScreenApi, name: string, title: string, intro: string, entries: SubEntry[], opts: { onDevice?: (d: DeviceId | null) => void } = {}): ScreenInstance {
  const buttons: FocusItem[] = entries.map((e) => button(e.label, e.run, `btn-main ${e.cls ?? ''}`.trim()));
  const back = button(t('ui.common.back'), () => api.back());
  const items = [...buttons, back];
  const list = createFocusList(items, { sfx: api.sfx });
  const hint = h('p', { class: 'main-hint sub-hint', text: entries[0]?.hint ?? intro });
  const sync = () => { hint.textContent = entries[list.index]?.hint ?? intro; };
  buttons.forEach((b, i) => b.el.addEventListener('mousemove', () => { hint.textContent = entries[i].hint; }));
  const el = screenFrame(name, title,
    h('div', { class: 'sub-menu glass' },
      h('p', { class: 'sub-intro', text: intro }),
      h('div', { class: 'menu-list' }, items.map((i) => i.el)),
      hint,
    ),
  );
  return {
    el,
    nav(nav) {
      opts.onDevice?.(nav.device);
      listNav(list, nav, api.sfx, () => api.back());
      opts.onDevice?.(null);
      sync();
    },
  };
}

/** "Jogar livre" (N5): corrida rápida, contra-relógio, online e copa avulsa, sem dinheiro. Com copa avulsa salva, "Continuar" vem primeiro. */
export function freeScreen(api: ScreenApi): ScreenInstance {
  let device: DeviceId | null = null;
  const go = (m: RaceMode, resume = false) => () => enterMode(api, device, m, resume);
  const saved = savedFreeCup(api.ctx.save);
  const entries: SubEntry[] = [];
  if (saved) {
    entries.push({
      label: t('expedition.free.continue'), cls: 'btn-primary',
      hint: t('expedition.free.continue.hint', { cup: t(`core.cup.${saved.cupId}`), n: Math.min(saved.raceIndex + 1, saved.raceCount), m: saved.raceCount }), run: go('cup', true),
    });
  }
  entries.push(
    { label: t('expedition.free.quick'), hint: t('ui.main.hint.quick'), run: go('quick') },
    { label: t('expedition.free.timetrial'), hint: t('ui.main.hint.timetrial'), run: go('timetrial') },
    { label: t('expedition.free.online'), hint: t('ui.main.hint.online'), run: () => api.go('online') },
    { label: t('expedition.free.cup'), hint: t('expedition.free.cup.hint'), run: go('cup') },
  );
  return listMenuScreen(api, 'free', t('expedition.free.title'), t('expedition.free.hint'), entries, { onDevice: (d) => { device = d; } });
}

/**
 * "Garagem" (N5): a garagem da Expedição e a Concessionária. A Concessionária fica AQUI, e não solta no menu: é o outro lado da
 * mesma garagem (ver × comprar), e um botão dentro de `garage.ts` mexeria no painel 3D e nas combinações do playtest-layout.
 * "Minha garagem" passa pelo lobby de "Continuar" (religa os controles, que o menu principal desliga) e cai na garagem.
 * "Resumo da Expedição" é a tela `career` (dinheiro, copa, pilotos e o "Nova Expedição" com confirmação).
 */
export function garageHubScreen(api: ScreenApi): ScreenInstance {
  let device: DeviceId | null = null;
  const career = api.ctx.save.career;
  const entries: SubEntry[] = [];
  if (career) entries.push({ label: t('expedition.garageHub.mine'), hint: t('expedition.garageHub.mine.hint'), cls: 'btn-primary', run: () => enterMode(api, device, 'career', true) });
  entries.push({
    label: t('expedition.garageHub.shop'), run: () => {
      // A Concessionária navega por assento, e o menu principal desliga os assentos: senta o P1 com o dispositivo que confirmou.
      const input = api.ctx.input;
      if (device && [0, 1, 2, 3].every((i) => input.seatDevice(i) === null)) input.bindSeat(0, device);
      api.go('dealership');
    },
    hint: t(career ? 'expedition.garageHub.shop.hint' : 'expedition.garageHub.shop.hint.noExpedition'),
  });
  if (career) entries.push({ label: t('expedition.garageHub.summary'), hint: t('expedition.garageHub.summary.hint'), run: () => api.go('career') });
  return listMenuScreen(api, 'garage-hub', t('expedition.garageHub.title'), t('expedition.card.garage.hint'), entries, { onDevice: (d) => { device = d; } });
}

export function pauseScreen(api: ScreenApi): ScreenInstance {
  const items: FocusItem[] = [
    button(t('ui.pause.resume'), () => api.emit({ type: 'resume' }), 'btn-primary'),
    button(t('ui.pause.restart'), () => api.emit({ type: 'restart' })),
    button(t('ui.pause.options'), () => api.go('options')),
    button(t('ui.pause.quit'), () => api.emit({ type: 'toMain' }), 'btn-danger'),
  ];
  const list = createFocusList(items, { sfx: api.sfx });
  const el = screenFrame('pause', null,
    h('div', { class: 'pause-panel glass' },
      h('h1', { class: 'screen-title', text: t('ui.pause.title') }),
      h('div', { class: 'menu-list' }, items.map((i) => i.el)),
    ),
  );
  return {
    el,
    nav(nav) {
      listNav(list, nav, api.sfx, () => api.emit({ type: 'resume' }));
    },
  };
}

export function creditsScreen(api: ScreenApi): ScreenInstance {
  const back = button(t('ui.common.back'), () => api.back());
  const list = createFocusList([back], { sfx: api.sfx });
  const el = screenFrame('credits', t('ui.credits.title'),
    h('div', { class: 'credits-body glass' },
      logo('small'),
      h('p', { class: 'credits-big', text: t('ui.credits.by') }),
      h('p', { text: t('ui.credits.inspired') }),
      h('p', { text: t('ui.credits.tech') }),
      h('p', { class: 'credits-small', text: t('ui.credits.assets') }),
    ),
    h('div', { class: 'actions' }, back.el),
  );
  return { el, nav: (nav) => listNav(list, nav, api.sfx, () => api.back()) };
}

export function loadingScreen(): ScreenInstance {
  const el = screenFrame('loading', null, h('p', { class: 'loading-text pulse', text: t('ui.loading') }));
  return { el, nav: () => undefined };
}
