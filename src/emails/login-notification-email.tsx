import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
  Section,
} from "@react-email/components";
import * as React from "react";
import type { SupportedLocale } from "@/i18n/locales";

interface LoginNotificationEmailCopy {
  preview: string;
  heading: string;
  intro: string;
  timeLabel: string;
  emailLabel: string;
  safeMessage: string;
  warningMessage: string;
}

interface LoginNotificationEmailProps {
  email: string;
  loginTime: string;
  locale: SupportedLocale;
  copy: LoginNotificationEmailCopy;
}

export default function LoginNotificationEmail({
  email,
  loginTime,
  copy,
}: LoginNotificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{copy.preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{copy.heading}</Heading>
          <Section style={section}>
            <Text style={text}>{copy.intro}</Text>
            <Section style={detailsSection}>
              <Text style={detailRow}>
                <strong>{copy.timeLabel}</strong> {loginTime}
              </Text>
              <Text style={detailRow}>
                <strong>{copy.emailLabel}</strong> {email}
              </Text>
            </Section>
          </Section>
          <Text style={safeText}>{copy.safeMessage}</Text>
          <Text style={warningText}>{copy.warningMessage}</Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  maxWidth: "560px",
};

const h1 = {
  fontSize: "24px",
  fontWeight: "600",
  lineHeight: "1.25",
  color: "#111827",
  marginBottom: "24px",
};

const section = {
  padding: "24px",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
};

const text = {
  fontSize: "16px",
  color: "#374151",
  lineHeight: "1.5",
};

const detailsSection = {
  marginTop: "16px",
  padding: "12px 16px",
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
};

const detailRow = {
  fontSize: "14px",
  color: "#374151",
  margin: "4px 0",
};

const safeText = {
  fontSize: "14px",
  color: "#374151",
  marginTop: "24px",
};

const warningText = {
  fontSize: "14px",
  color: "#dc2626",
  marginTop: "8px",
  padding: "12px",
  backgroundColor: "#fef2f2",
  borderRadius: "6px",
};
