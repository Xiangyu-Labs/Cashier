# 配置参考

本地全家桶从 `.env.local.example` 开始；外部数据库和对象存储部署从 `.env.example`
开始。空字符串会被当作未配置，除非下面另有说明。

## 应用与 AI

| 变量                    | 必需     | 默认值                      | 说明                                   |
| ----------------------- | -------- | --------------------------- | -------------------------------------- |
| `INITIAL_USER_EMAIL`    | 首次启动 | 无                          | 空数据库中创建的初始账号邮箱。         |
| `INITIAL_USER_PASSWORD` | 首次启动 | 无                          | 初始账号密码；用户创建后不会再次同步。 |
| `APP_URL`               | 否       | `http://localhost:3000`     | 用户访问 Cashier 的公开地址。          |
| `OPENAI_API_KEY`        | 是       | 无                          | OpenAI 或兼容服务的 API 密钥。         |
| `OPENAI_BASE_URL`       | 否       | `https://api.openai.com/v1` | OpenAI 兼容 API 根地址。               |
| `AI_MODEL`              | 否       | `gpt-4o`                    | 用于票据解析和分类的模型名。           |
| `TZ`                    | 否       | `Asia/Shanghai`             | 服务端默认时区。                       |

## PostgreSQL

| 变量                | 必需     | 默认值 | 说明                                           |
| ------------------- | -------- | ------ | ---------------------------------------------- |
| `DATABASE_URL`      | 外部模式 | 无     | 必须是 `postgres://` 或 `postgresql://` 地址。 |
| `DATABASE_POOL_MAX` | 否       | `2`    | 连接池上限，范围 1–50。                        |

本地全家桶由 `docker-compose.local.yml` 自动提供 `DATABASE_URL`。

## S3 / Cloudflare R2

| 变量                   | 必需       | 默认值        | 说明                                   |
| ---------------------- | ---------- | ------------- | -------------------------------------- |
| `S3_ENDPOINT`          | 外部模式   | 无            | 服务端访问的 S3 兼容端点。             |
| `S3_PUBLIC_ENDPOINT`   | 视部署而定 | `S3_ENDPOINT` | 浏览器直传时可访问的端点。             |
| `S3_REGION`            | 否         | `auto`        | R2 使用 `auto`；其他服务按供应商配置。 |
| `S3_BUCKET`            | 外部模式   | 无            | 已经存在的私有存储桶名称。             |
| `S3_ACCESS_KEY_ID`     | 外部模式   | 无            | S3 访问密钥 ID。                       |
| `S3_SECRET_ACCESS_KEY` | 外部模式   | 无            | S3 访问密钥。                          |
| `S3_FORCE_PATH_STYLE`  | 否         | `false`       | MinIO 等服务通常需要设为 `true`。      |

本地全家桶会启动 MinIO 并自动创建 `cashier` 桶。

## 认证与内部密钥

| 变量                   | 必需   | 默认值                          | 说明                                                             |
| ---------------------- | ------ | ------------------------------- | ---------------------------------------------------------------- |
| `AUTH_SECRET`          | 运行时 | Docker 自动生成                 | Auth.js 会话签名密钥。                                           |
| `API_KEY_PEPPER`       | 运行时 | Docker 自动生成                 | 服务凭证哈希使用的 pepper。                                      |
| `RATE_LIMIT_PEPPER`    | 运行时 | Docker 自动生成                 | 限流键匿名化哈希使用的 pepper。                                  |
| `AUTH_OTP_PEPPER`      | 运行时 | Docker 自动生成                 | 邮箱验证码哈希使用的 pepper。                                    |
| `AUTH_RESEND_KEY`      | 否     | 无                              | 配置后启用 Resend 邮箱验证码登录和注册。                         |
| `AUTH_EMAIL_FROM`      | 否     | `Cashier <noreply@example.com>` | 验证码和登录通知的发件人。                                       |
| `DISABLE_REGISTRATION` | 否     | `false`                         | 设为 `true` 后禁止新邮箱注册。                                   |
| `SESSION_MAX_AGE_DAYS` | 否     | `14`                            | 登录会话最长天数。                                               |
| `DEV_AUTH_BYPASS`      | 否     | `false`                         | 仅测试环境，或 `APP_URL` 指向 loopback 的 development 环境可用。 |

