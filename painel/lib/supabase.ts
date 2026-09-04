'use client';

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } },
);

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

export async function carregarPerfil(): Promise<Perfil | null> {
  const { data: sessao } = await supabase.auth.getSession();
  if (!sessao.session) return null;
  const { data } = await supabase
    .from('usuarios')
    .select('id, nome, email, papel, empresa:empresas(id, nome, status, trial_ate, assentos)')
    .eq('id', sessao.session.user.id)
    .maybeSingle();
  return (data as unknown as Perfil) ?? null;
}

export type Licenca = { ativa: boolean; titulo: string; detalhe: string; dias: number | null };

export function avaliarLicenca(e: Empresa | undefined): Licenca {
  if (!e) return { ativa: false, titulo: 'Sem empresa', detalhe: '', dias: null };
  if (e.status === 'ativa') return { ativa: true, titulo: 'Assinatura ativa', detalhe: 'Cobrança em dia.', dias: null };
  if (e.status === 'trial') {
    const dias = e.trial_ate ? Math.ceil((new Date(e.trial_ate).getTime() - Date.now()) / 86400000) : null;
    return dias !== null && dias <= 0
      ? { ativa: false, titulo: 'Teste encerrado', detalhe: 'Assine para voltar a sincronizar.', dias: 0 }
      : {
          ativa: true,
          titulo: 'Teste grátis',
          detalhe: dias === null ? 'Período de avaliação.' : `Faltam ${dias} dia(s) de avaliação.`,
          dias,
        };
  }
  if (e.status === 'inadimplente')
    return { ativa: false, titulo: 'Assinatura vencida', detalhe: 'Regularize para voltar a sincronizar.', dias: null };
  return { ativa: false, titulo: 'Assinatura cancelada', detalhe: 'A sincronização está pausada.', dias: null };
}

export const iniciais = (nome: string) =>
  nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export function formatarData(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia
    ? `hoje, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString('pt-BR');
}
