"use client";

import Link from "next/link";
import { useState, FormEvent, useRef, useEffect } from "react";
import ClaimsListResults from "./ClaimsListResult";
import LoadingMessages from "./ui/LoadingMessages";
import PreviewBox from "./PreviewBox";
import DocumentSummary from "./DocumentSummary";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import ShareButtons from "./ui/ShareButtons";
import { getAssetPath } from "@/lib/utils";

interface Claim {
    claim: string;
    original_text: string;
}

type FactCheckResponse = {
  claim: string;
  assessment: "True" | "False" | "Insufficient Information";
  summary: string;
  fixed_original_text: string;
  confidence_score: number;
  two_step_verification?: {
    reality_check: "GO" | "CHECK" | "NO GO";
    reality_check_reason: string;
    reliability_check: "GO" | "CHECK" | "NO GO";
    reliability_check_reason: string;
    final_verdict: "GO" | "CHECK" | "NO GO";
  };
};

export default function FactChecker() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [factCheckResults, setFactCheckResults] = useState<any[]>([]);
  const [articleContent, setArticleContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showAllClaims, setShowAllClaims] = useState(true);

  // Create a ref for the loading or bottom section
  const loadingRef = useRef<HTMLDivElement>(null);

  // Function to scroll to the loading section
  const scrollToLoading = () => {
    loadingRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Watch for changes to `isGenerating` and scroll when it becomes `true`
  useEffect(() => {
    if (isGenerating) {
      scrollToLoading();
    }
  }, [isGenerating]);

  // Function to adjust textarea height
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = '150px';
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.min(scrollHeight, 300)}px`;
    }
  };

  // Adjust height when content changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [articleContent]);

  // Extract claims function
  const extractClaims = async (content: string) => {
    const response = await fetch(getAssetPath('/api/extractclaims'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to extract claims.');
    }

    const data = await response.json();
    return Array.isArray(data.claims) ? data.claims : JSON.parse(data.claims);
  };

  // SerperSearch function
  const serperSearch = async (claim: string) => {
    console.log(`Claim received in serper search: ${claim}`);

    const response = await fetch(getAssetPath('/api/exasearch'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ claim }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch verification for claim.');
    }

    const data = await response.json();
    return data;
  };

  // Verify claims function
  const verifyClaim = async (claim: string, original_text: string, searchSources: any) => {
    const response = await fetch(getAssetPath('/api/verifyclaims'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ claim, original_text, exasources: searchSources }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to verify claim.');
    }

    const data = await response.json();
    console.log("VerifyClaim response:", data.claims);

    return data.claims as FactCheckResponse;
  };

  // Fact check function
  const factCheck = async (e: FormEvent) => {
    e.preventDefault();

    if (!articleContent) {
      setError("Please enter some content or try with sample blog.");
      return;
    }

    if (articleContent.length < 50) {
      setError("Too short. Please enter at least 50 characters.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setFactCheckResults([]);

    try {
      const claims = await extractClaims(articleContent);
      const finalResults = await Promise.all(
        claims.map(async ({ claim, original_text }: Claim) => {
          try {
            const searchSources = await serperSearch(claim);

            // Check if sources were found; if not, return null or an "Insufficient Info" structure
            if (!searchSources?.results?.length) {
              console.warn(`No .org sources found for claim: ${claim}`);
              // Optionally return a structure indicating insufficient info if needed downstream
              return {
                claim,
                assessment: "Insufficient Information",
                summary: "No .org sources found to verify this claim.",
                fixed_original_text: original_text,
                confidence_score: 0,
                original_text,
                url_sources: [],
                two_step_verification: {
                    reality_check: "NO GO",
                    reality_check_reason: "No .org sources found.",
                    reliability_check: "NO GO",
                    reliability_check_reason: "Cannot assess reliability without sources.",
                    final_verdict: "NO GO",
                }
              };
            }

            const sourceUrls = searchSources.results.map((result: { url: any; }) => result.url);

            const verifiedClaim = await verifyClaim(claim, original_text, searchSources.results);

            return {
              ...verifiedClaim,
              original_text,
              url_sources: sourceUrls,
              two_step_verification: verifiedClaim.two_step_verification
            };
          } catch (error) {
            console.error(`Failed to verify claim: ${claim}`, error);
            return null; // Or return an error structure
          }
        })
      );

      setFactCheckResults(finalResults.filter(result => result !== null));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An unexpected error occurred.');
      setFactCheckResults([]);
    } finally {
      setIsGenerating(false);
    }
  };


  // Sample blog content
  const sampleBlog = `The Eiffel Tower, a remarkable iron lattice structure standing proudly in Paris, was originally built as a giant sundial in 1822, intended to cast shadows across the city to mark the hours. Designed by the renowned architect Gustave Eiffel, the tower stands 330 meters tall and once housed the city's first observatory.\n\nWhile it's famously known for hosting over 7 million visitors annually, it was initially disliked by Parisians. Interestingly, the Eiffel Tower was used as to guide ships along the Seine during cloudy nights.`;

  // Load sample content function
  const loadSampleContent = () => {
    setArticleContent(sampleBlog);
    setError(null);
  };

  return (
    <div className="flex flex-col min-h-screen z-0">
      <main className="flex flex-col items-center justify-center flex-grow w-full max-w-6xl md:max-w-4xl p-6 pt-20">
        <div className="text-left">
          <h1 className="md:text-5xl text-3xl pb-4 font-medium text-gray-900 opacity-0 animate-fade-up [animation-delay:200ms]">
            AI Hallucination
            <span className="text-gray-600"> Detector</span>
          </h1>

          <p className="text-gray-600 mb-12 text-lg opacity-0 animate-fade-up [animation-delay:400ms]">
            Verify your content accuracy with real-time web search.
          </p>
        </div>

        <form onSubmit={factCheck} className="space-y-6 w-full mb-10">
          <textarea
            ref={textareaRef}
            value={articleContent}
            onChange={(e) => setArticleContent(e.target.value)}
            placeholder="Enter your content to fact-check..."
            className="w-full bg-white p-4 border-2 border-gray-200 rounded-md outline-none focus:border-gray-400 resize-none min-h-[150px] max-h-[250px] overflow-auto opacity-0 animate-fade-up [animation-delay:600ms] transition-all duration-200 text-gray-800"
          />

          <div className="pb-5">
            <button
              onClick={loadSampleContent}
              disabled={isGenerating}
              className={`px-4 py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-md hover:bg-gray-50 hover:border-gray-400 transition-all opacity-0 animate-fade-up [animation-delay:800ms] ${
                isGenerating ? 'cursor-not-allowed opacity-50' : ''
              }`}
            >
              Try with sample content
            </button>
          </div>

          <button
            type="submit"
            className={`w-full text-white mb-10 font-medium px-2 py-3 rounded-md transition-all opacity-0 animate-fade-up [animation-delay:1000ms] min-h-[50px] ${
              isGenerating ? 'bg-gray-400' : 'bg-gray-800 hover:bg-gray-900'
            }`}
            disabled={isGenerating}
          >
            {isGenerating ? 'Analyzing Content...' : 'Check for Hallucinations'}
          </button>
        </form>

        {isGenerating && (
            <div ref={loadingRef} className="w-full">
            <LoadingMessages isGenerating={isGenerating} />
            </div>
        )}

        {error && (
          <div className="mt-1 mb-14 p-4 bg-red-50 border border-red-200 animate-fade-up text-red-700 rounded-md">
            {error}
          </div>
        )}

        {factCheckResults.length > 0 && (
        <div className="space-y-14 mt-5 mb-32">
            {/* Add Document Summary */}
            <DocumentSummary results={factCheckResults} />

            <PreviewBox
              content={articleContent}
              claims={factCheckResults}
            />
            <div className="mt-4 pt-12 opacity-0 animate-fade-up [animation-delay:800ms]">
                <button
                onClick={() => setShowAllClaims(!showAllClaims)}
                className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 font-medium"
                >
                {showAllClaims ? (
                    <>
                    <span>Hide Detailed Analysis</span>
                    <ChevronUp size={20} />
                    </>
                ) : (
                    <>
                    <span>Show Detailed Analysis</span>
                    <ChevronDown size={20} />
                    </>
                )}
                </button>

                {/* Claims List */}
                {showAllClaims && (
                <div>
                    <ClaimsListResults results={factCheckResults} />
                </div>
                )}
            </div>
            <ShareButtons />
        </div>
        )}
      </main>

      {/* FOOTER REMOVED */}
    </div>
  );
}