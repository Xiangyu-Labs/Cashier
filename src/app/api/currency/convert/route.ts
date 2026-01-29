import { NextRequest, NextResponse } from "next/server";
import { ExchangeRateService } from "@/lib/currency/exchange-rate-service";

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const amountStr = searchParams.get("amount");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const date = searchParams.get("date") || undefined;

    if (!amountStr || !from || !to) {
        return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const amount = parseFloat(amountStr);

    try {
        const converted = await ExchangeRateService.convert(amount, from, to, date);
        return NextResponse.json({
            amount,
            from,
            to,
            date,
            converted
        });
    } catch (error) {
        console.error("Currency conversion error:", error);
        return NextResponse.json({ error: "Conversion failed" }, { status: 500 });
    }
}
