'use client';

// Editor da mensagem: a sequência de ações (texto/mídia com intervalo entre elas),
// mais categoria, atalho e a pasta aplicada ao paciente ao enviar.

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { carregarPerfil, supabase, type Perfil } from '@/lib/supabase';
import { Botao, Cartao, CampoTexto } from '@/componentes/ui';

type Tipo = 'texto' | 'imagem' | 'audio' | 'video' | 'documento';
const TIPOS: { valor: Tipo; rotulo: string }[] = [
  { valor: 'texto', rotulo: 'Texto' },
  { valor: 'imagem', rotulo: 'Imagem' },
  { valor: 'audio', rotulo: 'Áudio' },
  { valor: 'video', rotulo: 'Vídeo' },
  { valor: 'documento', rotulo: 'Documento' },
];
const VARIAVEIS = [
  { chave: '{{nome}}', descricao: 'nome completo' },
  { chave: '{{primeiro_nome}}', descricao: 'primeiro nome' },
  { chave: '{{saudacao}}', descricao: 'bom dia / boa tarde' },
  { chave: '{{data}}', descricao: 'data de hoje' },
];

type Acao = {
  tipo: Tipo;
  texto: string;
  midia_path: string | null;
  midia_mime: string | null;
  midia_nome: string | null;
  delay_segundos: number;
};
type Categoria = { id: string; nome: string; cor: string };
type Pasta = { id: string; nome: string; cor: string };

const acaoVazia = (tipo: Tipo = 'texto'): Acao => ({
  tipo,
  texto: '',
  midia_path: null,
  midia_mime: null,
  midia_nome: null,
  delay_segundos: 0,
});

