// app/api/verifyclaims/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 90; // Increased duration

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set in environment variables');
}

const genAI = new GoogleGenerativeAI(apiKey || '');

interface ExaSource {
  text: string;
  url: string;
  source_type: 'org' | 'edu_gov' | 'other'; // Ensure this matches exasearch
}

interface AdvancedVerification {
  reality_check: "GO" | "CHECK" | "NO GO";
  reality_check_reason: string;
  reliability_check: "GO" | "CHECK" | "NO GO";
  reliability_check_reason: string;
  contradiction_level: "None" | "Low" | "High";
  source_quality: "Poor" | "Mixed" | "Good";
  final_verdict: "GO" | "CHECK" | "NO GO";
}

interface FactCheckResponse {
  claim: string;
  assessment: "True" | "False" | "Insufficient Information";
  summary: string;
  fixed_original_text: string;
  confidence_score: number;
  two_step_verification: AdvancedVerification;
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
     if (exasources.length === 0) {
        return NextResponse.json(
          { error: 'At least one source is required for verification.' },
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

    const orgSources = exasources.filter((s: ExaSource) => s.source_type === 'org');
    const eduGovSources = exasources.filter((s: ExaSource) => s.source_type === 'edu_gov');
    const otherSources = exasources.filter((s: ExaSource) => s.source_type === 'other');

    const orgSourceUrls = orgSources.map((s: ExaSource) => getDomainName(s.url));
    const mostCredibleMentions = orgSourceUrls.length > 0
        ? ` Key .org sources include ${orgSourceUrls.slice(0, 3).join(', ')}.`
        : ' No .org sources were found.';

    const prompt = `You are an expert fact-checker following an ADVANCED protocol. You are given a claim and *up to* 10 sources, categorized by type ('org', 'edu_gov', 'other'). Your analysis MUST strictly adhere to these rules:

**Source Tally (MANDATORY FIRST STEP):**
1.  Carefully examine EACH source.
2.  Count *exactly* how many '.org' sources strongly support the claim: [ORG_COUNT]
3.  Count *exactly* how many '.edu_gov' sources strongly support the claim: [EDU_GOV_COUNT]
4.  Count *exactly* how many 'other' sources strongly support the claim: [OTHER_COUNT]
5.  Count *exactly* how many sources *refute* the claim: [REFUTE_COUNT]

**Mandatory 7/10 .org Rule:**
* **If [ORG_COUNT] is 7 or more**: You MUST set "assessment" to "True", "reality_check" to "GO", and "confidence_score" >= 95. The "reality_check_reason" MUST start with: "Verified by a strong majority ([ORG_COUNT}/${exasources.length}) of credible .org websites including ${mostCredibleMentions}."
* **If [ORG_COUNT] is less than 7**: Proceed to Advanced Logic. DO NOT apply the 7/10 rule.

**Advanced Verification Logic (Only if [ORG_COUNT] < 7):**
1.  **Reality Check**:
    * Assess accuracy based on *all* sources, heavily weighting .org > .edu_gov > other.
    * If [REFUTE_COUNT] > 1 OR ([REFUTE_COUNT] >= 1 AND [ORG_COUNT] < 3), MUST be "NO GO".
    * If [ORG_COUNT] == 0 AND [EDU_GOV_COUNT] == 0 AND [REFUTE_COUNT] == 0, MUST be "CHECK".
    * Otherwise, make a judgment ("GO", "CHECK", "NO GO").
    * Determine **Contradiction Level**: Based on supporting vs. refuting sources.
2.  **Reliability Check**:
    * Assess neutrality.
    * Determine **Source Quality**: If ([ORG_COUNT] + [EDU_GOV_COUNT]) < 3, MUST be "Poor" or "Mixed". If [ORG_COUNT] == 0 AND [EDU_GOV_COUNT] == 0, MUST be "Poor".
    * If Source Quality is "Poor", MUST be "NO GO". If "Mixed", MUST be "CHECK" or "NO GO".
    * Set **Reliability Check** verdict.
3.  **Final Verdict**: Most conservative (NO GO > CHECK > GO), unless 7/10 rule applied.

**IMPORTANT - VERY Detailed Explanations (3-4 sentences, NO source numbers):**
* **Reality Check Reason**: MUST start with "Based on [ORG_COUNT] .org, [EDU_GOV_COUNT] .edu/gov, and [OTHER_COUNT] other supporting sources vs [REFUTE_COUNT] refuting sources:". MUST explain the weight of evidence, key facts found (mentioning *types* of sources), and the contradiction impact. If no .org sources found, state it explicitly.
* **Reliability Check Reason**: MUST state the **Source Quality**. MUST explain neutrality/bias assessment, context, and *how the source mix (e.g., 'heavy reliance on non-.org sources (X/10)') impacts the reliability*.

**Here are the ${exasources.length} sources:**
${exasources.map((source: ExaSource, index: number) => {
  return `Source ${index + 1} [Type: ${source.source_type.toUpperCase()}]:\nText: ${source.text}\nURL: ${source.url}\n`;
}).join('\n')}

Original text: ${original_text}
Claim: ${claim}

Provide your answer STRICTLY as a JSON object:
{
  "claim": "${claim}",
  "assessment": "True" or "False" or "Insufficient Information",
  "summary": "Concise summary.",
  "fixed_original_text": "Fix or original text.",
  "confidence_score": percentage,
  "two_step_verification": {
    "reality_check": "GO" or "CHECK" or "NO GO",
    "reality_check_reason": "Detailed 3-4 sentence explanation, MUST start with source counts.",
    "reliability_check": "GO" or "CHECK" or "NO GO",
    "reliability_check_reason": "Detailed 3-4 sentence explanation, MUST mention Source Quality and source mix impact.",
    "contradiction_level": "None" or "Low" or "High",
    "source_quality": "Poor" or "Mixed" or "Good",
    "final_verdict": "GO" or "CHECK" or "NO GO"
  }
}
Return ONLY JSON.`;

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