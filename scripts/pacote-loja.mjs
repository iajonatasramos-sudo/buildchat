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
// Cada marca tem a sua pasta de saída (ver vite.config.ts).
const marca = process.env.MARCA === 'anamni' ? 'anamni' : 'buildchat';
const pasta = marca === 'anamni' ? 'dist-anamni' : 'dist';
const dist = join(raiz, pasta);

if (!existsSync(dist)) {
  console.error(`${pasta}/ não existe — rode \`npm run build${marca === 'anamni' ? ':anamni' : ''}\` antes.`);
  process.exit(1);
}

// Cada marca vira um .zip próprio, para uma listagem própria na Chrome Web Store.
const versao = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8')).version;
const temp = mkdtempSync(join(tmpdir(), `${marca}-loja-`));
cpSync(dist, temp, { recursive: true });
rmSync(join(temp, 'seed'), { recursive: true, force: true });

const saida = join(raiz, `${marca}-extensao-${versao}.zip`);
rmSync(saida, { force: true });
execSync(`cd "${temp}" && zip -r -q "${saida}" .`);
rmSync(temp, { recursive: true, force: true });

// Publica também no painel, para a equipe baixar em /instalar — um arquivo
// por marca; a página serve o da marca do domínio acessado.
const noPainel = join(raiz, 'painel', 'public', `${marca}-extensao.zip`);
cpSync(saida, noPainel);
writeFileSync(join(raiz, 'painel', 'public', `versao-${marca}.txt`), versao + '\n');

const tamanho = execSync(`du -h "${saida}"`).toString().split('\t')[0];
console.log(`pacote pronto: ${saida} (${tamanho})`);
console.log(`publicado no painel: painel/public/${marca}-extensao.zip (versão ${versao})`);
console.log('conteúdo sem a pasta seed/ — nenhum dado pessoal embarcado.');
