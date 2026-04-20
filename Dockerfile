# syntax=docker/dockerfile:1.7
# Build-Context: Parent-Verzeichnis (enthält Rentenversicherer/ und
# kanagawa-design-system/). Die relativen CSS-Imports bleiben damit gültig.

# -------- BUILD --------
FROM node:20-alpine AS build
WORKDIR /workspace
COPY kanagawa-design-system ./kanagawa-design-system
WORKDIR /workspace/Rentenversicherer
COPY Rentenversicherer/package.json Rentenversicherer/package-lock.json ./
RUN npm ci
COPY Rentenversicherer ./
RUN npm run build

# -------- RUNTIME --------
FROM node:20-alpine AS runtime
WORKDIR /app

# node:20-alpine bringt schon den User `node` (UID 1000, GID 1000) mit —
# den nehmen wir direkt, damit der Host-Mount /home/openclaw/.claude
# (UID 1000) lesbar und beschreibbar ist.
RUN apk add --no-cache bash ca-certificates dumb-init \
  && npm install -g @anthropic-ai/claude-code@2.1.113 tsx@4.19.0 \
  && chown -R node:node /app

USER node:node

COPY --chown=node:node Rentenversicherer/package.json Rentenversicherer/package-lock.json ./
RUN npm ci

COPY --chown=node:node --from=build /workspace/Rentenversicherer/dist ./dist
COPY --chown=node:node Rentenversicherer/server ./server
COPY --chown=node:node Rentenversicherer/types.ts ./types.ts
COPY --chown=node:node Rentenversicherer/tsconfig.json ./tsconfig.json

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3011

EXPOSE 3011
ENTRYPOINT ["dumb-init", "--"]
CMD ["tsx", "server/index.ts"]
