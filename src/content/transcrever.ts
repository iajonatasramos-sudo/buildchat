// Botão "Transcrever" em cada mensagem de áudio.
//
// Fica no DOM do próprio WhatsApp (como o ⚡ do compose), não em shadow root:
// o bloco precisa nascer dentro da bolha da mensagem, junto do player. Por isso
// o estilo vem de uma folha própria, com prefixo `bc-tr-`.
//
// COMO A MENSAGEM DE ÁUDIO É ENCONTRADA — a parte delicada:
//   * o <audio> NÃO existe até a pessoa tocar o áudio, então procurá-lo não
//     acha nada (foi o primeiro erro);
//   * as classes e os `data-icon` da bolha mudam a cada versão do WhatsApp.
// O que é estável é o `data-id` da linha. Então perguntamos ao WPP quais
// mensagens da conversa são de voz/áudio e cruzamos com esse atributo. Os
// sinais de DOM ficam como reforço, para o caso de a ponte estar fora do ar.
//
// A lista é virtualizada: a bolha some ao rolar e volta remontada. O observer
// reinsere o botão e um cache por id devolve o texto já transcrito.

import { tema } from '@/lib/store';
import { idsDeAudioDoChat, obterAudioDaMensagem } from '@/lib/wa';
import { transcrever, transcricaoDisponivel } from '@/lib/transcricao';

const MARCA = 'bcTr'; // dataset.bcTr — evita duplicar o bloco na mesma mensagem
const cache = new Map<string, string>(); // msgId -> texto já transcrito
let idsAudio = new Set<string>(); // ids de áudio da conversa aberta, segundo o WPP

function injetarEstilo() {
  if (document.getElementById('bc-tr-estilo')) return;
  const estilo = document.createElement('style');
  estilo.id = 'bc-tr-estilo';
  estilo.textContent = `
    /* Pílula centralizada DENTRO da bolha, logo abaixo do player. */
    .bc-tr { margin: 6px 0 2px; display: flex; flex-direction: column; gap: 6px; align-items: center; width: 100%; }
    .bc-tr-btn {
      display: inline-flex; align-items: center; gap: 7px;
      background: none; border: 1.5px solid var(--bc-tr-marca); border-radius: 999px;
      padding: 5px 16px; font-size: 14px; font-family: inherit; font-weight: 600;
      color: var(--bc-tr-marca); cursor: pointer; line-height: 1.5;
      transition: background .15s ease;
    }
    .bc-tr-btn:hover { background: var(--bc-tr-fundo-hover); }
    .bc-tr-btn:disabled { cursor: default; opacity: .7; }
    .bc-tr-btn svg { flex-shrink: 0; }
    .bc-tr-girando { animation: bc-tr-giro 1s linear infinite; transform-origin: center; }
    @keyframes bc-tr-giro { to { transform: rotate(360deg); } }
    .bc-tr-texto {
      align-self: stretch; font-size: 13.5px; line-height: 1.45; font-style: italic;
      color: var(--bc-tr-cor-texto); border-left: 2px solid var(--bc-tr-marca);
      padding: 1px 0 1px 8px; white-space: pre-wrap; word-break: break-word; text-align: left;
    }
    .bc-tr-erro { font-size: 12px; line-height: 1.4; color: var(--bc-tr-erro); text-align: center; }
    .bc-tr-refazer { background: none; border: 0; padding: 0; margin-left: 6px;
      font: inherit; font-size: 12px; color: var(--bc-tr-marca); cursor: pointer; text-decoration: underline; }
  `;
  document.head.appendChild(estilo);
}

/** As cores acompanham o claro/escuro do WhatsApp. */
function aplicarCores() {
  const escuro = tema.get() === 'dark';
  const raiz = document.documentElement.style;
  raiz.setProperty('--bc-tr-cor-texto', escuro ? '#d1d7db' : '#3b4a54');
  raiz.setProperty('--bc-tr-marca', escuro ? '#ff5f8f' : '#e11d6f');
  raiz.setProperty('--bc-tr-fundo-hover', escuro ? 'rgba(255,95,143,.12)' : 'rgba(225,29,111,.08)');
  raiz.setProperty('--bc-tr-erro', escuro ? '#f0a5a5' : '#b91c1c');
}

