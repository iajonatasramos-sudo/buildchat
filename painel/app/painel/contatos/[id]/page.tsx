'use client';

// Ficha do lead: tudo que a equipe vinculou a este contato pela extensão —
// pastas, propostas geradas, anotações, interesses e último envio — com a
// gestão feita daqui mesmo (renomear, anotar, mover de pasta, abrir o PDF).
// O que se muda aqui chega à extensão na sincronização seguinte.

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  carregarPerfil,
  formatarData,
  moeda,
  supabase,
  telefoneDoJid,
  TIPOS_PROPOSTA,
  type Perfil,
} from '@/lib/supabase';
import { Botao, Cabecalho, Cartao } from '@/componentes/ui';

type Contato = {
  id: string;
  wa_number: string;
  remote_jid: string;
  nome: string | null;
  nome_whatsapp: string | null;
  interesses: string | null;
  ultimo_contato: string | null;
  criado_em: string;
};
type Pasta = { id: string; nome: string; cor: string };
type Vinculo = { pasta_id: string; deleted_at: string | null };
type Proposta = {
  id: string;
  tipo: string;
  valor_centavos: number;
  arquivo_path: string;
  criado_por: string | null;
  enviada_em: string | null;
  criado_em: string;
};
type Nota = { id: string; texto: string; autor_id: string | null; criado_em: string };
type Usuario = { id: string; nome: string };

