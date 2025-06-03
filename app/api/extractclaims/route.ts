// app/api/extractclaims/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
// Corrected import: Import both apiCache (named) and cacheManager (default)
import cacheManager, { apiCache } from '@/lib/cacheManager';
import { ContentAnalyzer, ContentAnalysis, ContentChunk } from '@/lib/contentAnalyzer'; // Ensure ContentAnalyzer v2 is used

export const maxDuration = 300; // 5 minutes

// API Key - As per your request, this is hardcoded.
// Remember the security implications of hardcoding API keys.
const apiKey = "AIzaSyB-7iuE2qYR_1LK5DALUbBfwnxG7p9tIIs";

if (!apiKey) {
  console.error('GEMINI_API_KEY is not set (this should not happen if hardcoded).');
}

const genAI = new GoogleGenerativeAI(apiKey || '');

// Interface for individual checks (consistent with verifyclaims)
interface VerificationCheck {
  verdict: "GO" | "CHECK" | "NO GO" | "N/A" | string; // Allow string for types like "Statistical", "Simple"
  reason: string;
  score?: number | null;
}

interface Claim {
  claim_id: string;
  claim_text: string;
  original_sentence: string;
  sentence_number: number; // Global sentence number
  sentence_start_index: number;
  sentence_end_index: number;
  // New fields for preliminary analysis during extraction
  claim_complexity_assessment: VerificationCheck;
  claim_type_assessment: VerificationCheck;
}

interface ExtractionResponse {
  topic: string;
  category: string;
  document_type: string;
  expected_accuracy_range: string;
  funding_source?: string;
  author_credibility?: string;
  claims: Claim[];
  total_sentences_in_doc: number; // Renamed for clarity
  total_words_in_doc: number;     // Renamed for clarity
  avg_words_per_page: number;   // Renamed for clarity
  references_in_doc_count: number; // Renamed for clarity
  doc_reference_quality_score?: string; // Renamed for clarity

  // Fields specific to this API call
  fromCache?: boolean;
  analysis?: ContentAnalysis; // The ContentAnalysis object used for this extraction
  totalClaimsExtractedThisCall?: number;
}

