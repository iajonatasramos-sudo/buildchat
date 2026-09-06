// Botão "Transcrever" em cada mensagem de áudio.
//
// Fica no DOM do próprio WhatsApp (como o ⚡ do compose), não em shadow root:
// o bloco precisa nascer dentro da bolha da mensagem, junto do player. Por isso
// o estilo vem de uma folha própria, com prefixo `bc-tr-`.
//
// O WhatsApp virtualiza a lista: a bolha some ao rolar e volta remontada. Duas
// consequências tratadas aqui — o observer reinsere o botão, e o texto já
// transcrito fica num cache por id de mensagem, para não pagar a API de novo.

import { tema } from '@/lib/store';
import { obterAudioDaMensagem } from '@/lib/wa';
import { transcrever, transcricaoDisponivel } from '@/lib/transcricao';

const MARCA = 'bcTr'; // dataset.bcTr — evita duplicar o bloco na mesma mensagem
const cache = new Map<string, string>(); // msgId -> texto já transcrito

/** Seletores do WhatsApp para o player de áudio, do mais específico ao geral. */
const SELETORES_AUDIO = [
  '#main div[role="application"] audio',
  '#main audio',
];

function injetarEstilo() {
  if (document.getElementById('bc-tr-estilo')) return;
  const estilo = document.createElement('style');
  estilo.id = 'bc-tr-estilo';
  estilo.textContent = `
    .bc-tr { margin: 4px 0 2px; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
    .bc-tr[data-saida="1"] { align-items: flex-end; }
    .bc-tr-btn {
      display: inline-flex; align-items: center; gap: 5px;
      background: none; border: 1px solid var(--bc-tr-borda); border-radius: 8px;
      padding: 3px 9px; font-size: 12px; font-family: inherit; font-weight: 600;
      color: var(--bc-tr-cor); cursor: pointer; line-height: 1.5;
      transition: border-color .15s ease, color .15s ease;
    }
    .bc-tr-btn:hover { border-color: var(--bc-tr-marca); color: var(--bc-tr-marca); }
    .bc-tr-btn:disabled { cursor: default; opacity: .75; }
    .bc-tr-btn svg { flex-shrink: 0; }
    .bc-tr-girando { animation: bc-tr-giro 1s linear infinite; transform-origin: center; }
    @keyframes bc-tr-giro { to { transform: rotate(360deg); } }
    .bc-tr-texto {
      max-width: 100%; font-size: 13.5px; line-height: 1.45; font-style: italic;
      color: var(--bc-tr-cor-texto); border-left: 2px solid var(--bc-tr-marca);
      padding: 1px 0 1px 8px; white-space: pre-wrap; word-break: break-word;
      text-align: left;
    }
    .bc-tr-erro { font-size: 12px; line-height: 1.4; color: var(--bc-tr-erro); max-width: 100%; text-align: left; }
    .bc-tr-refazer { background: none; border: 0; padding: 0; margin-left: 6px;
      font: inherit; font-size: 12px; color: var(--bc-tr-marca); cursor: pointer; text-decoration: underline; }
  `;
  document.head.appendChild(estilo);
}

/** As cores acompanham o claro/escuro do WhatsApp. */
function aplicarCores() {
  const escuro = tema.get() === 'dark';
  const raiz = document.documentElement.style;
  raiz.setProperty('--bc-tr-cor', escuro ? '#8696a0' : '#54656f');
  raiz.setProperty('--bc-tr-cor-texto', escuro ? '#d1d7db' : '#3b4a54');
  raiz.setProperty('--bc-tr-borda', escuro ? 'rgba(134,150,160,.4)' : 'rgba(84,101,111,.3)');
  raiz.setProperty('--bc-tr-marca', escuro ? '#8aa2ff' : '#4F46E5');
  raiz.setProperty('--bc-tr-erro', escuro ? '#f0a5a5' : '#b91c1c');
}

const ICONE_TEXTO =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h11M4 18h7"/></svg>';
const ICONE_GIRO =
  '<svg class="bc-tr-girando" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>';

/** A linha da mensagem: é dela que saem o id e o lado (enviada/recebida). */
function linhaDaMensagem(audio: HTMLAudioElement): HTMLElement | null {
  return audio.closest<HTMLElement>('[data-id]') ?? audio.closest<HTMLElement>('[role="row"]');
}

function idDaMensagem(linha: HTMLElement): string | null {
  return linha.getAttribute('data-id') || linha.querySelector('[data-id]')?.getAttribute('data-id') || null;
}

/**
 * Onde encaixar o bloco: dentro da bolha, logo depois do player, para o texto
 * herdar a largura e o alinhamento dela. Sem a bolha reconhecida, o fim da
 * linha ainda é um lugar razoável.
 */
function alvoDoBloco(audio: HTMLAudioElement, linha: HTMLElement): HTMLElement {
  const bolha =
    audio.closest<HTMLElement>('.copyable-text') ??
    audio.closest<HTMLElement>('[class*="message-in"], [class*="message-out"]');
  return bolha ?? linha;
}

function montarBloco(audio: HTMLAudioElement, linha: HTMLElement) {
  const msgId = idDaMensagem(linha);
  const saida = linha.className.includes('message-out');

  const bloco = document.createElement('div');
  bloco.className = 'bc-tr';
  bloco.dataset.saida = saida ? '1' : '0';

  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'bc-tr-btn';
  botao.innerHTML = `${ICONE_TEXTO}<span>Transcrever</span>`;
  bloco.appendChild(botao);

  const mostrarTexto = (texto: string) => {
    botao.remove();
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
      const blob = await obterAudioDaMensagem(audio, msgId);
      const texto = await transcrever(blob);
      if (msgId) cache.set(msgId, texto);
      mostrarTexto(texto);
    } catch (erro) {
      botao.disabled = false;
      botao.innerHTML = `${ICONE_TEXTO}<span>Transcrever</span>`;
      mostrarErro(erro instanceof Error ? erro.message : 'Falha ao transcrever.');
    }
  });

  alvoDoBloco(audio, linha).appendChild(bloco);
}

export function montarTranscricao() {
  injetarEstilo();
  aplicarCores();
  tema.subscribe(aplicarCores);

  // Sem a integração cadastrada, o recurso simplesmente não existe para a
  // clínica — mesma regra do botão de proposta.
  let liberado = false;
  const conferir = () =>
    transcricaoDisponivel().then((tem) => {
      liberado = tem;
    });
  conferir();
  setInterval(conferir, 60000); // o sync pode liberar (ou tirar) a qualquer momento

  const garantir = () => {
    if (!liberado) return;
    for (const seletor of SELETORES_AUDIO) {
      for (const audio of document.querySelectorAll<HTMLAudioElement>(seletor)) {
        const linha = linhaDaMensagem(audio);
        if (!linha || linha.dataset[MARCA]) continue;
        linha.dataset[MARCA] = '1';
        try {
          montarBloco(audio, linha);
        } catch (e) {
          console.warn('[BuildChat] transcrição: não consegui montar o botão', e);
        }
      }
      if (document.querySelector(seletor)) break; // o primeiro seletor que casa basta
    }
  };

  garantir();
  const obs = new MutationObserver(() => garantir());
  obs.observe(document.body, { childList: true, subtree: true });
}
