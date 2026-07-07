import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusIcon } from "@/modules/task-queue/ui/QueueItemCard/StatusIcon";

describe("StatusIcon", () => {
  it("uses semantic color tokens for exceptional states", () => {
    const failed = render(<StatusIcon status="failed" />);
    const failedIcon = failed.container.querySelector("svg");
    expect(failedIcon?.getAttribute("class")).toContain("text-danger");
    failed.unmount();

    const anomaly = render(<StatusIcon status="anomaly" />);
    const anomalyIcon = anomaly.container.querySelector("svg");
    expect(anomalyIcon?.getAttribute("class")).toContain("text-warning");
  });
});
