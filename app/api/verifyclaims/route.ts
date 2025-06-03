// app/api/verifyclaims/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { apiCache } from "@/lib/cacheManager";

const apiKey = "AIzaSyB-7iuE2qYR_1LK5DALUbBfwnxG7p9tIIs"; // Hardcoded API Key

if (!apiKey) {
  console.error(
    "GEMINI_API_KEY is not set (this should not happen if hardcoded).",
  );
}

const genAI = new GoogleGenerativeAI(apiKey || "");

interface ExaSource {
  text: string;
  url: string;
  source_type: "org" | "edu_gov" | "other";
  title?: string;
  publication_date?: string;
}

interface VerificationCheck {
  verdict: "GO" | "CHECK" | "NO GO" | "N/A";
  reason: string;
  score?: number | null;
}

interface EnhancedSourceAnalysis {
  source_authority_score: VerificationCheck;
  source_freshness_index: VerificationCheck;
  source_bias_detection: VerificationCheck;
  source_consensus_mapping: VerificationCheck;
}

interface AdvancedClaimAnalysis {
  claim_complexity_score: VerificationCheck;
  claim_type_classification: VerificationCheck;
}

interface MultiDimensionalVerification {
  reality_check: VerificationCheck;
  reliability_check: VerificationCheck;
  context_coherence_check: VerificationCheck;
  temporal_consistency_check: VerificationCheck;
  cross_reference_validation: VerificationCheck;
  bias_detection_analysis_overall: VerificationCheck;
  confidence_calibration: VerificationCheck;
  predictive_accuracy_score_for_claim: VerificationCheck;
  enhanced_source_summary: EnhancedSourceAnalysis;
  advanced_claim_details: AdvancedClaimAnalysis;
  final_verdict: "GO" | "CHECK" | "NO GO";
}

interface FactCheckResponse {
  claim_id: string;
  claim_text: string;
  assessment:
    | "True"
    | "False"
    | "Ambiguous/Partially True"
    | "Insufficient Information"
    | "Needs Specialist Review";
  summary: string;
  fixed_original_text: string;
  multi_dimensional_verification: MultiDimensionalVerification;
  original_sentence: string;
  sentence_number: number;
  url_sources_used: ExaSource[];
}

const getDomainName = (url: string): string => {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch (e) {
    return url;
  }
};

