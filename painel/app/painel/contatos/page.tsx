'use client';

// CRM: a planilha de contatos alimentada pela extensão — pastas em que cada um
// está, propostas geradas, interesses anotados pela equipe e a data do último
// envio. Cada linha abre a ficha completa do lead (/painel/contatos/[id]).

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { carregarPerfil, formatarData, supabase, telefoneDoJid } from '@/lib/supabase';
import { Cabecalho, Cartao, Vazio } from '@/componentes/ui';

type Contato = {
  id: string;
  wa_number: string;
  remote_jid: string;
  nome: string | null;
  nome_whatsapp: string | null;
  interesses: string | null;
  ultimo_contato: string | null;
};
type Pasta = { id: string; nome: string; cor: string };
type Vinculo = { pasta_id: string; remote_jid: string; wa_number: string };
type PropostaResumo = { remote_jid: string; wa_number: string; enviada_em: string | null };

export default function Contatos() {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [propostas, setPropostas] = useState<PropostaResumo[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroPasta, setFiltroPasta] = useState<string>('');
  const [carregando, setCarregando] = useState(true);

  const buscarContatos = () =>
    supabase
      .from('contatos')
      .select('id, wa_number, remote_jid, nome, nome_whatsapp, interesses, ultimo_contato')
      .is('deleted_at', null)
      .order('ultimo_contato', { ascending: false, nullsFirst: false });

  const carregar = useCallback(async () => {
    const [ct, pa, vi, pr, an, perfil] = await Promise.all([
      buscarContatos(),
      supabase.from('pastas').select('id, nome, cor').is('deleted_at', null).order('ordem'),
      supabase.from('pasta_conversas').select('pasta_id, remote_jid, wa_number').is('deleted_at', null),
      supabase.from('propostas').select('remote_jid, wa_number, enviada_em').is('deleted_at', null),
      supabase.from('anotacoes').select('remote_jid, wa_number').is('deleted_at', null),
      carregarPerfil(),
    ]);
    let lista = (ct.data as Contato[]) ?? [];

    // Conversa etiquetada, com proposta ou anotação é lead — mesmo que ninguém
    // tenha salvo a ficha ainda (a extensão só criava a ficha ao ENVIAR algo).
    // Materializa a ficha aqui para o CRM ficar completo; o nome do WhatsApp
    // chega quando a equipe interagir de novo pela extensão.
    if (perfil) {
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
        lista = ((await buscarContatos()).data as Contato[]) ?? lista;
      }
    }
    setContatos(lista);
    setPastas((pa.data as Pasta[]) ?? []);
    setVinculos((vi.data as Vinculo[]) ?? []);
    setPropostas((pr.data as PropostaResumo[]) ?? []);
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

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return contatos.filter((c) => {
      const chave = `${c.wa_number}|${c.remote_jid}`;
      const suas = porJid.get(chave) ?? [];
      if (filtroPasta && !suas.some((p) => p.id === filtroPasta)) return false;
      if (!q) return true;
      return (
        (c.nome ?? '').toLowerCase().includes(q) ||
        (c.nome_whatsapp ?? '').toLowerCase().includes(q) ||
        (c.interesses ?? '').toLowerCase().includes(q) ||
        c.remote_jid.includes(q)
      );
    });
  }, [contatos, busca, filtroPasta, porJid]);

  function exportarCsv() {
    const linhas = [
      ['Nome', 'Telefone', 'Pastas', 'Propostas', 'Interesses', 'Último contato'],
      ...lista.map((c) => {
        const chave = `${c.wa_number}|${c.remote_jid}`;
        const suas = porJid.get(chave) ?? [];
        return [
          c.nome ?? c.nome_whatsapp ?? '',
          telefoneDoJid(c.remote_jid),
          suas.map((p) => p.nome).join(' | '),
          String(propostasPorJid.get(chave)?.total ?? 0),
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
        titulo="Contatos"
        subtitulo={`${contatos.length} contato(s) — alimentados pela extensão conforme a equipe atende.`}
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

      {contatos.length === 0 ? (
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
                  {['CONTATO', 'TELEFONE', 'PASTAS', 'PROPOSTAS', 'INTERESSES', 'ÚLTIMO CONTATO'].map((h) => (
                    <th key={h} className="rotulo border-b border-borda px-[18px] py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => {
                  const chave = `${c.wa_number}|${c.remote_jid}`;
                  const suas = porJid.get(chave) ?? [];
                  const props = propostasPorJid.get(chave);
                  return (
                    <tr key={c.id} className="transition hover:bg-fundo">
                      <td className="border-b border-linha px-[18px] py-3.5">
                        <Link href={`/painel/contatos/${c.id}`} className="font-medium text-marca hover:underline">
                          {c.nome || c.nome_whatsapp || telefoneDoJid(c.remote_jid)}
                        </Link>
                        {c.nome && c.nome_whatsapp && c.nome !== c.nome_whatsapp && (
                          <div className="text-[12px] text-tinta-4">no WhatsApp: {c.nome_whatsapp}</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5 font-mono text-[12.5px] text-tinta-3">
                        {telefoneDoJid(c.remote_jid)}
                      </td>
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
