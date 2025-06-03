// components/FactChecker.tsx
"use client";

import {
  useState,
  FormEvent,
  useRef,
  useEffect,
  useMemo,
  ChangeEvent,
} from "react";
import ClaimsListResults from "./ClaimsListResult";
import LoadingMessages from "./ui/LoadingMessages";
import DocumentSummary from "./DocumentSummary";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileText,
  UploadCloud,
  Paperclip,
  Server,
  Scissors,
  ExternalLink,
  Zap,
  Shield,
  Loader2,
} from "lucide-react";
import { getAssetPath } from "@/lib/utils"; //
import { ContentAnalyzer, ContentAnalysis } from "../lib/contentAnalyzer"; //

// Interfaces
interface ExtractedClaim {
  claim_id: string;
  claim_text: string;
  original_sentence: string;
  sentence_number: number;
  sentence_start_index?: number;
  sentence_end_index?: number;
}

// This will be used for the new state holding top-level extraction metadata
interface DocumentMetadataFromExtraction {
  topic?: string;
  category?: string;
  document_type?: string;
  expected_accuracy_range?: string;
  funding_source?: string;
  author_credibility?: string;
  total_sentences_in_doc?: number;
  total_words_in_doc?: number;
  avg_words_per_page?: number;
  references_in_doc_count?: number;
  doc_reference_quality_score?: string;
  totalClaimsExtracted?: number; // Added to match one of the fields used
}

interface ExtractionApiResponse {
  topic: string;
  category: string;
  document_type: string;
  expected_accuracy_range: string;
  funding_source?: string;
  author_credibility?: string;
  claims: ExtractedClaim[];
  fromCache: boolean;
  analysis: ContentAnalysis;
  totalClaimsExtracted: number;
  total_sentences_in_doc?: number;
  total_words_in_doc?: number;
  avg_words_per_page?: number;
  references_in_doc_count?: number;
  doc_reference_quality_score?: string;
}

interface EnhancedSearchResult {
  text: string;
  url: string;
  source_type: "org" | "edu_gov" | "other";
  title?: string;
  publication_date?: string;
  authority_score?: number;
  relevance_score?: number;
}

interface SearchMetadata {
  total_raw_results: number;
  org_sources: number;
  edu_gov_sources: number;
  avg_authority_score: number;
  avg_relevance_score: number;
  search_strategies_used: number;
}

interface VerificationCheck {
  verdict: "GO" | "CHECK" | "NO GO" | "N/A" | string;
  reason: string;
  score?: number | null;
}

interface EnhancedSourceAnalysis {
  source_authority_score: VerificationCheck;
  source_freshness_index: VerificationCheck;
  source_bias_detection: VerificationCheck;
  source_consensus_mapping: VerificationCheck;
}

interface AdvancedClaimAnalysis {
  claim_complexity_score: VerificationCheck;
  claim_type_classification: VerificationCheck;
}

interface MultiDimensionalVerification {
  reality_check: VerificationCheck;
  reliability_check: VerificationCheck;
  context_coherence_check: VerificationCheck;
  temporal_consistency_check: VerificationCheck;
  cross_reference_validation: VerificationCheck;
  bias_detection_analysis_overall: VerificationCheck;
  confidence_calibration: VerificationCheck;
  predictive_accuracy_score_for_claim: VerificationCheck;
  enhanced_source_summary: EnhancedSourceAnalysis;
  advanced_claim_details: AdvancedClaimAnalysis;
  final_verdict: "GO" | "CHECK" | "NO GO";
}

interface ExaSourceForResponse {
  text: string;
  url: string;
  source_type: "org" | "edu_gov" | "other";
  title?: string;
  publication_date?: string;
  authority_score?: number;
  relevance_score?: number;
}

type FactCheckResponse = {
  claim_id: string;
  claim_text: string;
  assessment:
    | "True"
    | "False"
    | "Ambiguous/Partially True"
    | "Insufficient Information"
    | "Needs Specialist Review";
  summary: string;
  fixed_original_text: string;
  multi_dimensional_verification: MultiDimensionalVerification;
  original_sentence: string;
  sentence_number: number;
  url_sources_used?: ExaSourceForResponse[];
  search_metadata?: SearchMetadata;
};

interface ProgressUpdate {
  stage:
    | "idle"
    | "analyzing_content"
    | "extracting_claims_chunk"
    | "extracting_claims_full"
    | "searching_sources"
    | "verifying_claims"
    | "complete"
    | "error"
    | "parsing_file"
    | "uploading_file";
  current: number;
  total: number;
  subMessage?: string;
  overallProgress?: number;
  message: string;
  msRemaining?: number;
}

