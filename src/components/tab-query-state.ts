export type TabQueryStatus = "pending" | "success" | "error";

export interface TabQueryStateReport {
  ledgerId: string;
  tab: "stream" | "details" | "stats" | "settings";
  queryKey: readonly unknown[];
  status: TabQueryStatus;
  isFetching: boolean;
  hasData: boolean;
}

export type ActiveTabDataState =
  "initial-loading" | "cached-preview" | "refreshing" | "ready" | "error-with-data" | "error-empty";
