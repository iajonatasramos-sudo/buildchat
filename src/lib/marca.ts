// Duas marcas, o mesmo código: BuildChat (grupo BuildClinic) e Anamni
// (produto comercial, vendido para os doutores).
//
// A marca é escolhida NA COMPILAÇÃO (`MARCA=anamni npm run pacote`), não em
// tempo de execução: cada uma vira uma extensão própria na Chrome Web Store,
// com identificador, ícone e armazenamento separados. Servidor, banco e painel
// continuam ÚNICOS — o que muda aqui é só a casca e a lista de recursos.
//
// Para tirar ou devolver uma função a um dos produtos, mexa em `recursos`
// abaixo. Nada mais no código precisa saber de marca.

/** Funções que podem ser ligadas/desligadas por produto. */
export type Recurso = 'propostas' | 'transcricao' | 'automacoes';

export type IdMarca = 'buildchat' | 'anamni';

export type Marca = {
  id: IdMarca;
  /** Nome curto, o que aparece na interface. */
  nome: string;
  /** Nome da listagem na Chrome Web Store. */
  nomeNaLoja: string;
  descricao: string;
  /** Painel web correspondente (a barra lateral abre já logado). */
  painelUrl: string;
  /** Domínios extras liberados no manifesto (APIs que a extensão chama). */
  dominios: string[];
  recursos: Record<Recurso, boolean>;
};

export const MARCAS: Record<IdMarca, Marca> = {
  buildchat: {
    id: 'buildchat',
    nome: 'BuildChat',
    nomeNaLoja: 'BuildChat - Gestão de leads e pacientes no WhatsApp',
    descricao: 'Otimize o atendimento com mensagens rápidas, etiquetas e CRM direto no WhatsApp Web.',
    painelUrl: 'https://chat.buildclinic.com.br',
    dominios: ['https://app.buildclinic.com.br/*'],
    recursos: { propostas: true, transcricao: true, automacoes: true },
  },
  anamni: {
    id: 'anamni',
    nome: 'Anamni',
    nomeNaLoja: 'Anamni - Atendimento e CRM no WhatsApp para consultórios',
    descricao: 'Mensagens rápidas, etiquetas, anotações e CRM do paciente direto no WhatsApp Web.',
    painelUrl: 'https://painel.anamni.com.br',
    // A API de transcrição é a mesma (cadastrada por clínica em /sistema/api);
    // o domínio próprio já fica liberado para quando ela mudar de casa.
    dominios: ['https://app.buildclinic.com.br/*', 'https://*.anamni.com.br/*'],
    // Gerar proposta é a proposta de arquitetura da BuildClinic — não faz
    // sentido no consultório do doutor.
    recursos: { propostas: false, transcricao: true, automacoes: true },
  },
};

// Substituído literalmente pelo Vite (`define`), por isso o typeof: fora do
// build (tsc, testes) o símbolo não existe e vale o padrão.
declare const __MARCA__: IdMarca | undefined;
const escolhida: IdMarca =
  typeof __MARCA__ !== 'undefined' && __MARCA__ in MARCAS ? __MARCA__ : 'buildchat';

/** A marca deste pacote. */
export const MARCA: Marca = MARCAS[escolhida];

/** Esta versão tem o recurso? */
export function temRecurso(r: Recurso): boolean {
  return MARCA.recursos[r];
}

/**
 * Cabeçalho do segredo nos webhooks de saída. Leva o nome do produto, então
 * quem integra com o Anamni recebe `X-Anamni-Secret`.
 */
export const CABECALHO_SEGREDO = `X-${MARCA.nome}-Secret`;