// Helper to get sentences with their global indices within the full document
function getSentencesWithIndices(
    text: string,
    globalCharOffset: number = 0,
    globalSentenceOffset: number = 0
): Array<{ text: string, start: number, end: number, globalIndex: number, localIndex: number }> {
    if (!text) return [];
    const sentencesArray: Array<{ text: string, start: number, end: number, globalIndex: number, localIndex: number }> = [];
    const sentenceRegex = /([^\.!\?\n]+(?:[\.!\?](?!\s*[a-z0-9])|\n+|$))/g;
    let match;
    let localSentenceIdx = 0;

    while ((match = sentenceRegex.exec(text)) !== null) {
        const sentenceText = match[0].trim();
        if (sentenceText.length > 0) {
            localSentenceIdx++;
            sentencesArray.push({
                text: sentenceText,
                start: globalCharOffset + match.index, 
                end: globalCharOffset + match.index + match[0].length, 
                globalIndex: globalSentenceOffset + localSentenceIdx, 
                localIndex: localSentenceIdx 
            });
        }
    }
    if (sentencesArray.length === 0 && text.trim().length > 0) {
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        let currentLineCharOffset = 0;
        lines.forEach((line, idx) => {
            localSentenceIdx++;
            const lineStartInText = text.indexOf(line, currentLineCharOffset);
            sentencesArray.push({
                text: line.trim(),
                start: globalCharOffset + (lineStartInText !== -1 ? lineStartInText : 0),
                end: globalCharOffset + (lineStartInText !== -1 ? lineStartInText : 0) + line.length,
                globalIndex: globalSentenceOffset + localSentenceIdx,
                localIndex: localSentenceIdx
            });
            currentLineCharOffset = (lineStartInText !== -1 ? lineStartInText : 0) + line.length;
        });
         if (sentencesArray.length === 0 && text.trim().length > 0) { 
            localSentenceIdx++;
            sentencesArray.push({
                text: text.trim(),
                start: globalCharOffset,
                end: globalCharOffset + text.length,
                globalIndex: globalSentenceOffset + localSentenceIdx,
                localIndex: localSentenceIdx
            });
        }
    }
    return sentencesArray;
}


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
        content,
        useCache = true,
        isChunk = false,
        chunkId, 
        chunkIndex, 
        totalChunks,
        fullDocumentAnalysis: analysisFromClient, 
        sentenceNumberOffset = 0, 
        chunkGlobalCharStartIndex = 0 
    } = body;

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const currentAnalysis: ContentAnalysis = isChunk && analysisFromClient ? analysisFromClient : ContentAnalyzer.analyze(content);

    if (!currentAnalysis.canProcess && !isChunk) { 
      return NextResponse.json({
        error: `Content too large or too small. ${currentAnalysis.warnings.join(' ')}`,
        analysis: currentAnalysis
      }, { status: 400 });
    }

    const cacheKey = `${isChunk ? `extractclaims_chunk_v3.1_${chunkId}` : `extractclaims_full_v3.1`}_${content.substring(0, 50)}_${content.length}`;


    if (useCache) {
      // Use cacheManager.get() for the full object
      const cachedFullResponse = cacheManager.get<ExtractionResponse>(cacheKey); 
      if (cachedFullResponse) {
          console.log(`Returning cached full extraction data for ${isChunk ? `chunk ${chunkId}` : 'full document'}`);
          return NextResponse.json({
              ...cachedFullResponse, // Spread the cached object
              fromCache: true,
              analysis: currentAnalysis 
          });
      }
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is not configured (extractclaims).' }, { status: 500 });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash", 
      generationConfig: {
        temperature: 0.05, 
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    });

    const textToProcess = content;
    const sentencesWithGlobalIndices = getSentencesWithIndices(textToProcess, chunkGlobalCharStartIndex, sentenceNumberOffset);

    const extractionResult = await performClaimExtractionLogic(
        model,
        textToProcess,
        currentAnalysis, 
        isChunk ? false : true, 
        isChunk ? chunkId : 'full_doc',
        sentencesWithGlobalIndices, 
        isChunk && chunkIndex === 0 
    );
    
    if (isChunk) {
        // For chunks, the extractionResult is already tailored (claims + metadata for first chunk)
        const chunkSpecificResponse = extractionResult; // extractionResult here is the specific response for the chunk
        if (useCache && chunkSpecificResponse.claims.length > 0) {
            // Cache the specific chunk response
            cacheManager.set(cacheKey, chunkSpecificResponse);
        }
        return NextResponse.json(chunkSpecificResponse);
    }

    // For non-chunked (full document) processing
    const uniqueClaims = removeDuplicateClaims(extractionResult.claims);
    extractionResult.claims = uniqueClaims;

    if (useCache && extractionResult.claims.length > 0) {
      // For a full document, cache the entire ExtractionResponse object
      cacheManager.set(cacheKey, extractionResult);
    }

    return NextResponse.json({
      ...extractionResult,
      fromCache: false,
      analysis: currentAnalysis,
      totalClaimsExtractedThisCall: extractionResult.claims.length
    });

  } catch (error) {
    console.error('Extract claims API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { error: `Failed to extract claims: ${errorMessage}` },
      { status: 500 }
    );
  }
}

