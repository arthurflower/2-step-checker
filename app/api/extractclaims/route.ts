// app/api/extractclaims/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { apiCache } from '@/lib/cacheManager';

// This function can run for a maximum of 60 seconds
export const maxDuration = 60;

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

    // Check cache first
    if (useCache) {
      const cachedClaims = apiCache.getClaims(content);
      if (cachedClaims) {
        console.log('Returning cached claims');
        return NextResponse.json({ 
          claims: cachedClaims,
          fromCache: true 
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
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `You are an expert at extracting claims from text.
Your task is to identify and list all claims present, true or false, in the given text. Each claim should be a verifiable statement.

If the input content is very lengthy, then pick the major claims.

Don't repeat the same claim.

For each claim, also provide the original part of the sentence from which the claim is derived.
Present the claims as a JSON array of objects. Each object should have two keys:
- "claim": the extracted claim in a single verifiable statement.
- "original_text": the portion of the original text that supports or contains the claim.

Do not include any additional text or commentary.

Here is the content: ${content}

Return the output strictly as a JSON array of objects following this schema:
[
  {
    "claim": "extracted claim here",
    "original_text": "original text portion here"
  },
  ...
]

Output the result as valid JSON, strictly adhering to the defined schema. Ensure there are no markdown codes or additional elements included in the output. Do not add anything else. Return only JSON.`;

    // Generate content with Gemini
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Clean the response to ensure it's valid JSON
    let cleanedText = text.trim();

    // Remove markdown code blocks if present
    cleanedText = cleanedText.replace(/```json\s*/g, '');
    cleanedText = cleanedText.replace(/```\s*/g, '');
    cleanedText = cleanedText.trim();

    // Try to parse the JSON
    let claims: Claim[];
    try {
      claims = JSON.parse(cleanedText);

      // Validate the structure
      if (!Array.isArray(claims)) {
        throw new Error('Response is not an array');
      }

      // Validate each claim object
      for (const claim of claims) {
        if (!claim.claim || !claim.original_text) {
          throw new Error('Invalid claim structure');
        }
      }
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', cleanedText);
      console.error('Parse error:', parseError);

      return NextResponse.json(
        { error: 'Failed to parse AI response. Please try again.' },
        { status: 500 }
      );
    }

    // Cache the results
    if (useCache) {
      apiCache.setClaims(content, claims);
    }

    return NextResponse.json({ 
      claims,
      fromCache: false 
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