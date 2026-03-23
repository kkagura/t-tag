# @t-tag/api

Fastify backend for personal password manager.

## 1. Configure

Copy config and edit values:

```bash
cp .env.example .env
```

Important MySQL fields in `.env`:

- `MYSQL_HOST`: MySQL host, e.g. `127.0.0.1`
- `MYSQL_PORT`: MySQL port, default `3306`
- `MYSQL_USER`: MySQL username
- `MYSQL_PASSWORD`: MySQL password
- `MYSQL_DATABASE`: database name

## 2. Install

```bash
pnpm install
```

## 3. Run migrations

```bash
pnpm --filter @t-tag/api migrate
```

## 4. Start API

```bash
pnpm --filter @t-tag/api dev
```

## 5. API base path

- `GET /health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/vault-items`
- `POST /api/v1/vault-items`
- `POST /api/v1/vault-items/update`
- `POST /api/v1/vault-items/delete`
- `GET /api/v1/tags`
- `POST /api/v1/tags/create`
- `POST /api/v1/tags/delete`
