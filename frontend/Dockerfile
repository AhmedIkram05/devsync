# ===== Build Stage =====
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy source and build
COPY . .
RUN npm run build

# ===== Production Serve Stage =====
FROM nginx:1.27-alpine

# Copy built assets from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Nginx config template — processed by nginx entrypoint via envsubst
# to substitute ${API_UPSTREAM} at container start
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80

# API_UPSTREAM defaults to the Docker Compose backend service
ENV API_UPSTREAM=http://backend:8000

CMD ["nginx", "-g", "daemon off;"]
