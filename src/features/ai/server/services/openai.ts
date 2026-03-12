// Re-export from lib/ai for backward compatibility
// The core implementation has been moved to lib/ai/openai-client.ts
// to fix architecture violation (lib/ should not depend on features/)
export { OpenAIClient, getOpenAIClient, resetOpenAIClient } from '@/lib/ai/openai-client';
