// Sessão do usuário (Supabase Auth) + perfil da empresa e status da licença.
//
// Regras de produto:
//   * a extensão funciona offline e sem login — o servidor é para sincronizar;
//   * a licença é verificada no login e periodicamente, com TOLERÂNCIA OFFLINE:
//     o vendedor não pode ficar travado no meio de um atendimento por falta de rede.

import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, servidorConfigurado } from './config';

export type Empresa = {
  id: string;
  nome: string;
  status: 'trial' | 'ativa' | 'inadimplente' | 'cancelada';
  trial_ate: string | null;
  assentos: number;
};

export type Perfil = {
  id: string;
  nome: string;
  email: string;
  papel: 'admin' | 'usuario';
  empresa: Empresa;
};

const CHAVE_PERFIL = 'bc2_perfil_cache';
/** Dias que a licença continua valendo sem conseguir falar com o servidor. */
const TOLERANCIA_OFFLINE_DIAS = 7;

// A sessão vive em chrome.storage (o localStorage da página é do WhatsApp).
const storageChrome = {
  getItem: (k: string) =>
    new Promise<string | null>((r) => chrome.storage.local.get(k, (res) => r(res[k] ?? null))),
  setItem: (k: string, v: string) =>
    new Promise<void>((r) => chrome.storage.local.set({ [k]: v }, () => r())),
  removeItem: (k: string) => new Promise<void>((r) => chrome.storage.local.remove(k, () => r())),
};

let cliente: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!servidorConfigurado()) return null;
  cliente ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: storageChrome,
      storageKey: 'bc2_sessao',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // não há redirect numa extensão
    },
  });
  return cliente;
}

// ───────────────────────────── Sessão ─────────────────────────────

export async function sessaoAtual(): Promise<Session | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

export function observarSessao(cb: (s: Session | null) => void): () => void {
  const sb = supabase();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((_evento, sessao) => cb(sessao));
  return () => data.subscription.unsubscribe();
}

export async function entrar(email: string, senha: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const sb = supabase();
  if (!sb) return { ok: false, erro: 'Servidor não configurado nesta build.' };
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
  if (error) return { ok: false, erro: traduzir(error.message) };
  return { ok: true };
}

const CHAVE_PENDENTE = 'bc2_cadastro_pendente';
const CHAVE_CONVITE = 'bc2_convite_pendente';

/**
 * Com "Confirm email" ligado, o signup NÃO abre sessão: o usuário confirma por
 * e-mail e volta para entrar. Guardamos o nome da clínica até lá e criamos a
 * empresa no primeiro login bem-sucedido.
 */
async function guardarCadastroPendente(empresa: string, nome: string) {
  await new Promise<void>((r) =>
    chrome.storage.local.set({ [CHAVE_PENDENTE]: { empresa, nome } }, () => r()),
  );
}

async function finalizarCadastroPendente(): Promise<boolean> {
  const sb = supabase();
  if (!sb) return false;

  // Convite guardado antes da confirmação de e-mail
  const convite = await new Promise<{ codigo: string; nome: string } | null>((r) =>
    chrome.storage.local.get(CHAVE_CONVITE, (res) => r(res[CHAVE_CONVITE] ?? null)),
  );
  if (convite) {
    const { error } = await sb.rpc('aceitar_convite', {
      p_token: convite.codigo,
      p_nome: convite.nome,
    });
    await new Promise<void>((r) => chrome.storage.local.remove(CHAVE_CONVITE, () => r()));
    if (!error) return true;
    console.warn('[BuildChat] convite pendente falhou:', error.message);
  }
  const pendente = await new Promise<{ empresa: string; nome: string } | null>((r) =>
    chrome.storage.local.get(CHAVE_PENDENTE, (res) => r(res[CHAVE_PENDENTE] ?? null)),
  );
  if (!pendente) return false;
  const { error } = await sb.rpc('criar_empresa_e_admin', {
    p_empresa: pendente.empresa,
    p_nome: pendente.nome,
  });
  await new Promise<void>((r) => chrome.storage.local.remove(CHAVE_PENDENTE, () => r()));
  if (error) {
    console.warn('[BuildChat] cadastro pendente falhou:', error.message);
    return false;
  }
  return true;
}

/** Cadastro: cria o usuário, a empresa e promove quem cadastrou a admin. */
export async function cadastrar(
  empresa: string,
  nome: string,
  email: string,
  senha: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const sb = supabase();
  if (!sb) return { ok: false, erro: 'Servidor não configurado nesta build.' };

  await guardarCadastroPendente(empresa, nome);

  const { error: erroSignup } = await sb.auth.signUp({ email: email.trim(), password: senha });
  if (erroSignup) return { ok: false, erro: traduzir(erroSignup.message) };

  // Sem confirmação de e-mail a sessão já vem pronta; com confirmação, o usuário
  // confirma, entra depois, e a empresa é criada nesse primeiro login.
  const { data } = await sb.auth.getSession();
  if (!data.session) return { ok: true };
  await new Promise<void>((r) => chrome.storage.local.remove(CHAVE_PENDENTE, () => r()));

  const { error } = await sb.rpc('criar_empresa_e_admin', { p_empresa: empresa, p_nome: nome });
  if (error) return { ok: false, erro: traduzir(error.message) };
  return { ok: true };
}