export default function Editor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const nova = id === 'nova';
  const router = useRouter();

  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [titulo, setTitulo] = useState('');
  const [atalho, setAtalho] = useState('');
  const [categoriaId, setCategoriaId] = useState<string>('');
  const [pastaId, setPastaId] = useState<string>('');
  const [acoes, setAcoes] = useState<Acao[]>([acaoVazia()]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const p = await carregarPerfil();
    setPerfil(p);
    const [c, f] = await Promise.all([
      supabase.from('categorias').select('id, nome, cor').is('deleted_at', null).order('ordem'),
      supabase.from('pastas').select('id, nome, cor').is('deleted_at', null).order('ordem'),
    ]);
    setCategorias((c.data as Categoria[]) ?? []);
    setPastas((f.data as Pasta[]) ?? []);

    if (!nova) {
      const { data } = await supabase
        .from('respostas')
        .select('titulo, atalho, categoria_id, pasta_id, resposta_acoes(ordem, tipo, texto, midia_path, midia_mime, midia_nome, delay_segundos)')
        .eq('id', id)
        .maybeSingle();
      if (data) {
        const r = data as never as {
          titulo: string; atalho: string; categoria_id: string | null; pasta_id: string | null;
          resposta_acoes: (Acao & { ordem: number })[];
        };
        setTitulo(r.titulo);
        setAtalho(r.atalho ?? '');
        setCategoriaId(r.categoria_id ?? '');
        setPastaId(r.pasta_id ?? '');
        setAcoes(
          r.resposta_acoes.length
            ? [...r.resposta_acoes].sort((a, b) => a.ordem - b.ordem).map(({ ordem: _o, ...a }) => a)
            : [acaoVazia()],
        );
      }
    }
  }, [id, nova]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!perfil) return null;

  const patch = (i: number, p: Partial<Acao>) => setAcoes((arr) => arr.map((a, k) => (k === i ? { ...a, ...p } : a)));
  const tempoTotal = acoes.reduce((s, a) => s + a.delay_segundos, 0);

  async function enviarArquivo(i: number, arquivo: File) {
    setErro(null);
    const ext = arquivo.name.split('.').pop() ?? 'bin';
    const caminho = `${perfil!.empresa.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('midias').upload(caminho, arquivo, {
      contentType: arquivo.type || undefined,
    });
    if (error) {
      setErro(`Falha ao enviar o arquivo: ${error.message}`);
      return;
    }
    patch(i, {
      midia_path: `storage:${caminho}`,
      midia_mime: arquivo.type || null,
      midia_nome: arquivo.name,
    });
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const registro = {
      empresa_id: perfil!.empresa.id,
      titulo: titulo.trim(),
      atalho: atalho.replace(/^\//, '').trim(),
      categoria_id: categoriaId || null,
      pasta_id: pastaId || null,
      escopo: perfil!.papel === 'admin' ? 'empresa' : 'pessoal',
      owner_id: perfil!.papel === 'admin' ? null : perfil!.id,
      deleted_at: null,
    };

    const { data, error } = nova
      ? await supabase.from('respostas').insert(registro).select('id').single()
      : await supabase.from('respostas').update(registro).eq('id', id).select('id').single();

    if (error || !data) {
      setErro(error?.message ?? 'Não consegui salvar.');
      setSalvando(false);
      return;
    }

    const respostaId = (data as { id: string }).id;
    await supabase.from('resposta_acoes').delete().eq('resposta_id', respostaId);
    const { error: erroAcoes } = await supabase.from('resposta_acoes').insert(
      acoes.map((a, i) => ({
        resposta_id: respostaId,
        ordem: i,
        tipo: a.tipo,
        texto: a.texto,
        midia_path: a.midia_path,
        midia_mime: a.midia_mime,
        midia_nome: a.midia_nome,
        delay_segundos: a.delay_segundos,
      })),
    );
    if (erroAcoes) {
      setErro(erroAcoes.message);
      setSalvando(false);
      return;
    }
    router.push('/painel/mensagens');
  }

  async function excluir() {
    if (nova) return;
    setSalvando(true);
    await supabase.from('respostas').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    router.push('/painel/mensagens');
  }

  const pastaEscolhida = pastas.find((p) => p.id === pastaId);

  return (
    <div>
      <Link href="/painel/mensagens" className="mb-2.5 inline-block font-medium text-marca">
        ← Mensagens padrão
      </Link>

      <div className="mb-5 flex items-end gap-4">
        <div className="min-w-0 flex-1">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título da mensagem"
            className="w-full border-0 bg-transparent p-0 text-[27px] font-extrabold tracking-[-0.025em] outline-none placeholder:text-tinta-4"
          />
          <div className="text-tinta-3">A mensagem é enviada como uma sequência de ações, na ordem abaixo.</div>
        </div>
        <div className="flex gap-2">
          {!nova && (
            <Botao variante="perigo" onClick={excluir} desabilitado={salvando}>
              Excluir
            </Botao>
          )}
          <Botao variante="secundario" onClick={() => router.push('/painel/mensagens')}>
            Cancelar
          </Botao>
          <Botao onClick={salvar} desabilitado={salvando || titulo.trim().length < 2}>
            {perfil.papel === 'admin' ? 'Publicar para a equipe' : 'Salvar'}
          </Botao>
        </div>
      </div>

      {erro && (
        <div className="mb-3 rounded-cartao border border-[#F0C9C9] bg-[#FEF2F2] px-4 py-3 text-[13px] text-perigo">
          {erro}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-4">
        <div className="flex flex-col gap-3">
          {acoes.map((a, i) => (
            <Cartao key={i} className="px-[18px] py-4">
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1.5 pt-0.5">
                  <div className="grid h-6 w-6 place-items-center rounded-lg bg-marca text-[12px] font-extrabold text-white">
                    {i + 1}
                  </div>
                  <button
                    onClick={() => i > 0 && setAcoes((arr) => trocar(arr, i, i - 1))}
                    className="text-[11px] text-tinta-4 hover:text-marca"
                    title="Subir"
                  >
                    ▴
                  </button>
                  <button
                    onClick={() => i < acoes.length - 1 && setAcoes((arr) => trocar(arr, i, i + 1))}
                    className="text-[11px] text-tinta-4 hover:text-marca"
                    title="Descer"
                  >
                    ▾
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-2.5 flex items-center gap-2.5">
                    <select
                      value={a.tipo}
                      onChange={(e) => patch(i, { tipo: e.target.value as Tipo, midia_path: null, midia_nome: null })}
                      className="rounded-controle border border-borda-forte bg-white px-2.5 py-[7px] text-[13px]"
                    >
                      {TIPOS.map((t) => (
                        <option key={t.valor} value={t.valor}>
                          {t.rotulo}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1.5 text-[13px] text-tinta-3">
                      Aguardar
                      <input
                        type="number"
                        min={0}
                        value={a.delay_segundos}
                        onChange={(e) => patch(i, { delay_segundos: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-[52px] rounded-controle border border-borda-forte px-2 py-1.5 text-center text-[13px]"
                      />
                      segundos antes
                    </div>
                    {acoes.length > 1 && (
                      <button
                        onClick={() => setAcoes((arr) => arr.filter((_, k) => k !== i))}
                        className="ml-auto text-[13px] text-tinta-4 hover:text-perigo"
                      >
                        Remover
                      </button>
                    )}
                  </div>

                  {a.tipo !== 'texto' && (
                    <div className="mb-2.5 flex items-center gap-3 rounded-controle border border-dashed border-borda-forte bg-fundo p-3">
                      <div className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-marca-suave text-marca">
                        {a.tipo === 'audio' ? '▶' : a.tipo === 'documento' ? 'PDF' : '🖼'}
                      </div>
                      <div className="min-w-0 leading-tight">
                        <div className="truncate font-medium">{a.midia_nome ?? 'Nenhum arquivo escolhido'}</div>
                        <div className="text-[12.5px] text-tinta-3">
                          {a.tipo === 'audio' ? 'enviado como áudio de voz' : 'enviado com a legenda abaixo'}
                        </div>
                      </div>
                      <label className="ml-auto cursor-pointer text-[13px] font-medium text-marca">
                        {a.midia_path ? 'Substituir' : 'Escolher arquivo'}
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) enviarArquivo(i, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  )}

                  <textarea
                    value={a.texto}
                    onChange={(e) => patch(i, { texto: e.target.value })}
                    placeholder={a.tipo === 'texto' ? 'Texto da mensagem…' : 'Legenda (opcional)…'}
                    className="campo focus:campo-foco min-h-[68px] resize-y leading-relaxed"
                  />
                </div>
              </div>
            </Cartao>
          ))}

          <div className="flex flex-wrap gap-2 rounded-cartao border border-dashed border-borda-forte bg-white p-3">
            <span className="px-1 py-[7px] text-tinta-3">Adicionar ação:</span>
            {TIPOS.map((t) => (
              <button
                key={t.valor}
                onClick={() => setAcoes((arr) => [...arr, acaoVazia(t.valor)])}
                className="rounded-controle border border-borda-forte bg-white px-3 py-[7px] text-[13px] font-medium text-tinta-2 transition hover:border-marca hover:text-marca"
              >
                {t.rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Cartao className="px-[18px] py-4">
            <div className="rotulo mb-3.5">CONFIGURAÇÃO</div>
            <div className="flex flex-col gap-3.5">
              <label className="flex flex-col gap-1.5 font-medium">
                Categoria
                <select
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  className="campo focus:campo-foco font-normal"
                >
                  <option value="">Sem categoria</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>

              <CampoTexto
                rotulo="Atalho no WhatsApp"
                valor={atalho}
                onChange={setAtalho}
                placeholder="saudacao"
                dica="Digitar /atalho na conversa dispara a sequência."
              />

              <label className="flex flex-col gap-1.5 font-medium">
                Pasta aplicada ao paciente
                <select
                  value={pastaId}
                  onChange={(e) => setPastaId(e.target.value)}
                  className="campo focus:campo-foco font-normal"
                >
                  <option value="">Nenhuma</option>
                  {pastas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
                {pastaEscolhida && (
                  <span className="flex items-center gap-2 font-normal">
                    <span
                      className="rounded-chip px-2.5 py-[3px] text-[12px] font-medium text-white"
                      style={{ background: pastaEscolhida.cor }}
                    >
                      {pastaEscolhida.nome}
                    </span>
                    <span className="text-[12.5px] text-tinta-4">aplicada ao enviar</span>
                  </span>
                )}
              </label>
            </div>
          </Cartao>

          <Cartao className="px-[18px] py-4">
            <div className="rotulo mb-3">VARIÁVEIS DISPONÍVEIS</div>
            <div className="flex flex-col gap-2.5">
              {VARIAVEIS.map((v) => (
                <div key={v.chave} className="flex items-center gap-2">
                  <span className="rounded-chip bg-marca-suave px-[7px] py-0.5 font-mono text-[12.5px] text-marca-hover">
                    {v.chave}
                  </span>
                  <span className="text-[13px] text-tinta-3">{v.descricao}</span>
                </div>
              ))}
            </div>
          </Cartao>

          <div className="rounded-cartao border border-borda bg-[#F0F1FB] px-4 py-3.5 leading-relaxed text-tinta-3">
            Tempo total estimado da sequência: <strong className="text-tinta">{tempoTotal} segundos</strong>.
          </div>
        </div>
      </div>
    </div>
  );
}

function trocar<T>(arr: T[], i: number, j: number): T[] {
  const n = [...arr];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}
