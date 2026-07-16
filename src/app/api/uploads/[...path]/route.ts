import { type NextRequest, NextResponse } from "next/server";
import { currentApplication } from "@/application/current";
import { requireAuth } from "@/lib/auth-actions";
import { UnauthorizedError } from "@/lib/errors";
import { logger } from "@/lib/logger";

const CACHE_CONTROL = "public, max-age=31536000, immutable";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const userId = await requireAuth();
    const result = await currentApplication.storedFiles.readAuthorizedLegacyUpload(
      userId,
      (await params).path
    );
    if (result == null) return new NextResponse("Not Found", { status: 404 });
    return new NextResponse(Buffer.from(result.body), {
      status: 200,
      headers: { "Content-Type": result.contentType, "Cache-Control": CACHE_CONTROL },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    logger.error({ error }, "Failed to serve legacy upload");
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
