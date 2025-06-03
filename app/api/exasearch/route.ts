// app/api/exasearch/route.ts
import { NextRequest, NextResponse } from 'next/server';

interface SearchResult {
  text: string;
  url: string;
  source_type: 'org' | 'edu_gov' | 'other';
  title?: string;
  publication_date?: string;
}

interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  date?: string;
  attributes?: { [key: string]: string };
}

interface SerperResponse {
  organic: SerperResult[];
}

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

const extractDate = (text: string, serperDate?: string): string | undefined => {
    if (serperDate) {
        try {
            const d = new Date(serperDate);
            if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        } catch (e) { /* ignore */ }
    }
    if (!text) return undefined;
    const monthDayYearMatch = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}/i);
    if (monthDayYearMatch) {
        try {
            const d = new Date(monthDayYearMatch[0]);
            if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        } catch (e) { /* ignore */ }
    }
    const ymdMatch = text.match(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/);
    if (ymdMatch) {
         try {
            const d = new Date(ymdMatch[0].replace(/\//g, '-'));
            if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        } catch (e) { /* ignore */ }
    }
    const dayMonthYearMatch = text.match(/\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/i);
    if (dayMonthYearMatch) {
         try {
            const d = new Date(dayMonthYearMatch[0]);
            if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        } catch (e) { /* ignore */ }
    }
    const yearMatch = text.match(/\b(20\d{2}|19\d{2})\b/);
    if (yearMatch) return yearMatch[0];
    return undefined;
};

const performSearch = async (query: string, apiKey: string, num: number): Promise<SerperResult[]> => {
    try {
        const response = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: query, num: num, autocompletion: false }),
        });
        if (!response.ok) {
            const errorBody = await response.text();
            console.warn(`Serper API error for query "${query}": ${response.status} - ${errorBody}`);
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
      return NextResponse.json({ error: 'Claim is required' }, { status: 400 });
    }

    const serperApiKey = process.env.SERPER_API_KEY;
    if (!serperApiKey) {
      return NextResponse.json({ error: 'Serper API key is not configured' }, { status: 500 });
    }

    const allSerperResults: SerperResult[] = [];
    const seenUrls = new Set<string>();

    // Increased number of results fetched
    const generalResults = await performSearch(claim, serperApiKey, 15); // Fetch more general results
    allSerperResults.push(...generalResults);

    const orgResults = await performSearch(`site:org "${claim}"`, serperApiKey, 10); // Fetch more .org
    allSerperResults.push(...orgResults);

    const eduGovResults = await performSearch(`(site:edu OR site:gov) "${claim}"`, serperApiKey, 10); // Fetch more .edu/.gov
    allSerperResults.push(...eduGovResults);

    const processedResults: SearchResult[] = [];
    for (const result of allSerperResults) {
        if (result.snippet && result.link && !seenUrls.has(result.link)) {
            const { source_type } = getDomainInfo(result.link);
            const publication_date = extractDate(result.snippet + (result.title || ''), result.date || result.attributes?.date);
            processedResults.push({
                title: result.title,
                text: result.snippet,
                url: result.link,
                source_type: source_type,
                publication_date: publication_date,
            });
            seenUrls.add(result.link);
        }
    }

    processedResults.sort((a, b) => {
        const priority = { 'edu_gov': 1, 'org': 2, 'other': 3 };
        return priority[a.source_type] - priority[b.source_type];
    });

    // Return up to 15 prioritized results
    const finalResults = processedResults.slice(0, 15);
    // console.log(`Returning ${finalResults.length} prioritized results for claim: "${claim.substring(0,50)}..."`);

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
