'use client';

// Área do gestor do sistema (dono do produto) — separada do painel das clínicas.
// O acesso é conferido no servidor pela função sou_operador().

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const MENU = [
  { href: '/sistema', rotulo: 'Visão geral' },
  { href: '/sistema/empresas', rotulo: 'Empresas' },
  { href: '/sistema/vendas', rotulo: 'Vendas' },
];

export default function LayoutSistema({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const caminho = usePathname();
  const [estado, setEstado] = useState<'verificando' | 'liberado' | 'negado'>('verificando');

  useEffect(() => {
    (async () => {
      const { data: sessao } = await supabase.auth.getSession();
      if (!sessao.session) {
        router.replace('/entrar');
        return;
      }
      const { data } = await supabase.rpc('sou_operador');
      setEstado(data === true ? 'liberado' : 'negado');
    })();
  }, [router]);

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

        <div className="mt-auto flex flex-col gap-2">
          <Link href="/painel" className="rounded-controle px-3 py-2.5 text-[13px] text-white/50 hover:text-white">
            ← Painel da minha clínica
          </Link>
        </div>
      </aside>

      <main className="flex-1 bg-fundo">
        <div className="max-w-[1180px] px-10 pb-16 pt-9">{children}</div>
      </main>
    </div>
  );
}
