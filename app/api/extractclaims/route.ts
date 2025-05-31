// app/api/extractclaims/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { apiCache } from '@/lib/cacheManager';
import { ContentAnalyzer, ContentAnalysis } from '@/lib/contentAnalyzer';

export const maxDuration = 300;

const apiKey = process.env.GEMINI_API_KEY; // Corrected to use GEMINI_API_KEY
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set in environment variables');
}

const genAI = new GoogleGenerativeAI(apiKey || '');

interface Claim {
  claim_id: string;
  claim_text: string;
  original_sentence: string;
  sentence_number: number;
  sentence_start_index: number; // Renamed for clarity
  sentence_end_index: number;   // Renamed for clarity
}

interface ExtractionResponse {
  topic: string;
  category: string;
  document_type: string;
  expected_accuracy_range: string; // Renamed for consistency
  funding_source?: string;
  author_credibility?: string;
  claims: Claim[];
  total_sentences: number;
  total_words: number;
  words_per_page: number; // Renamed for consistency
  references_count: number;
  reference_quality_score?: string; // Renamed for consistency
}

// Matches sentences ending with. !? or line breaks, and also captures start/end indices.
function getSentencesWithIndices(text: string): Array<{ text: string, start: number, end: number, index: number }> {
  if (!text) return [];

  const sentencesArray: Array<{ text: string, start: number, end: number, index: number }> = [];
  // Regex to split by common sentence terminators (. ! ?) followed by space or end of string.
  // Also handles line breaks as potential sentence separators if no other punctuation is found.
  const sentenceRegex = /([^\.!\?\n]+(?:[\.!\?](?!\s*[a-z])|\n+|$))/g;
  let match;
  let currentIndex = 0;
  let sentenceGlobalIndex = 0;

  while ((match = sentenceRegex.exec(text)) !== null) {
      const sentenceText = match[0].trim();
      if (sentenceText.length > 0) { // Ensure sentence is not empty
          sentencesArray.push({
              text: sentenceText,
              start: match.index,
              end: match.index + match[0].length, // Use match[0] for original length with potential trailing spaces
              index: ++sentenceGlobalIndex
          });
      }
  }
   // If regex fails to find sentences (e.g. text without common punctuation), treat the whole text as one sentence or split by newlines.
    if (sentencesArray.length === 0 && text.length > 0) {
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        let charIndex = 0;
        lines.forEach((line, idx) => {
            sentencesArray.push({
                text: line.trim(),
                start: text.indexOf(line, charIndex),
                end: text.indexOf(line, charIndex) + line.length,
                index: ++sentenceGlobalIndex
            });
            charIndex = text.indexOf(line, charIndex) + line.length;
        });
         if (sentencesArray.length === 0 && text.trim().length > 0) { // Still no sentences, treat as one
            sentencesArray.push({
                text: text.trim(),
                start: 0,
                end: text.length,
                index: 1
            });
        }
    }


  return sentencesArray;
}


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { content, useCache = true } = body;

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const analysis: ContentAnalysis = ContentAnalyzer.analyze(content);
    
    if (!analysis.canProcess) {
      return NextResponse.json({ 
        error: `Content too large. Maximum: ${ContentAnalyzer.LIMITS.MAX_WORDS_TOTAL.toLocaleString()} words. Your content: ${analysis.wordCount.toLocaleString()} words.`,
        analysis
      }, { status: 400 });
    }

    const cacheKey = `extractclaims_v3_${analysis.processingStrategy}_${content}`; // Updated cache key version
    if (useCache) {
      const cachedData = apiCache.getClaims(cacheKey);
      if (cachedData) {
        console.log('Returning cached extraction data');
        return NextResponse.json({ 
          ...cachedData,
          fromCache: true,
          analysis // ensure analysis is part of the cached response if needed, or re-attach current
        });
      }
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is not configured' }, { status: 500 });
    }

    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.1,
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

    let combinedExtractionResponse: ExtractionResponse;

    if (analysis.processingStrategy === 'direct') {
      combinedExtractionResponse = await extractClaims(model, content, analysis, true, 'doc', 0, getSentencesWithIndices(content));
    } else if (analysis.processingStrategy === 'chunked' && analysis.chunks) {
      console.log(`Processing ${analysis.chunks.length} chunks for claims extraction.`);
      let firstChunk = true;
      const allClaims: Claim[] = [];
      let baseExtractionData: Partial<ExtractionResponse> = {};
      let totalSentenceOffset = 0;

      for (const chunk of analysis.chunks) {
        try {
          const chunkSentencesWithIndices = getSentencesWithIndices(chunk.content);
          const chunkResponse = await extractClaims(
            model, 
            chunk.content, 
            analysis, // Pass full analysis for context
            firstChunk, 
            chunk.id, 
            chunk.startIndex, // Pass the global start index of the chunk content
            chunkSentencesWithIndices, // Pass sentences for this chunk
            totalSentenceOffset // Pass the sentence number offset
          );
          
          if (firstChunk) {
            baseExtractionData = { // Store all non-claim data from the first chunk
                topic: chunkResponse.topic,
                category: chunkResponse.category,
                document_type: chunkResponse.document_type,
                expected_accuracy_range: chunkResponse.expected_accuracy_range,
                funding_source: chunkResponse.funding_source,
                author_credibility: chunkResponse.author_credibility,
                total_sentences: analysis.sentenceCount, // Use overall analysis count
                total_words: analysis.wordCount,         // Use overall analysis count
                words_per_page: Math.round(analysis.wordCount / (analysis.estimatedPages || 1)),
                references_count: chunkResponse.references_count, // Could be aggregated later if needed
                reference_quality_score: chunkResponse.reference_quality_score,
            };
            firstChunk = false;
          }
          allClaims.push(...chunkResponse.claims);
          totalSentenceOffset += chunkSentencesWithIndices.length; // Increment sentence offset by the number of sentences in the current chunk
          
          if (analysis.chunks.indexOf(chunk) < analysis.chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300)); // Rate limit
          }
        } catch (chunkError) {
          console.error(`Error processing chunk ${chunk.id}:`, chunkError);
          // Optionally, decide if you want to stop or continue with other chunks
        }
      }
      combinedExtractionResponse = {
        ...(baseExtractionData as ExtractionResponse), // Cast after filling
        claims: allClaims
      };

    } else { // Fallback for unexpected strategy
        return NextResponse.json({ error: 'Invalid processing strategy.' }, { status: 500 });
    }
    
    const uniqueClaims = removeDuplicateClaims(combinedExtractionResponse.claims);
    combinedExtractionResponse.claims = uniqueClaims;

    // Update analysis object with topic and category if available
    analysis.topic = combinedExtractionResponse.topic;
    analysis.category = combinedExtractionResponse.category;

    if (useCache && combinedExtractionResponse.claims.length > 0) {
      apiCache.setClaims(cacheKey, combinedExtractionResponse);
    }

    return NextResponse.json({ 
      ...combinedExtractionResponse,
      fromCache: false,
      analysis, // Send back the updated analysis object
      totalClaimsExtracted: combinedExtractionResponse.claims.length 
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

async function extractClaims(
  model: any, 
  textContent: string,
  fullDocumentAnalysis: ContentAnalysis, // For overall context
  isFirstChunk: boolean = true,
  chunkId?: string,
  chunkGlobalCharStartIndex: number = 0, // Character start index of this chunk in the full document
  sentencesInChunk: Array<{ text: string, start: number, end: number, index: number }>, // Sentences specific to this chunk, with local indices
  sentenceNumberOffset: number = 0 // Offset for global sentence numbering
): Promise<ExtractionResponse> {
  
  const referencesInChunk = (textContent.match(/\[\d+\]|\(\d{4}\)|et al\.|doi:/gi) || []).length;
  
  const promptSystemInstruction = `You are an expert document analyzer. Your task is to meticulously analyze the provided text content.
${isFirstChunk ? `This is the FIRST CHUNK of a larger document (or the entire document if small enough). Perform a DOCUMENT OVERVIEW ANALYSIS and CLAIM EXTRACTION.
DOCUMENT OVERVIEW ANALYSIS (for first chunk only):
- Topic: Provide a highly specific and detailed topic (e.g., "The impact of neonicotinoid pesticides on Apis mellifera populations in North America" NOT just "Bees and pesticides").
- Category: Select the most fitting category: Medical, Legal, Political, Business, Education, Science, History, News/Current Events, Technical, Creative Writing, Financial, Social Science, Environmental Science, Other.
- Document Type: Identify the nature of the document: Original Research Article, Review Article, Meta-Analysis, Opinion Piece, News Report, Legal Document (e.g., contract, ToS, patent), Business Report (e.g., annual report, market analysis), Educational Material (e.g., textbook chapter, lecture notes), Technical Documentation (e.g., user manual, API specification), Creative Work (e.g., fiction, poetry), Financial Statement, Thesis/Dissertation, White Paper, Blog Post, Speech Transcript, Interview Transcript, Other.
- Expected Accuracy Range: Based on the identified Category and Document Type, estimate the typical expected factual accuracy. Examples: "Original Research (Science): 85-95% accuracy expected, subject to peer review limitations", "Political Speech: 50-75% accuracy expected due to persuasive language and potential bias", "Legal Contract: 99-100% accuracy expected for factual statements".
- Funding Source (if mentioned): Identify any explicitly mentioned funding sources for the work or research. If not mentioned, state "Not Mentioned".
- Author Credibility Assessment (if author info available, otherwise general assessment based on text style): Briefly assess potential author credibility or biases. Example: "Author appears to be a domain expert based on technical language", "Author's affiliation with [Organization] may introduce bias towards X". If no info, state "No specific author information to assess".
` : `This is a SUBSEQUENT CHUNK of a larger document. Focus ONLY on CLAIM EXTRACTION for this chunk. Do NOT repeat Document Overview Analysis.`}

CLAIM EXTRACTION (for ALL chunks):
Go through the text SENTENCE BY SENTENCE. For EACH sentence, identify and extract ALL verifiable factual claims.
A single sentence can contain multiple distinct claims. Extract each one.
- Focus on:
  1. Factual statements that can be objectively verified (e.g., "The capital of France is Paris").
  2. Statistical claims with specific numbers or quantities (e.g., "The project's budget was $1.2 million").
  3. Historical assertions with dates, events, or periods (e.g., "World War II ended in 1945").
  4. Scientific or medical statements (e.g., "Water boils at 100°C at standard pressure").
  5. Specific statements about named people, organizations, products, or events (e.g., "Company X released product Y in Q3 2023").
  6. Cause-and-effect relationships presented as facts (e.g., "Increased CO2 levels contribute to global warming").
  7. Comparative statements presented as facts (e.g., "Method A is 20% more efficient than Method B").
- What to SKIP:
  - Pure opinions, subjective statements, beliefs (e.g., "This is the best movie ever").
  - Rhetorical questions or questions in general.
  - Predictions, speculations, or statements about the future not presented as established plans.
  - Vague, ambiguous, or overly general statements (e.g., "Things are improving").
  - Instructions, commands, calls to action, or recommendations.
  - Incomplete sentences or sentence fragments unless they clearly state a verifiable fact.
  - Redundant information if already captured from a previous part of the same sentence.
  - Figurative language, metaphors, or idiomatic expressions not intended as literal facts.
  - Definitions of common terms unless they are presented as a specific, verifiable claim within a specialized context.
  - Self-referential statements about the document itself (e.g., "This paper will discuss...").

For each extracted claim, provide:
- "claim_id": A unique ID. Use "sentenceX_partY" format. X is the GLOBAL sentence number (starting from 1 for the entire document, respecting sentenceNumberOffset). Y is the part number if a sentence has multiple claims (e.g., sentence_1_part_a, sentence_1_part_b).
- "claim_text": The concise, verifiable statement, rephrased for clarity and atomicity if necessary, but retaining the core meaning and all critical factual components. Max 200 characters.
- "original_sentence": The EXACT, verbatim sentence from the document from which the claim was derived. Max 400 characters.
- "sentence_number": The GLOBAL 1-based index of the sentence in the ENTIRE document. (Use sentenceNumberOffset + local sentence index).
- "sentence_start_index": The character start index of 'original_sentence' WITHIN THE FULL DOCUMENT (chunkGlobalCharStartIndex + local sentence start index).
- "sentence_end_index": The character end index of 'original_sentence' WITHIN THE FULL DOCUMENT (chunkGlobalCharStartIndex + local sentence end index).

The provided text chunk to analyze is below. Sentence numbers listed are LOCAL to this chunk for your reference.
Use these local numbers to map to GLOBAL sentence numbers using the offset: ${sentenceNumberOffset}.
Character indices must also be mapped to GLOBAL indices using the offset: ${chunkGlobalCharStartIndex}.

Text to analyze (Chunk ID: ${chunkId || 'document'}):
${sentencesInChunk.map(s => `Local Sentence ${s.index} (Starts at local char ${s.start}): "${s.text}"`).join('\n\n')}

Output Format: Return ONLY a single JSON object. Ensure valid JSON.
${isFirstChunk ? `For the first chunk, the JSON must be:
{
  "topic": "Calculated Topic",
  "category": "Calculated Category",
  "document_type": "Calculated Document Type",
  "expected_accuracy_range": "Calculated Expected Accuracy Range",
  "funding_source": "Calculated Funding Source or Not Mentioned",
  "author_credibility": "Calculated Author Credibility or N/A",
  "claims": [ /* list of claims from this chunk */ ],
  "total_sentences": ${fullDocumentAnalysis.sentenceCount},
  "total_words": ${fullDocumentAnalysis.wordCount},
  "words_per_page": ${Math.round(fullDocumentAnalysis.wordCount / (fullDocumentAnalysis.estimatedPages || 1))},
  "references_count": ${referencesInChunk}, // References found in THIS chunk
  "reference_quality_score": "${referencesInChunk > 10 ? 'Potentially Well-referenced' : referencesInChunk > 3 ? 'Moderately referenced' : 'Sparsely referenced (in this chunk)'}"
}` : `For subsequent chunks, the JSON must be:
{
  "claims": [ /* list of claims from this chunk */ ]
  // DO NOT include topic, category, etc. for subsequent chunks.
}`}
If no claims are found in this chunk, return an empty "claims" array.
Ensure all string values in JSON are properly escaped.
Example claim object:
{
  "claim_id": "sentence_1_part_a",
  "claim_text": "Paris is the capital of France.",
  "original_sentence": "Paris, known for the Eiffel Tower, is the capital of France and a major global city.",
  "sentence_number": 1,
  "sentence_start_index": 0,
  "sentence_end_index": 75
}`;

  try {
    const result = await model.generateContent(promptSystemInstruction);
    const response = result.response;
    let text = response.text();
    
    text = text.trim();
    if (text.startsWith("```json")) text = text.substring(7);
    if (text.endsWith("```")) text = text.substring(0, text.length - 3);
    text = text.trim();

    let parsedResponse: Partial<ExtractionResponse>;
    try {
      parsedResponse = JSON.parse(text);
    } catch (parseError) {
      console.error(`Failed to parse Gemini response for chunk ${chunkId || 'direct'}. Raw text (first 500 chars):`, text.substring(0,500), parseError);
      throw new Error('Invalid JSON response from AI for claims extraction.');
    }

    // Construct the full response structure
    const finalResponse: ExtractionResponse = {
        topic: isFirstChunk ? parsedResponse.topic || "General (Default)" : "N/A (Subsequent Chunk)",
        category: isFirstChunk ? parsedResponse.category || "Other (Default)" : "N/A (Subsequent Chunk)",
        document_type: isFirstChunk ? parsedResponse.document_type || "Unknown (Default)" : "N/A (Subsequent Chunk)",
        expected_accuracy_range: isFirstChunk ? parsedResponse.expected_accuracy_range || "Unknown (Default)" : "N/A (Subsequent Chunk)",
        funding_source: isFirstChunk ? parsedResponse.funding_source : undefined,
        author_credibility: isFirstChunk ? parsedResponse.author_credibility : undefined,
        claims: [],
        total_sentences: isFirstChunk ? parsedResponse.total_sentences || fullDocumentAnalysis.sentenceCount : 0,
        total_words: isFirstChunk ? parsedResponse.total_words || fullDocumentAnalysis.wordCount : 0,
        words_per_page: isFirstChunk ? parsedResponse.words_per_page || Math.round(fullDocumentAnalysis.wordCount / (fullDocumentAnalysis.estimatedPages||1)) : 0,
        references_count: isFirstChunk ? parsedResponse.references_count || referencesInChunk : referencesInChunk, // references_count for subsequent chunks applies to that chunk
        reference_quality_score: isFirstChunk ? parsedResponse.reference_quality_score : undefined,
    };
    
    if (parsedResponse.claims && Array.isArray(parsedResponse.claims)) {
        finalResponse.claims = parsedResponse.claims.filter(claim => 
            claim && 
            typeof claim.claim_id === 'string' &&
            typeof claim.claim_text === 'string' && claim.claim_text.length > 3 && claim.claim_text.length <= 250 &&
            typeof claim.original_sentence === 'string' && claim.original_sentence.length > 3 && claim.original_sentence.length <= 500 &&
            typeof claim.sentence_number === 'number' && claim.sentence_number >= 0 && // sentence_number is global
            typeof claim.sentence_start_index === 'number' && claim.sentence_start_index >= 0 &&
            typeof claim.sentence_end_index === 'number' && claim.sentence_end_index > claim.sentence_start_index
        ).map(claim => ({
            ...claim,
            claim_text: claim.claim_text.substring(0,250),
            original_sentence: claim.original_sentence.substring(0,500),
        }));
    } else {
        console.warn(`No claims array found or it's not an array in response for chunk ${chunkId || 'direct'}.`);
    }
    
    return finalResponse;

  } catch (error) {
    console.error(`Error in extractClaims for chunk ${chunkId || 'direct'}:`, error);
    throw error;
  }
}

function removeDuplicateClaims(claims: Claim[]): Claim[] {
  const seen = new Set<string>();
  const unique: Claim[] = [];
  
  for (const claim of claims) {
    const key = `${claim.claim_text.toLowerCase().trim()}|${claim.original_sentence.toLowerCase().trim()}|${claim.sentence_number}`;
    
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(claim);
    }
  }
  return unique;
}