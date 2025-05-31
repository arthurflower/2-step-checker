// components/FactChecker.tsx
"use client";

import { useState, FormEvent, useRef, useEffect, useMemo } from "react";
import ClaimsListResults from "./ClaimsListResult";
import LoadingMessages from "./ui/LoadingMessages";
import DocumentSummary from "./DocumentSummary";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
// import ShareButtons from "./ui/ShareButtons"; // Removed ShareButtons import
import { getAssetPath } from "@/lib/utils";

// Using the relative path again, ensure this path is correct for your project structure.
// If 'components' is at root and 'lib' is at root, '../lib/' is correct.
// If 'components' is inside 'app/', then it should be '../../lib/'.
import { ContentAnalyzer, ContentAnalysis } from "../lib/contentAnalyzer"; 

// Interface for claims extracted from the API
interface ExtractedClaim {
    claim_id: string;
    claim_text: string;
    original_sentence: string;
    sentence_number: number;
}

// Interface for the full response from claim extraction API
interface ExtractionApiResponse {
    topic: string;
    category: string;
    claims: ExtractedClaim[];
    fromCache: boolean;
    analysis: ContentAnalysis; 
    totalClaimsExtracted: number;
}


// Interface for the response from claim verification API (FactCheckResponse)
type FactCheckResponse = {
  claim_id: string;
  claim_text: string;
  assessment: "True" | "False" | "Ambiguous/Partially True" | "Insufficient Information";
  summary: string;
  fixed_original_text: string;
  confidence_score: number;
  two_step_verification?: {
    reality_check: "GO" | "CHECK" | "NO GO";
    reality_check_reason: string;
    reliability_check: "GO" | "CHECK" | "NO GO";
    reliability_check_reason: string;
    final_verdict: "GO" | "CHECK" | "NO GO";
    contradiction_level: "None" | "Low" | "Medium" | "High";
    source_quality_assessment: "Poor" | "Mixed" | "Good" | "Excellent";
  };
  original_sentence: string;
  sentence_number: number;
  url_sources?: string[]; 
};

// Progress tracking interface
interface ProgressUpdate {
  stage: 'analyzing_content' | 'extracting_claims' | 'searching_sources' | 'verifying_claims' | 'complete' | 'error';
  current: number;
  total: number;
  message: string;
}

