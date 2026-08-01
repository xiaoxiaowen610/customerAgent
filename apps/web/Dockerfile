FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --no-frozen-lockfile

COPY packages/shared-types packages/shared-types
COPY apps/web apps/web
RUN pnpm --filter @finserve/shared-types build
RUN pnpm --filter @finserve/web build

EXPOSE 3000
CMD ["pnpm", "--filter", "@finserve/web", "start"]
