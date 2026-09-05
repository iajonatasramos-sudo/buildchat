// Tipos portados de BuildClinic src/lib/dental-chat/types.ts (versão local da extensão).

/** Cor da categoria — hex livre (ex.: "#22c55e"). Nomes antigos ainda aceitos. */
export type CorCategoria = string;
export const CORES_CATEGORIA: string[] = [
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#f59e0b',
  '#ef4444',
  '#14b8a6',
  '#6366f1',
];

export type TipoResposta = 'texto' | 'imagem' | 'audio' | 'video' | 'documento';
export const TIPOS_RESPOSTA: TipoResposta[] = ['texto', 'imagem', 'audio', 'video', 'documento'];
/** Tipos que exigem arquivo (mídia). */
export const TIPOS_MIDIA: TipoResposta[] = ['imagem', 'audio', 'video', 'documento'];

export type CategoriaDC = {
  id: string;
  nome: string;
  cor: CorCategoria;
  ordem: number;
  padrao: boolean;
};

/** Uma ação na sequência de uma resposta rápida. */
export type AcaoDC = {
  tipo: TipoResposta;
  texto: string; // corpo (texto) ou legenda (mídia)
  /** "seed/media/x.ogg" (arquivo da extensão) ou "media:<id>" (chrome.storage). */
  midiaPath: string | null;
  midiaMime: string | null;
  midiaNome: string | null;
  delaySegundos: number;
};

export type RespostaDC = {
  id: string;
  /** Restrição da mensagem da empresa: vazio = todos. Preenchido, só estes. */
  visivelEquipes?: string[];
  visivelUsuarios?: string[];
  categoriaId: string | null;
  titulo: string;
  atalho: string;
  usos: number;
  ordem: number;
  padrao: boolean;
  tagId: string | null;
  tagNome: string | null;
  tagCor: string | null;
  acoes: AcaoDC[];
};

export type TagOpt = { id: string; nome: string; cor: string };

export type MensagensRapidasData = {
  categorias: CategoriaDC[];
  respostas: RespostaDC[];
  tags: TagOpt[];
};

export type NotaContato = {
  id: string;
  conteudo: string;
  criadoEm: string;
};

/** Ficha do contato — nome de tratamento, interesses e último envio. */
export type FichaContato = {
  nome: string | null;
  nomeWhatsapp: string | null;
  interesses: string | null;
  ultimoContato: string | null;
};

export type ContatoAtivo = {
  /** id._serialized do WPP (ex.: 5511999999999@c.us) ou "wa:<título>" no fallback DOM. */
  chatId: string;
  nome: string;
  telefone: string | null;
  ehGrupo: boolean;
};

export type TemaEscolha = 'auto' | 'claro' | 'gray' | 'escuro';

export type Settings = {
  webhookUrl: string;
  triggerChar: string;
  /** 'auto' segue o tema do WhatsApp; 'gray' é o grafite (dim). */
  tema: TemaEscolha;
};

export const VARIAVEIS_DISPONIVEIS = [
  { chave: '{{nome}}', descricao: 'Nome do contato' },
  { chave: '{{primeiro_nome}}', descricao: 'Primeiro nome do contato' },
  { chave: '{{saudacao}}', descricao: 'Bom dia / Boa tarde / Boa noite' },
  { chave: '{{data}}', descricao: 'Data de hoje (dd/mm/aaaa)' },
] as const;

export function aplicarVariaveis(
  texto: string,
  ctx: { nome?: string | null; telefone?: string | null },
): string {
  const nome = (ctx.nome ?? '').trim();
  const primeiro = nome.split(/\s+/)[0] ?? '';
  const h = new Date().getHours();
  const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const data = new Date().toLocaleDateString('pt-BR');
  return texto
    .replaceAll('{{nome}}', nome)
    .replaceAll('{{primeiro_nome}}', primeiro)
    .replaceAll('{{telefone}}', (ctx.telefone ?? '').trim())
    .replaceAll('{{saudacao}}', saudacao)
    .replaceAll('{{data}}', data);
}
