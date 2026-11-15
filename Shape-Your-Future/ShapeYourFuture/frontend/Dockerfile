# Shape Your Future - frontend (vanilla TS + Vite)
# Two usable targets:
#   dev   - `docker build --target dev`  -> Vite dev server with HMR, source bind-mounted
#   build - `docker build --target build`-> runs `npm ci`, `tsc -b`, `vite build`
#   (default, no --target)               -> nginx serving the built dist/ (production-ish)

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------
FROM deps AS dev
WORKDIR /app
COPY . .
EXPOSE 5173
# --host so the dev server is reachable from outside the container;
# VITE_API_BASE_URL is passed in via docker-compose / --build-arg env.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---------------------------------------------------------------------
FROM deps AS build
WORKDIR /app
# Vite bakes VITE_* vars into the JS bundle at build time (unlike the
# `dev` target above, where the Vite dev server can just read them from
# the container's runtime environment) - so for this target it has to
# arrive as a build ARG, which docker-compose.yml supplies via
# `build.args`. Defaults to the same fallback api/client.ts already
# has, so a plain `docker compose build` with no override still works.
ARG VITE_API_BASE_URL=http://localhost:8000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY . .
# Same two commands V1-32 Part 1/2's regression phase runs:
#   npx tsc --noEmit   (typecheck, no output)
#   npm run build       (tsc -b && vite build -> dist/)
RUN npm run build

# ---------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD wget -qO- http://localhost:80/ || exit 1
