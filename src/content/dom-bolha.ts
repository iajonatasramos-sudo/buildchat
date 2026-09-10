// Ajudas para encaixar coisas nossas DENTRO da bolha de uma mensagem do
// WhatsApp. Usadas pela transcrição de áudio e pelas mensagens apagadas.

/**
 * `false_5511@c.us_3EB0ABC` → `3EB0ABC`. O `data-id` do DOM e o id do WPP
 * podem divergir no remetente (`@lid` × `@c.us`); o hash é o que coincide.
 */
export const hashDoId = (id: string) => {
  const partes = id.split('_');
  return partes.length >= 3 ? partes[2] : id;
};

/**
 * Acha o balão da mensagem por GEOMETRIA: o elemento mais externo, dentro da
 * linha, que tem fundo próprio e é mais estreito que ela. Procurar por classe
 * não vale — elas mudam a cada versão do WhatsApp — e ancorar na linha joga o
 * conteúdo para a borda esquerda, fora do balão.
 */
export function acharBolha(linha: HTMLElement): HTMLElement {
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
