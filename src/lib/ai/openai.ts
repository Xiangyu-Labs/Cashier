import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export class OpenAIClient {
    private client: OpenAI;

    constructor() {
        const apiKey = process.env.OPENAI_API_KEY;
        const baseURL = process.env.OPENAI_BASE_URL;

        if (!apiKey) {
            throw new Error("OPENAI_API_KEY is required");
        }

        this.client = new OpenAI({
            apiKey,
            baseURL,
        });
    }

    async generateContent(
        systemPrompt: string,
        messages: ChatCompletionMessageParam[]
    ): Promise<string> {
        const model = process.env.OPENAI_MODEL;

        if (!model) {
            throw new Error("OPENAI_MODEL is required");
        }

        const response = await this.client.chat.completions.create({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                ...messages,
            ],
        });

        return response.choices[0]?.message?.content || "";
    }
}

// Singleton instance
let openAIClient: OpenAIClient | null = null;

export function getOpenAIClient(): OpenAIClient {
    if (!openAIClient) {
        openAIClient = new OpenAIClient();
    }
    return openAIClient;
}
