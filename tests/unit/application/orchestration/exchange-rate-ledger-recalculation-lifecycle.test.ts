import { afterEach, describe, expect, it, vi } from "vitest";

const registerHandlerMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/currency/events", () => ({
  registerExchangeRatesStoredHandler: registerHandlerMock,
}));

vi.mock("@/application/server-composition-root", () => ({
  serverComposition: { exchangeRates: {} },
}));

describe("exchange-rate recalculation orchestration lifecycle", () => {
  afterEach(async () => {
    const orchestration =
      await import("@/application/orchestration/exchange-rate-ledger-recalculation");
    orchestration.shutdownExchangeRateLedgerRecalculationOrchestration();
    registerHandlerMock.mockReset();
  });

  it("disposes the old subscription across module reloads", async () => {
    const disposeFirst = vi.fn();
    const disposeSecond = vi.fn();
    registerHandlerMock.mockReturnValueOnce(disposeFirst).mockReturnValueOnce(disposeSecond);

    const firstModule =
      await import("@/application/orchestration/exchange-rate-ledger-recalculation");
    firstModule.initializeExchangeRateLedgerRecalculationOrchestration();

    vi.resetModules();
    const secondModule =
      await import("@/application/orchestration/exchange-rate-ledger-recalculation");
    secondModule.initializeExchangeRateLedgerRecalculationOrchestration();

    expect(disposeFirst).toHaveBeenCalledTimes(1);
    expect(registerHandlerMock).toHaveBeenCalledTimes(2);

    secondModule.shutdownExchangeRateLedgerRecalculationOrchestration();
    expect(disposeSecond).toHaveBeenCalledTimes(1);
  });
});
