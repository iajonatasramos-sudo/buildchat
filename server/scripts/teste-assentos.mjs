#!/usr/bin/env node
// Garante que o limite de assentos é imposto pelo BANCO — não só pela interface.
// (O admin passou a criar usuários direto, então a checagem saiu do fluxo de convite.)

import { api, criarAcesso, criarUsuarioTeste, verificador } from './_comum.mjs';

const v = verificador();
const marca = Date.now().toString(36);

const token = await criarUsuarioTeste(`e2e-${marca}-adm@gmail.com`);
const { dados: empresa } = await api('/rest/v1/rpc/criar_empresa_e_admin', {
  token,
  metodo: 'POST',
  corpo: { p_empresa: 'Clínica E2E Assentos', p_nome: 'Admin' },
});

// Como no painel: primeiro nasce o acesso (auth), depois o vínculo com a empresa.
const criarUsuario = async (nome, email) => {
  const id = await criarAcesso(email);
  return api('/rest/v1/usuarios', {
    token,
    metodo: 'POST',
    corpo: { id, empresa_id: empresa, nome, email, papel: 'usuario' },
  });
};

console.log('\n1. Dentro do limite (3 assentos, admin já ocupa 1)');
const a = await criarUsuario('Amanda', `e2e-${marca}-1@gmail.com`);
const b = await criarUsuario('Thiago', `e2e-${marca}-2@gmail.com`);
v.ok(a.status < 300 && b.status < 300, 'admin cadastra dois usuários', `status ${a.status}/${b.status}`);

console.log('\n2. Estourando o limite');
const c = await criarUsuario('Renata', `e2e-${marca}-3@gmail.com`);
v.ok(c.status >= 400, 'o quarto cadastro é recusado pelo banco', `status ${c.status}`);
v.ok(JSON.stringify(c.dados).includes('assentos'), 'a mensagem explica o motivo');

console.log('\n3. Desativar libera assento; reativar acima do limite não');
const { dados: lista } = await api('/rest/v1/usuarios?select=id,nome&nome=eq.Amanda', { token });
const amanda = lista[0].id;
const desativa = await api(`/rest/v1/usuarios?id=eq.${amanda}`, {
  token,
  metodo: 'PATCH',
  corpo: { ativo: false },
});
v.ok(desativa.status < 300, 'desativar funciona', `status ${desativa.status}`);

const d = await criarUsuario('Renata', `e2e-${marca}-4@gmail.com`);
v.ok(d.status < 300, 'com o assento livre, o cadastro passa', `status ${d.status}`);

const reativa = await api(`/rest/v1/usuarios?id=eq.${amanda}`, {
  token,
  metodo: 'PATCH',
  corpo: { ativo: true },
});
v.ok(reativa.status >= 400, 'reativar acima do limite é recusado', `status ${reativa.status}`);

v.fim();
