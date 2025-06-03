// app/api/exasearch/route.ts - SEVERELY AGGRESSIVE SOURCE CHECKING
import { NextRequest, NextResponse } from "next/server";

interface SearchResult {
  text: string;
  url: string;
  source_type: "org" | "edu_gov" | "other";
  title?: string;
  publication_date?: string;
  authority_score?: number;
  relevance_score?: number;
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
  answerBox?: any;
  peopleAlsoAsk?: any[];
  relatedSearches?: any[];
}

const AGGRESSIVE_SEARCH_CONFIG = {
  MIN_ORG_SOURCES: 15, // Minimum .org sources required
  MIN_EDU_GOV_SOURCES: 10, // Minimum .edu/.gov sources
  MIN_TOTAL_SOURCES: 50, // Minimum total sources to examine
  MAX_SEARCH_ATTEMPTS: 8, // Number of different search strategies
  RELEVANCE_THRESHOLD: 0.3, // Minimum relevance score to include
  AUTHORITY_BOOST: {
    // Domain authority multipliers
    org: 2.0,
    edu: 3.0,
    gov: 3.5,
    "ac.uk": 2.5,
    academic: 2.0,
  },
};

const getDomainInfo = (
  link: string,
): {
  hostname: string;
  source_type: "org" | "edu_gov" | "other";
  authority_score: number;
} => {
  try {
    const url = new URL(link);
    const hostname = url.hostname.replace("www.", "").toLowerCase();

    // Enhanced authority scoring
    let authority_score = 1.0;
    let source_type: "org" | "edu_gov" | "other" = "other";

    if (hostname.endsWith(".org")) {
      source_type = "org";
      authority_score = AGGRESSIVE_SEARCH_CONFIG.AUTHORITY_BOOST.org;

      // Premium .org domains get extra boost
      const premiumOrgs = [
        "who.int",
        "unesco.org",
        "worldbank.org",
        "redcross.org",
        "nature.org",
        "acm.org",
        "ieee.org",
        "cancer.org",
        "heart.org",
      ];
      if (premiumOrgs.some((domain) => hostname.includes(domain))) {
        authority_score *= 1.5;
      }
    } else if (hostname.endsWith(".edu") || hostname.endsWith(".gov")) {
      source_type = "edu_gov";
      authority_score = hostname.endsWith(".gov")
        ? AGGRESSIVE_SEARCH_CONFIG.AUTHORITY_BOOST.gov
        : AGGRESSIVE_SEARCH_CONFIG.AUTHORITY_BOOST.edu;

      // Premium institutions get extra boost
      const premiumEdu = [
        "harvard.edu",
        "mit.edu",
        "stanford.edu",
        "oxford.ac.uk",
        "cambridge.ac.uk",
        "nih.gov",
        "cdc.gov",
        "nasa.gov",
      ];
      if (premiumEdu.some((domain) => hostname.includes(domain))) {
        authority_score *= 1.8;
      }
    } else if (hostname.endsWith(".ac.uk") || hostname.includes("academic")) {
      source_type = "edu_gov";
      authority_score = AGGRESSIVE_SEARCH_CONFIG.AUTHORITY_BOOST["ac.uk"];
    }

    return { hostname, source_type, authority_score };
  } catch (e) {
    return { hostname: link, source_type: "other", authority_score: 0.5 };
  }
};

const calculateRelevanceScore = (
  result: SerperResult,
  claim: string,
): number => {
  const claimWords = claim.toLowerCase().split(/\s+/);
  const snippet = (result.snippet || "").toLowerCase();
  const title = (result.title || "").toLowerCase();

  let relevanceScore = 0;

  // Check word overlap in snippet and title
  claimWords.forEach((word) => {
    if (word.length > 3) {
      // Skip short words
      if (snippet.includes(word)) relevanceScore += 0.1;
      if (title.includes(word)) relevanceScore += 0.15;
    }
  });

  // Boost for exact phrase matches
  if (snippet.includes(claim.toLowerCase())) relevanceScore += 0.3;
  if (title.includes(claim.toLowerCase())) relevanceScore += 0.4;

  // Position boost (higher positions are more relevant)
  const positionBoost = Math.max(0, ((20 - result.position) / 20) * 0.2);
  relevanceScore += positionBoost;

  return Math.min(1.0, relevanceScore);
};

