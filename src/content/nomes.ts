// Nome de tratamento na LISTA e no CABEÇALHO do próprio WhatsApp.
//
// O WhatsApp lê o nome da agenda do celular — não dá para renomear o contato
// por aqui. O que dá é reescrever o que aparece na tela: onde o WhatsApp
// desenha "Comercial - Minha Clínica", mostramos "Dr. Jonatas", o nome que a
// equipe deu na ficha. É só exibição: o `title` do elemento (e o que o WPP
// devolve) continuam com o nome original, então casar vínculo com conversa e
// `getActiveChatTitle()` seguem funcionando.
//
// O React do WhatsApp repõe o texto a cada renderização; o observer reaplica.

import * as db from '@/lib/db';

/** nome no WhatsApp → nome de tratamento (só fichas que têm os dois). */
let dePara = new Map<string, string>();

/** Onde o WhatsApp escreve o nome: título das linhas da lista e do cabeçalho. */
const ALVOS = ['#pane-side span[title]', '#main header span[title]'];

async function recarregarMapa() {
  const fichas = await db.mapaFichas();
  const novo = new Map<string, string>();
  for (const f of Object.values(fichas)) {
    const original = f.nomeWhatsapp?.trim();
    const tratamento = f.nome?.trim();
    if (original && tratamento && original !== tratamento) novo.set(original, tratamento);
  }
  dePara = novo;
  aplicar();
}

function aplicar() {
  if (dePara.size === 0) return;
  for (const seletor of ALVOS) {
    for (const el of document.querySelectorAll<HTMLElement>(seletor)) {
      const original = el.getAttribute('title')?.trim();
      if (!original) continue;
      const nome = dePara.get(original);
      if (nome && el.textContent !== nome) el.textContent = nome;
    }
  }
}

export function montarNomes() {
  recarregarMapa();

  // A ficha mudou (aqui ou veio pelo sync): refaz o mapa e reaplica.
  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area === 'local' && mudancas.bc2_contatos) recarregarMapa();
  });

  // O WhatsApp remonta lista e cabeçalho o tempo todo; coalesce num frame.
  let agendado = 0;
  const obs = new MutationObserver(() => {
    if (agendado) return;
    agendado = requestAnimationFrame(() => {
      agendado = 0;
      aplicar();
    });
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
}
