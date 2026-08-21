import type { EmailDeliveryPort } from "@/application/contracts";
import { runtimeEnv } from "@/lib/env/runtime";

export const resendEmailAdapter: EmailDeliveryPort = {
  async send(input) {
    const apiKey = runtimeEnv.authResendKey;
    if (apiKey == null || apiKey === "") return "not_configured";
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: input.from,
      to: input.to,
      subject: input.subject,
      react: input.content as React.ReactElement,
    });
    if (result.error != null || result.data?.id == null || result.data.id === "") {
      throw new Error("Email provider did not accept the message");
    }
    return "sent";
  },
};