Docker 容器会把自动生成的内部密钥保存在 `cashier_config` 卷。非 Docker 部署必须自行
提供这些值，并保证重启和多实例之间保持一致。

## AI、图片与缓存

| 变量                       | 默认值     | 说明                         |
| -------------------------- | ---------- | ---------------------------- |
| `AI_MAX_RETRIES`           | `3`        | AI 调用重试次数，可设为 0。  |
| `AI_RETRY_DELAY_MS`        | `1000`     | AI 重试初始等待毫秒数。      |
| `AI_TEMPERATURE`           | `0.3`      | 模型 temperature，范围 0–2。 |
| `MAX_INPUT_PIXELS`         | `25000000` | 兼容保留；当前不控制 Sharp。 |
| `MAX_IMAGE_QUALITY`        | `85`       | 图片输出质量，范围 1–100。   |
| `SOURCE_DOC_STALE_TIME_MS` | `120000`   | 单据客户端数据新鲜期。       |
| `CURRENCY_STALE_TIME_MS`   | `14400000` | 汇率客户端数据新鲜期。       |

当前图片策略固定为 16 MP 业务校验上限，以及 24 MP Sharp 解码保护上限。
`MAX_INPUT_PIXELS` 仍保留以兼容既有部署配置，但修改它不会改变这两个限制。

## 恢复、限流与代理

| 变量                                      | 默认值 | 说明                                                                                                           |
| ----------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| `PROCESSING_RECOVERY_MAX_BATCH`           | `5`    | 单次请求最多恢复的待处理任务数。                                                                               |
| `PROCESSING_RECOVERY_MAX_ATTEMPTS`        | `5`    | 待处理任务最多恢复尝试次数。                                                                                   |
| `PROCESSING_RECOVERY_COOLDOWN_SECONDS`    | `60`   | 恢复尝试之间的冷却时间。                                                                                       |
| `API_RATE_LIMIT_PER_MINUTE`               | `60`   | 每个服务凭证共享的 API v1 每分钟额度。                                                                         |
| `AUTH_PASSWORD_EMAIL_MAX_ATTEMPTS`        | `10`   | 密码登录邮箱维度窗口上限。                                                                                     |
| `AUTH_PASSWORD_IP_MAX_ATTEMPTS`           | `50`   | 密码登录可信 IP 维度窗口上限。                                                                                 |
| `AUTH_PASSWORD_RATE_LIMIT_WINDOW_SECONDS` | `900`  | 密码登录限流窗口秒数。                                                                                         |
| `TRUSTED_PROXY`                           | 无     | 可选值仅为 `platform`。Vercel 读取单值 `X-Vercel-Forwarded-For`；Docker 读取由可信入口覆盖的单值 `X-Real-IP`。 |

未配置可信入口，或平台头为空、多值、非法时，地址会归入固定的哈希 `unknown` 桶，认证前限流仍然生效。`src/lib/env/startup.ts` 还定义了更细的 OTP 限流变量。

## 日志与端口

| 变量        | 默认值 | 说明                             |
| ----------- | ------ | -------------------------------- |
| `LOG_LEVEL` | `info` | 应用日志级别。                   |
| `APP_PORT`  | `3000` | Compose 暴露到宿主机的应用端口。 |
| `S3_PORT`   | `9000` | 本地全家桶暴露的 MinIO 端口。    |

不要在日志、Issue 或截图中公开 `.env`、Bearer Token、内部密钥、邮箱验证码或原始票据。
