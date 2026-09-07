// Automações — catálogo (gatilhos, condições, ações) e modelos.
//
// Copiado do Sales BuildClinic (src/lib/sales/automacoes-types.ts) com o que
// faz sentido aqui: o lead da extensão é a conversa do WhatsApp, organizada
// por PASTAS — não há origem, etapa nem responsável, então essas ações ficam
// de fora. O motor roda NO NAVEGADOR (ver motor.ts): o WhatsApp é o da aba.

// ── Condições ────────────────────────────────────────────────────────────────
export const CAMPOS_CONDICAO = ['mensagem', 'ddd', 'telefone'] as const;
export type CampoCondicao = (typeof CAMPOS_CONDICAO)[number];

export const OPERADORES = ['contem', 'exato', 'palavra', 'regex', 'igual', 'em', 'comeca_com'] as const;
export type OperadorCondicao = (typeof OPERADORES)[number];

/** Operadores válidos por campo (para montar os seletores). */
export const OPERADORES_POR_CAMPO: Record<CampoCondicao, OperadorCondicao[]> = {
  mensagem: ['contem', 'exato', 'palavra', 'regex'],
  ddd: ['igual', 'em'],
  telefone: ['comeca_com', 'regex', 'igual'],
};

export const LABEL_CAMPO: Record<CampoCondicao, string> = {
  mensagem: 'Mensagem',
  ddd: 'DDD',
  telefone: 'Telefone',
};

export const LABEL_OPERADOR: Record<OperadorCondicao, string> = {
  contem: 'contém',
  exato: 'é exatamente',
  palavra: 'contém a palavra',
  regex: 'casa a regex',
  igual: 'é igual a',
  em: 'está na lista',
  comeca_com: 'começa com',
};

export type Condicao = {
  campo: CampoCondicao;
  operador: OperadorCondicao;
  valor: string;
  /** Fase da sequência (1 = "Quando"; 2+ = blocos "Então"). */
  fase?: number;
};

// ── Ações ────────────────────────────────────────────────────────────────────
export const TIPOS_ACAO = [
  'enviar_mensagem',
  'enviar_resposta_rapida',
  'mover_pasta',
  'remover_pasta',
  'espera',
] as const;
export type TipoAcao = (typeof TIPOS_ACAO)[number];

export const LABEL_ACAO: Record<TipoAcao, string> = {
  enviar_mensagem: 'Enviar mensagem',
  enviar_resposta_rapida: 'Enviar mensagem rápida',
  mover_pasta: 'Adicionar à pasta',
  remover_pasta: 'Remover da pasta',
  espera: 'Esperar',
};

export const UNIDADES_ESPERA = ['seg', 'min', 'hora', 'dia'] as const;
export type UnidadeEspera = (typeof UNIDADES_ESPERA)[number];

export const LABEL_UNIDADE_ESPERA: Record<UnidadeEspera, string> = {
  seg: 'segundos',
  min: 'minutos',
  hora: 'horas',
  dia: 'dias',
};

/** Converte espera (valor+unidade) em milissegundos. */
export function esperaEmMs(valor: number, unidade: UnidadeEspera): number {
  const mult: Record<UnidadeEspera, number> = { seg: 1000, min: 60_000, hora: 3_600_000, dia: 86_400_000 };
  return Math.max(0, valor || 0) * mult[unidade];
}

export type Acao = {
  tipo: TipoAcao;
  texto?: string | null;
  respostaId?: string | null;
  pastaId?: string | null;
  /** "Esperar antes" desta ação. */
  esperaValor?: number;
  esperaUnidade?: UnidadeEspera;
  /** Fase da sequência (1 = gatilho; 2+ = blocos "Então"). */
  fase?: number;
};

export const REEXECUCOES = ['uma_vez', 'sempre'] as const;
export type Reexecucao = (typeof REEXECUCOES)[number];
export const LABEL_REEXECUCAO: Record<Reexecucao, string> = {
  uma_vez: '1× por contato',
  sempre: 'toda vez que casar',
};

export const GATILHOS = ['mensagem', 'lead_webhook'] as const;
export type Gatilho = (typeof GATILHOS)[number];
export const LABEL_GATILHO: Record<Gatilho, string> = {
  mensagem: 'Mensagem recebida',
  lead_webhook: 'Lead recebido via webhook (requer backend)',
};

export type Automacao = {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
  pararNoMatch: boolean;
  reexecucao: Reexecucao;
  condicaoCombinacao: 'E' | 'OU';
  gatilho: Gatilho;
  condicoes: Condicao[];
  acoes: Acao[];
  /** Quantas vezes já disparou (contador local). */
  execucoes: number;
  atualizadoEm: string;
};

// ── Execução (fila durável) ──────────────────────────────────────────────────
export type StatusExecucao = 'agendado' | 'concluido' | 'erro' | 'cancelado';

