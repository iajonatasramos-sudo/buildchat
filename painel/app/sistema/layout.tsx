'use client';

// Área do gestor do sistema (dono do produto) — separada do painel das clínicas.
// O acesso é conferido no servidor pela função sou_operador().

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { iniciais, supabase } from '@/lib/supabase';

type Eu = { nome: string; email: string };

const MENU = [
  { href: '/sistema', rotulo: 'Visão geral' },
  { href: '/sistema/empresas', rotulo: 'Empresas' },
  { href: '/sistema/vendas', rotulo: 'Vendas' },
  { href: '/sistema/api', rotulo: 'API' },
];

export default function LayoutSistema({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const caminho = usePathname();
  const [estado, setEstado] = useState<'verificando' | 'liberado' | 'negado'>('verificando');
  const [eu, setEu] = useState<Eu | null>(null);

  useEffect(() => {
    (async () => {
      const { data: sessao } = await supabase.auth.getSession();
      if (!sessao.session) {
        router.replace('/entrar');
        return;
      }
      const { data } = await supabase.rpc('sou_operador');
      setEstado(data === true ? 'liberado' : 'negado');
      if (data === true) {
        // Com que conta estou logado — nome do gestor e e-mail da sessão.
        const { data: perfil } = await supabase.rpc('sistema_meu_perfil');
        const linha = (perfil as Eu[] | null)?.[0];
        setEu({
          nome: linha?.nome ?? sessao.session.user.email ?? 'Gestor',
          email: linha?.email ?? sessao.session.user.email ?? '',
        });
      }
    })();
  }, [router, caminho]);

  if (estado === 'verificando') {
    return <div className="grid min-h-screen place-items-center text-tinta-3">Carregando…</div>;
  }

  if (estado === 'negado') {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="max-w-[420px] text-center">
          <h1 className="mb-2 text-[22px] font-extrabold">Área restrita</h1>
          <p className="mb-6 leading-relaxed text-tinta-3">
            Esta área é do gestor do BuildChat. Sua conta administra uma clínica — use o painel dela.
          </p>
          <Link
            href="/painel"
            className="rounded-controle bg-marca px-[18px] py-[11px] text-[13.5px] font-semibold text-white"
          >
            Ir para o meu painel
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-[244px] flex-none flex-col bg-[#0F1020] px-4 py-6">
        <div className="flex items-center gap-2 px-2 pb-1 text-[17px] font-extrabold text-white">
          <span className="text-[18px] text-lateral-claro">⚡</span>BuildChat
        </div>
        <div className="mb-5 px-2 text-[11px] font-bold uppercase tracking-wide text-white/40">
          Gestão do sistema
        </div>

        <nav className="flex flex-col gap-0.5">
          {MENU.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-controle px-3 py-2.5 text-[13.5px] font-medium transition ${
                caminho === item.href
                  ? 'bg-white/10 text-white'
                  : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              {item.rotulo}
            </Link>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          <Link href="/painel" className="rounded-controle px-3 py-2.5 text-[13px] text-white/50 hover:text-white">
            ← Painel da minha clínica
          </Link>

          {/* Conta logada: quem sou, meu perfil e sair. */}
          <div className="rounded-cartao border border-white/10 bg-white/[0.06] p-3">
            <div className="flex items-center gap-2.5">
              <div className="grid h-[32px] w-[32px] flex-none place-items-center rounded-controle bg-marca text-[12px] font-extrabold text-white">
                {iniciais(eu?.nome ?? 'G')}
              </div>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[13px] font-semibold text-white">{eu?.nome ?? '…'}</div>
                <div className="truncate text-[11.5px] text-white/50" title={eu?.email}>
                  {eu?.email ?? ''}
                </div>
              </div>
            </div>
            <div className="mt-2.5 flex gap-1.5">
              <Link
                href="/sistema/perfil"
                className={`flex-1 rounded-controle border px-2 py-1.5 text-center text-[12px] font-medium transition ${
                  caminho === '/sistema/perfil'
                    ? 'border-white/40 text-white'
                    : 'border-white/15 text-white/70 hover:border-white/40 hover:text-white'
                }`}
              >
                Meu perfil
              </Link>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.replace('/entrar');
                }}
                className="flex-1 rounded-controle border border-white/15 px-2 py-1.5 text-[12px] font-medium text-white/70 transition hover:border-white/40 hover:text-white"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 bg-fundo">
        <div className="max-w-[1180px] px-10 pb-16 pt-9">{children}</div>
      </main>
    </div>
  );
}
