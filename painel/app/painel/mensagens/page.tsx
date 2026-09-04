'use client';

// Acervo de mensagens padrão, agrupado por categoria.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { carregarPerfil, supabase, type Perfil } from '@/lib/supabase';
import { Botao, Cabecalho, Cartao, Vazio } from '@/componentes/ui';

type Acao = { tipo: string };
type Resposta = {
  id: string;
  titulo: string;
  atalho: string;
  categoria_id: string | null;
  escopo: string;
  atualizado_em: string;
  resposta_acoes: Acao[];
};
type Categoria = { id: string; nome: string; cor: string };

const NOME_TIPO: Record<string, string> = {
  texto: 'texto',
  imagem: 'imagem',
  audio: 'áudio',
  video: 'vídeo',
  documento: 'PDF',
};

export default function Mensagens() {
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [respostas, setRespostas] = useState<Resposta[]>([]);

  useEffect(() => {
    (async () => {
      setPerfil(await carregarPerfil());
      const [c, r] = await Promise.all([
        supabase.from('categorias').select('id, nome, cor').is('deleted_at', null).order('ordem'),
        supabase
          .from('respostas')
          .select('id, titulo, atalho, categoria_id, escopo, atualizado_em, resposta_acoes(tipo)')
          .is('deleted_at', null)
          .order('ordem'),
      ]);
      setCategorias((c.data as Categoria[]) ?? []);
      setRespostas((r.data as unknown as Resposta[]) ?? []);
    })();
  }, []);

  if (!perfil) return null;
  const ehAdmin = perfil.papel === 'admin';

  const grupos = [
    ...categorias.map((c) => ({ cat: c, itens: respostas.filter((r) => r.categoria_id === c.id) })),
    { cat: null, itens: respostas.filter((r) => !r.categoria_id) },
  ].filter((g) => g.itens.length > 0);

  return (
    <div>
      <Cabecalho
        titulo="Mensagens padrão da empresa"
        subtitulo="Publicadas para todos os usuários da extensão."
        acao={ehAdmin && <Botao onClick={() => router.push('/painel/mensagens/nova')}>Nova mensagem</Botao>}
      />

      {grupos.length === 0 ? (
        <Vazio
          titulo="Nenhuma mensagem padrão ainda"
          texto="Crie a primeira mensagem rápida da clínica — por exemplo uma saudação com texto, áudio e o PDF de avaliação — e ela aparece na extensão de toda a equipe."
          acao={ehAdmin && <Botao onClick={() => router.push('/painel/mensagens/nova')}>Criar primeira mensagem</Botao>}
        />
      ) : (
        <div className="flex flex-col gap-[18px]">
          {grupos.map((g) => (
            <Cartao key={g.cat?.id ?? 'sem'} className="overflow-hidden">
              <div className="flex items-center gap-2.5 border-b border-borda bg-fundo px-[18px] py-3">
                {g.cat ? (
                  <span
                    className="rounded-chip px-2.5 py-[3px] text-[12px] font-medium text-white"
                    style={{ background: g.cat.cor }}
                  >
                    {g.cat.nome}
                  </span>
                ) : (
                  <span className="rounded-chip bg-linha px-2.5 py-[3px] text-[12px] font-medium text-tinta-3">
                    SEM CATEGORIA
                  </span>
                )}
                <span className="text-tinta-3">
                  {g.itens.length} {g.itens.length === 1 ? 'mensagem' : 'mensagens'}
                </span>
              </div>

              {g.itens.map((r, i) => {
                const tipos = [...new Set(r.resposta_acoes.map((a) => NOME_TIPO[a.tipo] ?? a.tipo))];
                return (
                  <Link
                    key={r.id}
                    href={`/painel/mensagens/${r.id}`}
                    className={`flex items-center gap-3.5 px-[18px] py-3.5 transition hover:bg-fundo ${
                      i < g.itens.length - 1 ? 'border-b border-linha' : ''
                    }`}
                  >
                    <span className="min-w-[240px] font-medium">{r.titulo}</span>
                    {r.atalho && (
                      <span className="rounded-chip bg-marca-suave px-[7px] py-0.5 font-mono text-[12.5px] text-marca">
                        /{r.atalho}
                      </span>
                    )}
                    <span className="text-tinta-3">
                      {r.resposta_acoes.length} {r.resposta_acoes.length === 1 ? 'ação' : 'ações'} · {tipos.join(', ')}
                    </span>
                    <span className="ml-auto text-tinta-4">
                      {r.escopo === 'empresa' ? 'da empresa' : 'pessoal'} ·{' '}
                      {new Date(r.atualizado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </Link>
                );
              })}
            </Cartao>
          ))}
        </div>
      )}
    </div>
  );
}
