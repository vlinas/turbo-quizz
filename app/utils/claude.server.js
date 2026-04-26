import OpenAI from "openai";

let _client = null;

export function getClaudeClient() {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

export const CLAUDE_MODEL = "gpt-5-mini";
