# syntax=docker/dockerfile:1

FROM node:24-slim AS frontend
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=secret,id=extra_ca \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS backend-build
COPY --from=ghcr.io/astral-sh/uv:0.12.17 /uv /bin/uv
ENV UV_PYTHON_DOWNLOADS=0 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN --mount=type=secret,id=extra_ca \
    set -e; \
    if [ -s /run/secrets/extra_ca ]; then \
        cat /etc/ssl/certs/ca-certificates.crt /run/secrets/extra_ca > /tmp/ca.pem; \
        export SSL_CERT_FILE=/tmp/ca.pem; \
    fi; \
    uv sync --locked; \
    rm -f /tmp/ca.pem

FROM python:3.12-slim
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 DB_PATH=/app/db/finally.db
COPY --from=backend-build /app/.venv /app/.venv
COPY backend/app /app/app
COPY --from=frontend /fe/out /app/static
RUN useradd --system --user-group app \
    && mkdir -p /app/db \
    && chown app:app /app/db
USER app
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)"
CMD ["uvicorn", "--factory", "app.main:create_app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--timeout-graceful-shutdown", "3"]
