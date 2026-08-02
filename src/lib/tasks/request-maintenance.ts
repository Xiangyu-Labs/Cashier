import { after } from "next/server";
import { runBoundedMaintenance } from "@/application/adapters/postgres/maintenance";
import { logger } from "@/lib/logger";

export function scheduleRequestMaintenance(): void {
  after(async () => {
    try {
      await runBoundedMaintenance();
    } catch (error) {
      logger.warn({ error }, "Bounded request maintenance failed");
    }
  });
}
