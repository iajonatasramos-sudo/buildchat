'use client';

// Perfil do gestor do sistema: com que conta estou logado, meu nome e a senha.

import { useEffect, useState } from 'react';
import { formatarData, supabase } from '@/lib/supabase';
import { Botao, Cabecalho, CampoTexto, Cartao } from '@/componentes/ui';

type Perfil = { nome: string; email: string; desde: string };

export default function PerfilDoGestor() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    supabase.rpc('sistema_meu_perfil').then(({ data }) => {
      const p = (data as Perfil[] | null)?.[0] ?? null;
      setPerfil(p);
      setNome(p?.nome ?? '');
    });
  }, []);

  if (!perfil) return null;

  async function salvarNome() {
    setSalvando(true);
    setAviso(null);
    const { error } = await supabase.rpc('sistema_renomear_me', { p_nome: nome.trim() });
    setSalvando(false);
    if (error) return setAviso({ tipo: 'erro', texto: error.message });
    setPerfil((p) => (p ? { ...p, nome: nome.trim() } : p));
    setAviso({ tipo: 'ok', texto: 'Nome atualizado. A barra lateral mostra o novo nome ao recarregar.' });
  }

  async function trocarSenha() {
    if (senha.length < 8) return setAviso({ tipo: 'erro', texto: 'A senha precisa ter pelo menos 8 caracteres.' });
    if (senha !== confirma) return setAviso({ tipo: 'erro', texto: 'As senhas não conferem.' });
    setSalvando(true);
    setAviso(null);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) return setAviso({ tipo: 'erro', texto: error.message });
    setSenha('');
    setConfirma('');
    setAviso({ tipo: 'ok', texto: 'Senha alterada. Use a nova no próximo login.' });
  }

  return (
    <div>
      <Cabecalho titulo="Meu perfil" subtitulo="A conta com que você está logado na gestão do sistema." />

      {aviso && (
        <p
          className={`mb-3.5 rounded-controle border px-3 py-2 text-[12.5px] ${
            aviso.tipo === 'ok'
              ? 'border-[#BBE5C8] bg-[#EEFBF2] text-sucesso'
              : 'border-perigo-borda bg-perigo-fundo text-perigo'
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao className="p-5">
          <div className="rotulo mb-3">CONTA</div>
          <div className="mb-4 flex flex-col gap-2 rounded-controle border border-borda bg-fundo p-4 font-mono text-[13px]">
            <div>
              <span className="text-tinta-4">e-mail:</span> {perfil.email}
            </div>
            <div>
              <span className="text-tinta-4">gestor desde:</span> {formatarData(perfil.desde)}
            </div>
          </div>
          <CampoTexto rotulo="Nome" valor={nome} onChange={setNome} placeholder="Como aparece na barra lateral" />
          <div className="mt-3 flex justify-end">
            <Botao onClick={salvarNome} desabilitado={salvando || nome.trim().length < 2 || nome.trim() === perfil.nome}>
              Salvar nome
            </Botao>
          </div>
        </Cartao>

        <Cartao className="p-5">
          <div className="rotulo mb-3">SENHA</div>
          <div className="flex flex-col gap-3">
            <CampoTexto rotulo="Nova senha" tipo="password" valor={senha} onChange={setSenha} dica="Mínimo 8 caracteres." />
            <CampoTexto rotulo="Confirmar nova senha" tipo="password" valor={confirma} onChange={setConfirma} />
          </div>
          <div className="mt-3 flex justify-end">
            <Botao onClick={trocarSenha} desabilitado={salvando || !senha || !confirma}>
              Alterar senha
            </Botao>
          </div>
        </Cartao>
      </div>
    </div>
  );
}