const extractDate = (text: string, serperDate?: string): string | undefined => {
  if (serperDate) {
    try {
      const d = new Date(serperDate);
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    } catch (e) {
      /* ignore */
    }
  }

  if (!text) return undefined;

  // Enhanced date extraction patterns
  const patterns = [
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}/i,
    /\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/i,
    /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/,
    /\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/,
    /\b(20\d{2}|19\d{2})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const d = new Date(match[0].replace(/\//g, "-"));
        if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
      } catch (e) {
        /* continue */
      }
    }
  }

  return undefined;
};

const performAgressiveSearch = async (
  query: string,
  apiKey: string,
  searchType: string = "general",
): Promise<SerperResult[]> => {
  try {
    console.log(`🔍 AGGRESSIVE SEARCH [${searchType}]: "${query}"`);

    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: searchType === "org_focused" ? 50 : 30, // More results for .org searches
        gl: "us", // Geographic location
        hl: "en", // Language
        autocompletion: false,
        tbs: searchType === "recent" ? "qdr:y" : undefined, // Recent results for certain searches
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.warn(
        `Serper API error for ${searchType} query "${query}": ${response.status} - ${errorBody}`,
      );
      return [];
    }

    const data: SerperResponse = await response.json();
    const results = data.organic || [];

    console.log(`✅ ${searchType} search returned ${results.length} results`);
    return results;
  } catch (error) {
    console.error(
      `❌ Error during ${searchType} search for "${query}":`,
      error,
    );
    return [];
  }
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { claim } = body;

    if (!claim) {
      return NextResponse.json({ error: "Claim is required" }, { status: 400 });
    }

    const serperApiKey = process.env.SERPER_API_KEY;
    if (!serperApiKey) {
      return NextResponse.json(
        { error: "Serper API key is not configured" },
        { status: 500 },
      );
    }

    console.log(`🚀 INITIATING AGGRESSIVE SOURCE SEARCH for: "${claim}"`);

    const allSerperResults: SerperResult[] = [];
    const seenUrls = new Set<string>();

    // AGGRESSIVE SEARCH STRATEGY - Multiple targeted searches
    const searchStrategies = [
      // 1. General broad search
      { query: claim, type: "general" },

      // 2. Quoted exact phrase search
      { query: `"${claim}"`, type: "exact_phrase" },

      // 3. Heavy .org focus with multiple variations
      { query: `site:org "${claim}"`, type: "org_focused" },
      { query: `site:org ${claim}`, type: "org_variation" },
      { query: `site:org ${claim} research study`, type: "org_research" },
      { query: `site:org ${claim} facts evidence`, type: "org_evidence" },

      // 4. Educational and government sources
      { query: `(site:edu OR site:gov) "${claim}"`, type: "edu_gov" },
      { query: `site:edu ${claim} study research`, type: "edu_research" },
      { query: `site:gov ${claim} official data`, type: "gov_official" },

      // 5. Academic and research focus
      { query: `${claim} research paper study academic`, type: "academic" },
      { query: `${claim} peer reviewed journal`, type: "peer_reviewed" },

      // 6. Recent sources focus
      { query: `${claim} 2024 2023`, type: "recent" },

      // 7. International academic institutions
      { query: `site:ac.uk "${claim}"`, type: "uk_academic" },

      // 8. Fact-checking and verification focus
      { query: `${claim} fact check verification`, type: "fact_check" },
    ];

    // Execute all search strategies
    for (const strategy of searchStrategies) {
      const results = await performAgressiveSearch(
        strategy.query,
        serperApiKey,
        strategy.type,
      );
      allSerperResults.push(...results);

      // Add small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`📊 TOTAL RAW RESULTS: ${allSerperResults.length}`);

    // Process and score all results
    const processedResults: SearchResult[] = [];
    const orgSources: SearchResult[] = [];
    const eduGovSources: SearchResult[] = [];
    const otherSources: SearchResult[] = [];

    for (const result of allSerperResults) {
      if (result.snippet && result.link && !seenUrls.has(result.link)) {
        const { source_type, authority_score } = getDomainInfo(result.link);
        const relevance_score = calculateRelevanceScore(result, claim);

        // Only include if meets relevance threshold
        if (relevance_score >= AGGRESSIVE_SEARCH_CONFIG.RELEVANCE_THRESHOLD) {
          const publication_date = extractDate(
            result.snippet + (result.title || ""),
            result.date || result.attributes?.date,
          );

          const processedResult: SearchResult = {
            title: result.title,
            text: result.snippet,
            url: result.link,
            source_type: source_type,
            publication_date: publication_date,
            authority_score: authority_score,
            relevance_score: relevance_score,
          };

          // Categorize by source type
          if (source_type === "org") {
            orgSources.push(processedResult);
          } else if (source_type === "edu_gov") {
            eduGovSources.push(processedResult);
          } else {
            otherSources.push(processedResult);
          }

          seenUrls.add(result.link);
        }
      }
    }

    // Sort each category by combined authority and relevance score
    const sortByScore = (a: SearchResult, b: SearchResult) =>
      (b.authority_score || 1) * (b.relevance_score || 0.5) -
      (a.authority_score || 1) * (a.relevance_score || 0.5);

    orgSources.sort(sortByScore);
    eduGovSources.sort(sortByScore);
    otherSources.sort(sortByScore);

    console.log(`📈 CATEGORIZED RESULTS:`);
    console.log(`   .ORG Sources: ${orgSources.length}`);
    console.log(`   .EDU/.GOV Sources: ${eduGovSources.length}`);
    console.log(`   Other Sources: ${otherSources.length}`);

    // Ensure we meet minimum source requirements
    const finalResults: SearchResult[] = [];

    // Add top .org sources (minimum 15)
    finalResults.push(
      ...orgSources.slice(
        0,
        Math.max(AGGRESSIVE_SEARCH_CONFIG.MIN_ORG_SOURCES, orgSources.length),
      ),
    );

    // Add top .edu/.gov sources (minimum 10)
    finalResults.push(
      ...eduGovSources.slice(
        0,
        Math.max(
          AGGRESSIVE_SEARCH_CONFIG.MIN_EDU_GOV_SOURCES,
          eduGovSources.length,
        ),
      ),
    );

    // Fill remaining slots with other high-quality sources
    const remainingSlots =
      AGGRESSIVE_SEARCH_CONFIG.MIN_TOTAL_SOURCES - finalResults.length;
    if (remainingSlots > 0) {
      finalResults.push(...otherSources.slice(0, remainingSlots));
    }

    // Final sort by overall quality score
    finalResults.sort(sortByScore);

    console.log(`🎯 FINAL AGGRESSIVE RESULTS: ${finalResults.length} sources`);
    console.log(
      `   Target .ORG minimum: ${AGGRESSIVE_SEARCH_CONFIG.MIN_ORG_SOURCES}`,
    );
    console.log(
      `   Actual .ORG sources: ${finalResults.filter((r) => r.source_type === "org").length}`,
    );
    console.log(
      `   Target .EDU/.GOV minimum: ${AGGRESSIVE_SEARCH_CONFIG.MIN_EDU_GOV_SOURCES}`,
    );
    console.log(
      `   Actual .EDU/.GOV sources: ${finalResults.filter((r) => r.source_type === "edu_gov").length}`,
    );

    // Log quality metrics
    const avgAuthorityScore =
      finalResults.reduce((sum, r) => sum + (r.authority_score || 1), 0) /
      finalResults.length;
    const avgRelevanceScore =
      finalResults.reduce((sum, r) => sum + (r.relevance_score || 0.5), 0) /
      finalResults.length;

    console.log(`📊 QUALITY METRICS:`);
    console.log(`   Average Authority Score: ${avgAuthorityScore.toFixed(2)}`);
    console.log(`   Average Relevance Score: ${avgRelevanceScore.toFixed(2)}`);

    return NextResponse.json({
      results: finalResults,
      metadata: {
        total_raw_results: allSerperResults.length,
        org_sources: finalResults.filter((r) => r.source_type === "org").length,
        edu_gov_sources: finalResults.filter((r) => r.source_type === "edu_gov")
          .length,
        avg_authority_score: avgAuthorityScore,
        avg_relevance_score: avgRelevanceScore,
        search_strategies_used: searchStrategies.length,
      },
    });
  } catch (error) {
    console.error("❌ AGGRESSIVE SEARCH API ERROR:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json(
      { error: `Failed to perform aggressive source search: ${errorMessage}` },
      { status: 500 },
    );
  }
}
