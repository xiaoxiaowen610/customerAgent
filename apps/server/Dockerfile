FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/server/package.json apps/server/package.json
RUN pnpm install --no-frozen-lockfile

COPY packages/shared-types packages/shared-types
COPY apps/server apps/server
RUN pnpm --filter @finserve/shared-types build
RUN pnpm --filter @finserve/server prisma:generate
RUN pnpm --filter @finserve/server build

EXPOSE 3001
CMD ["pnpm", "--filter", "@finserve/server", "start"]
