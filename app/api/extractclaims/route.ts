// app/api/extractclaims/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { apiCache } from '@/lib/cacheManager';
import { ContentAnalyzer } from '@/lib/contentAnalyzer';

// Increase timeout for large documents
export const maxDuration = 300; // 5 minutes

// Initialize the Gemini API with error handling
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set in environment variables');
}

const genAI = new GoogleGenerativeAI(apiKey || '');

interface Claim {
  claim: string;
  original_text: string;
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

    // Analyze content size
    const analysis = ContentAnalyzer.analyze(content);
    
    if (!analysis.canProcess) {
      return NextResponse.json(
        { 
          error: `Content too large. Maximum supported: ${ContentAnalyzer.LIMITS.MAX_WORDS_TOTAL.toLocaleString()} words (${Math.round(ContentAnalyzer.LIMITS.MAX_WORDS_TOTAL / ContentAnalyzer.LIMITS.WORDS_PER_PAGE)} pages). Your content: ${analysis.wordCount.toLocaleString()} words.`,
          analysis
        },
        { status: 400 }
      );
    }

    // Check cache first
    if (useCache) {
      const cachedClaims = apiCache.getClaims(content);
      if (cachedClaims) {
        console.log('Returning cached claims');
        return NextResponse.json({ 
          claims: cachedClaims,
          fromCache: true,
          analysis
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
        maxOutputTokens: 8192, // Increase token limit
      }
    });

    let allClaims: Claim[] = [];

    // Process based on strategy
    if (analysis.processingStrategy === 'direct') {
      // Process entire content at once
      allClaims = await extractClaimsFromContent(model, content, analysis.estimatedClaims);
    } else if (analysis.processingStrategy === 'chunked' && analysis.chunks) {
      // Process in chunks
      console.log(`Processing ${analysis.chunks.length} chunks`);
      
      for (const chunk of analysis.chunks) {
        try {
          const chunkClaims = await extractClaimsFromContent(
            model, 
            chunk.content, 
            Math.ceil(chunk.wordCount / ContentAnalyzer.LIMITS.WORDS_PER_PAGE * ContentAnalyzer.LIMITS.AVG_CLAIMS_PER_PAGE)
          );
          allClaims.push(...chunkClaims);
          
          // Add small delay between chunks to avoid rate limiting
          if (analysis.chunks.indexOf(chunk) < analysis.chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (chunkError) {
          console.error(`Error processing chunk ${chunk.id}:`, chunkError);
          // Continue with other chunks even if one fails
        }
      }
    }

    // Remove duplicate claims
    const uniqueClaims = removeDuplicateClaims(allClaims);

    // Cache the results
    if (useCache && uniqueClaims.length > 0) {
      apiCache.setClaims(content, uniqueClaims);
    }

    return NextResponse.json({ 
      claims: uniqueClaims,
      fromCache: false,
      analysis,
      totalClaims: uniqueClaims.length
    });

  } catch (error) {
    console.error('Extract claims API error:', error);

    // Handle specific error types
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return NextResponse.json(
        { error: 'Network error. Please check your connection and try again.' },
        { status: 500 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    return NextResponse.json(
      { error: `Failed to extract claims: ${errorMessage}` },
      { status: 500 }
    );
  }
}

async function extractClaimsFromContent(
  model: any, 
  content: string, 
  estimatedClaims: number
): Promise<Claim[]> {
  // Adjust prompt based on content size
  const claimLimit = Math.min(estimatedClaims * 2, 50); // Cap at 50 claims per chunk
  
  const prompt = `You are an expert at extracting claims from text.
Your task is to identify and list the ${claimLimit} most important verifiable claims in the given text.

Focus on:
1. Factual statements that can be verified
2. Statistical claims with numbers
3. Historical assertions
4. Scientific or medical claims
5. Statements about people, organizations, or events

Skip:
- Opinions or subjective statements
- Predictions about the future
- Vague or general statements
- Redundant claims

For each claim, provide:
- "claim": A clear, concise, verifiable statement
- "original_text": The exact text from the document (keep it brief, max 200 characters)

Return ONLY a JSON array, no other text or formatting:
[
  {
    "claim": "The Eiffel Tower is 330 meters tall",
    "original_text": "The Eiffel Tower stands 330 meters tall"
  }
]

Content to analyze:
${content.substring(0, 30000)} ${content.length > 30000 ? '...[truncated]' : ''}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    let text = response.text();

    // Clean the response more aggressively
    text = text.trim();
    
    // Remove any markdown formatting
    text = text.replace(/```json\s*/gi, '');
    text = text.replace(/```\s*/g, '');
    
    // Remove any non-JSON content before the array
    const arrayStart = text.indexOf('[');
    if (arrayStart > 0) {
      text = text.substring(arrayStart);
    }
    
    // Remove any non-JSON content after the array
    const arrayEnd = text.lastIndexOf(']');
    if (arrayEnd > 0 && arrayEnd < text.length - 1) {
      text = text.substring(0, arrayEnd + 1);
    }

    // Try to parse the JSON
    let claims: Claim[];
    try {
      claims = JSON.parse(text);

      // Validate the structure
      if (!Array.isArray(claims)) {
        throw new Error('Response is not an array');
      }

      // Filter and validate each claim
      claims = claims.filter(claim => {
        return claim && 
               typeof claim === 'object' && 
               typeof claim.claim === 'string' && 
               typeof claim.original_text === 'string' &&
               claim.claim.length > 10 && // Minimum claim length
               claim.claim.length < 500;   // Maximum claim length
      });

      // Truncate original_text if too long
      claims = claims.map(claim => ({
        ...claim,
        original_text: claim.original_text.substring(0, 200)
      }));

    } catch (parseError) {
      console.error('Failed to parse Gemini response:', text.substring(0, 500));
      throw new Error('Invalid JSON response from AI');
    }

    return claims;
  } catch (error) {
    console.error('Error extracting claims:', error);
    throw error;
  }
}

function removeDuplicateClaims(claims: Claim[]): Claim[] {
  const seen = new Set<string>();
  const unique: Claim[] = [];
  
  for (const claim of claims) {
    // Create a normalized key for comparison
    const key = claim.claim.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(claim);
    }
  }
  
  return unique;
}