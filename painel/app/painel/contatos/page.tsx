'use client';

// CRM: a planilha de contatos alimentada pela extensão — pastas em que cada um
// está, interesses anotados pela equipe e a data do último envio.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatarData, supabase } from '@/lib/supabase';
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

/** 5511999998888@c.us → +55 11 99999-8888 */
function telefoneDoJid(jid: string): string {
  const d = jid.split('@')[0]?.replace(/\D/g, '') ?? '';
  if (jid.endsWith('@g.us')) return 'Grupo';
  if (d.length < 12) return d;
  const ddd = d.slice(2, 4);
  const resto = d.slice(4);
  const meio = resto.length > 8 ? resto.slice(0, 5) : resto.slice(0, 4);
  return `+${d.slice(0, 2)} ${ddd} ${meio}-${resto.slice(meio.length)}`;
}

export default function Contatos() {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroPasta, setFiltroPasta] = useState<string>('');
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const [ct, pa, vi] = await Promise.all([
      supabase
        .from('contatos')
        .select('id, wa_number, remote_jid, nome, nome_whatsapp, interesses, ultimo_contato')
        .is('deleted_at', null)
        .order('ultimo_contato', { ascending: false, nullsFirst: false }),
      supabase.from('pastas').select('id, nome, cor').is('deleted_at', null).order('ordem'),
      supabase.from('pasta_conversas').select('pasta_id, remote_jid, wa_number').is('deleted_at', null),
    ]);
    setContatos((ct.data as Contato[]) ?? []);
    setPastas((pa.data as Pasta[]) ?? []);
    setVinculos((vi.data as Vinculo[]) ?? []);
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
      ['Nome', 'Telefone', 'Pastas', 'Interesses', 'Último contato'],
      ...lista.map((c) => {
        const suas = porJid.get(`${c.wa_number}|${c.remote_jid}`) ?? [];
        return [
          c.nome ?? c.nome_whatsapp ?? '',
          telefoneDoJid(c.remote_jid),
          suas.map((p) => p.nome).join(' | '),
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
          texto="Assim que a equipe etiquetar conversas ou enviar mensagens rápidas pela extensão, os contatos aparecem aqui."
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
                  {['CONTATO', 'TELEFONE', 'PASTAS', 'INTERESSES', 'ÚLTIMO CONTATO'].map((h) => (
                    <th key={h} className="rotulo border-b border-borda px-[18px] py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => {
                  const suas = porJid.get(`${c.wa_number}|${c.remote_jid}`) ?? [];
                  return (
                    <tr key={c.id}>
                      <td className="border-b border-linha px-[18px] py-3.5">
                        <div className="font-medium">{c.nome || c.nome_whatsapp || '—'}</div>
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