export default function FactChecker() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [factCheckResults, setFactCheckResults] = useState<FactCheckResponse[]>(
    [],
  );
  const [articleContent, setArticleContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [showProblematicOnly, setShowProblematicOnly] = useState(true);
  const [currentAnalysis, setCurrentAnalysis] =
    useState<ContentAnalysis | null>(null);
  // NEW STATE for top-level document metadata from extraction
  const [documentExtractionMetadata, setDocumentExtractionMetadata] =
    useState<DocumentMetadataFromExtraction | null>(null);
  const [showAnalysisWarning, setShowAnalysisWarning] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [aggressiveMode, setAggressiveMode] = useState(true);
  const [sourceQualityStats, setSourceQualityStats] =
    useState<SearchMetadata | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const stageStartTimeRef = useRef<number>(0);

  useEffect(() => {
    // console.log("FactChecker.tsx: ContentAnalyzer on mount/render:", ContentAnalyzer);
  }, []);

  const scrollToLoading = () => {
    loadingRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const updateDynamicProgress = (
    currentStageProgress: number,
    estimatedStageDurationMs: number,
  ) => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    stageStartTimeRef.current = Date.now();
    const updateInterval = 100;

    progressIntervalRef.current = setInterval(() => {
      const elapsedTime = Date.now() - stageStartTimeRef.current;
      let stagePercentage = Math.min(
        100,
        (elapsedTime / Math.max(1, estimatedStageDurationMs)) * 100,
      );

      if (
        progress?.total &&
        progress.current < progress.total &&
        currentStageProgress > 0
      ) {
        const basePercentage = (progress.current / progress.total) * 100;
        const remainingPercentageForCurrentStep = (1 / progress.total) * 100;
        const timePerStep = Math.max(
          1,
          estimatedStageDurationMs /
            Math.max(1, progress.total - progress.current + 1),
        );
        stagePercentage =
          basePercentage +
          (elapsedTime / timePerStep) * remainingPercentageForCurrentStep;
        stagePercentage = Math.min(100, stagePercentage);
      }

      setProgress((prev) => {
        if (!prev || prev.stage === "complete" || prev.stage === "error") {
          if (progressIntervalRef.current)
            clearInterval(progressIntervalRef.current);
          return prev;
        }
        return {
          ...prev,
          overallProgress: Math.max(prev.overallProgress || 0, stagePercentage),
          msRemaining: Math.max(0, estimatedStageDurationMs - elapsedTime),
        };
      });

      if (elapsedTime >= estimatedStageDurationMs) {
        if (progressIntervalRef.current)
          clearInterval(progressIntervalRef.current);
      }
    }, updateInterval);
  };

  useEffect(() => {
    if (
      isGenerating &&
      progress &&
      progress.stage !== "complete" &&
      progress.stage !== "error"
    ) {
      scrollToLoading();
    }
    return () => {
      if (progressIntervalRef.current)
        clearInterval(progressIntervalRef.current);
    };
  }, [isGenerating, progress]);

  useEffect(() => {
    if (
      factCheckResults.length > 0 ||
      (progress &&
        (progress.stage === "complete" || progress.stage === "error"))
    ) {
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  }, [factCheckResults, progress]);

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.min(scrollHeight, 350)}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [articleContent]);

  const categorizedResults = useMemo(() => {
    const problematic = factCheckResults.filter((result) => {
      const assessmentCheck =
        result &&
        result.assessment &&
        (result.assessment.toLowerCase() === "false" ||
          result.assessment.toLowerCase() === "ambiguous/partially true" ||
          result.assessment.toLowerCase() === "needs specialist review");
      const verdictCheck =
        result &&
        result.multi_dimensional_verification &&
        (result.multi_dimensional_verification.final_verdict === "NO GO" ||
          result.multi_dimensional_verification.final_verdict === "CHECK");
      return assessmentCheck || verdictCheck;
    });

    const verified = factCheckResults.filter((result) => {
      const assessmentCheck =
        result &&
        result.assessment &&
        result.assessment.toLowerCase() === "true";
      const verdictCheck =
        result &&
        result.multi_dimensional_verification &&
        result.multi_dimensional_verification.final_verdict === "GO";
      return assessmentCheck && verdictCheck;
    });
    return { problematic, verified };
  }, [factCheckResults]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFileName(null);
      return;
    }

    setFileName(file.name);
    setError(null);
    setFactCheckResults([]);
    setArticleContent("");
    setIsGenerating(true);
    setDocumentExtractionMetadata(null);

    const validTypes = [
      "text/plain",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];

    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      setProgress({
        stage: "parsing_file",
        current: 0,
        total: 1,
        message: `Reading ${file.name}...`,
        overallProgress: 0,
      });
      updateDynamicProgress(100, 500);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setArticleContent(text);
        setProgress(null);
        setIsGenerating(false);
        if (progressIntervalRef.current)
          clearInterval(progressIntervalRef.current);
      };
      reader.onerror = () => {
        setError("Failed to read the .txt file.");
        setProgress(null);
        setIsGenerating(false);
        if (progressIntervalRef.current)
          clearInterval(progressIntervalRef.current);
      };
      reader.readAsText(file);
    } else if (
      validTypes.includes(file.type) ||
      file.name.endsWith(".pdf") ||
      file.name.endsWith(".docx") ||
      file.name.endsWith(".doc")
    ) {
      setProgress({
        stage: "uploading_file",
        current: 0,
        total: 1,
        message: `Uploading ${file.name} for server-side parsing...`,
        overallProgress: 1,
      });
      updateDynamicProgress(100, 2000);

      const formData = new FormData();
      formData.append("file", file);

      const apiUrl = getAssetPath("/api/parsefile");

      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          body: formData,
        });

        if (progressIntervalRef.current)
          clearInterval(progressIntervalRef.current);

        const contentType = response.headers.get("content-type");
        if (!response.ok) {
          let errorMsg = `Server failed to parse ${file.name}. Status: ${response.status}`;
          if (contentType && contentType.includes("application/json")) {
            try {
              const errorData = await response.json();
              errorMsg = errorData.error || errorMsg;
            } catch (jsonError) {
              errorMsg += ` Could not parse JSON error response.`;
            }
          }
          throw new Error(errorMsg);
        }

        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          if (data.extractedText) {
            setArticleContent(data.extractedText);
            setProgress(null);
          } else {
            throw new Error(`No text extracted from ${file.name}.`);
          }
        } else {
          throw new Error(`Unexpected response type from server.`);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : `Failed to process ${file.name}.`,
        );
        setProgress({
          stage: "error",
          current: 1,
          total: 1,
          message: `Error parsing ${file.name}.`,
          overallProgress: 0,
        });
      } finally {
        setIsGenerating(false);
      }
    } else {
      setError(
        `Unsupported file type. Please upload a .txt, .pdf, or .docx file.`,
      );
      setProgress(null);
      setIsGenerating(false);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const extractClaimsAPI = async (
    contentToAnalyze: string,
    analysis: ContentAnalysis,
  ): Promise<ExtractionApiResponse> => {
    if (
      analysis.processingStrategy === "chunked" &&
      analysis.chunks &&
      analysis.chunks.length > 0
    ) {
      const allExtractedClaims: ExtractedClaim[] = [];
      let overallExtractionResponse: Partial<ExtractionApiResponse> = {
        analysis,
      };
      const totalChunks = Math.min(
        analysis.chunks.length,
        ContentAnalyzer.LIMITS.MAX_CHUNKS,
      );
      const baseOverallProgress = progress?.overallProgress || 5;

      for (let i = 0; i < totalChunks; i++) {
        const chunk = analysis.chunks[i];
        const chunkProportion =
          chunk.wordCount / Math.max(1, analysis.wordCount);
        const estimatedChunkTime = Math.max(
          3000,
          analysis.estimatedProcessingTime * 1000 * 0.3 * chunkProportion,
        );

        setProgress((prev) => ({
          stage: "extracting_claims_chunk",
          current: i + 1,
          total: totalChunks,
          message: `Extracting claims: Chunk ${i + 1} of ${totalChunks}...`,
          subMessage: `Analyzing ${chunk.wordCount.toLocaleString()} words...`,
          overallProgress: baseOverallProgress + ((i + 1) / totalChunks) * 30,
          msRemaining: estimatedChunkTime * (totalChunks - i),
        }));
        updateDynamicProgress(
          ((i + 1) / totalChunks) * 100,
          estimatedChunkTime,
        );

        const response = await fetch(getAssetPath("/api/extractclaims"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: chunk.content,
            isChunk: true,
            chunkId: chunk.id,
            chunkIndex: i,
            totalChunks: totalChunks,
            fullDocumentAnalysis: i === 0 ? analysis : undefined,
            sentenceNumberOffset:
              i > 0
                ? analysis.chunks
                    .slice(0, i)
                    .reduce((acc, c) => acc + c.sentenceCount, 0)
                : 0,
            chunkGlobalCharStartIndex: chunk.startIndex,
          }),
        });
        if (progressIntervalRef.current)
          clearInterval(progressIntervalRef.current);
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || `Failed to extract claims from chunk ${chunk.id}.`,
          );

        if (i === 0) {
          overallExtractionResponse = { ...analysis, ...data, claims: [] };
        }
        if (data.claims) allExtractedClaims.push(...data.claims);
      }
      overallExtractionResponse.claims = allExtractedClaims;
      overallExtractionResponse.totalClaimsExtracted =
        allExtractedClaims.length;

      return overallExtractionResponse as ExtractionApiResponse;
    } else {
      const estimatedTime = Math.max(
        5000,
        analysis.estimatedProcessingTime * 1000 * 0.3,
      );
      setProgress((prev) => ({
        stage: "extracting_claims_full",
        current: 1,
        total: 1,
        message: "Extracting claims from the document...",
        overallProgress: (prev?.overallProgress || 5) + 15,
        msRemaining: estimatedTime,
      }));
      updateDynamicProgress(50, estimatedTime);

      const response = await fetch(getAssetPath("/api/extractclaims"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: contentToAnalyze,
          fullDocumentAnalysis: analysis,
        }),
      });
      if (progressIntervalRef.current)
        clearInterval(progressIntervalRef.current);
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Failed to extract claims.");
      return { ...data, analysis } as ExtractionApiResponse;
    }
  };

  const aggressiveSearchAPI = async (
    claimText: string,
    retries = 1,
  ): Promise<{
    results: EnhancedSearchResult[];
    metadata?: SearchMetadata;
  }> => {
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetch(getAssetPath("/api/exasearch"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claim: claimText }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error ||
              `Aggressive search failed (status ${response.status})`,
          );
        }

        const data = await response.json();
        return {
          results: data.results || [],
          metadata: data.metadata,
        };
      } catch (error) {
        if (i === retries) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
    return { results: [] };
  };

  const verifyClaimAPI = async (
    claimData: ExtractedClaim,
    searchSources: EnhancedSearchResult[],
    searchMetadata: SearchMetadata | undefined,
    docCategory: string = "Unknown",
    docTopic?: string,
  ): Promise<FactCheckResponse> => {
    const response = await fetch(getAssetPath("/api/verifyclaims"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claim_id: claimData.claim_id,
        claim_text: claimData.claim_text,
        original_sentence: claimData.original_sentence,
        sentence_number: claimData.sentence_number,
        exasources: searchSources,
        document_category: docCategory,
        document_topic: docTopic,
        aggressive_mode: aggressiveMode,
        search_metadata: searchMetadata,
      }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to verify claim.");
    }
    const data = await response.json();
    const result = data.claims as FactCheckResponse;

    if (searchMetadata) {
      result.search_metadata = result.search_metadata || searchMetadata;
    }

    return result;
  };

  const processBatchInParallel = async (
    claimsToVerify: ExtractedClaim[],
    batchSize: number,
    docCategory: string = "Unknown",
    docTopic: string = "Unknown",
    onProgressUpdate: (processedInBatch: number, totalClaims: number) => void,
  ): Promise<FactCheckResponse[]> => {
    const allResults: FactCheckResponse[] = [];
    const totalClaims = claimsToVerify.length;
    if (totalClaims === 0) return [];

    let claimsProcessedSoFar = 0;
    const baseOverallProgress = progress?.overallProgress || 35;
    const searchAndVerifyTotalPortion = 0.6;

    const baseTimePerClaim = aggressiveMode ? 8000 : 3000;
    const estimatedTimePerClaimTotalForSearchAndVerify = Math.max(
      baseTimePerClaim,
      ((currentAnalysis?.estimatedProcessingTime || 60) *
        1000 *
        searchAndVerifyTotalPortion) /
        Math.max(1, totalClaims),
    );

    const searchPortionOfStep = 0.4;
    const verifyPortionOfStep = 0.6;

    const aggregateSourceStats = {
      total_raw_results: 0,
      org_sources: 0,
      edu_gov_sources: 0,
      avg_authority_score: 0,
      avg_relevance_score: 0,
      search_strategies_used: 0,
    };

    for (let i = 0; i < totalClaims; i += batchSize) {
      const batch = claimsToVerify.slice(i, i + batchSize);
      const batchPromises = batch.map(async (claim, indexInBatch) => {
        const overallClaimIndex = i + indexInBatch;

        const estimatedSearchTimeForThisClaim =
          estimatedTimePerClaimTotalForSearchAndVerify * searchPortionOfStep;
        const estimatedVerifyTimeForThisClaim =
          estimatedTimePerClaimTotalForSearchAndVerify * verifyPortionOfStep;

        let searchData:
          | { results: EnhancedSearchResult[]; metadata?: SearchMetadata }
          | undefined;

        try {
          setProgress((prev) => ({
            ...prev!,
            stage: "searching_sources",
            current: overallClaimIndex + 1,
            total: totalClaims,
            message: aggressiveMode
              ? `🔥 AGGRESSIVE SOURCE HUNT: Claim ${overallClaimIndex + 1}/${totalClaims}...`
              : `Searching sources for claim ${overallClaimIndex + 1}/${totalClaims}...`,
            subMessage: aggressiveMode
              ? `(S${claim.sentence_number}) Scanning 50+ sources across 8 search strategies + 15+ .org domains...`
              : `(S${claim.sentence_number}) ${claim.claim_text.substring(0, 50)}...`,
            overallProgress:
              baseOverallProgress +
              (overallClaimIndex / totalClaims) *
                (100 - baseOverallProgress) *
                searchPortionOfStep,
            msRemaining:
              estimatedSearchTimeForThisClaim *
                (totalClaims - overallClaimIndex) +
              estimatedVerifyTimeForThisClaim * totalClaims,
          }));
          updateDynamicProgress(100, estimatedSearchTimeForThisClaim);

          searchData = aggressiveMode
            ? await aggressiveSearchAPI(claim.claim_text)
            : { results: [], metadata: undefined };

          if (progressIntervalRef.current)
            clearInterval(progressIntervalRef.current);

          if (searchData.metadata) {
            aggregateSourceStats.total_raw_results +=
              searchData.metadata.total_raw_results;
            aggregateSourceStats.org_sources += searchData.metadata.org_sources;
            aggregateSourceStats.edu_gov_sources +=
              searchData.metadata.edu_gov_sources;
            aggregateSourceStats.avg_authority_score +=
              searchData.metadata.avg_authority_score;
            aggregateSourceStats.avg_relevance_score +=
              searchData.metadata.avg_relevance_score;
            aggregateSourceStats.search_strategies_used = Math.max(
              aggregateSourceStats.search_strategies_used,
              searchData.metadata.search_strategies_used,
            );
          }

          if (!searchData?.results?.length) {
            return {
              claim_id: claim.claim_id,
              claim_text: claim.claim_text,
              assessment: "Insufficient Information",
              summary: aggressiveMode
                ? "Even with aggressive source hunting (50+ sources, 8 search strategies), no relevant sources were found to verify this claim."
                : "No relevant sources found by the search API to verify this claim.",
              fixed_original_text: claim.original_sentence,
              original_sentence: claim.original_sentence,
              sentence_number: claim.sentence_number,
              url_sources_used: [],
              multi_dimensional_verification: {
                reality_check: {
                  verdict: "NO GO",
                  reason: "No sources found.",
                  score: null,
                },
                reliability_check: {
                  verdict: "NO GO",
                  reason: "No sources found.",
                  score: null,
                },
                context_coherence_check: {
                  verdict: "N/A",
                  reason: "Not assessed due to no sources.",
                  score: null,
                },
                temporal_consistency_check: {
                  verdict: "N/A",
                  reason: "Not assessed due to no sources.",
                  score: null,
                },
                cross_reference_validation: {
                  verdict: "NO GO",
                  reason: "No sources to cross-reference.",
                  score: null,
                },
                bias_detection_analysis_overall: {
                  verdict: "N/A",
                  reason: "Not assessed due to no sources.",
                  score: null,
                },
                confidence_calibration: {
                  verdict: "N/A",
                  reason: "No verification performed.",
                  score: 0,
                },
                predictive_accuracy_score_for_claim: {
                  verdict: "N/A",
                  reason: "Not applicable or no sources.",
                  score: null,
                },
                enhanced_source_summary: {
                  source_authority_score: {
                    verdict: "N/A",
                    reason: "No sources.",
                    score: 0,
                  },
                  source_freshness_index: {
                    verdict: "N/A",
                    reason: "No sources.",
                    score: null,
                  },
                  source_bias_detection: {
                    verdict: "N/A",
                    reason: "No sources.",
                    score: null,
                  },
                  source_consensus_mapping: {
                    verdict: "N/A",
                    reason: "No sources.",
                    score: null,
                  },
                },
                advanced_claim_details: {
                  claim_complexity_score: {
                    verdict: "N/A",
                    reason: "Not assessed.",
                    score: null,
                  },
                  claim_type_classification: {
                    verdict: "N/A",
                    reason: "Not assessed.",
                    score: null,
                  },
                },
                final_verdict: "NO GO",
              },
              search_metadata: searchData?.metadata,
            } as FactCheckResponse;
          }

          setProgress((prev) => ({
            ...prev!,
            stage: "verifying_claims",
            current: overallClaimIndex + 1,
            total: totalClaims,
            message: aggressiveMode
              ? `🛡️ DEEP VERIFICATION: Claim ${overallClaimIndex + 1}/${totalClaims}...`
              : `Verifying claim ${overallClaimIndex + 1}/${totalClaims} with sources...`,
            subMessage:
              aggressiveMode && searchData
                ? `(S${claim.sentence_number}) Multi-dimensional analysis with ${searchData.results.length} high-authority sources...`
                : `(S${claim.sentence_number}) Using ${searchData?.results?.length || 0} sources.`,
            overallProgress:
              baseOverallProgress +
              (100 - baseOverallProgress) * searchPortionOfStep +
              (overallClaimIndex / totalClaims) *
                (100 - baseOverallProgress) *
                verifyPortionOfStep,
            msRemaining:
              estimatedVerifyTimeForThisClaim *
              (totalClaims - overallClaimIndex),
          }));
          updateDynamicProgress(100, estimatedVerifyTimeForThisClaim);

          const verifiedData = await verifyClaimAPI(
            claim,
            searchData.results,
            searchData.metadata,
            docCategory,
            docTopic,
          );
          if (progressIntervalRef.current)
            clearInterval(progressIntervalRef.current);
          return verifiedData;
        } catch (error) {
          if (progressIntervalRef.current)
            clearInterval(progressIntervalRef.current);
          return {
            claim_id: claim.claim_id,
            claim_text: claim.claim_text,
            assessment: "Insufficient Information",
            summary: `Error during ${aggressiveMode ? "aggressive " : ""}verification: ${error instanceof Error ? error.message : "Unknown error"}`,
            fixed_original_text: claim.original_sentence,
            original_sentence: claim.original_sentence,
            sentence_number: claim.sentence_number,
            url_sources_used: [],
            multi_dimensional_verification: {
              reality_check: {
                verdict: "NO GO",
                reason: "Error.",
                score: null,
              },
              reliability_check: {
                verdict: "NO GO",
                reason: "Error.",
                score: null,
              },
              context_coherence_check: {
                verdict: "N/A",
                reason: "Error.",
                score: null,
              },
              temporal_consistency_check: {
                verdict: "N/A",
                reason: "Error.",
                score: null,
              },
              cross_reference_validation: {
                verdict: "NO GO",
                reason: "Error.",
                score: null,
              },
              bias_detection_analysis_overall: {
                verdict: "N/A",
                reason: "Error.",
                score: null,
              },
              confidence_calibration: {
                verdict: "N/A",
                reason: "Error.",
                score: 0,
              },
              predictive_accuracy_score_for_claim: {
                verdict: "N/A",
                reason: "Error.",
                score: null,
              },
              enhanced_source_summary: {
                source_authority_score: {
                  verdict: "N/A",
                  reason: "Error.",
                  score: 0,
                },
                source_freshness_index: {
                  verdict: "N/A",
                  reason: "Error.",
                  score: null,
                },
                source_bias_detection: {
                  verdict: "N/A",
                  reason: "Error.",
                  score: null,
                },
                source_consensus_mapping: {
                  verdict: "N/A",
                  reason: "Error.",
                  score: null,
                },
              },
              advanced_claim_details: {
                claim_complexity_score: {
                  verdict: "N/A",
                  reason: "Error.",
                  score: null,
                },
                claim_type_classification: {
                  verdict: "N/A",
                  reason: "Error.",
                  score: null,
                },
              },
              final_verdict: "NO GO",
            },
            search_metadata: searchData?.metadata,
          } as FactCheckResponse;
        }
      });

      const resultsFromBatch = await Promise.all(batchPromises);
      allResults.push(
        ...(resultsFromBatch.filter((r) => r !== null) as FactCheckResponse[]),
      );
      claimsProcessedSoFar += batch.length;
      onProgressUpdate(claimsProcessedSoFar, totalClaims);
    }

    if (totalClaims > 0) {
      const numClaimsWithMetadata =
        allResults.filter((r) => r.search_metadata).length || 1; // Avoid division by zero
      if (aggregateSourceStats.total_raw_results > 0) {
        // Only divide if there were results
        aggregateSourceStats.avg_authority_score /= numClaimsWithMetadata;
        aggregateSourceStats.avg_relevance_score /= numClaimsWithMetadata;
      } else {
        // Set to 0 if no raw results to avoid NaN
        aggregateSourceStats.avg_authority_score = 0;
        aggregateSourceStats.avg_relevance_score = 0;
      }
      setSourceQualityStats(aggregateSourceStats);
    }

    return allResults;
  };

  const factCheck = async (e: FormEvent | null, contentOverride?: string) => {
    if (e) e.preventDefault();
    const currentContent = contentOverride || articleContent;

    if (!currentContent) {
      setError("Please enter some content or upload a file.");
      return;
    }

    setProgress({
      stage: "idle",
      current: 0,
      total: 0,
      message: "Initializing...",
      overallProgress: 0,
    });

    const initialAnalysis = ContentAnalyzer.analyze(currentContent);
    setCurrentAnalysis(initialAnalysis);
    setDocumentExtractionMetadata(null); // Reset this on new analysis

    if (!initialAnalysis.canProcess) {
      setError(
        initialAnalysis.warnings.join(" ") || "Content cannot be processed.",
      );
      setIsGenerating(false);
      setProgress({
        stage: "error",
        current: 1,
        total: 1,
        message:
          initialAnalysis.warnings.join(" ") || "Content cannot be processed.",
        overallProgress: 0,
      });
      return;
    }
    if (
      initialAnalysis.wordCount >
        ContentAnalyzer.LIMITS.MAX_WORDS_TOTAL * 0.1 &&
      !showAnalysisWarning &&
      !contentOverride
    ) {
      setShowAnalysisWarning(true);
      setError(null);
      return;
    }

    setIsGenerating(true);
    setError(null);
    setFactCheckResults([]);
    setSourceQualityStats(null);

    const initialAnalysisTime = Math.max(1000, initialAnalysis.wordCount / 100);
    setProgress({
      stage: "analyzing_content",
      current: 0,
      total: 1,
      message: `Performing initial analysis of ${initialAnalysis.wordCount.toLocaleString()} words...`,
      overallProgress: 5,
      msRemaining: initialAnalysisTime,
    });
    updateDynamicProgress(100, initialAnalysisTime);

    setShowAnalysisWarning(false);

    try {
      const extractionResponse = await extractClaimsAPI(
        currentContent,
        initialAnalysis,
      );
      if (progressIntervalRef.current)
        clearInterval(progressIntervalRef.current);

      // Store the ContentAnalysis part in currentAnalysis state
      setCurrentAnalysis(extractionResponse.analysis || initialAnalysis);

      // Store top-level metadata in documentExtractionMetadata state
      setDocumentExtractionMetadata({
        topic: extractionResponse.topic,
        category: extractionResponse.category,
        document_type: extractionResponse.document_type,
        expected_accuracy_range: extractionResponse.expected_accuracy_range,
        funding_source: extractionResponse.funding_source,
        author_credibility: extractionResponse.author_credibility,
        total_sentences_in_doc: extractionResponse.total_sentences_in_doc,
        total_words_in_doc: extractionResponse.total_words_in_doc,
        avg_words_per_page: extractionResponse.avg_words_per_page,
        references_in_doc_count: extractionResponse.references_in_doc_count,
        doc_reference_quality_score:
          extractionResponse.doc_reference_quality_score,
        totalClaimsExtracted: extractionResponse.totalClaimsExtracted,
      });

      const claimsToVerify = extractionResponse.claims;
      if (!claimsToVerify || claimsToVerify.length === 0) {
        setError("No verifiable claims were extracted from the content.");
        setProgress({
          stage: "complete",
          current: 0,
          total: 0,
          message: "No claims found.",
          overallProgress: 100,
        });
        setIsGenerating(false);
        return;
      }

      const finalResults = await processBatchInParallel(
        claimsToVerify,
        aggressiveMode ? 2 : 3,
        extractionResponse.category || "Unknown",
        extractionResponse.topic || "Unknown",
        (processedCount, totalClaimsInVerification) => {
          // Progress is set within processBatchInParallel
        },
      );

      setFactCheckResults(finalResults);
      setProgress({
        stage: "complete",
        current: finalResults.length,
        total: finalResults.length,
        message: aggressiveMode
          ? "🔥 Aggressive verification complete!"
          : "Analysis complete!",
        overallProgress: 100,
      });
      if (progressIntervalRef.current)
        clearInterval(progressIntervalRef.current);
    } catch (error) {
      console.error("Fact check process error:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred during fact-checking.";
      setError(errorMessage);
      setProgress({
        stage: "error",
        current: 0,
        total: 0,
        message: errorMessage,
        overallProgress: 0,
      });
      setFactCheckResults([]);
      if (progressIntervalRef.current)
        clearInterval(progressIntervalRef.current);
    } finally {
      setIsGenerating(false);
      if (progressIntervalRef.current)
        clearInterval(progressIntervalRef.current);
    }
  };

  const processLargeDocumentAnyway = (
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    setShowAnalysisWarning(false);
    setError(null);
    factCheck(e as any);
  };

  const sampleBlog = `The Eiffel Tower, a remarkable iron lattice structure standing proudly in Paris, was originally built as a giant sundial in 1822, intended to cast shadows across the city to mark the hours. Designed by the renowned architect Gustave Eiffel, the tower stands 330 meters tall and once housed the city's first observatory.\n\nWhile it's famously known for hosting over 7 million visitors annually, it was initially disliked by Parisians. Interestingly, the Eiffel Tower was used as to guide ships along the Seine during cloudy nights. Recent studies suggest its height varies by up to 15 cm due to temperature changes. It is painted every seven years to protect it from rust, a process that requires 60 tonnes of paint.`;

  const loadSampleContent = () => {
    setArticleContent(sampleBlog);
    setError(null);
    setCurrentAnalysis(null);
    setDocumentExtractionMetadata(null);
    setFactCheckResults([]);
    setProgress(null);
    setFileName(null);
    setSourceQualityStats(null);
    if (textareaRef.current) textareaRef.current.focus();
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
            Verify content accuracy with sentence-level analysis and real-time
            web search. Supports text input and .txt, .pdf, .docx file uploads.
          </p>
        </div>

        <form onSubmit={factCheck} className="space-y-6 w-full mb-10">
          <textarea
            ref={textareaRef}
            value={articleContent}
            onChange={(e) => {
              setArticleContent(e.target.value);
              adjustTextareaHeight();
              setFileName(null);
              setDocumentExtractionMetadata(null);
            }}
            placeholder="Paste your text here or upload a file below (min 10 words)..."
            className="w-full p-4 border-2 border-surface-border-strong rounded-lg outline-none focus:border-accent-primary resize-none min-h-[150px] max-h-[350px] overflow-auto opacity-0 animate-fade-up [animation-delay:600ms] transition-all duration-200 text-text-primary bg-surface-glass leading-relaxed text-base"
          />

          <div className="opacity-0 animate-fade-up [animation-delay:700ms]">
            <label
              htmlFor="file-upload"
              className="relative cursor-pointer bg-surface-glass hover:bg-surface-glass-hover border-2 border-dashed border-surface-border-strong rounded-lg p-6 flex flex-col items-center justify-center transition-all duration-200 group"
            >
              <UploadCloud className="w-10 h-10 text-text-muted group-hover:text-accent-primary transition-colors" />
              <span className="mt-2 text-sm text-text-secondary">
                <span className="font-semibold text-accent-primary">
                  Upload a file
                </span>{" "}
                or drag and drop
              </span>
              <p className="text-xs text-text-muted mt-1">
                TXT, PDF, DOC, DOCX supported
              </p>
              <input
                id="file-upload"
                name="file-upload"
                type="file"
                className="sr-only"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".txt,.pdf,.doc,.docx,text/plain,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              />
            </label>
            {fileName && (
              <div className="mt-3 text-sm text-text-secondary flex items-center justify-center">
                <Paperclip size={14} className="mr-2 text-text-muted" />
                Selected file:{" "}
                <span className="font-medium text-text-primary ml-1">
                  {fileName}
                </span>
                {(progress?.stage === "uploading_file" ||
                  progress?.stage === "parsing_file") && (
                  <Server
                    size={14}
                    className="ml-2 text-accent-primary animate-pulse"
                  />
                )}
              </div>
            )}
          </div>

          <div className="opacity-0 animate-fade-up [animation-delay:750ms]">
            <div className="flex items-center justify-center p-4 bg-surface-glass rounded-lg border border-surface-border">
              <div className="flex items-center space-x-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aggressiveMode}
                    onChange={(e) => setAggressiveMode(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
                      aggressiveMode ? "bg-red-500" : "bg-gray-600"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white transition-transform duration-300 ${
                        aggressiveMode ? "transform translate-x-7" : ""
                      }`}
                    />
                  </div>
                  <div className="ml-3">
                    <div className="flex items-center gap-2">
                      {aggressiveMode ? (
                        <Zap className="w-5 h-5 text-red-400 animate-pulse" />
                      ) : (
                        <Shield className="w-5 h-5 text-gray-400" />
                      )}
                      <span
                        className={`font-bold ${aggressiveMode ? "text-red-400" : "text-gray-400"}`}
                      >
                        {aggressiveMode ? "AGGRESSIVE MODE" : "Standard Mode"}
                      </span>
                    </div>
                    <div className="text-xs text-text-muted">
                      {aggressiveMode
                        ? "50+ sources • 8 search strategies • 15+ .org domains • Multi-dimensional verification"
                        : "Basic source checking with standard verification"}
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-5 opacity-0 animate-fade-up [animation-delay:800ms]">
            <button
              type="button"
              onClick={loadSampleContent}
              disabled={isGenerating}
              className={`btn-secondary px-5 py-2.5 text-sm ${
                isGenerating ? "cursor-not-allowed opacity-60" : ""
              }`}
            >
              Try Sample Content
            </button>
            <button
              type="submit"
              className={`btn-primary w-full sm:w-auto px-6 py-3 text-base min-h-[50px] flex items-center justify-center gap-2 ${
                isGenerating ? "opacity-60 cursor-not-allowed" : ""
              }`}
              disabled={isGenerating || (!articleContent && !fileName)}
            >
              {isGenerating ? (
                <>
                  {aggressiveMode ? (
                    <Zap className="w-4 h-4 animate-pulse" />
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  {aggressiveMode ? "Aggressive Analysis..." : "Analyzing..."}
                </>
              ) : (
                <>
                  {aggressiveMode ? (
                    <Zap className="w-4 h-4" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {aggressiveMode
                    ? "Aggressive Fact Check"
                    : "Check for Hallucinations"}
                </>
              )}
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
              <p>
                • Sentences: {currentAnalysis.sentenceCount.toLocaleString()}
              </p>
              <p>
                • Estimated processing time:{" "}
                {aggressiveMode
                  ? `~${Math.ceil((currentAnalysis.estimatedProcessingTime * 2.5) / 60)} minutes (Aggressive Mode)`
                  : currentAnalysis.estimatedProcessingTime > 60
                    ? `~${Math.ceil(currentAnalysis.estimatedProcessingTime / 60)} minutes`
                    : `~${currentAnalysis.estimatedProcessingTime} seconds`}
              </p>
              {currentAnalysis.processingStrategy === "chunked" && (
                <p>
                  • Strategy: Document will be processed in{" "}
                  {currentAnalysis.chunks?.length || "multiple"} chunks.
                </p>
              )}
              {aggressiveMode && (
                <p>
                  • Aggressive Mode: 50+ sources per claim, 8 search strategies
                </p>
              )}
              {currentAnalysis.warnings
                .filter(
                  (w) =>
                    !w.toLowerCase().includes("estimated processing time") &&
                    !w.toLowerCase().includes("multiple chunks"),
                )
                .map((w, i) => (
                  <p key={i}>• {w}</p>
                ))}
            </div>
            <div className="mt-4 space-y-2">
              <button
                onClick={processLargeDocumentAnyway}
                className="w-full bg-yellow-600 text-white px-4 py-2.5 rounded-md hover:bg-yellow-700 transition-all font-medium"
              >
                Proceed with Analysis
              </button>
              <div className="flex items-center justify-center gap-2 mt-3">
                <span className="text-xs text-yellow-400/80">
                  Having trouble with large files?
                </span>
                <a
                  href="/splitter"
                  className="inline-flex items-center gap-1 text-xs text-accent-primary hover:text-accent-secondary transition-colors font-medium"
                >
                  <Scissors size={12} />
                  Try Document Splitter
                  <ExternalLink size={10} />
                </a>
              </div>
              <p className="text-xs text-yellow-400/80 text-center">
                Tip: For faster results, consider analyzing smaller sections or
                chapters individually.
              </p>
            </div>
          </div>
        )}

        {isGenerating && (
          <div ref={loadingRef} className="w-full my-8">
            <LoadingMessages isGenerating={isGenerating} progress={progress} />
          </div>
        )}

        {error && !showAnalysisWarning && (
          <div className="mt-1 mb-14 p-4 glass-card border-red-500/50 animate-fade-up text-red-400 rounded-lg w-full">
            <div className="flex items-center gap-2">
              <XCircle size={20} />
              <span className="font-medium">Error:</span>
            </div>
            <p className="ml-7 text-red-300/90 text-sm">{error}</p>

            {(error.includes("timeout") ||
              error.includes("504") ||
              error.includes("FUNCTION_INVOCATION_TIMEOUT") ||
              error.includes("too large")) && (
              <div className="mt-3 pt-3 border-t border-red-500/30">
                <div className="flex items-center gap-2 text-accent-primary">
                  <Scissors size={16} />
                  <span className="font-medium text-sm">
                    💡 Suggested Solution:
                  </span>
                </div>
                <p className="text-red-300/90 text-sm mt-1">
                  Large files often cause timeouts. Try our Document Splitter to
                  break your file into smaller, processable chunks.
                </p>
                <a
                  href="/splitter"
                  className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 rounded-md text-sm font-medium transition-colors"
                >
                  <Scissors size={14} />
                  Open Document Splitter
                  <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>
        )}

        {sourceQualityStats && factCheckResults.length > 0 && (
          <div className="w-full mb-6">
            <div className="glass-card p-4">
              <h3 className="text-lg font-bold text-accent-primary mb-3 flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Aggressive Source Analysis Results
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-center">
                <div className="p-3 bg-surface-glass rounded-lg">
                  <div className="text-2xl font-bold text-accent-primary">
                    {sourceQualityStats.total_raw_results}
                  </div>
                  <div className="text-xs text-text-muted">
                    Total Sources Scanned
                  </div>
                </div>
                <div className="p-3 bg-surface-glass rounded-lg">
                  <div className="text-2xl font-bold text-orange-400">
                    {sourceQualityStats.org_sources}
                  </div>
                  <div className="text-xs text-text-muted">.ORG Sources</div>
                </div>
                <div className="p-3 bg-surface-glass rounded-lg">
                  <div className="text-2xl font-bold text-blue-400">
                    {sourceQualityStats.edu_gov_sources}
                  </div>
                  <div className="text-xs text-text-muted">
                    .EDU/.GOV Sources
                  </div>
                </div>
                <div className="p-3 bg-surface-glass rounded-lg">
                  <div className="text-2xl font-bold text-green-400">
                    {sourceQualityStats.avg_authority_score.toFixed(1)}
                  </div>
                  <div className="text-xs text-text-muted">
                    Avg Authority Score
                  </div>
                </div>
                <div className="p-3 bg-surface-glass rounded-lg">
                  <div className="text-2xl font-bold text-purple-400">
                    {sourceQualityStats.avg_relevance_score.toFixed(1)}
                  </div>
                  <div className="text-xs text-text-muted">
                    Avg Relevance Score
                  </div>
                </div>
                <div className="p-3 bg-surface-glass rounded-lg">
                  <div className="text-2xl font-bold text-yellow-400">
                    {sourceQualityStats.search_strategies_used}
                  </div>
                  <div className="text-xs text-text-muted">
                    Search Strategies
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={resultsRef} className="w-full">
          {!isGenerating &&
            (factCheckResults.length > 0 ||
              (progress?.stage === "complete" &&
                factCheckResults.length === 0 &&
                !error)) && (
              <div className="space-y-10 md:space-y-14 mt-5 mb-20 md:mb-32 w-full">
                <DocumentSummary
                  results={factCheckResults}
                  analysis={currentAnalysis}
                  isLoading={isGenerating && !currentAnalysis}
                  extractionData={documentExtractionMetadata} // CORRECTED: Pass the new state here
                />

                {factCheckResults.length > 0 && (
                  <div className="mt-4 pt-8 md:pt-12 opacity-0 animate-fade-up [animation-delay:800ms]">
                    <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
                      <h2 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight flex items-center gap-2">
                        Detailed Claim Analysis
                        {aggressiveMode && (
                          <Zap className="w-6 h-6 text-red-400 animate-pulse" />
                        )}
                      </h2>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setShowProblematicOnly(true)}
                          className={`px-4 py-2 rounded-md font-medium text-sm transition-all flex items-center gap-1.5 ${
                            showProblematicOnly
                              ? "bg-red-500/10 text-red-400 border border-red-500/30 ring-1 ring-red-500/50"
                              : "bg-surface-glass text-text-muted border border-surface-border hover:bg-surface-glass-hover hover:border-surface-border-strong"
                          }`}
                        >
                          <XCircle size={16} />
                          Issues ({categorizedResults.problematic.length})
                        </button>

                        <button
                          onClick={() => setShowProblematicOnly(false)}
                          className={`px-4 py-2 rounded-md font-medium text-sm transition-all flex items-center gap-1.5 ${
                            !showProblematicOnly
                              ? "bg-green-500/10 text-green-400 border border-green-500/30 ring-1 ring-green-500/50"
                              : "bg-surface-glass text-text-muted border border-surface-border hover:bg-surface-glass-hover hover:border-surface-border-strong"
                          }`}
                        >
                          <CheckCircle size={16} />
                          All ({factCheckResults.length})
                        </button>
                      </div>
                    </div>

                    {showProblematicOnly ? (
                      categorizedResults.problematic.length > 0 ? (
                        <ClaimsListResults
                          results={categorizedResults.problematic}
                        />
                      ) : (
                        <div className="text-center py-8 px-4 glass-card">
                          <CheckCircle
                            size={48}
                            className="mx-auto text-green-400 mb-4"
                          />
                          <h3 className="text-xl font-semibold text-text-primary mb-2">
                            {aggressiveMode
                              ? "🔥 Aggressive Verification: No Issues Found!"
                              : "No Issues Found!"}
                          </h3>
                          <p className="text-text-secondary">
                            {aggressiveMode
                              ? "All extracted claims passed rigorous verification with 50+ sources per claim, 8 search strategies, and multi-dimensional analysis."
                              : "All extracted claims requiring attention have been reviewed or no problematic claims were identified."}
                          </p>
                          <button
                            onClick={() => setShowProblematicOnly(false)}
                            className="mt-4 btn-secondary text-sm"
                          >
                            Show All Verified Claims ({factCheckResults.length})
                          </button>
                          {aggressiveMode && sourceQualityStats && (
                            <div className="mt-4 text-xs text-green-300/80">
                              ✅ Verified with{" "}
                              {sourceQualityStats.total_raw_results} total
                              sources •{sourceQualityStats.org_sources} .org
                              domains •{sourceQualityStats.edu_gov_sources}{" "}
                              academic/gov sources
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      <ClaimsListResults results={factCheckResults} />
                    )}
                  </div>
                )}
                {factCheckResults.length === 0 &&
                  progress?.stage === "complete" &&
                  !error && (
                    <div className="text-center py-10 px-4 glass-card">
                      <AlertTriangle
                        size={48}
                        className="mx-auto text-accent-primary mb-4"
                      />
                      <h3 className="text-xl font-semibold text-text-primary mb-2">
                        Analysis Complete
                      </h3>
                      <p className="text-text-secondary">
                        {aggressiveMode
                          ? "Even with aggressive source hunting, no verifiable claims were extracted from the provided text."
                          : 'No verifiable claims were extracted from the provided text, or all claims resulted in "Insufficient Information".'}
                      </p>
                    </div>
                  )}
              </div>
            )}
        </div>
      </main>
    </div>
  );
}
