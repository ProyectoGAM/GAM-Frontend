# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.15.0

FROM node:${NODE_VERSION}-alpine AS dependencies

ENV NG_CLI_ANALYTICS=false

WORKDIR /app

RUN chown node:node /app

USER node

COPY --chown=node:node package.json package-lock.json ./

RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    npm ci && \
    sha256sum package-lock.json | cut -d ' ' -f 1 > node_modules/.gam-package-lock.sha256


FROM dependencies AS source

COPY --chown=node:node . .


FROM source AS development

ENV WATCH_POLL_INTERVAL=2000

# Docker copies this directory's ownership into a new named cache volume.
RUN mkdir -p /app/.angular/cache

EXPOSE 4200

CMD ["sh", "/app/docker/dev-entrypoint.sh"]


FROM source AS build

RUN npm run build


FROM source AS verification

ENV CI=true

RUN npm run lint && \
    npm run test:ci && \
    npm run build && \
    npm audit --omit=dev


FROM nginxinc/nginx-unprivileged:1.28-alpine AS runtime

ENV API_UPSTREAM=http://gateway:8080 \
    NGINX_ENVSUBST_FILTER=API_UPSTREAM

COPY --from=build --chown=nginx:nginx /app/www /usr/share/nginx/html
COPY --chown=nginx:nginx docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=10s \
    CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

STOPSIGNAL SIGQUIT
