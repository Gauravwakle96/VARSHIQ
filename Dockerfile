# syntax=docker/dockerfile:1
FROM node:24-alpine AS web-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY THIRD_PARTY_NOTICES.md ./public/third-party-notices.txt
COPY DATASET_LICENCES.md ./public/dataset-licences.txt
RUN npm run build

FROM ghcr.io/astral-sh/uv:0.12.13 AS uv-binary

FROM python:3.13-slim-bookworm AS backend
COPY --from=uv-binary /uv /uvx /bin/
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 UV_LINK_MODE=copy
RUN groupadd --gid 10001 varshiq && useradd --uid 10001 --gid 10001 --create-home varshiq
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project --no-cache
COPY --chown=10001:10001 backend/ ./
COPY --chown=10001:10001 deploy/backend-entrypoint.sh /app/entrypoint.sh
RUN mkdir -p /app/backend/data /app/backend/uploads && chown -R 10001:10001 /app/backend/data /app/backend/uploads && chmod 755 /app/entrypoint.sh
ENV PATH="/app/backend/.venv/bin:$PATH"
USER 10001:10001
EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]

FROM nginxinc/nginx-unprivileged:stable-alpine AS frontend
COPY --from=web-build /build/frontend/dist/ /usr/share/nginx/html/
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
