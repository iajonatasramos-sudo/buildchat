// O menu do WhatsApp (Responder, Encaminhar, Baixar…) não pode nascer embaixo
// da nossa barra lateral.
//
// O menu é do WhatsApp, não nosso: ele se posiciona pela largura da JANELA,
// mas a extensão encolhe o `#app` para caber a barra lateral (ou a gaveta).
// Resultado: nas mensagens da direita — as suas — o menu abria para o lado
// direito e ficava cortado.
//
// Aqui a gente observa o menu aparecer e, se ele passar da área útil, empurra:
// • mensagem sua (`data-id` começando com `true_`): abre à ESQUERDA do balão;
// • mensagem do contato: fica onde está, só encostando dentro da área útil.
//
// Nada de procurar classe do WhatsApp (elas mudam a cada versão): o menu é
// reconhecido pela geometria — elemento posicionado, com tamanho de menu, que
// nasce logo depois de um clique dentro de uma mensagem.

import { acharBolha } from './dom-bolha';

const MARGEM = 8;
const JANELA_MS = 1500; // tempo entre o clique na mensagem e o menu aparecer

type Origem = { minha: boolean; balao: DOMRect; em: number };
let ultimaOrigem: Origem | null = null;

/** Borda direita da área que sobrou para o WhatsApp (o `#app` já vem encolhido). */
function limiteDireito(): number {
  const app = document.querySelector('#app');
  const direita = app?.getBoundingClientRect().right ?? window.innerWidth;
  // Se o #app ainda não foi ajustado, não há o que proteger.
  return Math.min(direita, window.innerWidth);
}

function pareceMenu(el: HTMLElement): boolean {
  const pos = getComputedStyle(el).position;
  if (pos !== 'absolute' && pos !== 'fixed') return false;
  const r = el.getBoundingClientRect();
  return r.width >= 100 && r.width <= 460 && r.height >= 60;
}

/** Empurra o menu para dentro da área útil (e para a esquerda do balão, se for meu). */
function reposicionar(el: HTMLElement, origem: Origem) {
  const r = el.getBoundingClientRect();
  const limite = limiteDireito();
  if (r.right <= limite - 1) return; // já cabe

  let esquerda: number;
  if (origem.minha && origem.balao.left - r.width - MARGEM >= MARGEM) {
    esquerda = origem.balao.left - r.width - MARGEM; // à esquerda do balão
  } else {
    esquerda = limite - r.width - MARGEM; // encostado na borda da área útil
  }
  esquerda = Math.max(MARGEM, esquerda);

  // O WhatsApp posiciona ora por `left`, ora por `transform`, e o `left` vale
  // em relação ao pai — não à janela. Em vez de tentar adivinhar, aplicamos e
  // corrigimos pelo erro medido: funciona em qualquer um dos casos.
  el.style.setProperty('right', 'auto', 'important');
  el.style.setProperty('left', `${esquerda}px`, 'important');
  const erro = el.getBoundingClientRect().left - esquerda;
  if (Math.abs(erro) > 1) el.style.setProperty('left', `${esquerda - erro}px`, 'important');
  el.dataset.bcMovido = '1';
}

export function montarMenus() {
  // De qual mensagem partiu o clique — e onde está o balão dela.
  document.addEventListener(
    'mousedown',
    (e) => {
      const alvo = e.target as HTMLElement | null;
      const linha = alvo?.closest?.('#main [data-id]') as HTMLElement | null;
      if (!linha) {
        ultimaOrigem = null;
        return;
      }
      const id = linha.getAttribute('data-id') ?? '';
      let balao: DOMRect;
      try {
        balao = acharBolha(linha).getBoundingClientRect();
      } catch {
        balao = linha.getBoundingClientRect();
      }
      ultimaOrigem = { minha: id.startsWith('true_'), balao, em: Date.now() };
    },
    true,
  );

  const conferir = (el: HTMLElement) => {
    const origem = ultimaOrigem;
    if (!origem || Date.now() - origem.em > JANELA_MS) return;
    if (el.dataset.bcMovido || !pareceMenu(el)) return;
    reposicionar(el, origem);
    // O WhatsApp às vezes reposiciona logo depois de montar; confere de novo.
    requestAnimationFrame(() => {
      delete el.dataset.bcMovido;
      if (pareceMenu(el)) reposicionar(el, origem);
    });
  };

  const obs = new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      for (const no of m.addedNodes) {
        if (!(no instanceof HTMLElement)) continue;
        conferir(no);
        // O menu pode nascer dentro de um invólucro recém-adicionado.
        for (const filho of no.querySelectorAll<HTMLElement>('div')) {
          if (filho.childElementCount > 1) conferir(filho);
        }
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // Diagnóstico: `__bcMenus()` (no contexto da extensão).
  (window as any).__bcMenus = () => ({
    limiteDireito: limiteDireito(),
    janela: window.innerWidth,
    ultimaOrigem,
  });
}
