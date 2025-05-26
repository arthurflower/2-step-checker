// app/api/verifyclaims/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set in environment variables');
}

const genAI = new GoogleGenerativeAI(apiKey || '');

interface ExaSource {
  text: string;
  url: string;
}

interface TwoStepVerification {
  reality_check: "GO" | "CHECK" | "NO GO";
  reality_check_reason: string;
  reliability_check: "GO" | "CHECK" | "NO GO";
  reliability_check_reason: string;
  final_verdict: "GO" | "CHECK" | "NO GO";
}

interface FactCheckResponse {
  claim: string;
  assessment: "True" | "False" | "Insufficient Information";
  summary: string;
  fixed_original_text: string;
  confidence_score: number;
  two_step_verification: TwoStepVerification;
}

const getDomainName = (url: string): string => {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch (e) {
    return url;
  }
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { claim, original_text, exasources } = body;

    if (!claim || !original_text || !exasources || !Array.isArray(exasources)) {
      return NextResponse.json(
        { error: 'Claim, original_text, and an array of exasources are required' },
        { status: 400 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key is not configured' },
        { status: 500 }
      );
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const orgSources = exasources
        .filter((source: ExaSource) => getDomainName(source.url).endsWith('.org'))
        .map((source: ExaSource) => getDomainName(source.url));

    const mostCredibleMentions = orgSources.length > 0
        ? ` Key sources include ${orgSources.slice(0, 2).join(' and ')}.`
        : '';

    const prompt = `You are an expert fact-checker following a strict protocol. Given a claim and up to 10 .org sources:

**Mandatory Protocol:**
1.  **Evaluate Each Source**: Determine if each source *individually* supports the claim.
2.  **Count Supporting Sources**: Count exactly how many of the provided .org sources strongly support the claim.
3.  **Apply 7/10 Rule**:
    * **If the count is 7 or more**: You MUST set "assessment" to "True", "reality_check" to "GO", and "confidence_score" to 95 or higher. The "reality_check_reason" MUST state this was based on the 7/10 rule.
    * **If the count is less than 7**: Proceed with your standard verification logic below.

**Standard Verification Logic (Only if < 7 sources support):**
1.  **Reality Check**: Verify if the claim *overall* can be substantiated.
2.  **Reliability Check**: Confirm if the facts are accurately represented without distortion.

**General Rules:**
* Give higher credibility weight to .org domains.
* Assign one of these verdicts: "GO", "CHECK", "NO GO".
* Final verdict should normally be the most conservative (NO GO > CHECK > GO), *unless* the 7/10 rule forces a "GO".

**IMPORTANT - Detailed Verification Explanations:**
* **Reality Check Reason**: Must be 2-3 sentences explaining:
  - What specific facts or evidence from the sources support or contradict the claim
  - The consistency of information across multiple sources
  - Any notable discrepancies or agreements between sources
  - The overall factual accuracy based on the evidence

* **Reliability Check Reason**: Must be 2-3 sentences explaining:
  - Whether the claim represents information without distortion or bias
  - If there's any missing context that changes the meaning
  - Whether the claim is presented in a misleading way
  - The completeness and fairness of how the information is stated

Make sure Reality Check focuses on FACTUAL ACCURACY (is it true?) while Reliability Check focuses on PRESENTATION INTEGRITY (is it fairly represented?).

Here are the sources:
${exasources.map((source: ExaSource, index: number) => {
  const isOrgDomain = getDomainName(source.url).endsWith('.org');
  const credibilityNote = isOrgDomain ? ' [HIGH CREDIBILITY - .org domain]' : '';
  return `Source ${index + 1}${credibilityNote}:\nText: ${source.text}\nURL: ${source.url}\n`;
}).join('\n')}

Here is the Original part of the text: ${original_text}
Here is the claim: ${claim}

Provide your answer STRICTLY as a JSON object:

{
  "claim": "${claim}",
  "assessment": "True" or "False" or "Insufficient Information",
  "summary": "Why is this claim correct and if it isn't correct, then what's correct. In a single concise line.",
  "fixed_original_text": "If assessment is False, correct the original text; otherwise return it unchanged.",
  "confidence_score": a percentage number (MUST be >= 95 if 7/10 rule applies),
  "two_step_verification": {
    "reality_check": "GO" or "CHECK" or "NO GO",
    "reality_check_reason": "Detailed 2-3 sentence explanation focusing on factual accuracy. If 7/10 rule applied, start with 'Verified by a strong majority (7+/10) of credible .org websites including ${mostCredibleMentions}.' then add specific factual details. DO NOT list source numbers.",
    "reliability_check": "GO" or "CHECK" or "NO GO",
    "reliability_check_reason": "Detailed 2-3 sentence explanation focusing on presentation integrity and context. DO NOT list source numbers.",
    "final_verdict": "GO" or "CHECK" or "NO GO"
  }
}

Return ONLY the JSON object, no additional text or markdown formatting.`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    let cleanedText = text.trim().replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let factCheckResult: FactCheckResponse;
    try {
      factCheckResult = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', cleanedText, parseError);
      return NextResponse.json(
        { error: 'Failed to parse AI response. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ claims: factCheckResult });

  } catch (error) {
    console.error('Verify claims API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { error: `Failed to verify claims: ${errorMessage}` },
      { status: 500 }
    );
  }
}