// Credenciais do projeto Supabase (públicas — podem ir no bundle da extensão).
// A service_role NUNCA entra aqui: ela ignora toda a RLS.
//
// Preencha com os valores de Settings → API do seu projeto.

export const SUPABASE_URL = 'https://jlzgnshwzlpnaaksozur.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_SAaQ6RvdOEU4UZMnbxkpcg_COzqkDAj';

/** Ainda não configurado? A extensão segue 100% local, sem tentar sincronizar. */
export function servidorConfigurado(): boolean {
  return !SUPABASE_URL.includes('SEU-PROJETO') && !SUPABASE_ANON_KEY.startsWith('COLE_AQUI');
}
