import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
  Section,
} from "@react-email/components";
import * as React from "react";

interface MagicLinkEmailProps {
  url: string;
  host: string;
}

export default function MagicLinkEmail({ url, host }: MagicLinkEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Sign in to {host}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Sign in to {host}</Heading>
          <Section style={section}>
            <Text style={text}>
              Click the link below to sign in to your account. This link effectively acts as a
              password, so please only share it with people you trust.
            </Text>
            <Link href={url} style={link}>
              Sign in to {host}
            </Link>
          </Section>
          <Text style={footer}>
            If you didn&apos;t request this email, you can safely ignore it.
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
  marginBottom: "24px",
  textAlign: "left" as const,
};

const link = {
  backgroundColor: "#111827",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 24px",
};

const footer = {
  fontSize: "14px",
  color: "#6b7280",
  marginTop: "24px",
};
