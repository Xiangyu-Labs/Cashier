import { type NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  _context: { params: Promise<{ path: string[] }> }
) {
  return new NextResponse("Not Found", { status: 404 });
}
