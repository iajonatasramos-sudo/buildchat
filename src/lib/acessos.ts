// Quem enxerga cada função da extensão.
//
// O admin configura no painel (Acessos) por pessoa ou por equipe; aqui a
// extensão lê o que desceu no sync e decide o que montar. **Sem configuração
// para a função, ela vale para todo mundo** — clínica que nunca mexeu nisso
// continua vendo tudo.
//
// A lista de chaves mora aqui porque é a tela que sabe o que existe. O banco
// guarda só o texto, então acrescentar uma função nova não pede migração.

import { minhasEquipes } from './sync';
import { perfilAtual } from './store';

export type ChaveRecurso =
  | 'contato'
  | 'rapidas'
  | 'automacoes'
  | 'agenda'
  | 'webhooks'
  | 'conta_whatsapp'
  | 'meus_contatos';

export const RECURSOS: { chave: ChaveRecurso; nome: string; onde: string }[] = [
  { chave: 'contato', nome: 'Guia Contato', onde: 'barra lateral — dados, etiquetas, agenda e anotações do contato' },
  { chave: 'rapidas', nome: 'Mensagens rápidas', onde: 'barra lateral e ⚡ da caixa de mensagem' },
  { chave: 'automacoes', nome: 'Automações', onde: 'barra lateral — bots, campanhas e notificações' },
  { chave: 'agenda', nome: 'Agenda', onde: 'ícone de calendário na barra do topo' },
  { chave: 'webhooks', nome: 'WebHooks', onde: 'barra lateral — envio para outro sistema' },
  { chave: 'conta_whatsapp', nome: 'Conta de WhatsApp', onde: 'barra lateral — qual número está conectado' },
  { chave: 'meus_contatos', nome: 'Meus contatos no painel', onde: 'barra lateral — atalho para o painel web' },
];

export type AcessoRecurso = {
  recurso: string;
  visivelTodos: boolean;
  visivelEquipes: string[];
  visivelUsuarios: string[];
};

const CHAVE = 'bc2_acessos';

export const salvarAcessos = (lista: AcessoRecurso[]) =>
  new Promise<void>((r) => chrome.storage.local.set({ [CHAVE]: lista }, () => r()));

export const listarAcessos = () =>
  new Promise<AcessoRecurso[]>((r) => chrome.storage.local.get(CHAVE, (res) => r(res[CHAVE] ?? [])));

/** Estado atual de todas as funções, pronto para a interface consultar. */
export async function meusRecursos(): Promise<Record<ChaveRecurso, boolean>> {
  const [acessos, equipes] = await Promise.all([listarAcessos(), minhasEquipes()]);
  const perfil = perfilAtual.get();
  const daEquipe = new Set(equipes);
  const mapa = {} as Record<ChaveRecurso, boolean>;

  for (const { chave } of RECURSOS) {
    const regra = acessos.find((a) => a.recurso === chave);
    mapa[chave] =
      !regra || // sem regra, todo mundo vê
      !perfil ||
      perfil.papel === 'admin' || // quem configura não se tranca do lado de fora
      regra.visivelTodos ||
      regra.visivelUsuarios.includes(perfil.id) ||
      regra.visivelEquipes.some((e) => daEquipe.has(e));
  }
  return mapa;
}
