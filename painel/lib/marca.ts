// Uma instalação do painel, duas marcas.
//
// O painel e o banco são ÚNICOS: quem entra por painel.anamni.com.br vê
// Anamni, quem entra pelo endereço da BuildClinic vê BuildChat. Cada clínica
// já é isolada pela RLS, então nada além da casca muda.
//
// A marca é decidida pelo DOMÍNIO da requisição (o layout põe `data-marca` no
// <html> e passa o valor adiante pelo MarcaProvider). Em desenvolvimento vale
// PAINEL_MARCA, e no fim a padrão.

export type IdMarca = 'buildchat' | 'anamni';

export type Marca = {
  id: IdMarca;
  nome: string;
  /** Símbolo provisório no lugar do logo; troque por <img> quando houver arte. */
  simbolo: string;
  /** Endereço público deste painel (usado nos textos de credenciais). */
  url: string;
  /** Nome do .zip publicado por `npm run pacote` / `pacote:anamni`. */
  arquivoExtensao: string;
  arquivoVersao: string;
  /** Trecho do domínio que identifica a marca na requisição. */
  hosts: string[];
  /** Etiquetas oferecidas na agenda — cada produto tem a sua lista. */
  etiquetasAgenda: { nome: string; cor: string }[];
};

export const MARCAS: Record<IdMarca, Marca> = {
  buildchat: {
    id: 'buildchat',
    nome: 'BuildChat',
    simbolo: '⚡',
    url: 'https://chat.buildclinic.com.br',
    arquivoExtensao: '/buildchat-extensao.zip',
    arquivoVersao: 'versao-buildchat.txt',
    hosts: ['chat.buildclinic.com.br', 'buildclinic'],
    etiquetasAgenda: [
      { nome: 'Follow-up', cor: '#2563EB' },
      { nome: 'Reunião', cor: '#7C3AED' },
      { nome: 'Cobrar', cor: '#D97706' },
      { nome: 'Urgente', cor: '#DC2626' },
    ],
  },
  anamni: {
    id: 'anamni',
    nome: 'Anamni',
    simbolo: '🩺',
    url: 'https://painel.anamni.com.br',
    arquivoExtensao: '/anamni-extensao.zip',
    arquivoVersao: 'versao-anamni.txt',
    hosts: ['anamni.com.br', 'anamni'],
    etiquetasAgenda: [
      { nome: 'Follow-up', cor: '#2563EB' },
      { nome: 'Consulta', cor: '#0D9488' },
      { nome: 'Retorno', cor: '#7C3AED' },
      { nome: 'Urgente', cor: '#DC2626' },
    ],
  },
};

export const MARCA_PADRAO: IdMarca =
  (process.env.PAINEL_MARCA as IdMarca) in MARCAS ? (process.env.PAINEL_MARCA as IdMarca) : 'buildchat';

/** Qual marca serve este endereço. Sem domínio conhecido, vale a padrão. */
export function marcaPorHost(host?: string | null): Marca {
  const h = (host ?? '').toLowerCase();
  for (const m of Object.values(MARCAS)) {
    if (m.hosts.some((d) => h.includes(d))) return m;
  }
  return MARCAS[MARCA_PADRAO];
}

export const ehMarca = (v: unknown): v is IdMarca => v === 'buildchat' || v === 'anamni';
