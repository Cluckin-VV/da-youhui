# 大有惠（Da Youhui）

面向大学生的优惠信息发现与审核平台。项目关注的核心问题是：优惠信息容易过期、来源分散且真实性难判断，因此把“采集—审核—发布—反馈—维护”设计成可追踪流程。

> 本仓库是脱敏后的作品集源码，只保留 Web 应用、数据库迁移、维护脚本和自动化测试；不包含 `.env.local`、真实反馈、数据库备份、研究任务、求职材料或构建缓存。

## Product workflow

```text
source monitoring
  -> candidate offer
  -> evidence and risk review
  -> approval / rejection
  -> public listing
  -> user feedback
  -> expiry and maintenance
```

## Verified project snapshot

- Next.js 16 + TypeScript + React + PostgreSQL
- 14 database tables and 4 migration stages in the verified local snapshot
- 37 offer candidates, 13 research leads and 22 monitored sources
- 2 offers published after review in the verified local snapshot
- 17 automated tests covering feedback API and key client flows

These figures describe a local project snapshot. They are not production user or revenue metrics.

## Repository structure

```text
app/          pages, admin review and API routes
components/   reusable mobile-first UI
lib/          database, labels, types and admin boundary
database/     schema, migrations, audits, expiry and backup scripts
tests/        feedback API and client-flow tests
```

## Run locally

```bash
pnpm install
cp .env.example .env.local
pnpm test
pnpm dev
```

Configure PostgreSQL in `.env.local`. Never commit the local environment file or database backups.

## Design decisions

- PostgreSQL is the source of truth; published views are derived from reviewed records.
- Admin actions and public reads are separated.
- Evidence, freshness and expiry are treated as product fields.
- Feedback validation and state transitions have automated tests.
- Operational data and portfolio source code are kept separate.

