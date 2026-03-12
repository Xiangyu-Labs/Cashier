import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOpenAIClient, resetOpenAIClient } from '@/lib/ai/openai-client';

describe('getOpenAIClient', () => {
  beforeEach(() => {
    vi.resetModules();
    resetOpenAIClient();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
  });

  it('should throw error when OPENAI_API_KEY is not set', () => {
    expect(() => getOpenAIClient()).toThrow('OPENAI_API_KEY is not set');
  });

  it('should create client with API key', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const client = getOpenAIClient();
    expect(client).toBeDefined();
  });

  it('should use custom base URL when provided', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_BASE_URL = 'https://custom.api.com';
    const client = getOpenAIClient();
    expect(client).toBeDefined();
  });

  it('should return singleton instance', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const client1 = getOpenAIClient();
    const client2 = getOpenAIClient();
    expect(client1).toBe(client2);
  });
});
