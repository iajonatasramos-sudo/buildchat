import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Empacotamento enxuto para rodar em container (VPS). Ignorado pela Vercel.
  output: process.env.DOCKER_BUILD ? 'standalone' : undefined,
  // Há outros package-lock.json acima desta pasta; fixa a raiz do projeto.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
};
