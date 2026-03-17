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

interface OTPEmailProps {
  otp: string;
  host: string;
  expiresInMinutes: number;
}

export default function OTPEmail({ otp, host, expiresInMinutes = 5 }: OTPEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your verification code is ready</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Sign in to {host}</Heading>
          <Section style={section}>
            <Text style={text}>Enter the verification code below to sign in to your account:</Text>
            <Section style={codeSection}>
              <Text style={codeLabel}>Your verification code:</Text>
              <Text style={codeText}>{otp}</Text>
            </Section>
            <Text style={expiryText}>This code will expire in {expiresInMinutes} minutes.</Text>
          </Section>
          <Text style={warningText}>
            Do not share this code with anyone. We will never ask for your verification code.
          </Text>
          <Text style={footer}>
            If you didn&apos;t request this code, you can safely ignore this email.
          </Text>
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
  textAlign: "center" as const,
};

const text = {
  fontSize: "16px",
  lineHeight: "24px",
  color: "#374151",
  marginBottom: "16px",
  textAlign: "center" as const,
};

const codeSection = {
  margin: "24px 0",
  padding: "16px",
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
};

const codeLabel = {
  fontSize: "14px",
  color: "#6b7280",
  marginBottom: "8px",
  textAlign: "center" as const,
};

const codeText = {
  fontSize: "48px",
  fontWeight: "700",
  fontFamily: "monospace",
  letterSpacing: "0.25em",
  color: "#111827",
  textAlign: "center" as const,
  margin: "0",
  userSelect: "all" as const,
};

const expiryText = {
  fontSize: "14px",
  color: "#6b7280",
  marginTop: "16px",
  marginBottom: "0",
  textAlign: "center" as const,
};

const warningText = {
  fontSize: "14px",
  color: "#dc2626",
  marginTop: "24px",
  padding: "12px",
  backgroundColor: "#fef2f2",
  borderRadius: "6px",
  textAlign: "center" as const,
};

const footer = {
  fontSize: "14px",
  color: "#6b7280",
  marginTop: "24px",
  textAlign: "center" as const,
};
