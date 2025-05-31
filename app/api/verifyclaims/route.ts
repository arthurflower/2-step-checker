// app/api/verifyclaims/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { apiCache } from '@/lib/cacheManager'; // Assuming you might want to cache verifications

export const maxDuration = 120; // Increased duration to 2 minutes

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set in environment variables');
}

const genAI = new GoogleGenerativeAI(apiKey || '');

interface ExaSource {
  text: string; // Snippet or relevant text from the source
  url: string;
  source_type: 'org' | 'edu_gov' | 'other'; // From exasearch
  title?: string; // Title of the source page
}

interface AdvancedVerification {
  reality_check: "GO" | "CHECK" | "NO GO";
  reality_check_reason: string; // Detailed explanation
  reliability_check: "GO" | "CHECK" | "NO GO";
  reliability_check_reason: string; // Detailed explanation
  contradiction_level: "None" | "Low" | "Medium" | "High"; // Added Medium
  source_quality_assessment: "Poor" | "Mixed" | "Good" | "Excellent"; // More granular
  final_verdict: "GO" | "CHECK" | "NO GO";
}

interface FactCheckResponse {
  claim_id: string; // ID from extraction step
  claim_text: string; // The claim being verified
  assessment: "True" | "False" | "Ambiguous/Partially True" | "Insufficient Information"; // Added Ambiguous
  summary: string; // Concise summary of verification
  fixed_original_text: string; // Suggested fix or original if no fix needed
  confidence_score: number; // 0-100
  two_step_verification: AdvancedVerification;
  original_sentence: string; // The sentence from which the claim was derived
  sentence_number: number; // The sentence number
}

const getDomainName = (url: string): string => {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch (e) {
    console.warn(`Invalid URL encountered: ${url}`);
    return url; // Return original string if URL parsing fails
  }
};

