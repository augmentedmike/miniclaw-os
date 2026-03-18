/**
 * Tone Filter for Fan Engagement
 * 
 * Ensures engagement stays genuine and intellectual, avoiding:
 * - Excessive flattery ("You're amazing!", "Love everything you do!")
 * - Mindless agreement without substance
 * - Emojis as primary expression
 * - Cult-like devotion ("You saved my life!")
 * - Generic filler ("Thanks for existing!")
 */

interface ToneCheckResult {
  isAuthentic: boolean;
  concerns: string[];
  score: number; // 0-100, 100 = most authentic
  suggestion?: string;
}

const SYCOPHANTIC_PATTERNS = [
  /^(omg|wow|amazing|incredible|genius|perfection|life[- ]changing)/i,
  /^(love|adore|worship|idolize|fanatic)/i,
  /^(you'?re|your) (the best|incredible|genius|amazing|perfect)/i,
  /(thank you|thanks) for (everything|existing|being you|making this|this)/i,
  /^\W*[😍🙏💯❤️🔥]+\W*$/,
  /(can't live without|changed my life|best person ever)/i,
  /^(yes|agreed|so true|exactly|perfect|couldn't have said it better)/i,
  /(this\s+)?is\s+(everything|perfect|the best|exactly what I needed)/i,
];

const GOOD_ENGAGEMENT_PATTERNS = [
  /this reminds me of/i,
  /interesting point about/i,
  /have you considered/i,
  /i'd like to push back on/i,
  /i disagree because/i,
  /this connects to/i,
  /in contrast to/i,
  /this overlaps with/i,
  /what about/i,
  /could you elaborate on/i,
  /i'm skeptical because/i,
];

export function checkTone(text: string): ToneCheckResult {
  const concerns: string[] = [];
  let sycophancyScore = 0;
  let authenticityScore = 0;

  // Check for sycophantic patterns
  for (const pattern of SYCOPHANTIC_PATTERNS) {
    if (pattern.test(text)) {
      sycophancyScore++;
      if (pattern.source.includes("omg|wow")) concerns.push("Starts with excessive enthusiasm");
      else if (pattern.source.includes("love|adore"))
        concerns.push("Uses devotional language");
      else if (pattern.source.includes("thank you|thanks"))
        concerns.push("Generic gratitude without substance");
      else if (pattern.source.includes("[😍🙏"))
        concerns.push("Relies on emoji instead of words");
      else if (pattern.source.includes("can't live without"))
        concerns.push("Overstates impact (cult-like language)");
      else if (pattern.source.includes("yes|agreed"))
        concerns.push("Mindless agreement without substance");
    }
  }

  // Check for authentic engagement patterns
  for (const pattern of GOOD_ENGAGEMENT_PATTERNS) {
    if (pattern.test(text)) {
      authenticityScore++;
    }
  }

  // Scoring logic
  const textLength = text.length;
  if (textLength < 30) concerns.push("Too short to be substantive");
  if (text.split("\n").length === 1 && textLength < 100)
    concerns.push("Single-line response; consider elaborating");
  if ((text.match(/[!?]{2,}/g) || []).length > 2)
    concerns.push("Excessive punctuation indicates low authenticity");
  if ((text.match(/\*/g) || []).length > 3)
    concerns.push("Over-use of formatting; focus on ideas");

  // Calculate overall score (0-100)
  const overallScore = Math.max(0, Math.min(100, 50 + authenticityScore * 10 - sycophancyScore * 15));

  const isAuthentic = overallScore >= 50 && sycophancyScore === 0;

  let suggestion: string | undefined;
  if (!isAuthentic) {
    if (sycophancyScore > 0) {
      suggestion =
        "This reads as flattery. Rewrite to focus on specific ideas, disagreements, or questions.";
    } else if (authenticityScore === 0 && textLength < 50) {
      suggestion = "Add more substance — what specifically resonates or concerns you?";
    }
  }

  return {
    isAuthentic,
    concerns,
    score: overallScore,
    suggestion,
  };
}

export function isEngagementAppropriate(
  engagementText: string,
  strictMode = true
): { approved: boolean; reason?: string } {
  const result = checkTone(engagementText);

  if (strictMode) {
    if (!result.isAuthentic) {
      return {
        approved: false,
        reason: result.suggestion || "Engagement lacks authenticity",
      };
    }
    if (result.score < 60) {
      return {
        approved: false,
        reason: "Engagement score too low. Be more specific or thoughtful.",
      };
    }
  } else {
    // Lenient mode: just warn if questionable
    if (result.score < 40) {
      return {
        approved: false,
        reason: "This might come across as insincere. Consider revising.",
      };
    }
  }

  return { approved: true };
}

export { type ToneCheckResult };
