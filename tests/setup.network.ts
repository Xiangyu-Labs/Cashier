import { afterAll, afterEach, beforeAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const server = setupServer(
  http.all("https://api.openai.com/*", () =>
    HttpResponse.json({ error: { message: "Test provider unavailable" } }, { status: 503 })
  ),
  http.get("https://api.frankfurter.app/:date", ({ params }) =>
    HttpResponse.json({
      base: "EUR",
      date: String(params.date),
      rates: {
        USD: 1,
        AUD: 1.5,
        BHD: 0.4,
        BRL: 6,
        CAD: 1.4,
        CHF: 1,
        CNY: 8,
        CZK: 25,
        DKK: 7.5,
        GBP: 0.85,
        HKD: 8.5,
        HUF: 400,
        IDR: 17000,
        ILS: 4,
        INR: 90,
        ISK: 150,
        JPY: 160,
        JOD: 0.75,
        KWD: 0.33,
        KRW: 1500,
        MXN: 20,
        MYR: 5,
        NOK: 12,
        NZD: 1.7,
        OMR: 0.4,
        PHP: 60,
        PLN: 4.5,
        RON: 5,
        SEK: 12,
        SGD: 1.5,
        THB: 40,
        TND: 3.5,
        TRY: 40,
        ZAR: 20,
      },
    })
  )
);
const unexpectedRequests: Error[] = [];

export function createUnexpectedHttpError(request: Pick<Request, "method" | "url">): Error {
  let origin = "invalid-origin";
  try {
    origin = new URL(request.url).origin;
  } catch {}
  return new Error(`TEST_UNEXPECTED_HTTP ${request.method.toUpperCase()} ${origin}`);
}

export function takeUnexpectedHttpErrors(): Error[] {
  return unexpectedRequests.splice(0);
}

beforeAll(() => {
  server.listen({
    onUnhandledRequest(request) {
      const error = createUnexpectedHttpError(request);
      unexpectedRequests.push(error);
      throw error;
    },
  });
});

afterEach(() => {
  server.resetHandlers();
  const errors = takeUnexpectedHttpErrors();
  if (errors.length > 0) throw errors[0];
});

afterAll(() => {
  server.close();
  takeUnexpectedHttpErrors();
});
