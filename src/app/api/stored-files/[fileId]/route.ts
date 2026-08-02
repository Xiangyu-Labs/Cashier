import { type NextRequest, NextResponse } from "next/server";
import { currentApplication } from "@/application/current";
import { requireAuth } from "@/lib/auth-actions";
import { AppError, UnauthorizedError } from "@/lib/errors";
import { logger } from "@/lib/logger";

const CACHE_CONTROL = "private, no-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const userId = await requireAuth();
    const { fileId } = await params;
    const read = await currentApplication.storedFiles.readAuthorizedStreamForUser(userId, fileId);
    if (read == null) return new NextResponse("Not Found", { status: 404 });
    return new NextResponse(read.body, {
      status: 200,
      headers: {
        "Content-Type": read.file.metadata.contentType,
        "Content-Length": String(read.file.metadata.byteSize),
        "Cache-Control": CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    if (error instanceof AppError) {
      logger.error({ code: error.code, statusCode: error.statusCode }, "Stored file read failed");
      return new NextResponse(error.statusCode === 404 ? "Not Found" : "Storage Unavailable", {
        status: error.statusCode,
      });
    }
    logger.error({ error }, "Failed to read stored file");
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
