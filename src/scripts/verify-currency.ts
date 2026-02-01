import fs from "fs";
import path from "path";

// Manually load .env.local to ensure DATABASE_URL is set correctly (identical logic to drizzle.config.ts)
function loadEnvLocal() {
    try {
        const envLocalPath = path.resolve(process.cwd(), ".env.local");
        if (fs.existsSync(envLocalPath)) {
            const envLocal = fs.readFileSync(envLocalPath, "utf8");
            const dbUrlMatch = envLocal.match(/^DATABASE_URL=(.+)$/m);
            if (dbUrlMatch) {
                process.env.DATABASE_URL = dbUrlMatch[1].trim();
                // Remove quotes if present
                if (process.env.DATABASE_URL.startsWith('"') && process.env.DATABASE_URL.endsWith('"')) {
                    process.env.DATABASE_URL = process.env.DATABASE_URL.slice(1, -1);
                }
                console.log("✅ Loaded DATABASE_URL from .env.local");
            } else {
                console.log("⚠️ .env.local found but DATABASE_URL pattern not matched");
            }
        } else {
            console.log("⚠️ .env.local not found at:", envLocalPath);
        }
    } catch (error) {
        console.warn("❌ Failed to load .env.local:", error);
    }
}

loadEnvLocal();

async function main() {
    console.log("--- Starting Currency Service Verification ---");
    console.log("Database URL Prefix:", process.env.DATABASE_URL?.substring(0, 15) + "...");

    try {
        // Dynamic import to ensure process.env is set BEFORE the module loads
        const { ExchangeRateService } = await import("../features/currency/server/exchange-rate-service");

        // 1. Fetch Rates (should hit API first time)
        console.log("1. Fetching current rates...");
        const rates = await ExchangeRateService.getRates();
        console.log(`   Success! Date: ${rates.date}, Base: ${rates.base}`);
        console.log(`   Sample Rates: USD=${rates.rates.USD}, CNY=${rates.rates.CNY}`);

        // 2. Conversion Test
        console.log("\n2. Testing Conversion (100 USD -> CNY)...");
        const amount = 100;
        const from = "USD";
        const to = "CNY";
        const result = await ExchangeRateService.convert(amount, from, to);
        console.log(`   ${amount} ${from} = ${result.toFixed(2)} ${to}`);

        // Verify math locally
        const expected = amount * (rates.rates[to] / rates.rates[from]);
        console.log(`   Expected: ~${expected.toFixed(2)}`);

        if (Math.abs(result - expected) < 0.01) {
            console.log("   ✅ Conversion accurate");
        } else {
            console.error("   ❌ Conversion discrepancy");
        }

    } catch (error) {
        console.error("❌ Verification Failed:", error);
        process.exit(1);
    }

    console.log("\n--- Verification Complete ---");
    process.exit(0);
}

main();
