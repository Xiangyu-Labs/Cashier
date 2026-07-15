import { type NextRequest, NextResponse } from "next/server";
import { localStoredFileAdapter } from "@/application/adapters/local";
import { requireAuth } from "@/lib/auth-actions";
import { AppError, UnauthorizedError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; targetId: string }> }
) {
  try {
    const userId = await requireAuth();
    const { sessionId, targetId } = await params;
    const contentType = request.headers.get("content-type")?.split(";", 1)[0] ?? "";
    const body = new Uint8Array(await request.arrayBuffer());
    const file = await localStoredFileAdapter.uploadTargetForUser({
      userId,
      uploadSessionId: sessionId,
      targetId,
      contentType,
      body,
    });
    return NextResponse.json({ storedFileId: file.id }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    if (error instanceof AppError) {
      return new NextResponse(error.statusCode === 404 ? "Not Found" : error.message, {
        status: error.statusCode,
      });
    }
    logger.error({ error }, "Failed to accept stored-file upload target");
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