/**
 * Entrada por convite — mantida para uso futuro. Hoje o admin cria o acesso
 * direto pelo painel (e-mail + senha) e a pessoa apenas entra.
 */
export async function entrarComConvite(
  codigo: string,
  nome: string,
  email: string,
  senha: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const sb = supabase();
  if (!sb) return { ok: false, erro: 'Servidor não configurado nesta build.' };

  // Já tem conta? Entra. Senão, cria.
  const login = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
  if (login.error) {
    const { error } = await sb.auth.signUp({ email: email.trim(), password: senha });
    if (error) return { ok: false, erro: traduzir(error.message) };
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      await new Promise<void>((r) =>
        chrome.storage.local.set({ [CHAVE_CONVITE]: { codigo, nome } }, () => r()),
      );
      return { ok: true }; // confirmação de e-mail ligada: conclui no primeiro login
    }
  }

  const { error } = await sb.rpc('aceitar_convite', { p_token: codigo.trim(), p_nome: nome.trim() });
  return error ? { ok: false, erro: traduzir(error.message) } : { ok: true };
}

export async function sair(): Promise<void> {
  await supabase()?.auth.signOut();
  await new Promise<void>((r) => chrome.storage.local.remove(CHAVE_PERFIL, () => r()));
}

// ───────────────────────────── Perfil e licença ─────────────────────────────

/** Busca o perfil no servidor; sem rede, devolve o cache (ver tolerância offline). */
export async function carregarPerfil(): Promise<Perfil | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data: sessao } = await sb.auth.getSession();
  if (!sessao.session) return null;

  const buscar = () =>
    sb
      .from('usuarios')
      .select('id, nome, email, papel, empresa:empresas(id, nome, status, trial_ate, assentos)')
      .eq('id', sessao.session!.user.id)
      .maybeSingle();

  let { data, error } = await buscar();

  // Autenticado mas ainda sem empresa: é o cadastro que ficou esperando a
  // confirmação de e-mail. Conclui agora e recarrega.
  if (!error && !data && (await finalizarCadastroPendente())) {
    ({ data, error } = await buscar());
  }

  if (error || !data) {
    console.warn('[BuildChat] perfil offline/indisponível:', error?.message);
    return perfilEmCache();
  }
  const perfil = { ...(data as any), empresa: (data as any).empresa } as Perfil;
  registrarAcesso(perfil.id);
  await new Promise<void>((r) =>
    chrome.storage.local.set({ [CHAVE_PERFIL]: { perfil, em: Date.now() } }, () => r()),
  );
  return perfil;
}

/** Marca o uso da extensão no máximo uma vez por hora. */
let ultimoRegistro = 0;
function registrarAcesso(usuarioId: string): void {
  const agora = Date.now();
  if (agora - ultimoRegistro < 3600_000) return;
  ultimoRegistro = agora;
  supabase()
    ?.from('usuarios')
    .update({ ultimo_acesso: new Date().toISOString() })
    .eq('id', usuarioId)
    .then(({ error }) => error && console.warn('[BuildChat] último acesso:', error.message));
}

async function perfilEmCache(): Promise<Perfil | null> {
  const cache = await new Promise<{ perfil: Perfil; em: number } | null>((r) =>
    chrome.storage.local.get(CHAVE_PERFIL, (res) => r(res[CHAVE_PERFIL] ?? null)),
  );
  if (!cache) return null;
  const dias = (Date.now() - cache.em) / 86_400_000;
  return dias <= TOLERANCIA_OFFLINE_DIAS ? cache.perfil : null;
}

export type Licenca = { ativa: boolean; rotulo: string; diasRestantes: number | null };

export function avaliarLicenca(perfil: Perfil | null): Licenca {
  if (!perfil) return { ativa: false, rotulo: 'Sem conta', diasRestantes: null };
  const { status, trial_ate } = perfil.empresa;

  if (status === 'ativa') return { ativa: true, rotulo: 'Assinatura ativa', diasRestantes: null };
  if (status === 'trial') {
    const dias = trial_ate
      ? Math.ceil((new Date(trial_ate).getTime() - Date.now()) / 86_400_000)
      : null;
    if (dias !== null && dias <= 0) return { ativa: false, rotulo: 'Teste encerrado', diasRestantes: 0 };
    return {
      ativa: true,
      rotulo: dias === null ? 'Teste grátis' : `Teste grátis — ${dias} dia(s)`,
      diasRestantes: dias,
    };
  }
  if (status === 'inadimplente') return { ativa: false, rotulo: 'Assinatura vencida', diasRestantes: null };
  return { ativa: false, rotulo: 'Assinatura cancelada', diasRestantes: null };
}

function traduzir(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (m.includes('already registered')) return 'Este e-mail já tem conta.';
  if (m.includes('password')) return 'Senha muito curta (mínimo 6 caracteres).';
  if (m.includes('já pertence')) return 'Este usuário já está em uma empresa.';
  if (m.includes('assentos')) return 'A empresa atingiu o limite de usuários do plano.';
  if (m.includes('inválido ou expirado')) return 'Convite inválido ou expirado.';
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (m.includes('failed to fetch')) return 'Sem conexão com o servidor.';
  if (m.includes('rate limit')) return 'Muitas tentativas de cadastro. Aguarde alguns minutos.';
  return msg;
}
