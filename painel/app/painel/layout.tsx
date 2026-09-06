'use client';

// Casca do painel: barra lateral escura, faixa de assinatura vencida e conteúdo.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { avaliarLicenca, carregarPerfil, ehAdmin, iniciais, SO_ADMIN, supabase, type Perfil } from '@/lib/supabase';

// O usuário comum não administra a clínica: sem usuários, equipes, acervo da
// empresa nem assinatura. Fica com o que é dele — visão geral, pastas e os
// contatos dos números que conectou.
const MENU_ADMIN = [
  { href: '/painel', rotulo: 'Visão geral' },
  { href: '/painel/usuarios', rotulo: 'Usuários' },
  { href: '/painel/equipes', rotulo: 'Equipes' },
  { href: '/painel/mensagens', rotulo: 'Mensagens padrão' },
  { href: '/painel/pastas', rotulo: 'Pastas' },
  { href: '/painel/contatos', rotulo: 'Contatos' },
  { href: '/painel/assinatura', rotulo: 'Assinatura' },
];
const MENU_USUARIO = [
  { href: '/painel', rotulo: 'Visão geral' },
  { href: '/painel/pastas', rotulo: 'Pastas' },
  { href: '/painel/contatos', rotulo: 'Meus contatos' },
];

export default function LayoutPainel({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const caminho = usePathname();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [operador, setOperador] = useState(false);

  useEffect(() => {
    carregarPerfil().then(async (p) => {
      if (!p) {
        // Conta sem clínica: se for o gestor do produto, é a área dele.
        const { data: ehOperador } = await supabase.rpc('sou_operador');
        router.replace(ehOperador === true ? '/sistema' : '/entrar');
        return;
      }
      // Rota de admin com usuário comum: volta para a visão geral dele.
      if (!ehAdmin(p) && SO_ADMIN.some((r) => caminho.startsWith(r))) {
        router.replace('/painel');
        return;
      }
      setPerfil(p);
      setCarregando(false);
    });
    // Só o gestor do produto enxerga o atalho para a área do sistema.
    supabase.rpc('sou_operador').then(({ data }) => setOperador(data === true));
  }, [router, caminho]);

  if (carregando) {
    return <div className="grid min-h-screen place-items-center text-tinta-3">Carregando…</div>;
  }
  if (!perfil) return null;

  const lic = avaliarLicenca(perfil.empresa);
  const admin = ehAdmin(perfil);
  const MENU = admin ? MENU_ADMIN : MENU_USUARIO;

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
          {operador && (
            <Link
              href="/sistema"
              className="rounded-controle border border-white/15 px-3 py-2 text-center text-[12.5px] font-medium text-white/70 transition hover:border-white/40 hover:text-white"
            >
              Gestão do sistema
            </Link>
          )}
          {admin ? (
            <div className="rounded-cartao border border-white/10 bg-white/[0.06] p-3">
              <div className="mb-1 text-[12px] text-white/60">Assinatura</div>
              <div className="text-[14px] font-extrabold text-white">{lic.titulo}</div>
              {lic.dias !== null && <div className="mt-0.5 text-[12px] text-white/60">{lic.dias} dia(s) restantes</div>}
            </div>
          ) : (
            <div className="rounded-cartao border border-white/10 bg-white/[0.06] p-3">
              <div className="mb-1 text-[12px] text-white/60">Clínica</div>
              <div className="truncate text-[14px] font-extrabold text-white">{perfil.empresa.nome}</div>
              <div className="mt-0.5 text-[12px] text-white/60">Atendente</div>
            </div>
          )}

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
            <span>
              {lic.titulo}. O painel está em modo restrito e a extensão parou de sincronizar
              {admin ? '.' : ' — avise o administrador da clínica.'}
            </span>
            {admin && (
              <Link
                href="/painel/assinatura"
                className="ml-auto rounded-controle bg-white px-3.5 py-1.5 text-[13px] font-medium text-perigo"
              >
                Regularizar pagamento
              </Link>
            )}
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
