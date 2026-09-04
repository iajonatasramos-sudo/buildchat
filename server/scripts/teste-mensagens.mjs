#!/usr/bin/env node
// Valida Fases 3 e 4 contra o projeto real: mensagens com sequência de ações,
// mídia no Storage (com isolamento por empresa), anotações e preferências.

import { api, criarUsuarioTeste, verificador, URL_BASE, KEY } from './_comum.mjs';

const v = verificador();
const marca = Date.now().toString(36);
const WA = '5511964788124';

async function storage(caminho, { token, metodo = 'GET', corpo, tipo }) {
  const r = await fetch(`${URL_BASE}/storage/v1/object/${caminho}`, {
    method: metodo,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      ...(tipo ? { 'Content-Type': tipo } : {}),
    },
    body: corpo,
  });
  return { status: r.status, tamanho: Number(r.headers.get('content-length') ?? 0) };
}

console.log('\n1. Duas clínicas');
const tokenA = await criarUsuarioTeste(`e2e-${marca}-a@gmail.com`);
const { dados: empA } = await api('/rest/v1/rpc/criar_empresa_e_admin', {
  token: tokenA, metodo: 'POST', corpo: { p_empresa: 'Clínica E2E Msg A', p_nome: 'Admin A' } });
const tokenB = await criarUsuarioTeste(`e2e-${marca}-b@gmail.com`);
const { dados: empB } = await api('/rest/v1/rpc/criar_empresa_e_admin', {
  token: tokenB, metodo: 'POST', corpo: { p_empresa: 'Clínica E2E Msg B', p_nome: 'Admin B' } });
v.ok(!!empA && !!empB && empA !== empB, 'duas empresas criadas');

console.log('\n2. Mensagem rápida com sequência de ações');
const cat = await api('/rest/v1/categorias', {
  token: tokenA, metodo: 'POST', prefer: 'return=representation',
  corpo: { empresa_id: empA, nome: 'SAUDAÇÃO', cor: '#22c55e', escopo: 'empresa' } });
const resp = await api('/rest/v1/respostas', {
  token: tokenA, metodo: 'POST', prefer: 'return=representation',
  corpo: { empresa_id: empA, categoria_id: cat.dados?.[0]?.id, titulo: 'Saudação MCA',
           atalho: 'saudacao', escopo: 'empresa' } });
const respId = resp.dados?.[0]?.id;
v.ok(!!respId, 'resposta criada');

const caminhoMidia = `${empA}/${marca}-audio.ogg`;
const acoes = await api('/rest/v1/resposta_acoes', {
  token: tokenA, metodo: 'POST',
  corpo: [
    { resposta_id: respId, ordem: 0, tipo: 'texto', texto: 'Olá {{primeiro_nome}}, tudo bem?',
      midia_path: null, midia_mime: null, midia_nome: null, delay_segundos: 0 },
    { resposta_id: respId, ordem: 1, tipo: 'audio', texto: '', midia_path: `storage:${caminhoMidia}`,
      midia_mime: 'audio/ogg', midia_nome: 'saudacao.ogg', delay_segundos: 2 },
  ] });
v.ok(acoes.status < 300, 'sequência de duas ações gravada', `status ${acoes.status}`);

const leitura = await api(
  '/rest/v1/respostas?select=titulo,resposta_acoes(ordem,tipo,midia_path,delay_segundos)', { token: tokenA });
const acoesLidas = leitura.dados?.[0]?.resposta_acoes ?? [];
v.ok(acoesLidas.length === 2, 'leitura aninhada devolve as ações', `${acoesLidas.length}`);
v.ok(acoesLidas.some((a) => a.delay_segundos === 2), 'o intervalo entre ações é preservado');

console.log('\n3. Mídia no Storage');
const audio = Buffer.from('OggS-conteudo-de-teste');
const up = await storage(`midias/${caminhoMidia}`, { token: tokenA, metodo: 'POST', corpo: audio, tipo: 'audio/ogg' });
v.ok(up.status < 300, 'clínica A envia a mídia da resposta', `status ${up.status}`);

const baixaA = await storage(`midias/${caminhoMidia}`, { token: tokenA });
v.ok(baixaA.status === 200, 'clínica A baixa a própria mídia');

const baixaB = await storage(`midias/${caminhoMidia}`, { token: tokenB });
v.ok(baixaB.status >= 400, 'clínica B NÃO baixa a mídia da A', `status ${baixaB.status}`);

const invade = await storage(`midias/${empA}/invasora.ogg`, {
  token: tokenB, metodo: 'POST', corpo: audio, tipo: 'audio/ogg' });
v.ok(invade.status >= 400, 'clínica B não grava na pasta da A', `status ${invade.status}`);

console.log('\n4. Anotações e preferências');
const nota = await api('/rest/v1/anotacoes', {
  token: tokenA, metodo: 'POST',
  corpo: { empresa_id: empA, wa_number: WA, remote_jid: '5511999990000@c.us',
           texto: 'Paciente pediu retorno em 15 dias' } });
v.ok(nota.status < 300, 'anotação gravada', `status ${nota.status}`);
const notasB = await api('/rest/v1/anotacoes?select=texto', { token: tokenB });
v.ok(notasB.dados?.length === 0, 'clínica B não vê a anotação da A');

const idA = (await api('/rest/v1/usuarios?select=id', { token: tokenA })).dados[0].id;
const cfg = await api('/rest/v1/config_usuario?on_conflict=usuario_id', {
  token: tokenA, metodo: 'POST', prefer: 'resolution=merge-duplicates',
  corpo: { usuario_id: idA, empresa_id: empA, tema: 'gray', atalho: '/', webhook_url: '' } });
v.ok(cfg.status < 300, 'preferências gravadas', `status ${cfg.status}`);
const cfgB = await api(`/rest/v1/config_usuario?select=tema&usuario_id=eq.${idA}`, { token: tokenB });
v.ok(Array.isArray(cfgB.dados) && cfgB.dados.length === 0, 'preferências de um usuário não vazam para outro',
     JSON.stringify(cfgB.dados).slice(0, 80));

v.fim();
