import { type NextRequest, NextResponse } from "next/server";
import { getLocalStorage } from "@/lib/storage/local";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/auth-actions";
import { UnauthorizedError } from "@/lib/errors";
import path from "path";

const CACHE_CONTROL = "public, max-age=31536000, immutable";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".avif": "image/avif",
};

/**
 * Validate path segments to prevent path traversal attacks
 * Returns true if path is valid, false otherwise
 */
function validatePathSegments(segments: string[]): boolean {
  for (const segment of segments) {
    // Reject path traversal sequences
    if (segment.includes("..")) {
      return false;
    }

    // Reject backslashes (Windows-style paths)
    if (segment.includes("\\")) {
      return false;
    }

    // Reject empty segments
    if (segment === "" || segment === ".") {
      return false;
    }

    // Reject absolute paths
    if (segment.startsWith("/")) {
      return false;
    }
  }

  return true;
}

/**
 * Get MIME type based on file extension
 */
function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    // 1. Authenticate the user
    await requireAuth();

    // 2. Extract and validate path segments
    const { path: pathSegments } = await params;

    if (pathSegments == null || pathSegments.length < 3) {
      logger.warn({ pathSegments }, "Invalid path: insufficient segments");
      return new NextResponse("Not Found", { status: 404 });
    }

    // Validate all path segments for security
    if (!validatePathSegments(pathSegments)) {
      logger.warn({ pathSegments }, "Invalid path: path traversal attempt detected");
      return new NextResponse("Not Found", { status: 404 });
    }

    // Extract ledgerId from first path segment for access control
    const [ledgerId, docId, ...filenameParts] = pathSegments;
    const filename = filenameParts.join("/");

    if (ledgerId === "" || docId === "" || filename === "") {
      logger.warn({ ledgerId, docId, filename }, "Invalid path: missing components");
      return new NextResponse("Not Found", { status: 404 });
    }

    // 3. Construct the storage key
    const storageKey = `${ledgerId}/${docId}/${filename}`;

    // 4. Get the file from local storage
    const storage = getLocalStorage();
    const fileBuffer = await storage.download(storageKey);

    // 5. Determine MIME type and serve the file
    const contentType = getMimeType(filename);

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": CACHE_CONTROL,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Handle file not found error
    if (error instanceof Error && error.message.includes("File not found")) {
      logger.warn({ error: error.message }, "File not found in storage");
      return new NextResponse("Not Found", { status: 404 });
    }

    // Log and return generic error for other cases
    logger.error({ error }, "Failed to serve uploaded image");
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
