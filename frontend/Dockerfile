# ===== Build Stage =====
FROM node:20-alpine AS build

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
FROM nginx:1.27-alpine

# Pull patched alpine packages (openssl, expat, libpng, etc. — Trivy gate)
RUN apk upgrade --no-cache

# Copy built assets from build stage
COPY --from=build /app/build /usr/share/nginx/html

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

CMD ["nginx", "-g", "daemon off;"]
