'use client';

// CRM: a planilha de contatos alimentada pela extensão — pastas em que cada um
// está, propostas geradas, interesses anotados pela equipe e a data do último
// envio. Cada linha abre a ficha completa do lead (/painel/contatos/[id]).

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { carregarPerfil, ehAdmin, formatarData, formatarDia, formatarTelefone, meusNumeros, supabase, telefoneDoContato } from '@/lib/supabase';
import { Cabecalho, Cartao, Vazio } from '@/componentes/ui';

type Contato = {
  id: string;
  wa_number: string;
  remote_jid: string;
  nome: string | null;
  nome_whatsapp: string | null;
  telefone: string | null;
  interesses: string | null;
  ultimo_contato: string | null;
  criado_em: string;
  criado_por: string | null;
  compartilha_notas: boolean;
  compartilha_interesses: boolean;
  compartilha_etiquetas: boolean;
  compartilha_propostas: boolean;
};
type Usuario = { id: string; nome: string };
type NumeroDaEquipe = { wa_number: string; nome_whatsapp: string | null };
type Pasta = { id: string; nome: string; cor: string };
type Vinculo = { pasta_id: string; remote_jid: string; wa_number: string };
type PropostaResumo = { remote_jid: string; wa_number: string; enviada_em: string | null };

