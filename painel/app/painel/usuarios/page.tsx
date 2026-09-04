'use client';

// Usuários da clínica. O admin cria a conta com e-mail e senha e entrega as
// credenciais — não há convite por e-mail.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { carregarPerfil, formatarData, supabase, type Perfil } from '@/lib/supabase';
import { Botao, Cabecalho, CampoTexto, Cartao, Modal } from '@/componentes/ui';

type Usuario = { id: string; nome: string; email: string; papel: string; ativo: boolean; ultimo_acesso: string | null };

export default function Usuarios() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('usuarios')
      .select('id, nome, email, papel, ativo, ultimo_acesso')
      .order('criado_em');
    setUsuarios((data as Usuario[]) ?? []);
  }, []);

  useEffect(() => {
    carregarPerfil().then(setPerfil);
    carregar();
  }, [carregar]);

  if (!perfil) return null;

  const ativos = usuarios.filter((u) => u.ativo).length;
  const cheio = ativos >= perfil.empresa.assentos;
  const ehAdmin = perfil.papel === 'admin';

  async function alternarAtivo(u: Usuario) {
    const { error } = await supabase.from('usuarios').update({ ativo: !u.ativo }).eq('id', u.id);
    if (error) alert(error.message.includes('assentos') ? 'Limite de assentos atingido.' : error.message);
    carregar();
  }

  return (
    <div>
      <Cabecalho
        titulo="Usuários"
        subtitulo={`${ativos} de ${perfil.empresa.assentos} assentos em uso.`}
        acao={
          ehAdmin && (
            <Botao onClick={() => setCriando(true)} desabilitado={cheio}>
              Novo usuário
            </Botao>
          )
        }
      />

      {cheio && (
        <div className="mb-3.5 flex items-center gap-3 rounded-cartao border border-alerta-borda bg-alerta-fundo px-4 py-3.5 leading-relaxed">
          <span className="font-extrabold text-alerta">Limite de assentos atingido.</span>
          <span className="text-[#7A5A1E]">Para cadastrar mais alguém, aumente o plano ou desative um usuário.</span>
          <Link
            href="/painel/assinatura"
            className="ml-auto rounded-controle border border-alerta-borda bg-white px-3 py-1.5 text-[13px] font-medium text-alerta"
          >
            Aumentar plano
          </Link>
        </div>
      )}

      <Cartao className="overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-fundo text-left">
              {['NOME', 'E-MAIL', 'PAPEL', 'ÚLTIMO ACESSO', 'STATUS', ''].map((h) => (
                <th key={h} className="rotulo border-b border-borda px-[18px] py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td className="border-b border-linha px-[18px] py-3.5 font-medium">{u.nome}</td>
                <td className="border-b border-linha px-[18px] py-3.5 text-tinta-3">{u.email}</td>
                <td className="border-b border-linha px-[18px] py-3.5">
                  <span
                    className={`rounded-chip px-2 py-[3px] text-[12px] font-medium ${
                      u.papel === 'admin' ? 'bg-marca-suave text-marca-hover' : 'bg-linha text-tinta-2'
                    }`}
                  >
                    {u.papel === 'admin' ? 'Admin' : 'Usuário'}
                  </span>
                </td>
                <td className="border-b border-linha px-[18px] py-3.5 text-tinta-3">
                  {u.ultimo_acesso ? formatarData(u.ultimo_acesso) : <span className="text-tinta-4">nunca entrou</span>}
                </td>
                <td className="border-b border-linha px-[18px] py-3.5">
                  <span className={`font-medium ${u.ativo ? 'text-sucesso' : 'text-tinta-4'}`}>
                    {u.ativo ? 'Ativo' : 'Desativado'}
                  </span>
                </td>
                <td className="border-b border-linha px-[18px] py-3.5 text-right">
                  {u.id === perfil.id ? (
                    <span className="text-tinta-4">Você</span>
                  ) : ehAdmin ? (
                    <button onClick={() => alternarAtivo(u)} className="font-medium text-marca">
                      {u.ativo ? 'Desativar' : 'Reativar'}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Cartao>

      <p className="mt-3 leading-relaxed text-tinta-3">
        Você define a senha no cadastro e entrega ao usuário. Ele usa esse e-mail e senha para entrar na extensão —
        e pode trocar a senha depois pela tela de recuperação.{' '}
        <Link href="/instalar" target="_blank" className="font-medium text-marca">
          Como instalar a extensão
        </Link>{' '}
        (mande este link para a equipe).
      </p>

      {criando && (
        <NovoUsuarioModal
          empresaId={perfil.empresa.id}
          onFechar={() => setCriando(false)}
          onPronto={() => {
            setCriando(false);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function NovoUsuarioModal({
  empresaId,
  onFechar,
  onPronto,
}: {
  empresaId: string;
  onFechar: () => void;
  onPronto: () => void;
}) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState(senhaSugerida());
  const [papel, setPapel] = useState<'usuario' | 'admin'>('usuario');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState(false);

  async function criar() {
    setSalvando(true);
    setErro(null);

    // Guarda a sessão do admin: o signUp abaixo troca a sessão do navegador
    // pela do usuário recém-criado, e precisamos voltar a ser o admin.
    const { data: antes } = await supabase.auth.getSession();

    const { data: novo, error: erroAuth } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password: senha,
    });

    if (antes.session) await supabase.auth.setSession(antes.session);

    if (erroAuth || !novo.user) {
      setErro(traduzir(erroAuth?.message ?? 'Não consegui criar o acesso.'));
      setSalvando(false);
      return;
    }

    const { error } = await supabase.from('usuarios').insert({
      id: novo.user.id,
      empresa_id: empresaId,
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      papel,
    });

    if (error) {
      setErro(
        error.message.includes('assentos')
          ? 'Limite de assentos atingido — aumente o plano para cadastrar mais alguém.'
          : error.message,
      );
      setSalvando(false);
      return;
    }
    setPronto(true);
    setSalvando(false);
  }

  if (pronto) {
    return (
      <Modal titulo="Usuário criado" onFechar={onPronto}>
        <div className="flex flex-col gap-4">
          <p className="leading-relaxed text-tinta-3">Entregue estas credenciais para a pessoa entrar na extensão:</p>
          <div className="flex flex-col gap-2 rounded-controle border border-borda bg-fundo p-4 font-mono text-[13px]">
            <div>
              <span className="text-tinta-4">e-mail:</span> {email}
            </div>
            <div>
              <span className="text-tinta-4">senha:</span> {senha}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Botao
              variante="secundario"
              onClick={() => navigator.clipboard.writeText(`E-mail: ${email}\nSenha: ${senha}`)}
            >
              Copiar
            </Botao>
            <Botao onClick={onPronto}>Concluir</Botao>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo="Novo usuário" onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <CampoTexto rotulo="Nome" valor={nome} onChange={setNome} placeholder="Amanda Souza" />
        <CampoTexto
          rotulo="E-mail"
          tipo="email"
          valor={email}
          onChange={setEmail}
          placeholder="amanda@clinica.com.br"
          dica="Será o login dela na extensão."
        />
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <CampoTexto rotulo="Senha" valor={senha} onChange={setSenha} dica="Mínimo 6 caracteres." />
          </div>
          <Botao variante="secundario" onClick={() => setSenha(senhaSugerida())}>
            Gerar
          </Botao>
        </div>
        <label className="flex flex-col gap-1.5 font-medium">
          Papel
          <select
            value={papel}
            onChange={(e) => setPapel(e.target.value as 'usuario' | 'admin')}
            className="campo focus:campo-foco font-normal"
          >
            <option value="usuario">Usuário — usa a extensão</option>
            <option value="admin">Admin — também gerencia a conta</option>
          </select>
        </label>

        {erro && <p className="text-[13px] text-perigo">{erro}</p>}

        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao
            onClick={criar}
            desabilitado={salvando || !email.includes('@') || senha.length < 6 || nome.trim().length < 2}
          >
            {salvando ? 'Criando…' : 'Criar usuário'}
          </Botao>
        </div>
      </div>
    </Modal>
  );
}

function senhaSugerida(): string {
  const letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 10 }, () => letras[Math.floor(Math.random() * letras.length)]).join('');
}

function traduzir(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered')) return 'Este e-mail já tem conta.';
  if (m.includes('rate limit')) return 'Muitos cadastros seguidos. Aguarde alguns minutos.';
  if (m.includes('password')) return 'Senha muito curta (mínimo 6 caracteres).';
  if (m.includes('invalid')) return 'E-mail inválido.';
  return msg;
}
