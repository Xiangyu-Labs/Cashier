import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceCredential, listServiceCredentials } from "@/lib/service-credentials";
import { requireLedgerAccess } from "@/lib/auth/helpers";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
    const { id: ledgerId } = await params;

    // Verify user owns this ledger
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) return error;

    try {
        const credentials = await listServiceCredentials(ledgerId);
        // Mask keys before returning
        const maskedCredentials = credentials.map(c => ({
            ...c,
            key: c.key ? `${c.key.substring(0, 8)}...${c.key.substring(c.key.length - 4)}` : undefined
        }));
        return NextResponse.json(maskedCredentials);
    } catch (error) {
        console.error("Failed to list service credentials:", error);
        return NextResponse.json({ error: "Failed to list service credentials" }, { status: 500 });
    }
}

const createCredentialSchema = z.object({
    name: z.string().min(1, "Name is required"),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
    const { id: ledgerId } = await params;

    // Verify user owns this ledger
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) return error;

    try {
        const body = await request.json();
        const validated = createCredentialSchema.parse(body);

        const newCredential = await createServiceCredential(ledgerId, validated.name);
        return NextResponse.json(newCredential, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Validation failed", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Failed to create service credential:", error);
        return NextResponse.json({ error: "Failed to create service credential" }, { status: 500 });
    }
}