// Helper function to create a unique cache key for verification
const generateVerificationCacheKey = (claim_id: string, claim_text: string, sources: ExaSource[]): string => {
  const sourceUrls = sources.map(s => s.url).sort().join(',');
  return `verify_${claim_id}_${claim_text}_${sourceUrls}`;
};


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Destructure with new field names
    const { claim_id, claim_text, original_sentence, sentence_number, exasources, document_category, useCache = true } = body;


    if (!claim_id || !claim_text || !original_sentence || typeof sentence_number !== 'number' || !exasources || !Array.isArray(exasources)) {
      return NextResponse.json(
        { error: 'claim_id, claim_text, original_sentence, sentence_number, and an array of exasources are required.' },
        { status: 400 }
      );
    }
     if (exasources.length === 0) {
        // If no sources, return a specific response without calling LLM
        const noSourceResponse: FactCheckResponse = {
            claim_id,
            claim_text,
            assessment: "Insufficient Information",
            summary: "No sources were provided or found for this claim, so verification cannot be performed.",
            fixed_original_text: original_sentence, // No fix if no sources
            confidence_score: 0,
            two_step_verification: {
                reality_check: "NO GO",
                reality_check_reason: "No sources available to check reality.",
                reliability_check: "NO GO",
                reliability_check_reason: "No sources available to assess reliability.",
                contradiction_level: "None",
                source_quality_assessment: "Poor", // Or N/A
                final_verdict: "NO GO"
            },
            original_sentence,
            sentence_number
        };
        return NextResponse.json({ claims: noSourceResponse });
     }

    // Cache check
    const cacheKey = generateVerificationCacheKey(claim_id, claim_text, exasources);
    if (useCache) {
      const cachedResult = apiCache.getVerification(cacheKey, {}); // Adjust getVerification if its signature changed
      if (cachedResult) {
        console.log(`Returning cached verification for claim_id: ${claim_id}`);
        return NextResponse.json({ claims: cachedResult, fromCache: true });
      }
    }


    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key is not configured' },
        { status: 500 }
      );
    }

    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.05, // Lower temperature for more deterministic fact-checking
        },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
    });
    
    const categoryInstruction = document_category ? 
    `The document is categorized as '${document_category}'. Prioritize sources and reasoning relevant to this category (e.g., for Medical, PubMed/NIH are highly credible; for Legal, case law/statutes).`
    : "The document category is unknown. Evaluate sources based on general credibility.";


    const prompt = `
You are an expert fact-checker performing an ADVANCED 2-Step Verification Protocol for a given claim from a document.
The document's primary category is: ${document_category || "Not Specified"}. ${categoryInstruction}

Claim Details:
- Claim ID: "${claim_id}"
- Claim Text: "${claim_text}"
- Original Sentence in Document (Sentence #${sentence_number}): "${original_sentence}"

Provided Sources (${exasources.length} total):
${exasources.map((source: ExaSource, index: number) => {
  return `Source ${index + 1} (Type: ${source.source_type.toUpperCase()}, URL: ${getDomainName(source.url)}):\nTitle: ${source.title || 'N/A'}\nRelevant Text: "${source.text}"\n`;
}).join('\n')}

Your task is to return a JSON object with the following structure and logic:

**JSON Output Structure:**
{
  "claim_id": "${claim_id}",
  "claim_text": "${claim_text}",
  "assessment": "True" | "False" | "Ambiguous/Partially True" | "Insufficient Information",
  "summary": "A concise (1-2 sentences) summary of your findings regarding the claim's veracity based on the sources.",
  "fixed_original_text": "If the claim is 'False' or 'Ambiguous/Partially True' AND the original sentence can be corrected based on the sources, provide a corrected version of the ORIGINAL SENTENCE. Otherwise, return the original_sentence.",
  "confidence_score": // Your confidence in the assessment (0-100). High for True/False with strong evidence, lower for Ambiguous or Insufficient.
  "two_step_verification": {
    "reality_check": "GO" | "CHECK" | "NO GO",
    "reality_check_reason": "Detailed explanation (2-3 sentences). Start with source counts: 'Based on X supporting .org, Y supporting .edu/gov, Z supporting other sources, and W refuting sources...'. Explicitly state if key source types (e.g., .org for political) are missing or weak. Explain how the evidence supports or refutes the claim's factual accuracy.",
    "reliability_check": "GO" | "CHECK" | "NO GO",
    "reliability_check_reason": "Detailed explanation (2-3 sentences). Start with overall source quality: 'Source quality is [Poor/Mixed/Good/Excellent] because...'. Discuss neutrality, potential biases, and how the mix/type of sources (e.g., 'heavy reliance on non-.org sources (X/${exasources.length})', or 'strong support from .gov sites') impacts reliability for THIS specific claim and category.",
    "contradiction_level": "None" | "Low" | "Medium" | "High", // Assess contradictions among provided sources regarding the claim.
    "source_quality_assessment": "Poor" | "Mixed" | "Good" | "Excellent", // Overall quality of the provided sources FOR THIS CLAIM.
    "final_verdict": "GO" | "CHECK" | "NO GO" // Overall recommendation.
  },
  "original_sentence": "${original_sentence}",
  "sentence_number": ${sentence_number}
}

**Verification Logic & Rules:**

1.  **Source Analysis (Internal Thought Process - Do not output this part):**
    * Tally supporting sources by type (.org, .edu_gov, other).
    * Tally refuting sources.
    * Note the strength and relevance of each source to the claim and document category.

2.  **Reality Check (Factual Accuracy):**
    * **Verdict**:
        * "GO": Claim is factually accurate and well-supported by high-quality, relevant sources.
        * "CHECK": Claim has some support but also conflicting information, or sources are mixed quality/relevance. Needs human review.
        * "NO GO": Claim is factually inaccurate or strongly contradicted by credible sources.
    * **Reasoning**: Must clearly state source counts and how they lead to the verdict.

3.  **Reliability Check (Source Credibility & Neutrality for this Claim):**
    * **Source Quality Assessment**:
        * "Excellent": Multiple, highly reputable, directly relevant sources (e.g., primary sources, top-tier .org/.edu/.gov for the category).
        * "Good": Several reputable sources, mostly relevant.
        * "Mixed": Some decent sources, but also lower quality ones, or relevance is varied.
        * "Poor": Few or no reputable/relevant sources; mostly blogs, forums, or biased sites.
    * **Verdict**:
        * "GO": Sources are high quality, neutral, and directly support the claim reliably.
        * "CHECK": Sources have mixed reliability, potential bias, or indirect relevance.
        * "NO GO": Sources are generally poor quality, biased, or irrelevant for this claim.
    * **Reasoning**: Must state the source_quality_assessment and explain.

4.  **Contradiction Level**: Assess if sources contradict each other regarding the claim.
    * "High" if strong sources directly conflict.
    * "Medium" if some sources conflict or offer different perspectives.
    * "Low" if minor discrepancies or different angles.
    * "None" if all sources align or don't address the same specific point.

5.  **Overall Assessment & Confidence:**
    * "True": Strong, consistent support from high-quality sources. Confidence: 85-100.
    * "False": Strong, consistent refutation from high-quality sources. Confidence: 85-100.
    * "Ambiguous/Partially True": Evidence is mixed, claim is true in one aspect but false in another, or nuances are critical. Confidence: 40-70.
    * "Insufficient Information": Not enough quality/relevant sources to make a firm judgment. Confidence: 0-30. Reality Check often "NO GO" or "CHECK".

6.  **Final Verdict (two_step_verification.final_verdict):**
    * If Reality Check is "NO GO" OR Reliability Check is "NO GO", Final Verdict MUST be "NO GO".
    * If Reality Check is "CHECK" OR Reliability Check is "CHECK" (and neither is "NO GO"), Final Verdict is "CHECK".
    * Only if BOTH Reality Check AND Reliability Check are "GO", Final Verdict is "GO".

7.  **Fixed Original Text**:
    * If assessment is "False" or "Ambiguous/Partially True", attempt to correct the *original_sentence* based *only* on the provided sources.
    * If no correction is possible or assessment is "True"/"Insufficient Information", return the original_sentence.

STRICTLY ADHERE TO THE JSON FORMAT. Do not add any text before or after the JSON object.
Ensure all string fields in the JSON are properly escaped.
`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    let cleanedText = text.trim();
    // More robust cleaning for JSON, handling potential markdown/text before/after
    const jsonStart = cleanedText.indexOf('{');
    const jsonEnd = cleanedText.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);
    } else {
        console.error('Could not find valid JSON object delimiters in response:', cleanedText.substring(0, 200));
        throw new Error('AI response is not valid JSON.');
    }
    
    let factCheckResult: FactCheckResponse;
    try {
      factCheckResult = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse Gemini response as JSON:', parseError);
      console.error('Raw response text (cleaned):', cleanedText.substring(0, 1000)); // Log more of the problematic response
      return NextResponse.json(
        { error: 'Failed to parse AI response. The AI returned malformed data. Please try again.' },
        { status: 500 }
      );
    }

    // Cache the successful verification
    if (useCache) {
      apiCache.setVerification(cacheKey, {}, factCheckResult); // Adjust setVerification if needed
    }

    return NextResponse.json({ claims: factCheckResult, fromCache: false });

  } catch (error) {
    console.error('Verify claims API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during verification.';
    // Attempt to provide a more specific error if it's from the AI generation itself
    if (error && typeof error === 'object' && 'message' in error && (error as any).message.includes('Candidate was blocked due to')) {
        return NextResponse.json(
            { error: `AI content generation blocked. ${ (error as any).message }`},
            { status: 503 } // Service Unavailable or specific AI error code
        );
    }
    return NextResponse.json(
      { error: `Failed to verify claims: ${errorMessage}` },
      { status: 500 }
    );
  }
}