export type Execucao = {
  id: string;
  /** De onde veio: uma regra (bot) ou uma campanha. */
  origem: { tipo: 'bot'; automacaoId: string } | { tipo: 'campanha'; campanhaId: string };
  chatId: string;
  /** Alvos do gatilho — as fases 2+ são avaliadas com eles. */
  contexto: { texto: string; telefone: string; ddd: string; nome: string };
  acoes: Acao[];
  condicoes: Condicao[];
  condicaoCombinacao: 'E' | 'OU';
  proximoIndice: number;
  /** Epoch ms: quando a próxima ação pode rodar. */
  executarEm: number;
  status: StatusExecucao;
  erro?: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

// ── Campanhas ────────────────────────────────────────────────────────────────
export const CAMPOS_SEGMENTO = ['pasta', 'ddd', 'dias_sem_contato'] as const;
export type CampoSegmento = (typeof CAMPOS_SEGMENTO)[number];
export const LABEL_CAMPO_SEGMENTO: Record<CampoSegmento, string> = {
  pasta: 'Está na pasta',
  ddd: 'DDD',
  dias_sem_contato: 'Dias sem contato (mínimo)',
};

/** Regra de segmento: valores é lista (pasta/ddd) ou número (dias: valores[0]). */
export type RegraSegmento = { campo: CampoSegmento; valores: string[] };

export type StatusCampanha = 'rascunho' | 'rodando' | 'concluida' | 'cancelada';

export type AlvoCampanha = {
  chatId: string;
  nome: string;
  status: 'pendente' | 'enviado' | 'erro' | 'pulado';
  enviarEm: number;
  erro?: string | null;
};

export type Campanha = {
  id: string;
  nome: string;
  status: StatusCampanha;
  intervaloMinSeg: number;
  intervaloMaxSeg: number;
  segmento: RegraSegmento[];
  acoes: Acao[];
  alvos: AlvoCampanha[];
  totalAlvos: number;
  totalEnviados: number;
  totalErros: number;
  criadoEm: string;
  atualizadoEm: string;
};

// ── Notificações ─────────────────────────────────────────────────────────────
// Eventos que a extensão emite de verdade (não há "venda"/"closer" aqui).
export const EVENTOS_NOTIF = ['proposta_gerada', 'proposta_enviada', 'contato_em_pasta'] as const;
export type EventoNotif = (typeof EVENTOS_NOTIF)[number];
export const LABEL_EVENTO_NOTIF: Record<EventoNotif, string> = {
  proposta_gerada: 'Proposta gerada',
  proposta_enviada: 'Proposta enviada na conversa',
  contato_em_pasta: 'Contato colocado numa pasta',
};
export const CAMPOS_NOTIF = ['contato', 'telefone', 'detalhe', 'quem', 'quando'] as const;
export type CampoNotif = (typeof CAMPOS_NOTIF)[number];
export const LABEL_CAMPO_NOTIF: Record<CampoNotif, string> = {
  contato: 'Nome do contato',
  telefone: 'Telefone',
  detalhe: 'Detalhe (tipo/valor da proposta, pasta)',
  quem: 'Quem fez',
  quando: 'Data e hora',
};

export type NotificacaoConfig = {
  evento: EventoNotif;
  ativo: boolean;
  /** Números (só dígitos) ou jids que recebem o aviso no WhatsApp. */
  destinatarios: string[];
  campos: CampoNotif[];
  textoExtra: string;
};

// ── Webhook (saída) ──────────────────────────────────────────────────────────
export const EVENTOS_WEBHOOK = ['mensagem_recebida', 'proposta_gerada', 'proposta_enviada', 'contato_em_pasta', 'bot_disparado'] as const;
export type EventoWebhook = (typeof EVENTOS_WEBHOOK)[number];
export const LABEL_EVENTO_WEBHOOK: Record<EventoWebhook, string> = {
  mensagem_recebida: 'Mensagem recebida',
  proposta_gerada: 'Proposta gerada',
  proposta_enviada: 'Proposta enviada',
  contato_em_pasta: 'Contato colocado numa pasta',
  bot_disparado: 'Bot disparado',
};

export type WebhookConfig = {
  url: string;
  ativo: boolean;
  eventos: EventoWebhook[];
  /** Cabeçalho opcional para o receptor conferir a origem. */
  segredo: string;
};

export const novaAutomacao = (ordem: number): Automacao => ({
  id: crypto.randomUUID(),
  nome: '',
  ativo: true,
  ordem,
  pararNoMatch: false,
  reexecucao: 'uma_vez',
  condicaoCombinacao: 'E',
  gatilho: 'mensagem',
  condicoes: [],
  acoes: [{ tipo: 'enviar_mensagem', texto: '', esperaValor: 0, esperaUnidade: 'seg', fase: 1 }],
  execucoes: 0,
  atualizadoEm: new Date().toISOString(),
});

export const novaCampanha = (): Campanha => ({
  id: crypto.randomUUID(),
  nome: '',
  status: 'rascunho',
  intervaloMinSeg: 20,
  intervaloMaxSeg: 60,
  segmento: [{ campo: 'pasta', valores: [] }],
  acoes: [{ tipo: 'enviar_mensagem', texto: '', fase: 1 }],
  alvos: [],
  totalAlvos: 0,
  totalEnviados: 0,
  totalErros: 0,
  criadoEm: new Date().toISOString(),
  atualizadoEm: new Date().toISOString(),
});