export default function Contatos() {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [propostas, setPropostas] = useState<PropostaResumo[]>([]);
  const [notas, setNotas] = useState<{ remote_jid: string; wa_number: string }[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [numerosEquipe, setNumerosEquipe] = useState<NumeroDaEquipe[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroPasta, setFiltroPasta] = useState<string>('');
  const [carregando, setCarregando] = useState(true);
  const [soMeus, setSoMeus] = useState(false); // usuário comum: só os números que ele conectou
  const [semNumero, setSemNumero] = useState(false);

  // O usuário comum vê só os contatos dos números que ELE conectou na extensão.
  // O admin vê a clínica inteira.
  const buscarContatos = async (perfilAtual: Awaited<ReturnType<typeof carregarPerfil>>) => {
    let q = supabase
      .from('contatos')
      .select('id, wa_number, remote_jid, nome, nome_whatsapp, telefone, interesses, ultimo_contato, criado_em, criado_por, compartilha_notas, compartilha_interesses, compartilha_etiquetas, compartilha_propostas')
      .is('deleted_at', null)
      .order('ultimo_contato', { ascending: false, nullsFirst: false });
    if (!ehAdmin(perfilAtual)) {
      const meus = (await meusNumeros()).map((n) => n.wa_number);
      setSoMeus(true);
      setSemNumero(meus.length === 0);
      if (meus.length === 0) return { data: [] as Contato[] };
      q = q.in('wa_number', meus);
    }
    return q;
  };

  const carregar = useCallback(async () => {
    const perfil = await carregarPerfil();
    const [ct, pa, vi, pr, an, us, nu] = await Promise.all([
      buscarContatos(perfil),
      supabase.from('pastas').select('id, nome, cor').is('deleted_at', null).order('ordem'),
      supabase.from('pasta_conversas').select('pasta_id, remote_jid, wa_number').is('deleted_at', null),
      supabase.from('propostas').select('remote_jid, wa_number, enviada_em').is('deleted_at', null),
      supabase.from('anotacoes').select('remote_jid, wa_number').is('deleted_at', null),
      supabase.from('usuarios').select('id, nome'),
      supabase.from('usuario_numeros').select('wa_number, nome_whatsapp'),
    ]);
    setUsuarios((us.data as Usuario[]) ?? []);
    setNumerosEquipe((nu.data as NumeroDaEquipe[]) ?? []);
    let lista = (ct.data as Contato[]) ?? [];

    // Conversa etiquetada, com proposta ou anotação é lead — mesmo que ninguém
    // tenha salvo a ficha ainda (a extensão só criava a ficha ao ENVIAR algo).
    // Materializa a ficha aqui para o CRM ficar completo; o nome do WhatsApp
    // chega quando a equipe interagir de novo pela extensão.
    if (perfil && ehAdmin(perfil)) {
      const existentes = new Set(lista.map((c) => `${c.wa_number}|${c.remote_jid}`));
      const faltando = new Map<string, { wa_number: string; remote_jid: string }>();
      for (const r of [
        ...((vi.data as { remote_jid: string; wa_number: string }[]) ?? []),
        ...((pr.data as { remote_jid: string; wa_number: string }[]) ?? []),
        ...((an.data as { remote_jid: string; wa_number: string }[]) ?? []),
      ]) {
        const chave = `${r.wa_number}|${r.remote_jid}`;
        if (!existentes.has(chave) && !faltando.has(chave)) {
          faltando.set(chave, { wa_number: r.wa_number, remote_jid: r.remote_jid });
        }
      }
      if (faltando.size > 0) {
        await supabase.from('contatos').upsert(
          [...faltando.values()].map((f) => ({ empresa_id: perfil.empresa.id, ...f })),
          { onConflict: 'empresa_id,wa_number,remote_jid', ignoreDuplicates: true },
        );
        lista = ((await buscarContatos(perfil)).data as Contato[]) ?? lista;
      }
    }
    setContatos(lista);
    setPastas((pa.data as Pasta[]) ?? []);
    setVinculos((vi.data as Vinculo[]) ?? []);
    setPropostas((pr.data as PropostaResumo[]) ?? []);
    setNotas((an.data as { remote_jid: string; wa_number: string }[]) ?? []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const porJid = useMemo(() => {
    const m = new Map<string, Pasta[]>();
    const pastaPorId = new Map(pastas.map((p) => [p.id, p]));
    for (const v of vinculos) {
      const p = pastaPorId.get(v.pasta_id);
      if (!p) continue;
      const chave = `${v.wa_number}|${v.remote_jid}`;
      m.set(chave, [...(m.get(chave) ?? []), p]);
    }
    return m;
  }, [vinculos, pastas]);

  // Quantas propostas cada contato tem (e quantas já foram enviadas).
  const propostasPorJid = useMemo(() => {
    const m = new Map<string, { total: number; enviadas: number }>();
    for (const p of propostas) {
      const chave = `${p.wa_number}|${p.remote_jid}`;
      const atual = m.get(chave) ?? { total: 0, enviadas: 0 };
      atual.total++;
      if (p.enviada_em) atual.enviadas++;
      m.set(chave, atual);
    }
    return m;
  }, [propostas]);

  const notasPorJid = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notas) {
      const chave = `${n.wa_number}|${n.remote_jid}`;
      m.set(chave, (m.get(chave) ?? 0) + 1);
    }
    return m;
  }, [notas]);

  const nomeUsuario = (id: string | null) => usuarios.find((u) => u.id === id)?.nome ?? '—';
  /** Origem = o WhatsApp da equipe que estava conectado quando o contato foi cadastrado. */
  const origem = (wa: string) => {
    const n = numerosEquipe.find((x) => x.wa_number === wa);
    return { numero: formatarTelefone(wa), nome: n?.nome_whatsapp ?? null };
  };
  const restrito = (c: Contato) =>
    [!c.compartilha_notas && 'notas', !c.compartilha_interesses && 'interesses', !c.compartilha_etiquetas && 'etiquetas', !c.compartilha_propostas && 'propostas'].filter(Boolean) as string[];

  // O mesmo contato visto de dois WhatsApps da equipe são duas linhas no
  // servidor (chave empresa + número conectado + contato). No CRM é UM contato:
  // consolidamos por remote_jid e somamos pastas/propostas/notas de todas as origens.
  const consolidados = useMemo(() => {
    const porJid = new Map<string, Contato & { origens: string[]; linhas: Contato[] }>();
    for (const c of contatos) {
      const atual = porJid.get(c.remote_jid);
      if (!atual) {
        porJid.set(c.remote_jid, { ...c, origens: [c.wa_number], linhas: [c] });
        continue;
      }
      atual.origens.push(c.wa_number);
      atual.linhas.push(c);
      // A linha mais completa manda no que aparece.
      atual.nome = atual.nome || c.nome;
      atual.nome_whatsapp = atual.nome_whatsapp || c.nome_whatsapp;
      atual.telefone = atual.telefone || c.telefone;
      atual.interesses = atual.interesses || c.interesses;
      atual.criado_por = atual.criado_por || c.criado_por;
      if (c.criado_em < atual.criado_em) atual.criado_em = c.criado_em;
      if ((c.ultimo_contato ?? '') > (atual.ultimo_contato ?? '')) atual.ultimo_contato = c.ultimo_contato;
    }
    return [...porJid.values()];
  }, [contatos]);

  type Consolidado = Contato & { origens: string[]; linhas: Contato[] };
  const pastasDe = (c: Consolidado) => {
    const vistas = new Map<string, Pasta>();
    for (const wa of c.origens) for (const p of porJid.get(`${wa}|${c.remote_jid}`) ?? []) vistas.set(p.id, p);
    return [...vistas.values()];
  };
  const propostasDe = (c: Consolidado) => {
    let total = 0, enviadas = 0;
    for (const wa of c.origens) {
      const p = propostasPorJid.get(`${wa}|${c.remote_jid}`);
      if (p) { total += p.total; enviadas += p.enviadas; }
    }
    return total ? { total, enviadas } : null;
  };
  const notasDe = (c: Consolidado) => c.origens.reduce((n, wa) => n + (notasPorJid.get(`${wa}|${c.remote_jid}`) ?? 0), 0);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return consolidados.filter((c) => {
      const suas = pastasDe(c);
      if (filtroPasta && !suas.some((p) => p.id === filtroPasta)) return false;
      if (!q) return true;
      return (
        (c.nome ?? '').toLowerCase().includes(q) ||
        (c.nome_whatsapp ?? '').toLowerCase().includes(q) ||
        (c.interesses ?? '').toLowerCase().includes(q) ||
        c.remote_jid.includes(q)
      );
    });
  }, [consolidados, busca, filtroPasta, porJid]);

  function exportarCsv() {
    const linhas = [
      ['Nome', 'Telefone', 'Origem', 'Usuário', 'Cadastro', 'Pastas', 'Propostas', 'Interesses', 'Último contato'],
      ...lista.map((c) => {
        const suas = pastasDe(c);
        return [
          c.nome ?? c.nome_whatsapp ?? '',
          telefoneDoContato(c),
          c.origens.map((wa) => origem(wa).numero).join(' | '),
          nomeUsuario(c.criado_por),
          formatarDia(c.criado_em),
          suas.map((p) => p.nome).join(' | '),
          String(propostasDe(c)?.total ?? 0),
          (c.interesses ?? '').replace(/\n/g, ' '),
          c.ultimo_contato ? formatarData(c.ultimo_contato) : '',
        ];
      }),
    ];
    const csv = linhas.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `contatos-buildchat-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (carregando) return null;

  return (
    <div>
      <Cabecalho
        titulo={soMeus ? 'Meus contatos' : 'Contatos'}
        subtitulo={
          soMeus
            ? `${consolidados.length} contato(s) dos números de WhatsApp que você conectou na extensão.`
            : `${consolidados.length} contato(s) — alimentados pela extensão conforme a equipe atende.`
        }
        acao={
          contatos.length > 0 && (
            <button
              onClick={exportarCsv}
              className="rounded-controle border border-borda bg-white px-4 py-[9px] text-[13.5px] font-medium transition hover:border-marca hover:text-marca"
            >
              Exportar CSV
            </button>
          )
        }
      />

      {contatos.length === 0 && semNumero ? (
        <Vazio
          titulo="Nenhum número conectado ainda"
          texto="Abra o WhatsApp Web com a extensão e entre com o seu usuário. O número conectado fica associado a você e os contatos dele aparecem aqui."
        />
      ) : contatos.length === 0 ? (
        <Vazio
          titulo="Nenhum contato ainda"
          texto="Assim que a equipe etiquetar uma conversa, anotar, gerar uma proposta ou enviar uma mensagem rápida pela extensão, o contato aparece aqui."
        />
      ) : (
        <>
          <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone ou interesse"
              className="h-10 min-w-[280px] flex-1 rounded-controle border border-borda bg-white px-3.5 text-[13.5px] outline-none transition focus:border-marca"
            />
            <select
              value={filtroPasta}
              onChange={(e) => setFiltroPasta(e.target.value)}
              className="h-10 rounded-controle border border-borda bg-white px-3 text-[13.5px] outline-none focus:border-marca"
            >
              <option value="">Todas as pastas</option>
              {pastas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <span className="text-[13px] text-tinta-3">{lista.length} exibido(s)</span>
          </div>

          <Cartao className="overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-fundo text-left">
                  {['CONTATO', 'TELEFONE', 'ORIGEM', 'USUÁRIO', 'CADASTRO', 'PASTAS', 'PROPOSTAS', 'NOTAS', 'INTERESSES', 'ÚLTIMO CONTATO'].map((h) => (
                    <th key={h} className="rotulo border-b border-borda px-[18px] py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => {
                  const suas = pastasDe(c);
                  const props = propostasDe(c);
                  const notasN = notasDe(c);
                  return (
                    <tr key={c.remote_jid} className="transition hover:bg-fundo">
                      <td className="border-b border-linha px-[18px] py-3.5">
                        <Link href={`/painel/contatos/${c.id}`} className="font-medium text-marca hover:underline">
                          {c.nome || c.nome_whatsapp || telefoneDoContato(c)}
                        </Link>
                        {restrito(c).length > 0 && (
                          <span className="ml-1.5 text-[11px]" title={`Restrito a quem cadastrou: ${restrito(c).join(', ')}`}>🔒</span>
                        )}
                        {c.nome && c.nome_whatsapp && c.nome !== c.nome_whatsapp && (
                          <div className="text-[12px] text-tinta-4">no WhatsApp: {c.nome_whatsapp}</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5 font-mono text-[12.5px] text-tinta-3">
                        {telefoneDoContato(c)}
                      </td>
                      <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5">
                        {c.origens.map((wa) => (
                          <div key={wa} className="leading-tight">
                            <div className="font-mono text-[12px] text-tinta-3">{origem(wa).numero}</div>
                            {origem(wa).nome && <div className="text-[11.5px] text-tinta-4">{origem(wa).nome}</div>}
                          </div>
                        ))}
                      </td>
                      <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5 text-tinta-3">{nomeUsuario(c.criado_por)}</td>
                      <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5 text-tinta-3">{formatarDia(c.criado_em)}</td>
                      <td className="border-b border-linha px-[18px] py-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          {suas.length === 0 ? (
                            <span className="text-tinta-4">—</span>
                          ) : (
                            suas.map((p) => (
                              <span
                                key={p.id}
                                className="rounded-chip px-2 py-[3px] text-[12px] font-medium text-white"
                                style={{ background: p.cor }}
                              >
                                {p.nome}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5">
                        {props ? (
                          <>
                            <span className="font-medium">{props.total}</span>
                            {props.enviadas > 0 && (
                              <span className="text-[12px] text-tinta-4"> · {props.enviadas} enviada(s)</span>
                            )}
                          </>
                        ) : (
                          <span className="text-tinta-4">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5">
                        {notasN ? <span className="font-medium">{notasN}</span> : <span className="text-tinta-4">—</span>}
                      </td>
                      <td className="max-w-[320px] border-b border-linha px-[18px] py-3.5 text-tinta-3">
                        {c.interesses || <span className="text-tinta-4">—</span>}
                      </td>
                      <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5 text-tinta-3">
                        {c.ultimo_contato ? formatarData(c.ultimo_contato) : <span className="text-tinta-4">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Cartao>
        </>
      )}
    </div>
  );
}
