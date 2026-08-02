# Cashier 运维手册

## 首次部署

```bash
cp .env.local.example .env
# 填写账号和 OpenAI-compatible 配置
npm run docker:local
docker compose -f docker-compose.yml -f docker-compose.local.yml ps
```

访问 `http://localhost:3000`。入口脚本会自动生成并持久化 Auth secret 与 API key
pepper、执行 PostgreSQL migrations，并在用户表为空时创建初始账号。

初始账号只创建一次。首次登录成功后可以从 `.env` 删除
`INITIAL_USER_PASSWORD`，后续通过设置页面修改密码。

## 日常操作

```bash
npm run docker:local             # 本地完整栈
npm run docker:external          # 外部 Neon/R2，仅 app
docker compose logs -f app       # 查看应用日志
npm run docker:down              # 停止本地栈并保留数据
```

不要运行 `docker compose down -v`，除非确认要永久删除数据库、对象和内部密钥。

## 数据与备份

默认 named volumes：

- `cashier_postgres`：用户、账本和业务数据
- `cashier_minio`：上传的票据和附件
- `cashier_config`：自动生成的稳定内部密钥

创建一致备份时先停止应用写入：

```bash
docker compose stop app
docker compose exec -T postgres pg_dump -U cashier -d cashier -Fc > cashier-postgres.dump
docker run --rm -v cashier_minio:/source -v "$PWD":/backup alpine \
  tar -C /source -czf /backup/cashier-minio.tar.gz .
docker compose start app
```

恢复前先在隔离环境验证备份。数据库使用 `pg_restore`，MinIO volume 解压后再启动应用；
应用会自动补跑尚未执行的 migrations。

## 可选邮件登录

在 `.env` 设置以下值并重启应用：

```dotenv
AUTH_RESEND_KEY=re_...
AUTH_EMAIL_FROM=Cashier <noreply@example.com>
```

配置后登录页自动显示邮箱验证码入口，并按 `DISABLE_REGISTRATION` 控制 OTP 新用户注册。
未配置时不会创建或发送 OTP 邮件。

## 外部 PostgreSQL 或 S3

从外部模板创建 `.env`，填写所有数据库和对象存储密钥，然后只启动应用：

```bash
cp .env.example .env
npm run docker:external
```

外部 S3 bucket 必须预先存在。R2 使用账户 endpoint、`S3_REGION=auto` 和
`S3_FORCE_PATH_STYLE=false`。

Web 上传使用签名 PUT 直传。R2 CORS 只允许 `APP_URL` 对应的精确 origin（本地开发可另加
`http://localhost:3000`）、只允许 `PUT`，并允许 `Content-Type` 与
`x-amz-meta-sha256` 请求头。bucket 必须保持私有；为 `temporary/` 前缀配置 1 天后删除的
lifecycle rule。读取始终通过 `/api/stored-files/:fileId` 鉴权代理。

## Breaking migration 发布

`src/persistence/postgres-migrations/` 是唯一迁移历史。发布前分别在全新 PostgreSQL 17
数据库和当前生产快照副本上执行 `npm run db:migrate`，核对账本设置、outbox、revision、
entry、stored file 与软删除记录。

正式发布时停止应用写入并完成数据库备份，再执行迁移并部署同一发布版本。0016 会删除旧
JSON/payload 列，旧浏览器的 IndexedDB 快照会失效并重建，旧的活动上传 session 需要用户
重新上传。不要只回滚应用镜像：回滚必须恢复迁移前数据库备份并部署上一镜像。

`/api/v1` 是长期稳定契约，没有下线日期；部署与代理配置中不得添加 `/api/v2` 例外。

## 本地开发与检查

```bash
npm install
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d postgres minio storage-bootstrap
npm run db:migrate
npm run dev
```

提交前执行：

```bash
npm run lint
npm run tsc
npm run test:run
npm run validate:i18n
```
