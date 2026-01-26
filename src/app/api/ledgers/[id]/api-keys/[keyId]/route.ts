import { NextRequest, NextResponse } from "next/server";
import { deleteApiKey } from "@/lib/api-keys";

type RouteParams = { params: Promise<{ id: string; keyId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const { id: ledgerId, keyId } = await params;
    try {
        await deleteApiKey(ledgerId, keyId);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error("Failed to delete api key:", error);
        return NextResponse.json({ error: "Failed to delete API key" }, { status: 500 });
    }
}