export default function FactChecker() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [factCheckResults, setFactCheckResults] = useState<FactCheckResponse[]>([]);
  const [articleContent, setArticleContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [showProblematicOnly, setShowProblematicOnly] = useState(true);
  
  const [currentAnalysis, setCurrentAnalysis] = useState<ContentAnalysis | null>(null);
  const [showAnalysisWarning, setShowAnalysisWarning] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadingRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // This log is for debugging the ContentAnalyzer import. 
    // It can be removed once the import issue is confirmed resolved.
    console.log("FactChecker.tsx: ContentAnalyzer on mount/render:", ContentAnalyzer);
  }, []);

  const scrollToLoading = () => {
    loadingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  useEffect(() => {
    if (isGenerating && progress && progress.stage !== 'complete' && progress.stage !== 'error') {
      scrollToLoading();
    }
  }, [isGenerating, progress]);

  useEffect(() => {
    if (factCheckResults.length > 0 || (progress && (progress.stage === 'complete' || progress.stage === 'error'))) {
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [factCheckResults, progress]);

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto'; 
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.min(scrollHeight, 350)}px`; 
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [articleContent]);

  const categorizedResults = useMemo(() => {
    const problematic = factCheckResults.filter(
      result => result.assessment.toLowerCase() === 'false' || 
                result.assessment.toLowerCase() === 'ambiguous/partially true' ||
                result.two_step_verification?.final_verdict === 'NO GO' ||
                result.two_step_verification?.final_verdict === 'CHECK'
    );
    
    const verified = factCheckResults.filter(
      result => result.assessment.toLowerCase() === 'true' && 
      result.two_step_verification?.final_verdict === 'GO'
    );

    return { problematic, verified };
  }, [factCheckResults]);

  const extractClaimsAPI = async (content: string): Promise<ExtractionApiResponse> => {
    const response = await fetch(getAssetPath('/api/extractclaims'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to extract claims.');
    }
    return data as ExtractionApiResponse;
  };

  const serperSearchAPI = async (claimText: string, retries = 1) => { 
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetch(getAssetPath('/api/exasearch'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ claim: claimText }),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Serper search failed (status ${response.status})`);
        }
        return await response.json();
      } catch (error) {
        console.warn(`Serper search attempt ${i + 1} for "${claimText}" failed:`, error);
        if (i === retries) throw error;
        await new Promise(resolve => setTimeout(resolve, 750 * (i + 1))); 
      }
    }
  };

  const verifyClaimAPI = async (claimData: ExtractedClaim, searchSources: any, documentCategory?: string): Promise<FactCheckResponse> => {
    const response = await fetch(getAssetPath('/api/verifyclaims'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        claim_id: claimData.claim_id,
        claim_text: claimData.claim_text,
        original_sentence: claimData.original_sentence,
        sentence_number: claimData.sentence_number,
        exasources: searchSources,
        document_category: documentCategory 
      }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to verify claim.');
    }
    const data = await response.json();
    return data.claims as FactCheckResponse; 
  };

  const processBatchInParallel = async (
    claimsToVerify: ExtractedClaim[], 
    documentCategory?: string,
    batchSize: number = 3, 
    onProgressUpdate: (processedInBatch: number) => void
  ): Promise<FactCheckResponse[]> => {
    const allResults: FactCheckResponse[] = [];
    
    for (let i = 0; i < claimsToVerify.length; i += batchSize) {
      const batch = claimsToVerify.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (claim) => {
        try {
          setProgress(prev => ({
            ...prev!,
            stage: 'searching_sources',
            message: `Searching sources for claim (S${claim.sentence_number})...`
          }));
          const searchData = await serperSearchAPI(claim.claim_text);
          
          if (!searchData?.results?.length) {
            return {
              claim_id: claim.claim_id,
              claim_text: claim.claim_text,
              assessment: "Insufficient Information",
              summary: "No relevant sources found to verify this claim.",
              fixed_original_text: claim.original_sentence,
              confidence_score: 0,
              original_sentence: claim.original_sentence,
              sentence_number: claim.sentence_number,
              url_sources: [],
              two_step_verification: {
                reality_check: "NO GO", reality_check_reason: "No sources found.",
                reliability_check: "NO GO", reliability_check_reason: "Cannot assess reliability without sources.",
                contradiction_level: "None", source_quality_assessment: "Poor",
                final_verdict: "NO GO",
              }
            } as FactCheckResponse;
          }

          setProgress(prev => ({
            ...prev!,
            stage: 'verifying_claims',
            message: `Verifying claim (S${claim.sentence_number}) with ${searchData.results.length} sources...`
          }));
          const verifiedData = await verifyClaimAPI(claim, searchData.results, documentCategory);
          return { ...verifiedData, url_sources: searchData.results.map((r: any) => r.url) };
        } catch (error) {
          console.error(`Error processing claim (S${claim.sentence_number}): ${claim.claim_text}`, error);
          return { 
            claim_id: claim.claim_id,
            claim_text: claim.claim_text,
            assessment: "Insufficient Information", 
            summary: `Error during verification: ${error instanceof Error ? error.message : 'Unknown error'}`,
            fixed_original_text: claim.original_sentence,
            confidence_score: 0,
            original_sentence: claim.original_sentence,
            sentence_number: claim.sentence_number,
            url_sources: [],
            two_step_verification: {
              reality_check: "NO GO", reality_check_reason: "Verification process failed.",
              reliability_check: "NO GO", reliability_check_reason: "Verification process failed.",
              contradiction_level: "None", source_quality_assessment: "Poor",
              final_verdict: "NO GO",
            }
          } as FactCheckResponse;
        }
      });
      
      const resultsFromBatch = await Promise.all(batchPromises);
      allResults.push(...resultsFromBatch.filter(r => r !== null) as FactCheckResponse[]);
      onProgressUpdate(batch.length); 
    }
    return allResults;
  };

  const factCheck = async (e: FormEvent) => {
    e.preventDefault();
    if (!articleContent) {
      setError("Please enter some content or try with the sample.");
      return;
    }
    if (articleContent.length < 20) { 
      setError("Content is too short. Please enter at least 20 characters.");
      return;
    }

    // This log is for debugging the ContentAnalyzer import.
    console.log("FactChecker.tsx: ContentAnalyzer before calling analyze:", ContentAnalyzer); 
    if (typeof ContentAnalyzer === 'undefined' || !ContentAnalyzer) {
        setError("Critical error: ContentAnalyzer module is not loaded. Please check browser console for details and try a hard refresh (Ctrl+Shift+R).");
        setIsGenerating(false);
        return;
    }
    
    const initialAnalysis = ContentAnalyzer.analyze(articleContent); 
    setCurrentAnalysis(initialAnalysis); 

    if (initialAnalysis.wordCount > 10000 && !showAnalysisWarning) { 
      setShowAnalysisWarning(true);
      setError(`Your document has ${initialAnalysis.wordCount.toLocaleString()} words. Processing may take ~${Math.ceil(initialAnalysis.estimatedProcessingTime / 60)} mins. For faster results, consider smaller sections.`);
      return;
    }
    
    setIsGenerating(true);
    setError(null);
    setFactCheckResults([]);
    setProgress({
      stage: 'analyzing_content', current: 0, total: 1,
      message: `Performing initial analysis of ${initialAnalysis.wordCount.toLocaleString()} words...`
    });
    setShowAnalysisWarning(false); 

    try {
      setProgress(prev => ({ ...prev!, stage: 'extracting_claims', message: "Extracting claims and document details..." }));
      const extractionResponse = await extractClaimsAPI(articleContent);
      
      setCurrentAnalysis(extractionResponse.analysis); 
      
      const claimsToVerify = extractionResponse.claims;
      if (!claimsToVerify || claimsToVerify.length === 0) {
        setError("No verifiable claims were extracted from the content.");
        setProgress({ stage: 'error', current: 0, total: 0, message: "No claims found." });
        setIsGenerating(false);
        return;
      }

      let totalProcessedInVerification = 0;
      const finalResults = await processBatchInParallel(
        claimsToVerify,
        extractionResponse.category, 
        3, 
        (processedInBatch) => {
          totalProcessedInVerification += processedInBatch;
          setProgress({
            stage: 'verifying_claims',
            current: totalProcessedInVerification,
            total: claimsToVerify.length,
            message: `Verified ${totalProcessedInVerification} of ${claimsToVerify.length} claims...`
          });
        }
      );
      
      setFactCheckResults(finalResults);
      setProgress({
        stage: 'complete', current: finalResults.length, total: finalResults.length,
        message: 'Analysis complete!'
      });

    } catch (error) {
      console.error('Fact check process error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred during fact-checking.';
      setError(errorMessage);
      setProgress({ stage: 'error', current: 0, total: 0, message: errorMessage });
      setFactCheckResults([]); 
    } finally {
      setIsGenerating(false);
    }
  };

  const processLargeDocumentAnyway = (e: React.MouseEvent<HTMLButtonElement>) => {
    setShowAnalysisWarning(false); 
    setError(null); 
    factCheck(e as any); 
  };

  const sampleBlog = `The Eiffel Tower, a remarkable iron lattice structure standing proudly in Paris, was originally built as a giant sundial in 1822, intended to cast shadows across the city to mark the hours. Designed by the renowned architect Gustave Eiffel, the tower stands 330 meters tall and once housed the city's first observatory.\n\nWhile it's famously known for hosting over 7 million visitors annually, it was initially disliked by Parisians. Interestingly, the Eiffel Tower was used as to guide ships along the Seine during cloudy nights. Recent studies suggest its height varies by up to 15 cm due to temperature changes. It is painted every seven years to protect it from rust, a process that requires 60 tonnes of paint.`;

  const loadSampleContent = () => {
    setArticleContent(sampleBlog);
    setError(null);
    setCurrentAnalysis(null); 
    setFactCheckResults([]); 
    setProgress(null); 
  };

  return (
    <div className="flex flex-col min-h-screen z-0 w-full items-center">
      <main className="flex flex-col items-center justify-center flex-grow w-full max-w-5xl md:max-w-4xl p-4 md:p-6 pt-12 md:pt-20">
        <div className="text-center md:text-left w-full">
          <h1 className="text-3xl sm:text-4xl md:text-5xl pb-3 font-bold opacity-0 animate-fade-up [animation-delay:200ms] tracking-tight">
            AI Hallucination
            <span className="text-text-muted"> Detector</span>
          </h1>
          <p className="text-text-secondary mb-8 md:mb-12 text-base sm:text-lg opacity-0 animate-fade-up [animation-delay:400ms]">
            Verify content accuracy with sentence-level analysis and real-time web search.
          </p>
        </div>

        <form onSubmit={factCheck} className="space-y-6 w-full mb-10">
          <textarea
            ref={textareaRef}
            value={articleContent}
            onChange={(e) => {
              setArticleContent(e.target.value);
              adjustTextareaHeight(); 
            }}
            placeholder="Paste your text here to check for inaccuracies (min 20 characters)..."
            className="w-full p-4 border-2 border-surface-border-strong rounded-lg outline-none focus:border-accent-primary resize-none min-h-[150px] max-h-[350px] overflow-auto opacity-0 animate-fade-up [animation-delay:600ms] transition-all duration-200 text-text-primary bg-surface-glass leading-relaxed text-base"
          />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-5 opacity-0 animate-fade-up [animation-delay:800ms]">
            <button
              type="button"
              onClick={loadSampleContent}
              disabled={isGenerating}
              className={`btn-secondary px-5 py-2.5 text-sm ${
                isGenerating ? 'cursor-not-allowed opacity-60' : ''
              }`}
            >
              Try Sample Content
            </button>
            <button
              type="submit"
              className={`btn-primary w-full sm:w-auto px-6 py-3 text-base min-h-[50px] ${
                isGenerating ? 'opacity-60 cursor-not-allowed' : ''
              }`}
              disabled={isGenerating}
            >
              {isGenerating ? 'Analyzing...' : 'Check for Hallucinations'}
            </button>
          </div>
        </form>

        {showAnalysisWarning && currentAnalysis && (
          <div className="mt-4 mb-10 p-5 glass-card border-yellow-500/50 animate-fade-up w-full">
            <h3 className="font-semibold text-yellow-400 mb-3 flex items-center text-lg">
              <AlertTriangle className="mr-2" size={22} />
              Large Document Warning
            </h3>
            <div className="text-yellow-300/90 space-y-1 text-sm">
              <p>• Words: {currentAnalysis.wordCount.toLocaleString()}</p>
              <p>• Sentences: {currentAnalysis.sentenceCount.toLocaleString()}</p>
              <p>• Estimated processing time: ~{Math.ceil(currentAnalysis.estimatedProcessingTime / 60)} minutes</p>
              {currentAnalysis.processingStrategy === 'chunked' && 
                <p>• Strategy: Document will be processed in {currentAnalysis.chunks?.length || 'multiple'} chunks.</p>
              }
            </div>
            <div className="mt-4 space-y-2">
              <button
                onClick={processLargeDocumentAnyway}
                className="w-full bg-yellow-600 text-white px-4 py-2.5 rounded-md hover:bg-yellow-700 transition-all font-medium"
              >
                Proceed with Analysis
              </button>
              <p className="text-xs text-yellow-400/80 text-center">
                Tip: For faster results, consider analyzing smaller sections or chapters individually.
              </p>
            </div>
          </div>
        )}

        {isGenerating && (
          <div ref={loadingRef} className="w-full my-8">
            <LoadingMessages 
              isGenerating={isGenerating} 
              progress={progress}
            />
          </div>
        )}

        {error && !showAnalysisWarning && (
          <div className="mt-1 mb-14 p-4 glass-card border-red-500/50 animate-fade-up text-red-400 rounded-lg w-full">
            <div className="flex items-center gap-2">
              <XCircle size={20} />
              <span className="font-medium">Error:</span>
            </div>
            <p className="ml-7 text-red-300/90 text-sm">{error}</p>
          </div>
        )}
        
        <div ref={resultsRef} className="w-full">
          {(!isGenerating && (factCheckResults.length > 0 || (progress?.stage === 'complete' && factCheckResults.length === 0 && !error) )) && (
            <div className="space-y-10 md:space-y-14 mt-5 mb-20 md:mb-32 w-full">
              <DocumentSummary 
                results={factCheckResults} 
                analysis={currentAnalysis} 
                isLoading={isGenerating && !currentAnalysis}
              />
              
              {factCheckResults.length > 0 && (
                <div className="mt-4 pt-8 md:pt-12 opacity-0 animate-fade-up [animation-delay:800ms]">
                  <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
                    <h2 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">
                      Detailed Claim Analysis
                    </h2>
                    
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => setShowProblematicOnly(true)}
                        className={`px-4 py-2 rounded-md font-medium text-sm transition-all flex items-center gap-1.5 ${
                          showProblematicOnly 
                            ? 'bg-red-500/10 text-red-400 border border-red-500/30 ring-1 ring-red-500/50' 
                            : 'bg-surface-glass text-text-muted border border-surface-border hover:bg-surface-glass-hover hover:border-surface-border-strong'
                        }`}
                      >
                        <XCircle size={16} />
                        Issues ({categorizedResults.problematic.length})
                      </button>
                      
                      <button
                        onClick={() => setShowProblematicOnly(false)}
                        className={`px-4 py-2 rounded-md font-medium text-sm transition-all flex items-center gap-1.5 ${
                          !showProblematicOnly 
                            ? 'bg-green-500/10 text-green-400 border border-green-500/30 ring-1 ring-green-500/50' 
                            : 'bg-surface-glass text-text-muted border border-surface-border hover:bg-surface-glass-hover hover:border-surface-border-strong'
                        }`}
                      >
                        <CheckCircle size={16} />
                        All ({factCheckResults.length})
                      </button>
                    </div>
                  </div>

                  {showProblematicOnly ? (
                    categorizedResults.problematic.length > 0 ? (
                      <ClaimsListResults results={categorizedResults.problematic} />
                    ) : (
                      <div className="text-center py-8 px-4 glass-card">
                        <CheckCircle size={48} className="mx-auto text-green-400 mb-4" />
                        <h3 className="text-xl font-semibold text-text-primary mb-2">No Issues Found!</h3>
                        <p className="text-text-secondary">All extracted claims requiring attention have been reviewed or no problematic claims were identified.</p>
                        <button 
                          onClick={() => setShowProblematicOnly(false)}
                          className="mt-4 btn-secondary text-sm"
                        >
                          Show All Verified Claims ({factCheckResults.length})
                        </button>
                      </div>
                    )
                  ) : (
                    <ClaimsListResults results={factCheckResults} />
                  )}
                </div>
              )}
              {factCheckResults.length === 0 && progress?.stage === 'complete' && !error && (
                 <div className="text-center py-10 px-4 glass-card">
                    <AlertTriangle size={48} className="mx-auto text-accent-primary mb-4" /> 
                    <h3 className="text-xl font-semibold text-text-primary mb-2">Analysis Complete</h3>
                    <p className="text-text-secondary">No verifiable claims were extracted from the provided text, or all claims resulted in "Insufficient Information".</p>
                  </div>
              )}

              {/* ShareButtons component was removed from here in the previous step */}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
