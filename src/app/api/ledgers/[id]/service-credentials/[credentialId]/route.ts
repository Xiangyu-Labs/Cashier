import { NextRequest, NextResponse } from "next/server";
import { deleteServiceCredential } from "@/lib/service-credentials";

type RouteParams = { params: Promise<{ id: string; credentialId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const { id: ledgerId, credentialId } = await params;
    try {
        await deleteServiceCredential(ledgerId, credentialId);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error("Failed to delete service credential:", error);
        return NextResponse.json({ error: "Failed to delete service credential" }, { status: 500 });
    }
}
