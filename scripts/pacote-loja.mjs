#!/usr/bin/env node
// Gera o .zip da extensão para a Chrome Web Store.
//
// IMPORTANTE: remove a pasta seed/ do pacote. Ela contém o acervo pessoal do
// desenvolvedor (áudios da clínica e 188 números reais) e serve apenas para a
// migração local — nunca pode ir para dentro do produto distribuído.

import { execSync } from 'node:child_process';
import { cpSync, rmSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = new URL('..', import.meta.url).pathname;
const dist = join(raiz, 'dist');

if (!existsSync(dist)) {
  console.error('dist/ não existe — rode `npm run build` antes.');
  process.exit(1);
}

const versao = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8')).version;
const temp = mkdtempSync(join(tmpdir(), 'buildchat-loja-'));
cpSync(dist, temp, { recursive: true });
rmSync(join(temp, 'seed'), { recursive: true, force: true });

const saida = join(raiz, `buildchat-extensao-${versao}.zip`);
rmSync(saida, { force: true });
execSync(`cd "${temp}" && zip -r -q "${saida}" .`);
rmSync(temp, { recursive: true, force: true });

// Publica também no painel, para a equipe baixar em /instalar.
const noPainel = join(raiz, 'painel', 'public', 'buildchat-extensao.zip');
cpSync(saida, noPainel);
writeFileSync(join(raiz, 'painel', 'public', 'versao-extensao.txt'), versao + '\n');

const tamanho = execSync(`du -h "${saida}"`).toString().split('\t')[0];
console.log(`pacote pronto: ${saida} (${tamanho})`);
console.log(`publicado no painel: painel/public/buildchat-extensao.zip (versão ${versao})`);
console.log('conteúdo sem a pasta seed/ — nenhum dado pessoal embarcado.');
