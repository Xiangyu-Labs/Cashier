# Cashier 运维手册

本文档面向部署、运维、联调和紧急处理场景，覆盖：

- 本地运行
- Docker 开发 / 生产部署
- 数据库迁移
- 数据备份与恢复
- 常见运维动作

## 1. 基本约定

### 默认路径

- 数据库：`./data/sqlite.db`
- 上传文件：`./data/uploads`
- 本地环境变量：`./.env.local`
- Docker 生产环境变量：`./.env`

### 关键脚本

- 安装依赖：`npm install`
- 本地开发：`npm run dev`
- 类型检查：`npm run tsc`
- Lint：`npm run lint`
- 单元测试：`npm run test:unit`
- i18n 校验：`npm run validate:i18n`
- 生成迁移：`npm run db:generate`
- 执行迁移：`npm run db:migrate`
- 推送 schema：`npm run db:push`

## 2. 本地运行

### 首次启动

1. 复制环境变量模板：

```bash
cp .env.example .env.local
```

2. 按需填写 `.env.local`

至少确认这些值：

- `OPENAI_API_KEY`
- `AUTH_SECRET`
- `AUTH_URL`
- `NEXT_PUBLIC_APP_URL`

如果使用默认本地 SQLite，可保持：

- `DATABASE_URL=file:./data/sqlite.db`
- `LOCAL_STORAGE_PATH=./data/uploads`

3. 安装依赖：

```bash
npm install
```

4. 执行数据库迁移：

```bash
npm run db:migrate
```

5. 启动开发服务器：

```bash
npm run dev
```

6. 打开：

```text
http://localhost:3000
```

### 启动前验证

建议在改动较大或准备联调前执行：

```bash
npm run lint
npm run tsc
npm run test:unit
npm run validate:i18n
```

## 3. Worktree / 分支联调

如果你在一个 worktree 里运行 Cashier，需要注意：

- `./data/sqlite.db` 和 `./.env.local` 是相对当前 worktree 路径解析的
- 主工作区和 worktree 默认不会共享数据库文件

如果你要把主工作区数据库带到 worktree 里联调，可以复制：

```bash
cp /path/to/main/.env.local /path/to/worktree/.env.local
cp -f /path/to/main/data/sqlite.db /path/to/worktree/data/sqlite.db
cp -f /path/to/main/data/sqlite.db-wal /path/to/worktree/data/sqlite.db-wal
cp -f /path/to/main/data/sqlite.db-shm /path/to/worktree/data/sqlite.db-shm
cp -a /path/to/main/data/uploads/. /path/to/worktree/data/uploads/
```

复制后建议执行一次：

```bash
npm run db:migrate
```

因为分支代码可能依赖比主库更新的 schema。

## 4. 数据库迁移策略

### 日常开发

如果你修改了 Drizzle schema：

1. 生成迁移：

```bash
npm run db:generate
```

2. 执行迁移：

```bash
npm run db:migrate
```

### 只想把当前 schema 直接推到本地数据库

```bash
npm run db:push
```

说明：

- `db:push` 适合本地快速同步
- `db:generate + db:migrate` 更适合可审计、可部署的正式变更

### 生产部署建议

生产环境优先使用：

```bash
npm run db:migrate
```

不要直接在生产上依赖 `db:push` 作为常规迁移手段。

## 5. Docker 生产部署

### 环境文件

生产 Compose 文件 `docker-compose.yml` 实际读取的是：

```text
.env
```

不是 `.env.production`。

所以推荐这样准备：

```bash
cp .env.example .env
```

然后编辑 `.env`。

### 启动

```bash
npm run docker:prod
```

或者：

```bash
docker compose up -d --build
```

### 生产容器行为

生产镜像入口脚本 `docker-entrypoint.sh` 会自动执行：

1. 创建数据库目录
2. 创建上传目录
3. 执行 `npm run db:migrate`
4. 启动应用

如果你明确不希望容器自动迁移，可设置：

```bash
SKIP_MIGRATIONS=true
```

### 卷挂载

生产 Compose 默认挂载：

```text
./data:/app/data
```

这意味着：

- 数据库和上传文件都保存在宿主机 `./data`
- 重建容器不会丢失数据

## 6. 非 Docker 生产运行

如果你不使用 Docker，可以按传统 Node 方式运行：

1. 准备环境变量
2. 安装依赖
3. 构建：

```bash
npm run build
```

4. 执行迁移：

```bash
npm run db:migrate
```

5. 启动：

```bash
npm run start
```

## 7. 数据备份与恢复

### 备份 SQLite

在应用停止写入时，最简单的方式是备份整个 `data/` 目录：

```bash
cp -a ./data ./data.backup.$(date +%Y%m%d-%H%M%S)
```

如果只备份主库文件，建议同时带上 WAL / SHM：

```bash
cp ./data/sqlite.db ./backup/sqlite.db
cp ./data/sqlite.db-wal ./backup/sqlite.db-wal
cp ./data/sqlite.db-shm ./backup/sqlite.db-shm
```

### 恢复

1. 停止应用
2. 恢复数据库和上传文件
3. 重新启动应用
4. 执行一次迁移，确保 schema 对齐：

```bash
npm run db:migrate
```

## 8. 常见运维动作

### 查看当前用户

```bash
sqlite3 ./data/sqlite.db "SELECT id, email, created_at, deleted_at FROM users ORDER BY created_at DESC;"
```

### 查看最近迁移记录

```bash
sqlite3 ./data/sqlite.db "SELECT * FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 10;"
```

### 查看应用日志

本地开发直接看终端输出。

Docker 生产环境：

```bash
docker compose logs -f
```

只看 app 服务：

```bash
docker compose logs -f app
```

## 9. 推荐的最小生产操作流程

### 首次上线

```bash
cp .env.example .env
# 编辑 .env
docker compose up -d --build
```

### 例行升级

```bash
git pull
docker compose up -d --build
```

由于生产入口脚本会自动执行 `npm run db:migrate`，一般不需要额外手工跑迁移。
