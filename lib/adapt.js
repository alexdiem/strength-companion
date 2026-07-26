import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./prompt.js";

const client = new Anthropic();

export async function adaptWod(wod) {
  const stream = client.messages.stream({
    model: "claude-opus-4-8",
    // Caps thinking and response text together — adaptive thinking plus a full
    // four-section session needs far more headroom than the visible output alone.
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Adapt this WOD to a 60-minute session following your rules:\n\n${wod}`,
      },
    ],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "max_tokens") {
    throw new Error(
      "The adapted session was cut off before it finished. Try again, or shorten the workout you pasted in.",
    );
  }
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export function isMissingKeyError(err) {
  return (
    err instanceof Anthropic.AuthenticationError ||
    /apiKey|api key|authentication/i.test(String(err?.message))
  );
}

export const MISSING_KEY_MESSAGE =
  "Anthropic API key missing or invalid. Set the ANTHROPIC_API_KEY environment variable and restart the server.";