export default function FichaDoLead({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [contato, setContato] = useState<Contato | null>(null);
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Edição da ficha
  const [nome, setNome] = useState('');
  const [interesses, setInteresses] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [novaNota, setNovaNota] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data: c } = await supabase
      .from('contatos')
      .select('id, wa_number, remote_jid, nome, nome_whatsapp, interesses, ultimo_contato, criado_em')
      .eq('id', id)
      .maybeSingle();
    const ct = c as Contato | null;
    setContato(ct);
    if (!ct) {
      setCarregando(false);
      return;
    }
    setNome(ct.nome ?? '');
    setInteresses(ct.interesses ?? '');

    const conversa = (q: any) => q.eq('wa_number', ct.wa_number).eq('remote_jid', ct.remote_jid);
    const [pa, vi, pr, no, us] = await Promise.all([
      supabase.from('pastas').select('id, nome, cor').is('deleted_at', null).order('ordem'),
      conversa(supabase.from('pasta_conversas').select('pasta_id, deleted_at')),
      conversa(
        supabase
          .from('propostas')
          .select('id, tipo, valor_centavos, arquivo_path, criado_por, enviada_em, criado_em')
          .is('deleted_at', null),
      ).order('criado_em', { ascending: false }),
      conversa(supabase.from('anotacoes').select('id, texto, autor_id, criado_em').is('deleted_at', null)).order(
        'criado_em',
        { ascending: false },
      ),
      supabase.from('usuarios').select('id, nome'),
    ]);
    setPastas((pa.data as Pasta[]) ?? []);
    setVinculos((vi.data as Vinculo[]) ?? []);
    setPropostas((pr.data as Proposta[]) ?? []);
    setNotas((no.data as Nota[]) ?? []);
    setUsuarios((us.data as Usuario[]) ?? []);
    setCarregando(false);
  }, [id]);

  useEffect(() => {
    carregarPerfil().then(setPerfil);
    carregar();
  }, [carregar]);

  const nomeDe = useMemo(() => {
    const m = new Map(usuarios.map((u) => [u.id, u.nome]));
    return (uid: string | null) => (uid ? m.get(uid) ?? 'equipe' : 'equipe');
  }, [usuarios]);

  const pastasAtivas = useMemo(
    () => new Set(vinculos.filter((v) => !v.deleted_at).map((v) => v.pasta_id)),
    [vinculos],
  );

  if (carregando) return null;
  if (!contato) {
    return (
      <div>
        <Link href="/painel/contatos" className="mb-2.5 inline-block font-medium text-marca">
          ← Contatos
        </Link>
        <Cartao className="p-6 text-tinta-3">Este contato não existe mais.</Cartao>
      </div>
    );
  }

  const titulo = contato.nome || contato.nome_whatsapp || telefoneDoJid(contato.remote_jid);
  const mudouFicha = nome !== (contato.nome ?? '') || interesses !== (contato.interesses ?? '');

  async function salvarFicha() {
    setSalvando(true);
    setErro(null);
    const { error } = await supabase
      .from('contatos')
      .update({ nome: nome.trim() || null, interesses: interesses.trim() || null })
      .eq('id', contato!.id);
    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    carregar();
  }

  /** Entra/sai da pasta. Sair é exclusão lógica — a extensão sincroniza por `deleted_at`. */
  async function alternarPasta(pasta: Pasta) {
    if (!perfil) return;
    setErro(null);
    const { wa_number, remote_jid } = contato!;
    const { error } = pastasAtivas.has(pasta.id)
      ? await supabase
          .from('pasta_conversas')
          .update({ deleted_at: new Date().toISOString() })
          .eq('pasta_id', pasta.id)
          .eq('wa_number', wa_number)
          .eq('remote_jid', remote_jid)
      : await supabase.from('pasta_conversas').upsert(
          {
            empresa_id: perfil.empresa.id,
            pasta_id: pasta.id,
            wa_number,
            remote_jid,
            criado_por: perfil.id,
            deleted_at: null,
          },
          { onConflict: 'pasta_id,wa_number,remote_jid' },
        );
    if (error) {
      setErro(error.message);
      return;
    }
    carregar();
  }

  async function adicionarNota() {
    if (!perfil || !novaNota.trim()) return;
    setErro(null);
    const { error } = await supabase.from('anotacoes').insert({
      empresa_id: perfil.empresa.id,
      wa_number: contato!.wa_number,
      remote_jid: contato!.remote_jid,
      texto: novaNota.trim(),
      autor_id: perfil.id,
    });
    if (error) {
      setErro(error.message);
      return;
    }
    setNovaNota('');
    carregar();
  }

  async function apagarNota(n: Nota) {
    if (!confirm('Apagar esta anotação?')) return;
    await supabase.from('anotacoes').update({ deleted_at: new Date().toISOString() }).eq('id', n.id);
    carregar();
  }

  /** Abre o PDF numa aba: a aba nasce ANTES do await, enquanto o clique ainda vale como gesto. */
  async function abrirPdf(p: Proposta) {
    const aba = window.open('', '_blank');
    const { data, error } = await supabase.storage.from('midias').createSignedUrl(p.arquivo_path, 120);
    if (error || !data?.signedUrl) {
      aba?.close();
      setErro('Não consegui abrir o PDF: ' + (error?.message ?? 'arquivo indisponível'));
      return;
    }
    if (aba) aba.location.href = data.signedUrl;
    else window.open(data.signedUrl, '_blank');
  }

  return (
    <div>
      <Link href="/painel/contatos" className="mb-2.5 inline-block font-medium text-marca">
        ← Contatos
      </Link>
      <Cabecalho
        titulo={titulo}
        subtitulo={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-[13px]">{telefoneDoJid(contato.remote_jid)}</span>
            {contato.nome_whatsapp && contato.nome_whatsapp !== contato.nome && (
              <span>no WhatsApp: {contato.nome_whatsapp}</span>
            )}
            <span>
              Último contato:{' '}
              {contato.ultimo_contato ? formatarData(contato.ultimo_contato) : <span className="text-tinta-4">nenhum</span>}
            </span>
          </span>
        }
      />

      {erro && (
        <p className="mb-3.5 rounded-controle border border-perigo-borda bg-perigo-fundo px-3 py-2 text-[12.5px] text-perigo">
          {erro}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* ── Coluna esquerda: ficha e pastas ── */}
        <div className="flex flex-col gap-4">
          <Cartao className="p-5">
            <div className="rotulo mb-3">FICHA</div>
            <label className="mb-3 flex flex-col gap-1.5 font-medium">
              Nome de tratamento
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder={contato.nome_whatsapp ?? 'Como a equipe chama este contato'}
                className="campo focus:campo-foco font-normal"
              />
              <span className="text-[12.5px] font-normal text-tinta-4">
                É o que entra em {'{{nome}}'} nas mensagens rápidas e o nome que sai na proposta.
              </span>
            </label>
            <label className="flex flex-col gap-1.5 font-medium">
              Interesses
              <textarea
                value={interesses}
                onChange={(e) => setInteresses(e.target.value)}
                rows={4}
                placeholder="Ex.: clínica nova em Moema, 4 consultórios — orçamento enviado"
                className="campo focus:campo-foco resize-none font-normal"
              />
            </label>
            <div className="mt-3 flex justify-end">
              <Botao onClick={salvarFicha} desabilitado={!mudouFicha || salvando}>
                {salvando ? 'Salvando…' : 'Salvar ficha'}
              </Botao>
            </div>
          </Cartao>

          <Cartao className="p-5">
            <div className="rotulo mb-1">PASTAS</div>
            <p className="mb-3 text-[12.5px] text-tinta-4">
              Clique para colocar ou tirar o contato da pasta. Vale para toda a equipe que atende este número.
            </p>
            {pastas.length === 0 ? (
              <span className="text-tinta-4">Nenhuma pasta criada ainda.</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {pastas.map((p) => {
                  const dentro = pastasAtivas.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => alternarPasta(p)}
                      title={dentro ? 'Tirar desta pasta' : 'Colocar nesta pasta'}
                      className="rounded-chip border px-2.5 py-[4px] text-[12.5px] font-medium transition"
                      style={
                        dentro
                          ? { background: p.cor, borderColor: p.cor, color: '#fff' }
                          : { background: '#fff', borderColor: p.cor, color: p.cor, opacity: 0.75 }
                      }
                    >
                      {dentro ? '✓ ' : '+ '}
                      {p.nome}
                    </button>
                  );
                })}
              </div>
            )}
          </Cartao>
        </div>

        {/* ── Coluna direita: propostas e anotações ── */}
        <div className="flex flex-col gap-4">
          <Cartao className="p-5">
            <div className="rotulo mb-3">PROPOSTAS · {propostas.length}</div>
            {propostas.length === 0 ? (
              <span className="text-tinta-4">Nenhuma proposta gerada para este contato ainda.</span>
            ) : (
              <ul className="flex flex-col gap-2">
                {propostas.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 rounded-controle border border-borda px-3.5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">
                        {TIPOS_PROPOSTA[p.tipo] ?? p.tipo} · {moeda(p.valor_centavos)}
                      </div>
                      <div className="text-[12.5px] text-tinta-4">
                        {formatarData(p.criado_em)} · por {nomeDe(p.criado_por)} ·{' '}
                        {p.enviada_em ? (
                          <span className="font-medium text-sucesso">enviada {formatarData(p.enviada_em)}</span>
                        ) : (
                          'gerada, ainda não enviada'
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => abrirPdf(p)}
                      className="whitespace-nowrap rounded-controle border border-borda bg-white px-3 py-1.5 text-[13px] font-medium transition hover:border-marca hover:text-marca"
                    >
                      Abrir PDF
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[12.5px] text-tinta-4">
              Para enviar uma proposta na conversa, use a guia Contato da extensão — ela anexa o PDF direto no WhatsApp.
            </p>
          </Cartao>

          <Cartao className="p-5">
            <div className="rotulo mb-3">ANOTAÇÕES · {notas.length}</div>
            <div className="mb-3 flex gap-2">
              <input
                value={novaNota}
                onChange={(e) => setNovaNota(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && adicionarNota()}
                placeholder="Nova anotação sobre o lead…"
                className="campo focus:campo-foco min-w-0 flex-1 font-normal"
              />
              <Botao onClick={adicionarNota} desabilitado={!novaNota.trim()}>
                Anotar
              </Botao>
            </div>
            {notas.length === 0 ? (
              <span className="text-tinta-4">Nenhuma anotação ainda.</span>
            ) : (
              <ul className="flex flex-col gap-2">
                {notas.map((n) => (
                  <li key={n.id} className="rounded-controle border border-borda px-3.5 py-3">
                    <div className="whitespace-pre-wrap leading-relaxed">{n.texto}</div>
                    <div className="mt-1 flex items-center gap-3 text-[12px] text-tinta-4">
                      <span>
                        {formatarData(n.criado_em)} · {nomeDe(n.autor_id)}
                      </span>
                      <button onClick={() => apagarNota(n)} className="ml-auto font-medium hover:text-perigo">
                        apagar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      </div>
    </div>
  );
}
