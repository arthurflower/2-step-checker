// app/api/extractclaims/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { apiCache } from '@/lib/cacheManager';
import { ContentAnalyzer, ContentAnalysis } from '@/lib/contentAnalyzer';

// Increase timeout for large documents
export const maxDuration = 300; // 5 minutes

// Initialize the Gemini API with error handling
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set in environment variables');
}

const genAI = new GoogleGenerativeAI(apiKey || '');

interface Claim {
  claim_id: string; // Unique ID for the claim, e.g., sentence_1, sentence_2_part_a
  claim_text: string; // The concise, verifiable statement
  original_sentence: string; // The exact sentence from the document
  sentence_number: number; // The number of the sentence in the document
}

interface ExtractionResponse {
  topic: string;
  category: string; // e.g., Medical, Legal, Political, Business, Education, Science, History, Other
  claims: Claim[];
}

// Helper to split content into sentences
function getSentences(text: string): string[] {
    if (!text) return [];
    const sentences = text.match(/[^.!?]+[.!?](?=\s+|$|[^A-Z0-9])/g) || [];
    if (sentences.length === 0) {
        return text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    }
    return sentences.map(s => s.trim()).filter(s => s.length > 0);
}


export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const body = await req.json();
    const { content, useCache = true } = body;

    if (!content) {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    // Analyze content size using the updated ContentAnalyzer
    const analysis: ContentAnalysis = ContentAnalyzer.analyze(content);
    
    if (!analysis.canProcess) {
      return NextResponse.json(
        { 
          error: `Content too large. Maximum supported: ${ContentAnalyzer.LIMITS.MAX_WORDS_TOTAL.toLocaleString()} words. Your content: ${analysis.wordCount.toLocaleString()} words.`,
          analysis
        },
        { status: 400 }
      );
    }

    // Check cache first (key includes content and analysis strategy for robustness)
    const cacheKey = `extractclaims_${analysis.processingStrategy}_${content}`;
    if (useCache) {
      const cachedData = apiCache.getClaims(cacheKey); // Using a generic getClaims, assuming it stores ExtractionResponse
      if (cachedData) {
        console.log('Returning cached extraction data');
        // Ensure the cached data includes the analysis object
        return NextResponse.json({ 
          ...cachedData, // Spread the cached data (topic, category, claims)
          fromCache: true,
          analysis // Add the current analysis object
        });
      }
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key is not configured' },
        { status: 500 }
      );
    }

    // Initialize Gemini Flash model
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

    let combinedExtractionResponse: ExtractionResponse = {
        topic: "General",
        category: "Other",
        claims: []
    };

    // Process based on strategy
    if (analysis.processingStrategy === 'direct') {
      // Process entire content at once
      combinedExtractionResponse = await extractTopicCategoryAndClaims(model, content, analysis);
    } else if (analysis.processingStrategy === 'chunked' && analysis.chunks) {
      // Process in chunks
      console.log(`Processing ${analysis.chunks.length} chunks for claims extraction.`);
      let firstChunk = true;
      for (const chunk of analysis.chunks) {
        try {
          const chunkResponse = await extractTopicCategoryAndClaims(model, chunk.content, analysis, firstChunk, chunk.id, analysis.chunks.indexOf(chunk) * 1000); // Pass chunkId and base sentence number
          if (firstChunk) {
            combinedExtractionResponse.topic = chunkResponse.topic;
            combinedExtractionResponse.category = chunkResponse.category;
            firstChunk = false;
          }
          combinedExtractionResponse.claims.push(...chunkResponse.claims);
          
          if (analysis.chunks.indexOf(chunk) < analysis.chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Reduced delay
          }
        } catch (chunkError) {
          console.error(`Error processing chunk ${chunk.id} for claims:`, chunkError);
        }
      }
    }
    
    // Update analysis object with topic and category
    analysis.topic = combinedExtractionResponse.topic;
    analysis.category = combinedExtractionResponse.category;

    // Remove duplicate claims based on claim_text and original_sentence
    const uniqueClaims = removeDuplicateClaims(combinedExtractionResponse.claims);
    combinedExtractionResponse.claims = uniqueClaims;


    // Cache the results
    if (useCache && combinedExtractionResponse.claims.length > 0) {
      apiCache.setClaims(cacheKey, combinedExtractionResponse); // Cache the full ExtractionResponse
    }

    return NextResponse.json({ 
      ...combinedExtractionResponse, // topic, category, claims
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

async function extractTopicCategoryAndClaims(
  model: any, 
  textContent: string,
  analysis: ContentAnalysis, // Pass the full analysis object
  isFirstChunk: boolean = true, // To determine if topic/category should be extracted
  chunkId?: string, // Optional chunk ID for logging or context
  baseSentenceNumber: number = 0 // For multi-chunk sentence numbering
): Promise<ExtractionResponse> {
  
  const sentencesForPrompt = getSentences(textContent);

  const promptParts = [];
  if (isFirstChunk) {
    promptParts.push(
      `You are an expert document analyzer. Your first task is to determine the primary TOPIC and CATEGORY of the following text.`,
      `Categories can be: Medical, Legal, Political, Business, Education, Science, History, News/Current Events, Technical, Creative Writing, Other.`,
      `Be specific with the topic (e.g., "The impact of AI on climate change" not just "AI").`
    );
  }

  promptParts.push(
    `Next, your main task is to meticulously go through the text SENTENCE BY SENTENCE. For EACH sentence, identify and extract verifiable claims.`,
    `If a sentence contains multiple distinct claims, create separate entries for each, appending _part_a, _part_b, etc. to the sentence_number for the claim_id.`,
    `Focus on:`,
    `1. Factual statements that can be verified (e.g., "The sky is blue").`,
    `2. Statistical claims with numbers (e.g., "GDP grew by 5%").`,
    `3. Historical assertions (e.g., "The Berlin Wall fell in 1989").`,
    `4. Scientific or medical statements (e.g., "Water boils at 100°C at sea level").`,
    `5. Specific statements about people, organizations, or events.`,
    `What to SKIP:`,
    ` - Pure opinions or subjective statements (e.g., "This is the best movie ever").`,
    ` - Rhetorical questions or questions in general.`,
    ` - Predictions or speculations about the future.`,
    ` - Vague or overly general statements (e.g., "Things are good").`,
    ` - Instructions, commands, or calls to action.`,
    ` - Incomplete sentences or sentence fragments unless they clearly state a verifiable fact.`,
    ` - Redundant information if already captured from a previous part of the same sentence.`,
    `For each extracted claim, provide:`,
    ` - "claim_id": A unique ID. Use "sentence_X" where X is the 1-based index of the sentence in THIS CHUNK. If a sentence has multiple claims, use "sentence_X_part_a", "sentence_X_part_b". Adjust X by adding ${baseSentenceNumber} if this is not the first chunk.`,
    ` - "claim_text": A clear, concise, and independently verifiable statement, rephrased slightly for clarity if necessary, but keeping the core meaning. Max 150 characters.`,
    ` - "original_sentence": The EXACT sentence from the document from which the claim was derived. Max 300 characters.`,
    ` - "sentence_number": The 1-based index of the sentence in THIS CHUNK. Adjust by adding ${baseSentenceNumber} if this is not the first chunk.`,
    `Output Format: Return ONLY a single JSON object.`,
    `If this is the first chunk, the JSON should be: {"topic": "Calculated Topic", "category": "Calculated Category", "claims": [ ... claims list ... ]}`,
    `If this is NOT the first chunk, the JSON should be: {"claims": [ ... claims list ... ]} (topic and category are only for the first chunk).`,
    `Example for a single sentence with two claims (assuming it's the 5th sentence in the current chunk and baseSentenceNumber is 0):`,
    `   {"claim_id": "sentence_5_part_a", "claim_text": "Paris is the capital of France.", "original_sentence": "Paris, known for the Eiffel Tower, is the capital of France and a major global city.", "sentence_number": 5},`,
    `   {"claim_id": "sentence_5_part_b", "claim_text": "Paris is a major global city.", "original_sentence": "Paris, known for the Eiffel Tower, is the capital of France and a major global city.", "sentence_number": 5}`,
    `If no claims are found in a sentence, do not include an entry for that sentence. If no claims are found in the entire text, return an empty "claims" array.`,
    `Prioritize extracting claims from distinct parts of compound sentences.`,
    `Text to analyze (chunk ${chunkId || '1'}):`
  );

  // Add sentences with numbering for the LLM to reference
  sentencesForPrompt.forEach((sentence, index) => {
    promptParts.push(`Sentence ${index + 1}: ${sentence}`);
  });
  
  const fullPrompt = promptParts.join('\n\n');

  try {
    const result = await model.generateContent(fullPrompt);
    const response = result.response;
    let text = response.text();
    
    text = text.trim();
    // Minimal cleaning, assuming responseMimeType handles JSON structure
    if (text.startsWith("```json")) text = text.substring(7);
    if (text.endsWith("```")) text = text.substring(0, text.length - 3);
    text = text.trim();

    let parsedResponse: Partial<ExtractionResponse>;
    try {
      parsedResponse = JSON.parse(text);
    } catch (parseError) {
      console.error(`Failed to parse Gemini response for chunk ${chunkId || 'direct'}. Raw text (first 500 chars):`, text.substring(0,500), parseError);
      // Attempt to find a valid JSON array for claims if the main object fails
      const claimsMatch = text.match(/"claims"\s*:\s*(\[.*?\])/s);
      if (claimsMatch && claimsMatch[1]) {
        try {
          const claimsArray = JSON.parse(claimsMatch[1]);
          parsedResponse = { claims: claimsArray };
          if (isFirstChunk) {
            parsedResponse.topic = "Error in topic/category extraction";
            parsedResponse.category = "Error";
          }
        } catch (nestedParseError) {
          console.error(`Nested JSON parsing also failed for chunk ${chunkId || 'direct'}.`, nestedParseError);
          throw new Error('Invalid JSON response from AI for claims extraction.');
        }
      } else {
        throw new Error('Invalid JSON response structure from AI for claims extraction.');
      }
    }

    const finalResponse: ExtractionResponse = {
        topic: isFirstChunk ? parsedResponse.topic || analysis.topic || "General" : analysis.topic || "General", // Use existing analysis topic if not first chunk
        category: isFirstChunk ? parsedResponse.category || analysis.category || "Other" : analysis.category || "Other",
        claims: [],
    };

    if (parsedResponse.claims && Array.isArray(parsedResponse.claims)) {
      finalResponse.claims = parsedResponse.claims.filter(claim => 
        claim && 
        typeof claim.claim_id === 'string' &&
        typeof claim.claim_text === 'string' && claim.claim_text.length > 5 && claim.claim_text.length <= 250 && // Adjusted max length
        typeof claim.original_sentence === 'string' && claim.original_sentence.length > 5 && claim.original_sentence.length <= 400 && // Adjusted max length
        typeof claim.sentence_number === 'number' && claim.sentence_number > 0
      ).map(claim => ({
          ...claim,
          claim_text: claim.claim_text.substring(0,250), // Ensure max length
          original_sentence: claim.original_sentence.substring(0,400), // Ensure max length
          // Adjust sentence number by baseSentenceNumber for subsequent chunks
          sentence_number: claim.sentence_number + (isFirstChunk ? 0 : baseSentenceNumber),
          claim_id: `${chunkId ? chunkId + '_' : ''}sentence_${claim.sentence_number + (isFirstChunk ? 0 : baseSentenceNumber)}${claim.claim_id.includes('_part_') ? '_' + claim.claim_id.split('_part_')[1] : ''}`
      }));
    } else {
        console.warn(`No claims array found or it's not an array in response for chunk ${chunkId || 'direct'}.`);
    }
    
    return finalResponse;

  } catch (error) {
    console.error(`Error extracting topic/category/claims for chunk ${chunkId || 'direct'}:`, error);
    throw error; // Re-throw to be caught by the main handler
  }
}

function removeDuplicateClaims(claims: Claim[]): Claim[] {
  const seen = new Set<string>();
  const unique: Claim[] = [];
  
  for (const claim of claims) {
    // Normalize based on claim text and original sentence to avoid minor rephrasing issues
    const key = `${claim.claim_text.toLowerCase().trim()}|${claim.original_sentence.toLowerCase().trim()}`;
    
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(claim);
    }
  }
  return unique;
}
