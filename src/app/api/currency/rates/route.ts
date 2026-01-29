import { ExchangeRateService } from "@/lib/currency/exchange-rate-service";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const dateParam = searchParams.get("date"); // Optional YYYY-MM-DD

    try {
        const dates = await ExchangeRateService.getRates(dateParam || undefined);
        return NextResponse.json(dates);
    } catch (error) {
        console.error("Exchange Rate API Error:", error);
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 500 }
        );
    }
}
