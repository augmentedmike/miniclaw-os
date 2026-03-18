/**
 * perplexity.ts — Deep research via Perplexity sonar API
 */

export type PerplexityResult = {
  answer: string;
  citations: string[];
  model: string;
};

export async function queryPerplexity(
  apiKey: string,
  query: string,
  focus: string = "web",
  model: string = "sonar",
): Promise<PerplexityResult> {
  const systemPrompt =
    focus === "academic"
      ? "You are a thorough academic researcher. Provide detailed, well-cited analysis."
      : focus === "news"
        ? "You are a news analyst. Focus on recent events, announcements, and developments."
        : "You are a competitive intelligence analyst. Provide detailed, actionable research with specific data points, comparisons, and strategic insights.";

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Perplexity API error ${response.status}: ${errBody}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    citations?: string[];
    model: string;
  };

  return {
    answer: data.choices?.[0]?.message?.content ?? "(no answer)",
    citations: data.citations ?? [],
    model: data.model ?? model,
  };
}
