import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createApiKey, listApiKeys } from "@/lib/api-keys";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
    const { id: ledgerId } = await params;

    try {
        const keys = await listApiKeys(ledgerId);
        // Mask keys before returning
        const maskedKeys = keys.map(k => ({
            ...k,
            key: k.key ? `${k.key.substring(0, 8)}...${k.key.substring(k.key.length - 4)}` : undefined
        }));
        return NextResponse.json(maskedKeys);
    } catch (error) {
        console.error("Failed to list api keys:", error);
        return NextResponse.json({ error: "Failed to list API keys" }, { status: 500 });
    }
}

const createKeySchema = z.object({
    name: z.string().min(1, "Name is required"),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
    const { id: ledgerId } = await params;
    try {
        const body = await request.json();
        const validated = createKeySchema.parse(body);

        const newKey = await createApiKey(ledgerId, validated.name);
        return NextResponse.json(newKey, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Validation failed", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Failed to create api key:", error);
        return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
    }
}
