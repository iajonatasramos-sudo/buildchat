// "Ver mensagem apagada" — o botão nasce DENTRO da bolha que o WhatsApp
// esvaziou, no lugar exato onde a mensagem estava (como no Dental Chat).
//
// A captura é do `src/lib/db.ts`: toda mensagem que chega vai para um cache
// local (`bc2_msg_cache`) e, quando o WhatsApp avisa que foi apagada
// (`chat.msg_revoke` do WPP), o texto é movido para `bc2_apagadas`. Aqui só
// mostramos o que já está guardado — nada é pedido a servidor nenhum.
//
// Casar a bolha com o registro é pelo HASH do id, não pelo id inteiro: desde
// os ids `@lid` o DOM traz `false_123@lid_HASH` e o WPP `false_5511…@c.us_HASH`
// (mesma lição da transcrição de áudio).
//
// A lista é virtualizada: a bolha some ao rolar e volta remontada, então o
// observer reinsere o botão e um conjunto guarda quais já foram reveladas.

import { perfilAtual, tema } from '@/lib/store';
import { servidorConfigurado } from '@/lib/config';
import { acharBolha, hashDoId } from './dom-bolha';
import type { MsgApagada } from '@/lib/db';

const MARCA = 'bcAp'; // dataset.bcAp — evita duplicar o bloco na mesma bolha
let porHash = new Map<string, MsgApagada>();
const reveladas = new Set<string>(); // hashes que a pessoa já abriu nesta sessão

const ICONE_OLHO =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';

function injetarEstilo() {
  if (document.getElementById('bc-ap-estilo')) return;
  const estilo = document.createElement('style');
  estilo.id = 'bc-ap-estilo';
  estilo.textContent = `
    /* O padding de baixo reserva a faixa do horário, que o WhatsApp desenha
       em absoluto no canto inferior direito da bolha. */
    .bc-ap { margin: 6px 0 0; padding: 0 0 18px; display: flex; flex-direction: column;
      gap: 6px; align-items: flex-start; width: 100%; box-sizing: border-box; }
    .bc-ap-btn {
      display: inline-flex; align-items: center; gap: 6px;
      background: none; border: 1.5px solid var(--bc-ap-cor); border-radius: 999px;
      padding: 4px 13px; font-size: 13px; font-family: inherit; font-weight: 600;
      color: var(--bc-ap-cor); cursor: pointer; line-height: 1.2;
    }
    .bc-ap-btn:hover { background: var(--bc-ap-fundo); }
    .bc-ap-texto {
      white-space: pre-wrap; word-break: break-word; font-size: 14.2px; line-height: 1.4;
      color: var(--bc-ap-texto); border-left: 3px solid var(--bc-ap-cor);
      padding: 2px 0 2px 9px; width: 100%; box-sizing: border-box;
    }
    .bc-ap-rodape { font-size: 11.5px; color: var(--bc-ap-fraco); }
  `;
  document.head.appendChild(estilo);
}

function aplicarCores() {
  const escuro = tema.get() === 'dark';
  const raiz = document.documentElement.style;
  raiz.setProperty('--bc-ap-cor', escuro ? '#f0a3a3' : '#c0392b');
  raiz.setProperty('--bc-ap-fundo', escuro ? 'rgba(240,163,163,0.14)' : 'rgba(192,57,43,0.08)');
  raiz.setProperty('--bc-ap-texto', escuro ? '#e9edef' : '#111b21');
  raiz.setProperty('--bc-ap-fraco', escuro ? '#8696a0' : '#667781');
}

const hora = (ms: number) =>
  new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Descrição curta de uma mídia apagada, quando não há texto. */
function semTexto(tipo: string | null): string {
  const mapa: Record<string, string> = {
    image: 'uma imagem', video: 'um vídeo', audio: 'um áudio', ptt: 'um áudio',
    document: 'um documento', sticker: 'uma figurinha',
  };
  return `A mensagem apagada era ${mapa[tipo ?? ''] ?? 'de um tipo que não guardamos'} — o conteúdo não fica salvo.`;
}

function montarBloco(linha: HTMLElement, hash: string, registro: MsgApagada) {
  const bolha = acharBolha(linha);
  const bloco = document.createElement('div');
  bloco.className = 'bc-ap';

  const mostrar = () => {
    bloco.textContent = '';
    const texto = document.createElement('div');
    texto.className = 'bc-ap-texto';
    texto.textContent = registro.texto?.trim() || semTexto(registro.tipo);
    const rodape = document.createElement('div');
    rodape.className = 'bc-ap-rodape';
    rodape.textContent = `apagada às ${hora(registro.apagadaEm)}`;
    bloco.append(texto, rodape);
  };

  if (reveladas.has(hash)) {
    mostrar();
  } else {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'bc-ap-btn';
    botao.innerHTML = `${ICONE_OLHO}<span>Ver mensagem apagada</span>`;
    botao.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      reveladas.add(hash);
      mostrar();
    });
    bloco.appendChild(botao);
  }

  bolha.appendChild(bloco);
}

/** Sem conta, nada da extensão funciona. */
const logado = () => !servidorConfigurado() || !!perfilAtual.get();

export function montarApagadas() {
  injetarEstilo();
  aplicarCores();
  tema.subscribe(aplicarCores);

  const limpar = () => {
    document.querySelectorAll('.bc-ap').forEach((el) => el.remove());
    document.querySelectorAll<HTMLElement>('#main [data-id]').forEach((l) => delete l.dataset[MARCA]);
  };

  const garantir = () => {
    if (!logado() || porHash.size === 0) return;
    for (const linha of document.querySelectorAll<HTMLElement>('#main [data-id]')) {
      if (linha.dataset[MARCA]) continue;
      const id = linha.getAttribute('data-id');
      if (!id) continue;
      const registro = porHash.get(hashDoId(id));
      if (!registro) continue;
      linha.dataset[MARCA] = '1';
      try {
        montarBloco(linha, hashDoId(id), registro);
      } catch (e) {
        console.warn('[BuildChat] apagadas: não consegui montar o botão', e);
      }
    }
  };

  const carregar = () => {
    chrome.storage.local.get('bc2_apagadas', (res) => {
      const mapa = (res.bc2_apagadas ?? {}) as Record<string, MsgApagada[]>;
      const novo = new Map<string, MsgApagada>();
      for (const lista of Object.values(mapa)) {
        for (const m of lista) if (m.id) novo.set(hashDoId(m.id), m);
      }
      porHash = novo;
      garantir();
    });
  };

  carregar();
  chrome.storage.onChanged.addListener((mudancas) => {
    if ('bc2_apagadas' in mudancas) carregar();
  });
  perfilAtual.subscribe(() => (logado() ? garantir() : limpar()));

  const obs = new MutationObserver(() => garantir());
  obs.observe(document.body, { childList: true, subtree: true });
  setInterval(garantir, 3000); // troca de conversa e rolagem rápida

  // Diagnóstico: `__bcApagadas()` no console.
  (window as any).__bcApagadas = () => ({
    logado: logado(),
    guardadas: porHash.size,
    naTela: document.querySelectorAll('.bc-ap').length,
  });
}
