'use client';

// Casca do painel: barra lateral escura, faixa de assinatura vencida e conteúdo.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { avaliarLicenca, carregarPerfil, iniciais, supabase, type Perfil } from '@/lib/supabase';

const MENU = [
  { href: '/painel', rotulo: 'Visão geral' },
  { href: '/painel/usuarios', rotulo: 'Usuários' },
  { href: '/painel/equipes', rotulo: 'Equipes' },
  { href: '/painel/mensagens', rotulo: 'Mensagens padrão' },
  { href: '/painel/pastas', rotulo: 'Pastas' },
  { href: '/painel/contatos', rotulo: 'Contatos' },
  { href: '/painel/assinatura', rotulo: 'Assinatura' },
];

export default function LayoutPainel({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const caminho = usePathname();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregarPerfil().then((p) => {
      if (!p) router.replace('/entrar');
      else setPerfil(p);
      setCarregando(false);
    });
  }, [router]);

  if (carregando) {
    return <div className="grid min-h-screen place-items-center text-tinta-3">Carregando…</div>;
  }
  if (!perfil) return null;

  const lic = avaliarLicenca(perfil.empresa);

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-[244px] flex-none flex-col bg-lateral px-4 py-6">
        <div className="flex items-center gap-2 px-2 pb-[26px] text-[17px] font-extrabold text-white">
          <span className="text-[18px] text-lateral-claro">⚡</span>BuildChat
        </div>

        <nav className="flex flex-col gap-0.5">
          {MENU.map((item) => {
            const ativo = caminho === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-controle px-3 py-2.5 text-[13.5px] font-medium transition ${
                  ativo ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {item.rotulo}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          <div className="rounded-cartao border border-white/10 bg-white/[0.06] p-3">
            <div className="mb-1 text-[12px] text-white/60">Assinatura</div>
            <div className="text-[14px] font-extrabold text-white">{lic.titulo}</div>
            {lic.dias !== null && <div className="mt-0.5 text-[12px] text-white/60">{lic.dias} dia(s) restantes</div>}
          </div>

          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="grid h-[30px] w-[30px] place-items-center rounded-controle bg-marca text-[12px] font-extrabold text-white">
              {iniciais(perfil.nome)}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13px] font-medium text-white">{perfil.nome}</div>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.replace('/entrar');
                }}
                className="text-[12px] text-white/60 hover:text-white"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {!lic.ativa && (
          <div className="flex items-center gap-4 bg-[#ef4444] px-8 py-3 font-medium text-white">
            <span>{lic.titulo}. O painel está em modo restrito e a extensão parou de sincronizar.</span>
            <Link
              href="/painel/assinatura"
              className="ml-auto rounded-controle bg-white px-3.5 py-1.5 text-[13px] font-medium text-perigo"
            >
              Regularizar pagamento
            </Link>
          </div>
        )}
        <div className="max-w-[1180px] px-10 pb-10 pt-9">{children}</div>
        <div className="mt-auto flex gap-4 px-10 pb-8 text-[12.5px] text-tinta-4">
          <Link href="/instalar" target="_blank" className="hover:text-marca">
            Instalar a extensão
          </Link>
          <Link href="/privacidade" target="_blank" className="hover:text-marca">
            Política de privacidade
          </Link>
        </div>
      </main>
    </div>
  );
}
