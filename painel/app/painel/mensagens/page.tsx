'use client';

// Acervo de mensagens padrão, agrupado por categoria.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { carregarPerfil, supabase, type Perfil } from '@/lib/supabase';
import { Botao, Cabecalho, CampoTexto, Cartao, Modal, Vazio } from '@/componentes/ui';

const CORES = ['#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#f59e0b', '#ef4444', '#14b8a6', '#6366f1'];

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
  const [criandoCategoria, setCriandoCategoria] = useState(false);

  const carregar = useCallback(async () => {
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

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!perfil) return null;
  const ehAdmin = perfil.papel === 'admin';

  // Admin: o acervo padrão da clínica (e as pessoais dele). Atendente: só as
  // dele — as padrão que ele vê são do admin, e ele não as edita.
  const minhas = ehAdmin ? respostas : respostas.filter((r) => r.escopo === 'pessoal');
  const grupos = [
    ...categorias.map((c) => ({ cat: c, itens: minhas.filter((r) => r.categoria_id === c.id) })),
    { cat: null, itens: minhas.filter((r) => !r.categoria_id) },
  ].filter((g) => g.itens.length > 0);

  return (
    <div>
      <Cabecalho
        titulo={ehAdmin ? 'Mensagens padrão da empresa' : 'Minhas mensagens'}
        subtitulo={
          ehAdmin
            ? 'Você escolhe para quem cada uma aparece: todos, departamentos ou pessoas.'
            : 'Só você vê e usa estas mensagens. As padrão da clínica aparecem direto na extensão.'
        }
        acao={<MenuCriar onMensagem={() => router.push('/painel/mensagens/nova')} onCategoria={() => setCriandoCategoria(true)} />}
      />

      {grupos.length === 0 ? (
        <Vazio
          titulo={ehAdmin ? 'Nenhuma mensagem padrão ainda' : 'Nenhuma mensagem sua ainda'}
          texto={
            ehAdmin
              ? 'Crie a primeira mensagem rápida da clínica — por exemplo uma saudação com texto, áudio e o PDF de avaliação — e escolha quem a recebe na extensão.'
              : 'Crie aqui ou direto na extensão — ela sincroniza sozinha e aparece só para você.'
          }
          acao={<MenuCriar onMensagem={() => router.push('/painel/mensagens/nova')} onCategoria={() => setCriandoCategoria(true)} />}
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

      {criandoCategoria && perfil && (
        <CategoriaModal
          perfil={perfil}
          ordem={categorias.length}
          onFechar={() => setCriandoCategoria(false)}
          onPronto={() => {
            setCriandoCategoria(false);
            carregar();
          }}
        />
      )}
    </div>
  );
}

// ── "Criar ▾": mensagem rápida ou categoria ──
function MenuCriar({ onMensagem, onCategoria }: { onMensagem: () => void; onCategoria: () => void }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);
  return (
    <div ref={ref} className="relative">
      <Botao onClick={() => setAberto((v) => !v)}>Criar ▾</Botao>
      {aberto && (
        <div className="cartao absolute right-0 z-20 mt-1.5 w-[220px] overflow-hidden py-1">
          {[
            { rotulo: 'Mensagem rápida', dica: 'Sequência de texto, áudio, PDF…', acao: onMensagem },
            { rotulo: 'Categoria', dica: 'Agrupa as mensagens na extensão', acao: onCategoria },
          ].map((item) => (
            <button
              key={item.rotulo}
              onClick={() => {
                setAberto(false);
                item.acao();
              }}
              className="block w-full px-4 py-2.5 text-left transition hover:bg-fundo"
            >
              <div className="text-[13.5px] font-medium">{item.rotulo}</div>
              <div className="text-[12px] text-tinta-4">{item.dica}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Nova categoria: da empresa (admin) ou pessoal (atendente) ──
function CategoriaModal({ perfil, ordem, onFechar, onPronto }: { perfil: Perfil; ordem: number; onFechar: () => void; onPronto: () => void }) {
  const ehAdmin = perfil.papel === 'admin';
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(CORES[1]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.from('categorias').insert({
      empresa_id: perfil.empresa.id,
      nome: nome.trim(),
      cor,
      ordem,
      escopo: ehAdmin ? 'empresa' : 'pessoal',
      owner_id: ehAdmin ? null : perfil.id,
    });
    setSalvando(false);
    if (error) {
      setErro(
        /row-level security/i.test(error.message)
          ? 'Sem permissão — categoria da empresa exige o plano Pro ou superior.'
          : error.message,
      );
      return;
    }
    onPronto();
  }

  return (
    <Modal titulo={ehAdmin ? 'Nova categoria da empresa' : 'Nova categoria'} onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <CampoTexto rotulo="Nome" valor={nome} onChange={setNome} placeholder="Ex.: Saudações, Links, Orçamentos" />
        <div className="flex flex-col gap-2 font-medium">
          Cor
          <div className="flex flex-wrap gap-2">
            {CORES.map((c) => (
              <button
                key={c}
                onClick={() => setCor(c)}
                className={`h-8 w-8 rounded-controle transition ${cor === c ? 'ring-2 ring-tinta ring-offset-2' : ''}`}
                style={{ background: c }}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>
        </div>
        <p className="text-[12.5px] text-tinta-4">
          {ehAdmin
            ? 'Categoria da empresa: aparece na extensão de quem tiver alguma mensagem dela liberada.'
            : 'Categoria pessoal: só você vê, aqui e na extensão.'}
        </p>
        {erro && <p className="text-[12.5px] text-perigo">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
          <Botao onClick={salvar} desabilitado={salvando || nome.trim().length < 2}>Criar categoria</Botao>
        </div>
      </div>
    </Modal>
  );
}
