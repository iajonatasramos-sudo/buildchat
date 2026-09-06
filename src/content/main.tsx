// Entry do content script: injeta a ponte WPP na página, monta o app React
// dentro de um shadow DOM (para o CSS não conflitar com o do WhatsApp).

import { createRoot } from 'react-dom/client';
import { App } from '@/ui/App';
import { montarTranscricao } from './transcrever';
import { montarNomes } from './nomes';
import { TopBar, ALTURA_TOPBAR } from '@/ui/TopBar';
import { HeaderBar } from '@/ui/HeaderBar';
import { injetarBridge } from '@/lib/wa';
import { getSettings } from '@/lib/db';
import { gavetaAberta, tema } from '@/lib/store';
import '@/styles/tokens.css';

declare global {
  interface Window {
    __buildchat2?: boolean;
  }
}

const containers: HTMLElement[] = [];

function criarRaiz(host: HTMLElement): HTMLElement {
  const shadow = host.attachShadow({ mode: 'open' });
  // CSS compilado (Tailwind + tokens) dentro do shadow root
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('assets/content.css');
  shadow.appendChild(link);

  const container = document.createElement('div');
  container.className = 'bc-root';
  shadow.appendChild(container);
  containers.push(container);
  return container;
}

// ── Tema ────────────────────────────────────────────────────────────────────
// 'auto' segue o claro/escuro do WhatsApp; o usuário pode fixar claro,
// gray (grafite) ou escuro nas Configurações.
let temaEscolhido: 'auto' | 'claro' | 'gray' | 'escuro' = 'auto';

function temaEfetivo(): 'light' | 'dim' | 'dark' {
  if (temaEscolhido === 'claro') return 'light';
  if (temaEscolhido === 'gray') return 'dim';
  if (temaEscolhido === 'escuro') return 'dark';
  return tema.get() === 'dark' ? 'dark' : 'light';
}

function aplicarTema() {
  const t = temaEfetivo();
  containers.forEach((c) => {
    if (t === 'light') delete c.dataset.tema;
    else c.dataset.tema = t;
  });
}

function detectarTema() {
  const cor = getComputedStyle(document.body).backgroundColor;
  const m = cor.match(/\d+/g);
  const escuro = m ? (Number(m[0]) + Number(m[1]) + Number(m[2])) / 3 < 128 : false;
  const novo = escuro ? 'dark' : 'light';
  if (novo !== tema.get()) {
    tema.set(novo);
    aplicarTema();
  }
}

function observarTemaEscolhido() {
  getSettings().then((s) => {
    temaEscolhido = s.tema ?? 'auto';
    aplicarTema();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.bc2_settings) return;
    temaEscolhido = (changes.bc2_settings.newValue as { tema?: typeof temaEscolhido } | undefined)?.tema ?? 'auto';
    aplicarTema();
  });
}

// ── Cabeçalho no topo (largura total, como na referência) ───────────────────
// O #app do WhatsApp é empurrado para baixo pela altura da barra.
function montarTopBar() {
  // O #app do WhatsApp é position:absolute com altura em px definida via JS —
  // empurramos com top/height (!important vence o estilo inline) e, com a
  // gaveta aberta, encolhemos a largura para o corpo se adequar ao layout.
  const estilo = document.createElement('style');
  estilo.id = 'buildchat2-estilo';
  estilo.textContent = `
    #app {
      top: ${ALTURA_TOPBAR}px !important;
      height: calc(100vh - ${ALTURA_TOPBAR}px) !important;
    }
    html.bc-gaveta #app {
      width: calc(100vw - 353px) !important;
    }
  `;
  document.head.appendChild(estilo);

  const host = document.createElement('div');
  host.id = 'buildchat2-topbar';
  host.style.cssText = `position:fixed;top:0;left:0;right:0;height:${ALTURA_TOPBAR}px;z-index:2147483001;`;
  document.body.appendChild(host);
  createRoot(criarRaiz(host)).render(<TopBar />);
}

// ── Botão ⚡ DENTRO da barra de escrever, ao lado do microfone ──────────────
// Inserido no DOM do próprio compose (como na referência), com cara de ícone
// nativo. O footer remonta a cada troca de conversa; o observer garante a volta.
const ZAP_SVG =
  '<svg viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';

function corDoRaio(): string {
  if (gavetaAberta.get()) return 'oklch(54% 0.18 264)'; // brand
  return tema.get() === 'dark' ? '#8696a0' : '#54656f'; // cinza dos ícones nativos
}

function montarBotaoCompose() {
  const BTN_ID = 'buildchat2-raio';

  const atualizarCor = () => {
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.style.color = corDoRaio();
  };
  gavetaAberta.subscribe(atualizarCor);
  tema.subscribe(atualizarCor);

  const garantir = () => {
    if (document.getElementById(BTN_ID)) return;
    const mic =
      document.querySelector('#main footer span[data-icon="ptt"]')?.closest('button') ||
      document.querySelector('#main footer span[data-icon="mic"]')?.closest('button') ||
      document.querySelector('#main footer span[data-icon="wds-ic-mic-outline"]')?.closest('button') ||
      document.querySelector('#main footer span[data-icon="wds-ic-mic-outline-filled"]')?.closest('button');
    if (!mic || !mic.parentElement) return;
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.title = 'BuildChat — mensagens rápidas';
    btn.setAttribute('aria-label', 'BuildChat');
    btn.innerHTML = ZAP_SVG;
    btn.style.cssText =
      'background:none;border:0;padding:10px;margin:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;';
    btn.style.color = corDoRaio();
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      gavetaAberta.set(!gavetaAberta.get());
    });
    mic.insertAdjacentElement('afterend', btn);
  };

  garantir();
  const obs = new MutationObserver(() => garantir());
  obs.observe(document.body, { childList: true, subtree: true });
}

// ── Barra de funções no cabeçalho da conversa ───────────────────────────────
// Etiquetas, filtros, mensagens apagadas e fixar — inserida no <header> do
// #main, antes do bloco de ícones nativos (como na referência).
function montarHeaderBar() {
  const HOST_ID = 'buildchat2-headerbar';
  const garantir = () => {
    if (document.getElementById(HOST_ID)) return;
    const header = document.querySelector('#main header');
    if (!header) return;
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'display:flex;align-items:center;flex-shrink:0;';
    // antes do último filho (bloco dos ícones nativos); senão, no fim
    const ultimo = header.lastElementChild;
    if (ultimo && ultimo.parentElement === header) header.insertBefore(host, ultimo);
    else header.appendChild(host);
    const container = criarRaiz(host);
    container.style.cssText = 'display:flex;align-items:center;';
    createRoot(container).render(<HeaderBar />);
  };
  garantir();
  const obs = new MutationObserver(() => garantir());
  obs.observe(document.body, { childList: true, subtree: true });
}

function montarUi() {
  const host = document.createElement('div');
  host.id = 'buildchat2-root';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;';
  document.body.appendChild(host);
  const container = criarRaiz(host);
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;';
  createRoot(container).render(<App />);

  montarTopBar();
  montarBotaoCompose();
  montarHeaderBar();
  montarTranscricao();
  montarNomes();

  observarTemaEscolhido();
  detectarTema();
  aplicarTema();
  setInterval(detectarTema, 2000);
}

function montar() {
  if (window.__buildchat2) return;
  window.__buildchat2 = true;

  // A ponte WPP é injetada o quanto antes (document_start) — o wa-js precisa
  // observar o carregamento do WhatsApp para ficar pronto com confiança.
  injetarBridge();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', montarUi);
  } else {
    montarUi();
  }
}

montar();
