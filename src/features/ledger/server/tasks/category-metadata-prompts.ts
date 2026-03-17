import { COMMON_LUCIDE_ICONS } from "@/config/icons";

export function buildCategoryMetadataPrompt(
  categoryName: string,
  existingCategories: Array<{ name: string; description?: string | null; icon?: string | null }>,
  aiLanguage?: string
): string {
  const lang = aiLanguage ?? "zh-CN";
  const existingList = existingCategories
    .map((c) => `- ${c.name}: ${c.description || "无描述"} (图标: ${c.icon || "无"})`)
    .join("\n");

  const prompt =
    `You are a helpful assistant for a ledger application. You MUST respond with ONLY a JSON object — no explanations, no markdown, no other text.
Your task is to suggest a suitable icon and a short description for a new category created by the user.

Analyze the existing category system to understand the style and granularity.

Existing Categories:
${existingList}

New Category Name: "${categoryName}"

Please select the most appropriate icon from the following list (Lucide React Icons):
${COMMON_LUCIDE_ICONS.join(", ")}

Requirements:
1. Icon: Choose strictly from the provided list. If nothing fits perfectly, choose "Package" or "Tag".
2. Description: STRICTLY mimic the style, structure, and length of the existing category descriptions provided above. If they are concise (e.g., "Food and drinks"), be concise. If they are detailed lists (e.g., "Includes x, y, z"), follow that format. Language should be ${lang === "zh-CN" ? "Chinese" : "English"}.
3. Return specifically in JSON format.

JSON Format:
{
  "icon": "IconName",
  "description": "Short description here"
}
`.trim();

  return prompt;
}
