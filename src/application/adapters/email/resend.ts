import type { EmailDeliveryPort } from "@/application/contracts";
import { runtimeEnv } from "@/lib/env/runtime";

export const resendEmailAdapter: EmailDeliveryPort = {
  async send(input) {
    const apiKey = runtimeEnv.authResendKey;
    if (apiKey == null || apiKey === "") return "not_configured";
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: input.from,
      to: input.to,
      subject: input.subject,
      react: input.content as React.ReactElement,
    });
    return "sent";
  },
};
