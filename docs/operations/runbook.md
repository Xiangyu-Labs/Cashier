# Cashier 运维手册

## 首次部署

```bash
cp .env.example .env
# 填写 QUICK START 中的邮箱、密码和 OpenAI-compatible 配置
docker compose up -d
docker compose ps
```

访问 `http://localhost:3000`。入口脚本会自动生成并持久化 Auth secret 与 API key
pepper、执行 PostgreSQL migrations，并在用户表为空时创建初始账号。

初始账号只创建一次。首次登录成功后可以从 `.env` 删除
`INITIAL_USER_PASSWORD`，后续通过设置页面修改密码。

## 日常操作

```bash
docker compose logs -f app       # 查看应用日志
docker compose pull              # 拉取新镜像
docker compose up -d             # 滚动更新并自动迁移
docker compose restart app       # 只重启应用
docker compose down              # 停止，保留数据
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

取消 `.env` 中 `EXTERNAL SERVICES` 对应变量的注释并填写连接信息，然后只启动应用：

```bash
docker compose up -d --no-deps app
```

外部 S3 bucket 必须预先存在。R2 使用账户 endpoint、`S3_REGION=auto` 和
`S3_FORCE_PATH_STYLE=false`。如果 API v2 客户端需要直接上传，还要将
`S3_PUBLIC_ENDPOINT` 设置为客户端可访问的 endpoint。

## 本地开发与检查

```bash
npm install
docker compose up -d postgres minio minio-init
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
