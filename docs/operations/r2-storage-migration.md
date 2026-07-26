# Private R2 storage cutover

Cashier runtime supports private Cloudflare R2 only. Browsers upload source images with short-lived,
PUT-only signed URLs and read through `/api/stored-files/:fileId`. The bucket must not have public
access or a public custom domain, and no Worker is required.

## Prepare

1. Create the private bucket `cashier-images` and an Object Read & Write S3 token scoped only to it.
2. Back up Neon and the complete production `data/uploads` tree. Record the current image digest.
3. Put the four R2 values in a local ignored environment file and the production `.env`:

   ```dotenv
   R2_ACCOUNT_ID=...
   R2_BUCKET_NAME=cashier-images
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   ```

Do not paste credentials into chat, logs, issue trackers, or Git.

The same four R2 values support upload signing, HEAD verification, server-side COPY, reads, and
deletes. Do not expose them to the browser and do not create a separate browser credential.

## Configure direct-upload CORS and cleanup

Before deploying the direct-upload Web flow, add an R2 CORS rule with the exact production and
stable staging origins. Local development may add `http://localhost:3000`. Do not add `*` or
ephemeral Vercel preview origins.

```json
[
  {
    "AllowedOrigins": [
      "https://cashier.example.com",
      "https://cashier-staging.example.com",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type", "x-amz-meta-sha256"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

Replace the example HTTPS origins with the deployed values of `NEXT_PUBLIC_APP_URL`; omit staging
when it does not exist. Keep the bucket private. CORS grants no object access without a valid signed
URL.

Configure an R2 lifecycle rule that deletes objects with prefix `temporary/` after one day. The
application deletes promoted temporary objects best-effort; the lifecycle rule covers abandoned
sessions and interrupted cleanup.

## Upload historical objects

The migration script can upload the database-referenced files directly. It validates local files
and legacy inline data-URI images before the first R2 write, uploads with six concurrent requests,
and then downloads every object to verify it again. The object key stays identical to
`stored_files.storage_key`:

```text
local: data/uploads/<ledger-id>/stored/<file-id>
R2:                <ledger-id>/stored/<file-id>
```

With the ignored `.env.r2.local` file configured, upload and verify with:

```bash
npm run storage:r2:upload
```

`LOCAL_INVALID` means nothing was uploaded. An upload interrupted by a network error is safe to
rerun. Upload mode does not download objects after writing and does not change the database.
`EXTRA_R2_OBJECT` is informational and objects are never automatically deleted.

## Maintenance window

1. Stop Cashier writes for 15-30 minutes and wait for open upload sessions to expire.
2. Copy and upload the final `data/uploads/` increment, then repeat the dry-run.
3. Switch the verified database rows under an advisory lock:

   ```bash
   npm run storage:r2:migrate -- --apply --maintenance-window-confirmed
   ```

   To explicitly accept upload success without downloading every R2 object for checksum
   verification, use:

   ```bash
   npm run storage:r2:migrate -- --apply --maintenance-window-confirmed --skip-r2-verification
   ```

4. Deploy the pinned candidate image and force recreation so Compose rereads `.env`:

   ```bash
   docker compose pull
   docker compose up -d --force-recreate
   ```

5. Verify historical reads, a new upload, AI recognition and retry, unauthorized 404 behavior, and
   persistence after a container restart.

The isolated live credential check touches only a random `smoke-tests/` key:

```bash
npm run storage:r2:smoke
```

## Roll back to the previous image

Keep writes frozen. The rollback command downloads every active R2 row to `LOCAL_STORAGE_PATH`,
verifies size/checksum, and only then changes those rows to `local` in a locked transaction:

```bash
npm run storage:r2:migrate -- --rollback --maintenance-window-confirmed
```

Restore the previous environment and pinned image digest, then force-recreate the container. The
new R2-only image intentionally cannot run against `local` rows.