async function performClaimExtractionLogic(
  model: any,
  textContentToAnalyze: string, 
  fullDocAnalysisContext: ContentAnalysis, 
  isFirstChunkOrOnlyChunk: boolean, 
  currentProcessingUnitId: string, 
  sentencesInCurrentBlock: Array<{ text: string, start: number, end: number, globalIndex: number, localIndex: number }>,
  isActualFirstChunkOfDocument: boolean 
): Promise<ExtractionResponse> {

  const referencesInThisBlock = (textContentToAnalyze.match(/\[\d+\]|\(\d{4}\)|et al\.|doi:/gi) || []).length;

  const promptSystemInstruction = `You are an expert document analyzer.
${isFirstChunkOrOnlyChunk || isActualFirstChunkOfDocument ? `
This is the FIRST (or only) part of the document. Perform DOCUMENT OVERVIEW ANALYSIS and CLAIM EXTRACTION.
DOCUMENT OVERVIEW ANALYSIS (Only for the very first processing unit of the entire document):
- Topic: Highly specific topic (e.g., "Impact of neonicotinoids on Apis mellifera in North America").
- Category: Medical, Legal, Political, Business, Education, Science, History, News/Current Events, Technical, Creative Writing, Financial, Social Science, Environmental Science, Other.
- Document Type: Original Research, Review Article, Opinion Piece, News Report, Legal Document, etc.
- Expected Accuracy Range: Based on Category & Type (e.g., "Original Research (Science): 85-95%").
- Funding Source (if mentioned): Explicitly mentioned funding. State "Not Mentioned" if absent.
- Author Credibility Assessment (if info available): Potential author credibility/biases. State "No specific author information to assess" if none.
` : `
This is a SUBSEQUENT part of a larger document. Focus ONLY on CLAIM EXTRACTION for this part. Do NOT repeat Document Overview Analysis.
`}

CLAIM EXTRACTION (for ALL parts):
Analyze the provided text SENTENCE BY SENTENCE. For EACH sentence, extract ALL verifiable factual claims.
A single sentence can contain multiple distinct claims.
- Focus on: Factual statements, statistics, historical assertions, scientific/medical statements, specifics about entities/events, cause-effect, factual comparisons.
- Skip: Opinions, questions, predictions (unless stated as plans), vague statements, instructions, incomplete sentences (unless factual), redundancies, figurative language, common definitions, self-referential statements.

For each extracted claim, provide:
- "claim_id": Unique ID: "sentenceX_partY" (X=GLOBAL sentence number, Y=part letter if multiple claims in one sentence).
- "claim_text": Concise, verifiable statement (max 200 chars). Rephrase for clarity/atomicity if needed, retain core facts.
- "original_sentence": EXACT verbatim sentence from the document (max 400 chars).
- "sentence_number": GLOBAL 1-based index of the sentence in the ENTIRE document.
- "sentence_start_index": GLOBAL character start index of 'original_sentence' in the FULL document.
- "sentence_end_index": GLOBAL character end index of 'original_sentence' in the FULL document.
- "claim_complexity_assessment": { "verdict": "Simple" | "Moderate" | "Complex", "reason": "Brief justification for complexity." }
- "claim_type_assessment": { "verdict": "Statistical" | "Historical Fact" | "Scientific Assertion" | "Geographical Fact" | "Biographical Fact" | "Event Description" | "Process Description" | "Product Specification" | "Definition (Specialized)" | "Other Factual", "reason": "Brief justification for type." }

The text to analyze is below (Processing Unit ID: ${currentProcessingUnitId}).
Sentence numbers listed are GLOBAL. Use these directly. Character indices are also GLOBAL.
Text Block:
${sentencesInCurrentBlock.map(s => `Sentence ${s.globalIndex} (Global Chars: ${s.start}-${s.end}): "${s.text}"`).join('\n\n')}

Output Format: Return ONLY a single JSON object. Ensure valid JSON.
${isFirstChunkOrOnlyChunk || isActualFirstChunkOfDocument ? `
JSON for the first processing unit of the document:
{
  "topic": "Calculated Topic",
  "category": "Calculated Category",
  "document_type": "Calculated Document Type",
  "expected_accuracy_range": "Calculated Expected Accuracy Range",
  "funding_source": "Calculated Funding Source or Not Mentioned",
  "author_credibility": "Calculated Author Credibility or N/A",
  "claims": [ /* list of claims from this text block */ ],
  "total_sentences_in_doc": ${fullDocAnalysisContext.sentenceCount},
  "total_words_in_doc": ${fullDocAnalysisContext.wordCount},
  "avg_words_per_page": ${Math.round(fullDocAnalysisContext.wordCount / (fullDocAnalysisContext.estimatedPages || 1))},
  "references_in_doc_count": ${referencesInThisBlock},
  "doc_reference_quality_score": "${referencesInThisBlock > 10 ? 'Potentially Well-referenced' : referencesInThisBlock > 3 ? 'Moderately referenced' : 'Sparsely referenced (in this block)'}"
}` : `
JSON for subsequent processing units (chunks):
{
  "claims": [ /* list of claims from this text block */ ]
  // DO NOT include topic, category, etc. for subsequent chunks.
}`}
If no claims are found in this block, return an empty "claims" array.
Ensure all string values in JSON are properly escaped.
Example claim object:
{
  "claim_id": "sentence_1_part_a",
  "claim_text": "Paris is the capital of France.",
  "original_sentence": "Paris, known for the Eiffel Tower, is the capital of France and a major global city.",
  "sentence_number": 1,
  "sentence_start_index": 0,
  "sentence_end_index": 75,
  "claim_complexity_assessment": { "verdict": "Simple", "reason": "Direct factual statement." },
  "claim_type_assessment": { "verdict": "Geographical Fact", "reason": "States a geographical fact about a capital city." }
}`;

  try {
    const result = await model.generateContent(promptSystemInstruction);
    const response = result.response;
    let text = response.text();

    text = text.trim();
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/); 
    if (jsonMatch && (jsonMatch[1] || jsonMatch[2])) {
        text = jsonMatch[1] || jsonMatch[2];
    } else {
        console.warn(`Could not extract JSON from Gemini response for ${currentProcessingUnitId}. Using raw text.`);
    }
    text = text.trim();


    let parsedResponse: Partial<ExtractionResponse>;
    try {
      parsedResponse = JSON.parse(text);
    } catch (parseError) {
      console.error(`Failed to parse Gemini response for ${currentProcessingUnitId}. Raw text (first 500 chars):`, text.substring(0,500), parseError);
      throw new Error(`Invalid JSON response from AI for claims extraction (unit: ${currentProcessingUnitId}).`);
    }

    const finalResponse: ExtractionResponse = {
        topic: (isFirstChunkOrOnlyChunk || isActualFirstChunkOfDocument) ? parsedResponse.topic || "General (Default)" : "N/A (Subsequent Chunk)",
        category: (isFirstChunkOrOnlyChunk || isActualFirstChunkOfDocument) ? parsedResponse.category || "Other (Default)" : "N/A (Subsequent Chunk)",
        document_type: (isFirstChunkOrOnlyChunk || isActualFirstChunkOfDocument) ? parsedResponse.document_type || "Unknown (Default)" : "N/A (Subsequent Chunk)",
        expected_accuracy_range: (isFirstChunkOrOnlyChunk || isActualFirstChunkOfDocument) ? parsedResponse.expected_accuracy_range || "Unknown (Default)" : "N/A (Subsequent Chunk)",
        funding_source: (isFirstChunkOrOnlyChunk || isActualFirstChunkOfDocument) ? parsedResponse.funding_source : undefined,
        author_credibility: (isFirstChunkOrOnlyChunk || isActualFirstChunkOfDocument) ? parsedResponse.author_credibility : undefined,
        claims: [],
        total_sentences_in_doc: (isFirstChunkOrOnlyChunk || isActualFirstChunkOfDocument) ? parsedResponse.total_sentences_in_doc || fullDocAnalysisContext.sentenceCount : 0,
        total_words_in_doc: (isFirstChunkOrOnlyChunk || isActualFirstChunkOfDocument) ? parsedResponse.total_words_in_doc || fullDocAnalysisContext.wordCount : 0,
        avg_words_per_page: (isFirstChunkOrOnlyChunk || isActualFirstChunkOfDocument) ? parsedResponse.avg_words_per_page || Math.round(fullDocAnalysisContext.wordCount / (fullDocAnalysisContext.estimatedPages||1)) : 0,
        references_in_doc_count: (isFirstChunkOrOnlyChunk || isActualFirstChunkOfDocument) ? parsedResponse.references_in_doc_count || referencesInThisBlock : referencesInThisBlock,
        doc_reference_quality_score: (isFirstChunkOrOnlyChunk || isActualFirstChunkOfDocument) ? parsedResponse.doc_reference_quality_score : undefined,
    };

    if (parsedResponse.claims && Array.isArray(parsedResponse.claims)) {
        finalResponse.claims = parsedResponse.claims.filter(claim =>
            claim &&
            typeof claim.claim_id === 'string' &&
            typeof claim.claim_text === 'string' && claim.claim_text.length > 3 && claim.claim_text.length <= 250 &&
            typeof claim.original_sentence === 'string' && claim.original_sentence.length > 3 && claim.original_sentence.length <= 500 &&
            typeof claim.sentence_number === 'number' && claim.sentence_number >= 0 &&
            typeof claim.sentence_start_index === 'number' && claim.sentence_start_index >= 0 &&
            typeof claim.sentence_end_index === 'number' && claim.sentence_end_index > claim.sentence_start_index &&
            claim.claim_complexity_assessment && typeof claim.claim_complexity_assessment.verdict === 'string' &&
            claim.claim_type_assessment && typeof claim.claim_type_assessment.verdict === 'string'
        ).map(claim => ({ 
            ...claim,
            claim_text: claim.claim_text.substring(0,250),
            original_sentence: claim.original_sentence.substring(0,500),
            claim_complexity_assessment: claim.claim_complexity_assessment || {verdict: "N/A", reason: "Not assessed"},
            claim_type_assessment: claim.claim_type_assessment || {verdict: "N/A", reason: "Not assessed"},
        }));
    } else {
        console.warn(`No claims array found or it's not an array in response for ${currentProcessingUnitId}.`);
    }

    return finalResponse;

  } catch (error) {
    console.error(`Error in performClaimExtractionLogic for ${currentProcessingUnitId}:`, error);
    throw error; 
  }
}

function removeDuplicateClaims(claims: Claim[]): Claim[] {
  const seen = new Set<string>();
  return claims.filter(claim => {
    const key = `${claim.claim_text.toLowerCase().trim()}|${claim.original_sentence.toLowerCase().trim()}|${claim.sentence_number}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

