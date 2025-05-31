// app/api/exasearch/route.ts
import { NextRequest, NextResponse } from 'next/server';

interface SearchResult {
  text: string;
  url: string;
  source_type: 'org' | 'edu_gov' | 'other'; // Flag to indicate source quality
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

// Helper to determine source type
const getDomainInfo = (link: string): { hostname: string; source_type: 'org' | 'edu_gov' | 'other' } => {
    try {
        const url = new URL(link);
        const hostname = url.hostname.replace('www.', '');
        if (hostname.endsWith('.org')) return { hostname, source_type: 'org' };
        if (hostname.endsWith('.edu') || hostname.endsWith('.gov')) return { hostname, source_type: 'edu_gov' };
        return { hostname, source_type: 'other' };
    } catch (e) {
        return { hostname: link, source_type: 'other' };
    }
};

// Helper to perform search and handle errors
const performSearch = async (query: string, apiKey: string, num: number): Promise<SerperResult[]> => {
    try {
        const response = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: query, num: num }),
        });
        if (!response.ok) {
            console.warn(`Serper API error for query "${query}": ${response.status}`);
            return [];
        }
        const data: SerperResponse = await response.json();
        return (data.organic && Array.isArray(data.organic)) ? data.organic : [];
    } catch (error) {
        console.error(`Error during Serper search for "${query}":`, error);
        return [];
    }
};

export async function POST(req: NextRequest) {
  try {
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

    const allSerperResults: SerperResult[] = [];
    const seenUrls = new Set<string>();

    // 1. Broad Search (20 results)
    console.log(`Searching broadly for: ${claim}`);
    const generalResults = await performSearch(claim, serperApiKey, 20);
    allSerperResults.push(...generalResults);

    // 2. .org Search (10 results)
    console.log(`Searching .org for: ${claim}`);
    const orgResults = await performSearch(`site:org ${claim}`, serperApiKey, 10);
    allSerperResults.push(...orgResults);

    // 3. .edu/.gov Search (5 results)
    console.log(`Searching .edu/.gov for: ${claim}`);
    const eduGovResults = await performSearch(`site:edu OR site:gov ${claim}`, serperApiKey, 5);
    allSerperResults.push(...eduGovResults);

    // Process, Deduplicate, and Add Source Type
    const processedResults: SearchResult[] = [];
    for (const result of allSerperResults) {
        if (result.snippet && result.link && !seenUrls.has(result.link)) {
            const { source_type } = getDomainInfo(result.link);
            processedResults.push({
                text: `${result.title}. ${result.snippet}`,
                url: result.link,
                source_type: source_type,
            });
            seenUrls.add(result.link);
        }
    }

    // Prioritize results: .org > .edu_gov > other
    processedResults.sort((a, b) => {
        const priority = { 'org': 1, 'edu_gov': 2, 'other': 3 };
        return priority[a.source_type] - priority[b.source_type];
    });

    // Slice to get the top 10 (or fewer if less than 10 were found)
    const finalResults = processedResults.slice(0, 10);
    console.log(`Returning ${finalResults.length} prioritized results.`);

    return NextResponse.json({ results: finalResults });

  } catch (error) {
    console.error('Search API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { error: `Failed to perform search: ${errorMessage}` },
      { status: 500 }
    );
  }
}