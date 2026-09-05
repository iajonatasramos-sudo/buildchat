// Geração de proposta em PDF.
//
// O PDF NÃO é montado aqui: a extensão só junta os dados, chama a API do
// BuildClinic e recebe o arquivo pronto. O token fica nas Configurações da
// extensão (chrome.storage), para trocar sem precisar recompilar.

import { getSettings } from './db';

export const API_PROPOSTAS = 'https://app.buildclinic.com.br/api/propostas/gerar';

export type TipoProposta = 'EXEC_SP' | 'INT_SP' | 'EXEC_BR' | 'INT_BR' | 'VIGILANCIA';

export const TIPOS: { valor: TipoProposta; rotulo: string }[] = [
  { valor: 'EXEC_SP', rotulo: 'Executivo SP' },
  { valor: 'INT_SP', rotulo: 'Interiores SP' },
  { valor: 'EXEC_BR', rotulo: 'Executivo BR' },
  { valor: 'INT_BR', rotulo: 'Interior BR' },
  { valor: 'VIGILANCIA', rotulo: 'Vigilância Sanitária' },
];

export const ehInteriores = (t: TipoProposta) => t === 'INT_SP' || t === 'INT_BR';
export const ehVigilancia = (t: TipoProposta) => t === 'VIGILANCIA';

/** Aceita "12.000,00", "12000,50" e "R$ 12.000,00". */
export function parseValor(s: string): number | null {
  const n = Number(
    String(s)
      .replace(/[^\d,.-]/g, '')
      .replace(/\.(?=\d{3})/g, '')
      .replace(',', '.'),
  );
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Hoje por extenso, como a proposta exibe: "05 de Setembro de 2026". */
export function dataPorExtenso(d = new Date()): string {
  const texto = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  return texto.replace(/ de (\p{Ll})/u, (_, letra: string) => ` de ${letra.toUpperCase()}`);
}

export type Derivados = { avista: string; cartao: string; entrada: string; saldo: string; saldo2: string };

/**
 * Valores a partir do total. Vigilância parcela em 50/30/20; os demais usam a
 * porcentagem de entrada escolhida.
 */
export function calcular(
  total: number,
  { desconto, parcelas, entradaPct, tipo }: { desconto: number; parcelas: number; entradaPct: number; tipo: TipoProposta },
): Derivados {
  const avista = total * (1 - desconto / 100);
  const cartao = parcelas > 0 ? total / parcelas : 0;

  if (ehVigilancia(tipo)) {
    return {
      avista: brl(avista),
      cartao: brl(cartao),
      entrada: brl(total * 0.5),
      saldo: brl(total * 0.3),
      saldo2: brl(total * 0.2),
    };
  }
  return {
    avista: brl(avista),
    cartao: brl(cartao),
    entrada: brl((total * entradaPct) / 100),
    saldo: brl((total * (100 - entradaPct)) / 100),
    saldo2: '',
  };
}

export type DadosProposta = {
  nome: string;
  medida?: string;
  qambientes?: string;
  ambientes?: string;
  valor: string;
  avista: string;
  cartao: string;
  parcelas: string;
  entrada: string;
  saldo: string;
  saldo2?: string;
  prazo: string;
  data: string;
  notasExtras: string[];
  mostrarAvista?: boolean;
  mostrarCartao?: boolean;
  mostrarParcelado?: boolean;
};

/** Chama a API e devolve o PDF. Erros da API sobem com a mensagem dela. */
export async function gerarProposta(dados: DadosProposta, tipo: TipoProposta): Promise<Blob> {
  const { tokenPropostas } = await getSettings();
  if (!tokenPropostas.trim()) {
    throw new Error('Configure o token da API de propostas em ⚙ Configurações.');
  }

  let resposta: Response;
  try {
    resposta = await fetch(`${API_PROPOSTAS}?token=${encodeURIComponent(tokenPropostas.trim())}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, dados }),
    });
  } catch {
    throw new Error('Não consegui falar com o servidor de propostas. Verifique a conexão.');
  }

  if (!resposta.ok) {
    // A API responde { ok:false, erro:"..." }; se vier outra coisa, usa o status.
    let mensagem = `Falha ao gerar (${resposta.status}).`;
    try {
      const corpo = await resposta.json();
      if (corpo?.erro) mensagem = corpo.erro;
    } catch {
      if (resposta.status === 401) mensagem = 'Token da API inválido ou expirado.';
    }
    throw new Error(mensagem);
  }

  return resposta.blob();
}
