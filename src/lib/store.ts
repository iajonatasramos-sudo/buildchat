// Mini-store compartilhado entre as raízes React (barra de pastas fica em um
// shadow root próprio no topo da lista; o painel/app em outro). Mesmo bundle,
// então um pub/sub de módulo basta.

type Listener<T> = (v: T) => void;

function criarSinal<T>(inicial: T) {
  let valor = inicial;
  const listeners = new Set<Listener<T>>();
  return {
    get: () => valor,
    set(v: T) {
      valor = v;
      listeners.forEach((fn) => fn(v));
    },
    subscribe(fn: Listener<T>) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

/** Etiqueta (tagId) usada como "pasta" ativa; null = Todas (lista nativa). */
export const pastaAtiva = criarSinal<string | null>(null);

/** Tema atual do WhatsApp Web ('light' | 'dark'). */
export const tema = criarSinal<'light' | 'dark'>('light');

/** Gaveta lateral (painel de mensagens rápidas) aberta? */
export const gavetaAberta = criarSinal<boolean>(false);

/** Menu aberto a partir da barra do cabeçalho da conversa. */
export type MenuHeader = { tipo: 'etiquetas' | 'filtros' | 'apagadas'; x: number; y: number } | null;
export const menuHeader = criarSinal<MenuHeader>(null);

/** Modal de Anotações da conversa aberta. */
export const modalAnotacoes = criarSinal<boolean>(false);

/** Perfil carregado do servidor (null = sem login / modo local). */
import type { Perfil } from './auth';
export const perfilAtual = criarSinal<Perfil | null>(null);

/** Modal de entrar / criar conta. */
export const modalConta = criarSinal<boolean>(false);

/** Estado da sincronização mostrado na barra do topo. */
export type EstadoSync = 'local' | 'sincronizando' | 'ok' | 'erro' | 'bloqueado';
export const estadoSync = criarSinal<EstadoSync>('local');

/** Modal "Gerar proposta" (usa o contato da conversa aberta). */
export const modalProposta = criarSinal<boolean>(false);
/** Incrementa quando uma proposta é criada/enviada — a guia Contato recarrega a lista. */
export const propostasMudaram = criarSinal<number>(0);