const generateVerificationCacheKey = (
  claim_id: string,
  claim_text: string,
  sources: ExaSource[],
): string => {
  const sourceUrls = sources
    .map((s) => s.url)
    .sort()
    .join(",");
  return `verify_v3_${claim_id}_${claim_text}_${sourceUrls}`; // Cache key version bump
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      claim_id,
      claim_text,
      original_sentence,
      sentence_number,
      exasources,
      document_category,
      document_topic,
      useCache = true,
    } = body;

    if (
      !claim_id ||
      !claim_text ||
      !original_sentence ||
      typeof sentence_number !== "number" ||
      !exasources ||
      !Array.isArray(exasources)
    ) {
      return NextResponse.json(
        {
          error:
            "claim_id, claim_text, original_sentence, sentence_number, and an array of exasources are required.",
        },
        { status: 400 },
      );
    }

    const defaultNotApplicableCheck: VerificationCheck = {
      verdict: "N/A",
      reason: "Not applicable or not assessed.",
    };
    const defaultErrorCheck: VerificationCheck = {
      verdict: "NO GO",
      reason: "Error in processing.",
    };

    if (exasources.length === 0) {
      const noSourceResponse: FactCheckResponse = {
        claim_id,
        claim_text,
        assessment: "Insufficient Information",
        summary:
          "No sources were provided or found by the search step for this claim, so verification cannot be performed.",
        fixed_original_text: original_sentence,
        original_sentence,
        sentence_number,
        url_sources_used: [],
        multi_dimensional_verification: {
          reality_check: {
            verdict: "NO GO",
            reason: "No sources available to check reality.",
            score: null,
          },
          reliability_check: {
            verdict: "NO GO",
            reason: "No sources available to assess reliability.",
            score: null,
          },
          context_coherence_check: defaultNotApplicableCheck,
          temporal_consistency_check: defaultNotApplicableCheck,
          cross_reference_validation: defaultNotApplicableCheck,
          bias_detection_analysis_overall: defaultNotApplicableCheck,
          confidence_calibration: {
            verdict: "N/A",
            reason: "No verification performed.",
            score: 0,
          },
          predictive_accuracy_score_for_claim: defaultNotApplicableCheck,
          enhanced_source_summary: {
            source_authority_score: defaultNotApplicableCheck,
            source_freshness_index: defaultNotApplicableCheck,
            source_bias_detection: defaultNotApplicableCheck,
            source_consensus_mapping: defaultNotApplicableCheck,
          },
          advanced_claim_details: {
            claim_complexity_score: defaultNotApplicableCheck,
            claim_type_classification: defaultNotApplicableCheck,
          },
          final_verdict: "NO GO",
        },
      };
      return NextResponse.json({ claims: noSourceResponse });
    }

    const cacheKey = generateVerificationCacheKey(
      claim_id,
      claim_text,
      exasources,
    );
    if (useCache) {
      const cachedResult = apiCache.getVerification(cacheKey, {});
      if (cachedResult) {
        console.log(
          `Returning cached verification (v3) for claim_id: ${claim_id}`,
        );
        return NextResponse.json({ claims: cachedResult, fromCache: true });
      }
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key is not configured (verifyclaims)." },
        { status: 500 },
      );
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 8192,
      },
      safetySettings: [
        /* ... safety settings ... */
      ],
    });

    const sourcesString = exasources
      .map((source: ExaSource, index: number) => {
        return `Source ${index + 1} (Type: ${source.source_type.toUpperCase()}, URL: ${getDomainName(source.url)}, PubDate: ${source.publication_date || "N/A"}):\nTitle: ${source.title || "N/A"}\nRelevant Text: "${source.text}"\n`;
      })
      .join("\n");

    const prompt = `
You are an expert fact-checker performing an ADVANCED Multi-Dimensional Verification for a given claim.
Document Context:
- Primary Category: "${document_category || "Not Specified"}"
- Primary Topic: "${document_topic || "Not Specified"}"
Claim Details:
- Claim ID: "${claim_id}"
- Claim Text: "${claim_text}"
- Original Sentence in Document (Sentence #${sentence_number}): "${original_sentence}"

Provided Sources (${exasources.length} total):
${sourcesString}

Your task is to return a SINGLE JSON object adhering STRICTLY to the following structure and logic.
DO NOT include any explanatory text before or after the JSON object.

JSON Output Structure:
{
  "claim_id": "${claim_id}",
  "claim_text": "${claim_text}",
  "assessment": "True" | "False" | "Ambiguous/Partially True" | "Insufficient Information" | "Needs Specialist Review",
  "summary": "A concise (1-2 sentences) overall summary of your findings regarding the claim's veracity based on all analyses.",
  "fixed_original_text": "If the claim is 'False' or 'Ambiguous/Partially True' AND the original sentence can be corrected based on the sources, provide a corrected version of the ORIGINAL SENTENCE. Otherwise, return the original_sentence verbatim.",
  "url_sources_used": [ /* Array of ExaSource objects. List ALL sources from the 'Provided Sources' that were relevant and actively used in your reasoning for ANY of the verification checks. Prioritize citing .org and .edu/.gov sources if many are relevant. Aim to list up to 10-15 sources if they genuinely contribute to the analysis. If no provided sources are relevant, this array can be empty. Each object should be: { "text": "Relevant snippet from source used", "url": "Source URL", "source_type": "org" | "edu_gov" | "other", "title": "Source Title", "publication_date": "YYYY-MM-DD or N/A" } */ ],
  "multi_dimensional_verification": {
    "reality_check": { "verdict": "GO" | "CHECK" | "NO GO" | "N/A", "reason": "...", "score": null },
    "reliability_check": { "verdict": "GO" | "CHECK" | "NO GO" | "N/A", "reason": "...", "score": null },
    "context_coherence_check": { "verdict": "GO" | "CHECK" | "NO GO" | "N/A", "reason": "Does the claim make sense within the context of the document's topic/category and the original sentence?", "score": null },
    "temporal_consistency_check": { "verdict": "GO" | "CHECK" | "NO GO" | "N/A", "reason": "Is the claim's information timely and relevant given its nature and source publication dates?", "score": null },
    "cross_reference_validation": { "verdict": "GO" | "CHECK" | "NO GO" | "N/A", "reason": "How well do multiple high-quality sources corroborate the specific details of the claim?", "score": null },
    "bias_detection_analysis_overall": { "verdict": "GO" | "CHECK" | "NO GO" | "N/A", "reason": "Considering the claim and sources, is there an evident overall bias?", "score": null },
    "confidence_calibration": { "verdict": "GO" | "CHECK" | "NO GO" | "N/A", "reason": "Your confidence in the OVERALL 'assessment' of this claim.", "score": 0-100 },
    "predictive_accuracy_score_for_claim": { "verdict": "GO" | "CHECK" | "NO GO" | "N/A", "reason": "If the claim is a prediction, assess its plausibility. N/A if not a prediction.", "score": 0-100 (if applicable, else null) },
    "enhanced_source_summary": {
      "source_authority_score": { "verdict": "N/A", "reason": "Overall authority of provided sources.", "score": 0-100 },
      "source_freshness_index": { "verdict": "GO" | "CHECK" | "NO GO" | "N/A", "reason": "Overall timeliness of sources.", "score": null },
      "source_bias_detection": { "verdict": "GO" | "CHECK" | "NO GO" | "N/A", "reason": "Overall bias assessment of the source collection.", "score": null },
      "source_consensus_mapping": { "verdict": "GO" | "CHECK" | "NO GO" | "N/A", "reason": "Do sources generally agree or disagree on the claim?", "score": null }
    },
    "advanced_claim_details": {
      "claim_complexity_score": { "verdict": "N/A", "reason": "How complex is the claim to verify? (e.g., Simple, Moderate, Complex)", "score": null },
      "claim_type_classification": { "verdict": "N/A", "reason": "Classify claim type (e.g., Statistical, Historical, Scientific).", "score": null }
    },
    "final_verdict": "GO" | "CHECK" | "NO GO"
  },
  "original_sentence": "${original_sentence}",
  "sentence_number": ${sentence_number}
}

**Logic for Verdicts & Scores & url_sources_used:**
- **url_sources_used**: Critically evaluate each of the ${exasources.length} 'Provided Sources'. Include a source in this list if it was *directly used* in your reasoning for any check, or if it significantly supports/refutes the claim. Aim to be comprehensive; if 10-15 sources are genuinely relevant and used, list them. If fewer, list those. If none of the provided sources are relevant or helpful, this array MUST be empty. For each source included, ensure the 'text' field contains a concise snippet (1-2 sentences) from the source that is most relevant to your verification of THIS claim.
- **Overall Assessment & Final Verdict**: Follow previous logic. If 'Insufficient Information' assessment, it often means not enough *relevant* sources were found *among those provided* or the claim is unanswerable with them.
Ensure all string values in JSON are properly escaped. The entire response MUST be a single JSON object.
`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    let cleanedText = text.trim();
    const jsonStart = cleanedText.indexOf("{");
    const jsonEnd = cleanedText.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      console.error(
        "Could not find valid JSON object delimiters in response (verifyclaims). Raw text (first 500 chars):",
        cleanedText.substring(0, 500),
      );
      throw new Error("AI response is not valid JSON.");
    }
    cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);

    let factCheckResult: FactCheckResponse;
    try {
      factCheckResult = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error(
        "Failed to parse Gemini response as JSON (verifyclaims):",
        parseError,
      );
      console.error(
        "Raw response text (cleaned, first 1000 chars):",
        cleanedText.substring(0, 1000),
      );
      const errorResponse: FactCheckResponse = {
        /* ... construct default error response ... */
      } as FactCheckResponse; // Truncated for brevity, same as before
      return NextResponse.json({
        claims: errorResponse,
        fromCache: false,
        errorDetails: "AI response parsing failed.",
      });
    }

    // Ensure url_sources_used is an array, even if AI fails to provide it correctly
    if (!Array.isArray(factCheckResult.url_sources_used)) {
      console.warn(
        "AI response for 'url_sources_used' was not an array. Defaulting to empty array.",
      );
      factCheckResult.url_sources_used = [];
    }

    if (useCache) {
      apiCache.setVerification(cacheKey, {}, factCheckResult);
    }

    return NextResponse.json({ claims: factCheckResult, fromCache: false });
  } catch (error) {
    console.error("Verify claims API error:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error occurred during verification.";
    const fallbackErrorResponse: Partial<FactCheckResponse> = {
      /* ... construct default error response ... */
    } as Partial<FactCheckResponse>; // Truncated for brevity
    return NextResponse.json(
      {
        claims: fallbackErrorResponse,
        error: `Failed to verify claims: ${errorMessage}`,
      },
      { status: 500 },
    );
  }
}
