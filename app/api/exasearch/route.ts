// app/api/exasearch/route.ts
import { NextRequest, NextResponse } from 'next/server';

interface SearchResult {
  text: string;
  url: string;
}

interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

interface SerperResponse {
  organic: SerperResult[];
}

export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const body = await req.json();
    const { claim } = body;

    if (!claim) {
      return NextResponse.json(
        { error: 'Claim is required' },
        { status: 400 }
      );
    }

    const serperApiKey = process.env.SERPER_API_KEY;
    if (!serperApiKey) {
      return NextResponse.json(
        { error: 'Serper API key is not configured' },
        { status: 500 }
      );
    }

    console.log(`Searching ONLY .org sites for claim: ${claim}`);

    const results: SearchResult[] = [];

    // Perform only one search, specifically for .org sites
    const orgResponse = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': serperApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: `site:org ${claim}`,
        num: 10, // Request more results to increase chances of finding .org links
      }),
    });

    if (!orgResponse.ok) {
        console.error(`Serper API error: ${orgResponse.status}`);
        // Return an empty array in case of Serper error to avoid breaking the flow
        return NextResponse.json({ results: [] });
    }

    const orgData: SerperResponse = await orgResponse.json();

    // Add ONLY .org results
    if (orgData.organic && Array.isArray(orgData.organic)) {
      for (const result of orgData.organic) {
        // Strict check to ensure the link is a .org domain and has a snippet
        if (result.snippet && result.link) {
            try {
                const url = new URL(result.link);
                if (url.hostname.endsWith('.org')) {
                    const text = `${result.title}. ${result.snippet}`;
                    results.push({
                        text: text,
                        url: result.link
                    });
                }
            } catch (urlError) {
                console.warn(`Could not parse URL, skipping: ${result.link}`, urlError);
            }
        }
      }
    }

    console.log(`Returning ${results.length} .org results.`);

    // Return whatever .org results were found, even if it's 0.
    return NextResponse.json({ results: results });

  } catch (error) {
    console.error('Search API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { error: `Failed to perform search: ${errorMessage}` },
      { status: 500 }
    );
  }
}