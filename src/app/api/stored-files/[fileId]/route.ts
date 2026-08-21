import { type NextRequest, NextResponse } from "next/server";
import { serverComposition } from "@/application/server-composition-root";
import { requireAuth } from "@/lib/auth-actions";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getErrorStatusCode, toSanitizedErrorResponse } from "@/lib/error-handlers";

const CACHE_CONTROL = "private, no-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const requestId = crypto.randomUUID();
  try {
    const userId = await requireAuth();
    const { fileId } = await params;
    const read = await serverComposition.storedFiles.readAuthorizedStreamForUser(userId, fileId);
    if (read == null) throw new AppError("Stored file not found", "FILE_NOT_FOUND", 404);
    return new NextResponse(read.body, {
      status: 200,
      headers: {
        "Content-Type": read.file.metadata.contentType,
        "Content-Length": String(read.file.metadata.byteSize),
        "Cache-Control": CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    const status = getErrorStatusCode(error);
    const body = toSanitizedErrorResponse(error);
    const log = status < 500 ? logger.warn : logger.error;
    log(
      { requestId, status, errorCode: body.error.code },
      status < 500 ? "Stored file request rejected" : "Stored file request failed"
    );
    return NextResponse.json(body, {
      status,
      headers: { "Cache-Control": CACHE_CONTROL, "X-Request-Id": requestId },
    });
  }
}
