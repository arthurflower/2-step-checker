// components/FactChecker.tsx
"use client";

import Link from "next/link";
import { useState, FormEvent, useRef, useEffect, useMemo } from "react";
import ClaimsListResults from "./ClaimsListResult";
import LoadingMessages from "./ui/LoadingMessages";
import PreviewBox from "./PreviewBox";
import DocumentSummary from "./DocumentSummary";
import { ChevronDown, ChevronRight, ChevronUp, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import ShareButtons from "./ui/ShareButtons";
import { getAssetPath } from "@/lib/utils";
import { ContentAnalyzer } from "@/lib/contentAnalyzer";

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

// Progress tracking interface
interface ProgressUpdate {
  stage: 'extracting' | 'searching' | 'verifying' | 'complete';
  current: number;
  total: number;
  message: string;
}

export default function FactChecker() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [factCheckResults, setFactCheckResults] = useState<any[]>([]);
  const [articleContent, setArticleContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [showProblematicOnly, setShowProblematicOnly] = useState(true);
  const [contentAnalysis, setContentAnalysis] = useState<any>(null);
  const [showAnalysisWarning, setShowAnalysisWarning] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Create a ref for the loading or bottom section
  const loadingRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

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

  // Scroll to results when they're available
  useEffect(() => {
    if (factCheckResults.length > 0) {
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [factCheckResults]);

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

  // Categorize results
  const categorizedResults = useMemo(() => {
    const problematic = factCheckResults.filter(
      result => result.assessment.toLowerCase() === 'false' || 
      result.two_step_verification?.final_verdict === 'NO GO' ||
      result.two_step_verification?.final_verdict === 'CHECK'
    );
    
    const verified = factCheckResults.filter(
      result => result.assessment.toLowerCase() === 'true' && 
      result.two_step_verification?.final_verdict === 'GO'
    );

    return { problematic, verified };
  }, [factCheckResults]);

  // Extract claims function with better error handling
  const extractClaims = async (content: string) => {
    const response = await fetch(getAssetPath('/api/extractclaims'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to extract claims.');
    }

    // Store the analysis data if available
    if (data.analysis) {
      setContentAnalysis(data.analysis);
    }

    // Check if we got valid claims
    let claims = data.claims;
    if (!Array.isArray(claims) || claims.length === 0) {
      throw new Error('No valid claims could be extracted from the content.');
    }

    return claims;
  };

  // SerperSearch function with retry logic
  const serperSearch = async (claim: string, retries = 2) => {
    for (let i = 0; i <= retries; i++) {
      try {
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
      } catch (error) {
        if (i === retries) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
      }
    }
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
    return data.claims as FactCheckResponse;
  };

  // Batch process claims in parallel
  const processBatch = async (
    claims: Claim[], 
    batchSize: number = 3,
    onProgress: (current: number, total: number) => void
  ) => {
    const results = [];
    
    for (let i = 0; i < claims.length; i += batchSize) {
      const batch = claims.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async ({ claim, original_text }) => {
          try {
            const searchSources = await serperSearch(claim);
            
            if (!searchSources?.results?.length) {
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
            return null;
          }
        })
      );
      
      results.push(...batchResults.filter(result => result !== null));
      onProgress(Math.min(i + batchSize, claims.length), claims.length);
    }
    
    return results;
  };

  // Main fact check function with improved error handling
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

    // Analyze content before processing
    const analysis = ContentAnalyzer.analyze(articleContent);
    setContentAnalysis(analysis);

    // Show warning for large documents
    if (analysis.wordCount > 10000) {
      setShowAnalysisWarning(true);
      setError(`Your document contains ${analysis.wordCount.toLocaleString()} words (approximately ${analysis.estimatedPages} pages). Processing will take approximately ${Math.ceil(analysis.estimatedProcessingTime / 60)} minutes. Consider breaking it into smaller sections for faster results.`);
      return;
    }

    setIsGenerating(true);
    setError(null);
    setFactCheckResults([]);
    setProgress(null);
    setShowAnalysisWarning(false);

    try {
      // Extract claims with better progress messaging
      setProgress({
        stage: 'extracting',
        current: 0,
        total: 1,
        message: `Analyzing ${analysis.wordCount.toLocaleString()} words and extracting claims...`
      });
      
      const claims = await extractClaims(articleContent);
      
      // Limit claims for very large documents
      let processableClaims = claims;
      if (claims.length > 100) {
        setError(`Found ${claims.length} claims. Processing the first 100 most relevant claims.`);
        processableClaims = claims.slice(0, 100);
      }
      
      // Process claims in parallel batches
      setProgress({
        stage: 'searching',
        current: 0,
        total: processableClaims.length,
        message: `Verifying ${processableClaims.length} claims...`
      });
      
      const finalResults = await processBatch(
        processableClaims,
        3, // Process 3 claims at a time
        (current, total) => {
          setProgress({
            stage: 'verifying',
            current,
            total,
            message: `Verified ${current} of ${total} claims...`
          });
        }
      );

      setFactCheckResults(finalResults);
      setProgress({
        stage: 'complete',
        current: finalResults.length,
        total: finalResults.length,
        message: 'Analysis complete!'
      });
    } catch (error) {
      console.error('Fact check error:', error);
      setError(error instanceof Error ? error.message : 'An unexpected error occurred.');
      setFactCheckResults([]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Process anyway function for large documents
  const processLargeDocument = (e: MouseEvent<HTMLButtonElement>) => {
    setShowAnalysisWarning(false);
    setError(null);
    factCheck(e as any);
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
              type="button"
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

        {/* Analysis Warning for Large Documents */}
        {showAnalysisWarning && contentAnalysis && (
          <div className="mt-4 mb-10 p-4 bg-yellow-50 border border-yellow-200 rounded-md animate-fade-up w-full">
            <h3 className="font-semibold text-yellow-800 mb-2 flex items-center">
              <AlertTriangle className="mr-2" size={20} />
              Large Document Detected
            </h3>
            <div className="text-yellow-700 space-y-1 text-sm">
              <p>• Words: {contentAnalysis.wordCount.toLocaleString()}</p>
              <p>• Estimated pages: {contentAnalysis.estimatedPages}</p>
              <p>• Estimated processing time: {Math.ceil(contentAnalysis.estimatedProcessingTime / 60)} minutes</p>
              <p>• Strategy: {contentAnalysis.processingStrategy === 'chunked' ? 'Will process in chunks' : 'Direct processing'}</p>
            </div>
            <div className="mt-3 space-y-2">
              <button
                onClick={processLargeDocument}
                className="w-full bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 transition-all"
              >
                Process Anyway
              </button>
              <p className="text-xs text-yellow-600 text-center">
                Tip: For faster results, consider processing one chapter at a time
              </p>
            </div>
          </div>
        )}

        {isGenerating && (
          <div ref={loadingRef} className="w-full">
            <LoadingMessages 
              isGenerating={isGenerating} 
              progress={progress}
            />
          </div>
        )}

        {error && !showAnalysisWarning && (
          <div className="mt-1 mb-14 p-4 bg-red-50 border border-red-200 animate-fade-up text-red-700 rounded-md">
            {error}
          </div>
        )}

        {factCheckResults.length > 0 && (
          <div ref={resultsRef} className="space-y-14 mt-5 mb-32 w-full">
            {/* Document Summary */}
            <DocumentSummary results={factCheckResults} />

            {/* Preview Box */}
            <PreviewBox
              content={articleContent}
              claims={factCheckResults}
            />

            {/* Results Section with Toggle */}
            <div className="mt-4 pt-12 opacity-0 animate-fade-up [animation-delay:800ms]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-gray-900">
                  Detailed Analysis
                </h2>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowProblematicOnly(!showProblematicOnly)}
                    className={`px-4 py-2 rounded-md font-medium transition-all ${
                      showProblematicOnly 
                        ? 'bg-red-100 text-red-700 border border-red-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200'
                    }`}
                  >
                    <XCircle size={16} className="inline mr-2" />
                    Issues Only ({categorizedResults.problematic.length})
                  </button>
                  
                  <button
                    onClick={() => setShowProblematicOnly(!showProblematicOnly)}
                    className={`px-4 py-2 rounded-md font-medium transition-all ${
                      !showProblematicOnly 
                        ? 'bg-green-100 text-green-700 border border-green-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200'
                    }`}
                  >
                    <CheckCircle size={16} className="inline mr-2" />
                    Show All ({factCheckResults.length})
                  </button>
                </div>
              </div>

              {/* Problematic Claims */}
              {showProblematicOnly && categorizedResults.problematic.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-red-700 mb-4 flex items-center">
                    <AlertTriangle size={20} className="mr-2" />
                    Claims Requiring Attention
                  </h3>
                  <ClaimsListResults results={categorizedResults.problematic} />
                </div>
              )}

              {/* Verified Claims Summary */}
              {showProblematicOnly && categorizedResults.verified.length > 0 && (
                <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h3 className="text-lg font-semibold text-green-700 mb-2">
                    ✓ {categorizedResults.verified.length} Claims Verified
                  </h3>
                  <p className="text-green-600">
                    The following claims were verified and found to be accurate:
                  </p>
                  <ul className="mt-2 space-y-1">
                    {categorizedResults.verified.slice(0, 3).map((result, idx) => (
                      <li key={idx} className="text-sm text-green-600">
                        • {result.claim.substring(0, 80)}...
                      </li>
                    ))}
                    {categorizedResults.verified.length > 3 && (
                      <li className="text-sm text-green-600 italic">
                        And {categorizedResults.verified.length - 3} more verified claims
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* All Claims View */}
              {!showProblematicOnly && (
                <ClaimsListResults results={factCheckResults} />
              )}
            </div>

            <ShareButtons />
          </div>
        )}
      </main>
    </div>
  );
}