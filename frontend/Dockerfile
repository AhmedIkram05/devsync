# ===== Build Stage =====
# Digest-pinned: node:26-alpine resolved to 26.12.0.
FROM node:26.13.0-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94 AS build

# Pull patched alpine packages (openssl, expat, libpng, etc. — Trivy gate)
RUN apk upgrade --no-cache

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# Copy source and build
COPY . .
ARG REACT_APP_SOCKET_TRANSPORT
ENV REACT_APP_SOCKET_TRANSPORT=${REACT_APP_SOCKET_TRANSPORT:-polling}
RUN npm run build

# ===== Production Serve Stage =====
# Digest-pinned: nginx:1.29-alpine resolved to 1.29.8.
FROM nginx:1.31.8-alpine@sha256:785835ea65db4bba6f021acc0f3be91b0fef76a53fe41f8588c6698d2aed0606

# Pull patched alpine packages (openssl, expat, libpng, etc. — Trivy gate)
RUN apk upgrade --no-cache

# Hand the runtime dirs to the unprivileged nginx user (uid 101 — the same uid
# the k8s Deployment forces). The entrypoint's envsubst writes the processed
# template into /etc/nginx/conf.d and nginx needs writable cache/run paths;
# k8s mounts emptyDirs over them, this keeps the image self-sufficient
# standalone (docker compose / docker run).
# /run is listed explicitly: on Alpine /var/run is a symlink to /run, and
# `chown -R` does not traverse a symlink passed as an argument, so chowning
# only /var/run leaves the real directory root-owned and nginx cannot write its
# pid file (/run/nginx.pid) — `nginx -t` then fails with EACCES.
RUN chown -R nginx:nginx /var/cache/nginx /var/run /run /etc/nginx/conf.d /usr/share/nginx/html

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Nginx config template — processed by nginx entrypoint via envsubst
# to substitute ${API_UPSTREAM} at container start
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80

# API_UPSTREAM defaults to the Docker Compose backend service
ENV API_UPSTREAM=http://backend:8000

# Resolver for runtime proxy_pass lookups. Docker built-in DNS default;
# the k8s FE Deployment overrides to GKE node-local DNS 169.254.20.10
# (127.0.0.11 does not exist inside a pod) in frontend-deployment.yaml.
ENV NGINX_RESOLVER=127.0.0.11

USER nginx

CMD ["nginx", "-g", "daemon off;"]
