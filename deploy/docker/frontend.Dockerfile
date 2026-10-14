# ==============================================================================
# PlanVista3D Frontend Production Dockerfile (Multi-stage Node.js + Nginx Alpine)
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy source code and build production bundle
COPY frontend/ ./
ARG VITE_API_BASE_URL=""
ARG VITE_PUTER_WORKER_URL="https://planvista-3d.puter.work"
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_PUTER_WORKER_URL=$VITE_PUTER_WORKER_URL

RUN npm run build

# Stage 2: Serve optimized assets with Nginx
FROM nginx:alpine

# Copy custom Nginx configuration with SPA routing and reverse proxy
COPY deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy production build artifacts
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
