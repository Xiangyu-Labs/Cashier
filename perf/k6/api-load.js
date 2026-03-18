import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";

const seed = JSON.parse(open("../.seed.json"));
const baseUrl = (__ENV.PERF_BASE_URL || "http://host.docker.internal:3000").replace(/\/$/, "");
const apiKey = __ENV.PERF_API_KEY || seed.apiKey;
const scenarioName = __ENV.PERF_SCENARIO || "read_mix";
const preset = __ENV.PERF_PRESET || "smoke";

function buildScenarioConfig() {
  if (preset === "baseline" && scenarioName === "write_enqueue") {
    return {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 1 },
        { duration: "45s", target: 2 },
        { duration: "45s", target: 4 },
        { duration: "45s", target: 6 },
        { duration: "45s", target: 8 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    };
  }

  if (preset === "baseline") {
    return {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 5 },
        { duration: "45s", target: 10 },
        { duration: "45s", target: 20 },
        { duration: "45s", target: 30 },
        { duration: "45s", target: 40 },
        { duration: "45s", target: 60 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    };
  }

  return {
    executor: "constant-vus",
    vus: scenarioName === "write_enqueue" ? 1 : 2,
    duration: "30s",
  };
}

const durationThreshold = scenarioName === "write_enqueue" ? 1000 : 500;

export const options = {
  scenarios: {
    [scenarioName]: buildScenarioConfig(),
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: [`p(95)<${durationThreshold}`],
    checks: ["rate>0.99"],
  },
};

const commonParams = {
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
};

function request(path, params = commonParams) {
  return http.get(`${baseUrl}${path}`, params);
}

function runReadMix() {
  const bucket = Math.random();
  let response;

  if (bucket < 0.4) {
    response = request(
      `/api/v1/entries?limit=20&startDate=${seed.dateRange.startDate}&endDate=${seed.dateRange.endDate}`
    );
    check(response, {
      "entries status is 200": (res) => res.status === 200,
    });
  } else if (bucket < 0.6) {
    response = request(
      `/api/v1/stats?startDate=${seed.dateRange.startDate}&endDate=${seed.dateRange.endDate}`
    );
    check(response, {
      "stats status is 200": (res) => res.status === 200,
    });
  } else if (bucket < 0.8) {
    response = request(
      `/api/v1/source-documents?limit=20&startDate=${seed.dateRange.startDate}&endDate=${seed.dateRange.endDate}`
    );
    check(response, {
      "source documents status is 200": (res) => res.status === 200,
    });
  } else if (bucket < 0.9) {
    response = request("/api/v1/task/stats");
    check(response, {
      "task stats status is 200": (res) => res.status === 200,
    });
  } else {
    response = request("/api/v1/task/items");
    check(response, {
      "task items status is 200": (res) => res.status === 200,
    });
  }

  sleep(1 + Math.random() * 2);
}

function runWriteEnqueue() {
  const iteration = exec.scenario.iterationInTest;
  const payload = JSON.stringify({
    text: `Performance write test VU ${exec.vu.idInTest} iteration ${iteration}`,
    entryDate: seed.dateRange.endDate,
    timezone: "UTC",
  });

  const response = http.post(`${baseUrl}/api/v1/source-documents`, payload, commonParams);
  check(response, {
    "write enqueue status is 201": (res) => res.status === 201,
  });

  sleep(0.5 + Math.random());
}

export default function () {
  if (scenarioName === "write_enqueue") {
    runWriteEnqueue();
    return;
  }

  runReadMix();
}
