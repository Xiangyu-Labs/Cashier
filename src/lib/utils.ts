import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Robust copy to clipboard utility that handles both modern and legacy APIs.
 * Works in non-secure contexts (HTTP) via a hidden textarea fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (text === "") return false;

  // Try modern Clipboard API if available and in secure context
  if (navigator.clipboard != null && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error("Modern clipboard API failed:", err);
      // Fall through to legacy method
    }
  }

  // Legacy fallback using execCommand('copy')
  const textArea = document.createElement("textarea");
  textArea.value = text;

  // Ensure the textarea is not visible but part of the DOM
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  textArea.style.opacity = "0";
  textArea.setAttribute("readonly", ""); // Avoid keyboard on mobile

  document.body.appendChild(textArea);

  // Selection handling for iOS and others
  const isIOS = navigator.userAgent.match(/ipad|iphone/i);
  if (isIOS) {
    const range = document.createRange();
    range.selectNodeContents(textArea);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    textArea.setSelectionRange(0, 999999);
  } else {
    textArea.focus();
    textArea.select();
  }

  let successful = false;
  try {
    successful = document.execCommand("copy");
  } catch (err) {
    console.error("Fallback copy failed:", err);
  } finally {
    document.body.removeChild(textArea);
  }

  return successful;
}
