import { ValidationError } from "@/lib/errors";

const DATA_URL_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]*)$/i;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export interface DecodedBase64Image {
  bytes: Buffer;
  normalizedBase64: string;
}

export function decodeBase64Image(data: string, declaredMimeType: string): DecodedBase64Image {
  let encoded = data;
  if (data.startsWith("data:")) {
    const match = DATA_URL_PATTERN.exec(data);
    if (match == null) throw new ValidationError("Invalid image data URL");
    if (match[1]!.toLowerCase() !== declaredMimeType.toLowerCase()) {
      throw new ValidationError("MIME type does not match the image data URL");
    }
    encoded = match[2]!;
  }

  const unpadded = encoded.replace(/[\t\n\f\r ]+/g, "");
  if (unpadded.length === 0) throw new ValidationError("Image data is empty");
  if (!BASE64_PATTERN.test(unpadded) || unpadded.length % 4 === 1) {
    throw new ValidationError("Invalid base64 image data");
  }
  const firstPadding = unpadded.indexOf("=");
  if (firstPadding >= 0 && unpadded.length % 4 !== 0) {
    throw new ValidationError("Invalid base64 image data");
  }
  const normalizedBase64 =
    firstPadding >= 0
      ? unpadded
      : unpadded.padEnd(unpadded.length + ((4 - (unpadded.length % 4)) % 4), "=");

  const bytes = Buffer.from(normalizedBase64, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== normalizedBase64) {
    throw new ValidationError("Invalid base64 image data");
  }
  return { bytes, normalizedBase64 };
}
