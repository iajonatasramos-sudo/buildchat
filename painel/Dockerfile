# Painel BuildChat — imagem para rodar na VPS.
#
# As chaves NEXT_PUBLIC_* são embutidas no bundle durante o build (são públicas
# por natureza), então entram como build args.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
# Valores padrão do projeto — são chaves PÚBLICAS (vão no bundle de qualquer
# forma). Assim o build funciona sem configurar nada no painel de deploy;
# para outro ambiente, basta sobrescrever como build arg.
ARG NEXT_PUBLIC_SUPABASE_URL=https://jlzgnshwzlpnaaksozur.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_SAaQ6RvdOEU4UZMnbxkpcg_COzqkDAj
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    DOCKER_BUILD=1 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
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
