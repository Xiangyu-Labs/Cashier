export type TabQueryStatus = "pending" | "success" | "error";

export interface TabQueryStateReport {
  ledgerId: string;
  tab: "stream" | "details" | "stats" | "settings";
  queryKey: readonly unknown[];
  status: TabQueryStatus;
  isFetching: boolean;
}
