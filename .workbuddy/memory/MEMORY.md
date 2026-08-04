# FinServe AI — 项目长期笔记

## 本地开发环境（关键信息）
- 技术栈：pnpm monorepo（apps/web = Next.js 14 前端，apps/server = NestJS 后端，packages/shared-types）。
- 数据库：**PostgreSQL（必须）**，Prisma 管理。本地用 Homebrew 安装 `postgresql@16`，命令 `brew services start postgresql@16` 常驻。
- 默认端口：前端 5000，后端 5050，Postgres 5432。
- `.env` 原是脚手架占位符（`<choose-...>`），首次跑必须填真实值。当前已填：WEB_ORIGIN=http://localhost:5000、NEXT_PUBLIC_API_BASE_URL=http://localhost:5050/api、Postgres 角色/库=finserve/finserve_local、DATABASE_URL=postgresql://finserve:finserve_local@localhost:5432/finserve、JWT_SECRET 已生成、DEMO_PASSWORD=123456。

## 启动后端与数据库的标准流程（首次/重置）
1. 装库：`HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_BOTTLE_DOMAIN=https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles brew install postgresql@16`（北京网络慢，务必用清华/中科大镜像，否则易中断）。
2. `brew services start postgresql@16`；`psql -d postgres -c "CREATE ROLE finserve WITH LOGIN PASSWORD 'finserve_local';"` + `CREATE DATABASE finserve OWNER finserve;`
3. 在 apps/server 下：`export DATABASE_URL=...; export DEMO_PASSWORD=123456;` 然后 `pnpm prisma:generate && pnpm prisma:deploy && pnpm prisma:seed`。
4. 编译：`pnpm --filter @finserve/shared-types build && pnpm --filter @finserve/server build`，再 `node dist/main.js`（需注入 DATABASE_URL/JWT_SECRET/WEB_ORIGIN/PORT/DEMO_PASSWORD/LLM_*）。

## 排错要点
- 登录报 `Failed to fetch` = 前端请求没到后端，几乎都是「后端没起 / 端口错配 / Postgres 没跑」。先 `nc -z localhost 5050` 和 `nc -z localhost 5432`。
- **Next.js 的 NEXT_PUBLIC_* 在启动时内联**：改了 `.env` 后必须重启前端进程（kill 5000 端口占用再 `next dev`），否则浏览器仍打旧地址。macOS 杀端口占用用 `lsof -ti:5000 | xargs kill -9`（普通 kill 有时杀不掉，用 -9）。
- 后台 `run_in_background` 任务会在用户发新消息的间隙被回收，长任务（如 brew install）要用前台一次性跑完。
- macOS 没有 `setsid`，常驻进程用 `nohup ... & disown`。
- 验证前端是否指向正确后端：抓 `http://localhost:5000/login` 的 HTML，找 `/_next/static/chunks/app/login/page.js` 并 grep `localhost:5050/api`。

## 登录账号（seed 生成）
- `user@finserve.dev` / `agent@finserve.dev` / `other@finserve.dev`，密码均 `123456`。
- 后端登录接口：`POST /api/auth/login`，成功返回 201 + JWT。