// Microfone com balão de fala — "o que foi falado, em texto".
const ICONE_TEXTO = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
  stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <rect x="1.6" y="7.5" width="4.8" height="8" rx="2.4"/>
  <path d="M.2 13.2a3.8 3.8 0 0 0 7.6 0"/>
  <path d="M4 17.5v3.3"/>
  <path d="M10.6 2.2h11a1.6 1.6 0 0 1 1.6 1.6v6a1.6 1.6 0 0 1-1.6 1.6h-5.2l-3.4 2.9v-2.9h-2.4A1.6 1.6 0 0 1 9 9.8v-6a1.6 1.6 0 0 1 1.6-1.6Z"/>
  <path d="M11.9 5.3h8.4M11.9 8.2h5.2"/>
</svg>`;
const ICONE_GIRO = `<svg class="bc-tr-girando" viewBox="0 0 24 24" width="18" height="18" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>`;

/**
 * Reforço para quando a ponte WPP não respondeu: sinais de que a bolha tem
 * áudio. Propositalmente amplo — nome de ícone, rótulo de acessibilidade em
 * português ou inglês, o testid antigo e o próprio <audio>, se já existir.
 */
function pareceAudio(linha: HTMLElement): boolean {
  if (linha.querySelector('audio')) return true;
  if (linha.querySelector('[data-testid*="audio" i], [data-testid*="ptt" i]')) return true;
  for (const el of linha.querySelectorAll('[data-icon]')) {
    const nome = el.getAttribute('data-icon')?.toLowerCase() ?? '';
    if (nome.includes('audio') || nome.includes('ptt') || nome.includes('mic')) return true;
  }
  for (const el of linha.querySelectorAll('[aria-label]')) {
    const rotulo = el.getAttribute('aria-label')?.toLowerCase() ?? '';
    if (rotulo.includes('voice message') || rotulo.includes('mensagem de voz') || rotulo.includes('áudio')) return true;
  }
  return false;
}

/**
 * A bolha da mensagem — é dentro dela que o botão entra, centralizado.
 *
 * Procurar por classe não vale (o WhatsApp renomeia a cada versão), então
 * achamos pela aparência: o elemento mais externo, dentro da linha, que tem
 * fundo próprio e é mais estreito que a linha. É exatamente o que desenha o
 * balão. Sem isso o bloco caía na linha inteira e encostava na borda esquerda.
 */
function acharBolha(linha: HTMLElement): HTMLElement {
  const larguraLinha = linha.getBoundingClientRect().width || 1;
  const fila: HTMLElement[] = [...linha.children].filter((n): n is HTMLElement => n instanceof HTMLElement);

  while (fila.length) {
    const el = fila.shift()!;
    const caixa = el.getBoundingClientRect();
    const fundo = getComputedStyle(el).backgroundColor;
    const opaco = fundo && !/rgba\(0, 0, 0, 0\)|transparent/.test(fundo);
    if (opaco && caixa.width > 60 && caixa.width < larguraLinha * 0.95) return el;
    fila.push(...([...el.children].filter((n): n is HTMLElement => n instanceof HTMLElement)));
  }
  return (
    linha.querySelector<HTMLElement>('[class*="message-in"], [class*="message-out"]') ??
    linha.querySelector<HTMLElement>('.copyable-text') ??
    linha
  );
}

function montarBloco(linha: HTMLElement, msgId: string | null) {
  const bloco = document.createElement('div');
  bloco.className = 'bc-tr';

  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'bc-tr-btn';
  botao.innerHTML = `${ICONE_TEXTO}<span>Transcrever</span>`;
  bloco.appendChild(botao);

  const mostrarTexto = (texto: string) => {
    botao.remove();
    bloco.querySelector('.bc-tr-erro')?.remove();
    const p = document.createElement('div');
    p.className = 'bc-tr-texto';
    p.textContent = `“${texto}”`;
    bloco.appendChild(p);
  };

  const mostrarErro = (mensagem: string) => {
    bloco.querySelector('.bc-tr-erro')?.remove();
    const p = document.createElement('div');
    p.className = 'bc-tr-erro';
    p.textContent = mensagem;
    const refazer = document.createElement('button');
    refazer.type = 'button';
    refazer.className = 'bc-tr-refazer';
    refazer.textContent = 'tentar de novo';
    refazer.addEventListener('click', () => {
      p.remove();
      botao.click();
    });
    p.appendChild(refazer);
    bloco.appendChild(p);
  };

  // Já transcrita nesta sessão? Mostra direto — a bolha remonta o tempo todo.
  const pronta = msgId ? cache.get(msgId) : undefined;
  if (pronta) mostrarTexto(pronta);

  botao.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    botao.disabled = true;
    botao.innerHTML = `${ICONE_GIRO}<span>Transcrevendo…</span>`;
    try {
      const audio = linha.querySelector('audio');
      const texto = await transcrever(await obterAudioDaMensagem(audio, msgId));
      if (msgId) cache.set(msgId, texto);
      mostrarTexto(texto);
    } catch (erro) {
      botao.disabled = false;
      botao.innerHTML = `${ICONE_TEXTO}<span>Transcrever</span>`;
      mostrarErro(erro instanceof Error ? erro.message : 'Falha ao transcrever.');
    }
  });

  acharBolha(linha).appendChild(bloco);
}

export function montarTranscricao() {
  injetarEstilo();
  aplicarCores();
  tema.subscribe(aplicarCores);

  // Sem a integração cadastrada, o recurso não existe para a clínica — mesma
  // regra do botão de proposta. O sync pode liberar (ou tirar) a qualquer hora.
  let liberado = false;
  const conferir = () =>
    transcricaoDisponivel().then((tem) => {
      if (tem !== liberado) console.info(`[BuildChat] transcrição ${tem ? 'liberada' : 'indisponível (sem integração)'}.`);
      liberado = tem;
    });
  setInterval(conferir, 60000);

  // Quais mensagens da conversa são de áudio, segundo o WPP.
  let consultando = false;
  let ultimaConsulta = 0;
  const atualizarIds = async () => {
    if (!liberado || consultando) return;
    consultando = true;
    ultimaConsulta = Date.now();
    try {
      const ids = await idsDeAudioDoChat();
      if (ids.length) {
        idsAudio = new Set(ids);
        garantir(); // os ids novos podem revelar bolhas que já estão na tela
      }
    } finally {
      consultando = false;
    }
  };
  // A checagem da licença é assíncrona: só depois dela a consulta faz sentido.
  conferir().then(atualizarIds);
  setInterval(atualizarIds, 8000);

  const garantir = () => {
    if (!liberado) return;
    let desconhecidas = false;
    for (const linha of document.querySelectorAll<HTMLElement>('#main [data-id]')) {
      if (linha.dataset[MARCA]) continue;
      const msgId = linha.getAttribute('data-id');
      if (!(msgId && idsAudio.has(msgId)) && !pareceAudio(linha)) {
        desconhecidas = true; // pode ser áudio que a lista do WPP ainda não cobre
        continue;
      }
      linha.dataset[MARCA] = '1';
      try {
        montarBloco(linha, msgId);
      } catch (e) {
        console.warn('[BuildChat] transcrição: não consegui montar o botão', e);
      }
    }
    // Trocou de conversa ou rolou para trás: pede a lista de novo, sem
    // martelar a ponte (no máximo uma consulta por segundo e meio).
    if (desconhecidas && Date.now() - ultimaConsulta > 1500) atualizarIds();
  };

  garantir();
  const obs = new MutationObserver(() => garantir());
  obs.observe(document.body, { childList: true, subtree: true });

  // Diagnóstico: se o botão não aparecer, isto diz de que lado está o problema.
  (window as any).__bcTranscricao = () => ({
    liberado,
    audiosSegundoWpp: idsAudio.size,
    linhasComDataId: document.querySelectorAll('#main [data-id]').length,
    botoesNaTela: document.querySelectorAll('.bc-tr-btn').length,
    transcritos: cache.size,
  });
}
