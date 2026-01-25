import { GoogleGenerativeAI, Part } from "@google/generative-ai";

export class GeminiClient {
  private genAI: GoogleGenerativeAI;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY is required");
    }
    this.genAI = new GoogleGenerativeAI(key);
  }

  async generateContent(
    systemPrompt: string,
    parts: Part[]
  ): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: systemPrompt,
    });

    const result = await model.generateContent(parts);
    const response = result.response;
    return response.text();
  }
}

// 单例实例
let geminiClient: GeminiClient | null = null;

export function getGeminiClient(): GeminiClient {
  if (!geminiClient) {
    geminiClient = new GeminiClient();
  }
  return geminiClient;
}
