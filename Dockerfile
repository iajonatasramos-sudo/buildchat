# Dockerfile da RAIZ — constrói o painel (pasta painel/).
#
# Existe para o deploy no Dokploy: assim tanto o contexto quanto o Dockerfile
# ficam na raiz do repositório, sem depender de como a ferramenta combina
# "Build Path" com "Docker File". O painel/Dockerfile continua servindo para
# builds feitos de dentro da própria pasta.

FROM node:22-alpine AS deps
WORKDIR /app
COPY painel/package.json painel/package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
# Chaves PÚBLICAS do projeto (vão no bundle de qualquer forma). Para outro
# ambiente, sobrescreva como build args.
ARG NEXT_PUBLIC_SUPABASE_URL=https://jlzgnshwzlpnaaksozur.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_SAaQ6RvdOEU4UZMnbxkpcg_COzqkDAj
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    DOCKER_BUILD=1 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY painel/ ./
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3100 NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3100
CMD ["node", "server.js"]
