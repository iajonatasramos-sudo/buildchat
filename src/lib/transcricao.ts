// Transcrição de áudio.
//
// A transcrição NÃO acontece aqui: a extensão pega o áudio da mensagem, manda
// para a API do BuildClinic e recebe o texto. Mesmo padrão da proposta — o
// endereço e o token vêm de uma integração cadastrada pelo gestor em
// /sistema/api e trazida pelo sync.

import { obterIntegracao } from './db';

export const API_TRANSCRICAO = 'https://app.buildclinic.com.br/api/transcrever';

/** 25 MB é o teto da API; barramos antes para não gastar upload à toa. */
export const LIMITE_BYTES = 25 * 1024 * 1024;

/**
 * A integração própria (`transcricao`) manda; sem ela, vale o token da
 * `propostas`, que é o mesmo da API — assim quem já configurou a proposta ganha
 * a transcrição sem mexer em nada.
 */
async function credenciais(): Promise<{ url: string; token: string }> {
  const propria = await obterIntegracao('transcricao');
  const token = propria?.token?.trim() || (await obterIntegracao('propostas'))?.token?.trim();
  if (!token) {
    throw new Error(
      'A API de transcrição ainda não foi configurada. Peça ao gestor do BuildChat para cadastrá-la em API.',
    );
  }
  return { url: propria?.url?.trim() || API_TRANSCRICAO, token };
}

/** Já há transcrição disponível para esta conta? (esconde o botão de quem não tem) */
export async function transcricaoDisponivel(): Promise<boolean> {
  const propria = await obterIntegracao('transcricao');
  return !!(propria?.token?.trim() || (await obterIntegracao('propostas'))?.token?.trim());
}

/** Manda o áudio e devolve o texto. Erros sobem com a mensagem da API. */
export async function transcrever(audio: Blob): Promise<string> {
  if (audio.size === 0) throw new Error('Não consegui ler este áudio. Toque nele uma vez e tente de novo.');
  if (audio.size > LIMITE_BYTES) throw new Error('Áudio maior que 25 MB.');

  const { url, token } = await credenciais();

  const corpo = new FormData();
  corpo.append('file', audio, 'audio.ogg');

  let resposta: Response;
  try {
    resposta = await fetch(`${url}?token=${encodeURIComponent(token)}`, { method: 'POST', body: corpo });
  } catch {
    throw new Error('Não consegui falar com o servidor de transcrição. Verifique a conexão.');
  }

  // A API responde { ok, texto } | { ok:false, erro } — inclusive nos erros HTTP.
  let dados: { ok?: boolean; texto?: string; erro?: string } | null = null;
  try {
    dados = await resposta.json();
  } catch {
    /* resposta sem JSON — cai nas mensagens por status abaixo */
  }

  if (dados?.ok && dados.texto?.trim()) return dados.texto.trim();

  if (dados?.erro) throw new Error(traduzir(dados.erro));
  if (resposta.status === 401) throw new Error('Token da API inválido ou expirado.');
  if (resposta.status === 413) throw new Error('Áudio maior que 25 MB.');
  throw new Error(`Falha ao transcrever (${resposta.status}).`);
}

/** A API responde alguns erros em inglês; o atendente lê em português. */
function traduzir(erro: string): string {
  if (erro.toLowerCase() === 'unauthorized') return 'Token da API inválido ou expirado.';
  return erro;
}
