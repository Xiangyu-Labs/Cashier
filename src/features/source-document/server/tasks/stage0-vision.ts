/**
 * Stage 0: Vision Description
 *
 * Decouples "seeing" from "thinking" by producing a detailed text description
 * of the financial document images. All subsequent stages receive this text
 * instead of raw images, allowing them to use cheaper text-only models.
 */

import type { AIContext } from "@/lib/flow/types";
import { logger } from "@/lib/logger";
import { loadImagesForAI } from "@/lib/storage/utils";

export interface Stage0Input {
    imageUrls: string[];
    focusHints?: string[];
    aiLanguage?: string;
}

export interface Stage0Output {
    description: string;
}

function buildVisionPrompt(aiLanguage: string = "zh-CN", focusHints?: string[]): string {
    const focusSection = focusHints?.length
        ? `\n### Focus Areas\nPay special attention to:\n${focusHints.map(h => `- ${h}`).join("\n")}\n`
        : "";

    return `You are a financial document transcription AI. Your job is to produce a complete, detailed text description of the document image(s) so that another AI can parse it WITHOUT seeing the original image.

### Task
Describe EVERYTHING visible in this financial document. Be exhaustive — the downstream parser will rely entirely on your description.

### Required Sections

**1. Document Type & Layout**
- What kind of document is this? (receipt, invoice, bank statement, screenshot, handwritten note, etc.)
- Overall layout description

**2. Merchant / Source Information**
- Store name, brand, or merchant (if visible)
- Address, phone number, or other identifiers

**3. Date & Time**
- Transaction date and time (if visible)
- Any other dates (print date, due date, etc.)

**4. Currency & Amounts**
- ALL currency symbols or codes visible (¥, $, €, RM, etc.)
- List EVERY line item with its exact amount
- Subtotals, taxes, tips, discounts, totals
- Transcribe amounts exactly as printed (e.g., "¥45.00", "$12.50")

**5. Line Items (CRITICAL - be exhaustive)**
For each item, transcribe:
- Item name / description (exactly as printed)
- Quantity (if shown)
- Unit price (if shown)
- Line total
- Any notes or modifiers

**6. Payment Information**
- Payment method (cash, card, WeChat, Alipay, etc.)
- Card last 4 digits (if shown)
- Change given (if shown)

**7. Additional Text**
- Any other text: order numbers, receipt numbers, barcodes, QR codes, promotional text
- Handwritten annotations if any

**8. Visual Quality Notes**
- Note any parts that are blurry, cut off, or hard to read
- Note if any text is partially obscured
${focusSection}
### Rules
1. Transcribe amounts and item names EXACTLY as they appear — do not interpret or convert
2. If something is unclear, say so explicitly (e.g., "amount partially obscured, appears to be ¥4X.00")
3. Use the original language of the document for item names; add a brief translation if not in ${aiLanguage}
4. Preserve the order of items as they appear in the document
5. Do NOT summarize — be verbose and complete

Respond with plain text following the sections above. Do not use JSON or markdown code blocks.`;
}

export async function executeStage0(
    input: Stage0Input,
    ai: AIContext
): Promise<Stage0Output> {
    if (!input.imageUrls?.length) {
        return { description: "" };
    }

    const prompt = buildVisionPrompt(input.aiLanguage, input.focusHints);

    const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];

    if (input.imageUrls.length > 1) {
        content.push({
            type: "text",
            text: `This document consists of ${input.imageUrls.length} images. Describe all of them as a single document.`,
        });
    }

    // Load images (handles both base64 and R2 URLs)
    const loadedResults = await loadImagesForAI(input.imageUrls);
    const failures = loadedResults.filter(r => !r.success);
    if (failures.length > 0) {
        const failureMessages = failures.map(f => `${f.url}: ${f.error?.message}`).join("; ");
        throw new Error(`Failed to load ${failures.length} image(s): ${failureMessages}`);
    }

    for (const result of loadedResults) {
        if (result.dataUrl) {
            // Log the data URL to debug mime type issues
            logger.info({
                dataUrlPreview: result.dataUrl.substring(0, 100),
                dataUrlLength: result.dataUrl.length,
                mimeMatch: result.dataUrl.match(/^data:([^;]+);/)?.[1] || 'no match'
            }, "Adding image to AI content");
            content.push({ type: "image_url", image_url: { url: result.dataUrl } });
        }
    }

    logger.info({ contentTypes: content.map(c => c.type === 'image_url' ? `image: ${c.image_url.url.substring(0, 50)}...` : 'text') }, "AI content prepared");

    const response = await ai.generate({
        prompt,
        messages: [{ role: "user", content }],
        model: "vision",
    });

    logger.info(
        { descriptionLength: response.content.length },
        "Stage 0: Vision description completed"
    );

    return { description: response.content };
}
