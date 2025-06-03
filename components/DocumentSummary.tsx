// components/DocumentSummary.tsx
"use client";
import React from 'react';
import {
  FileText, Info, ListChecks, BarChart3, BookOpen, Tag, Brain, Users, AlertTriangle, TrendingUp, FileCheck, Hash,
  CheckCircle2, XCircle, AlertCircle, ShieldCheck, Eye, CalendarDays, Link2, Scale, Gauge, Lightbulb, Edit3, ThumbsUp, ThumbsDown, HelpCircle, Type // Added Type icon
} from 'lucide-react';
import { ContentAnalysis } from '@/lib/contentAnalyzer';

// --- Interfaces to match FactChecker.tsx and verifyclaims/route.ts (v2) ---
interface VerificationCheck {
  verdict: "GO" | "CHECK" | "NO GO" | "N/A" | string; // Allow string for specific check types
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
  source_type: 'org' | 'edu_gov' | 'other';
  title?: string;
  publication_date?: string;
}

interface ClaimResult { // This is FactCheckResponse from FactChecker
  claim_id: string;
  claim_text: string;
  assessment: "True" | "False" | "Ambiguous/Partially True" | "Insufficient Information" | "Needs Specialist Review";
  summary: string;
  fixed_original_text: string;
  multi_dimensional_verification: MultiDimensionalVerification;
  original_sentence: string;
  sentence_number: number;
  url_sources_used?: ExaSourceForResponse[];
}

interface DocumentSummaryProps {
  results: ClaimResult[];
  analysis: ContentAnalysis | null; // This is the initial ContentAnalysis result
  isLoading: boolean;
  extractionData?: any; // This can hold the ExtractionApiResponse data which includes more document details
}


const StatDisplay: React.FC<{
  icon: React.ReactNode,
  label: string,
  value: string | number | undefined | null,
  unit?: string,
  colorClass?: string,
  size?: 'normal' | 'large',
  tooltip?: string
}> = ({ icon, label, value, unit, colorClass = 'text-text-primary', size = 'normal', tooltip }) => (
  <div
    className={`stat-item p-4 rounded-lg flex flex-col items-center text-center ${size === 'large' ? 'sm:col-span-1 md:col-span-1' : ''} ${tooltip ? 'relative group' : ''}`}
    title={tooltip} // Basic tooltip
  >
    <div className={`mb-1.5 ${colorClass || 'text-accent-primary'}`}>{icon}</div>
    <div className={`font-bold ${colorClass} ${size === 'large' ? 'text-xl md:text-2xl' : 'text-lg md:text-xl'}`}>
      {(value === undefined || value === null || value === "" || value === "N/A (Subsequent Chunk)") ? <span className="text-text-muted text-sm">N/A</span> : value}
      {value && unit && <span className="text-xs text-text-muted ml-1">{unit}</span>}
    </div>
    <div className={`text-xs text-text-muted ${size === 'large' ? 'mt-0.5' : 'mt-0.5'}`}>{label}</div>
    {tooltip && (
        <div className="absolute bottom-full mb-2 w-max max-w-xs p-2 text-xs bg-bg-tertiary text-text-primary rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10">
            {tooltip}
        </div>
    )}
  </div>
);

const VerificationCheckDisplay: React.FC<{ title: string, check: VerificationCheck, icon?: React.ReactNode }> = ({ title, check, icon }) => {
  const getVerdictColor = (verdict: VerificationCheck['verdict']) => {
    switch (verdict) {
      case "GO": return "text-success";
      case "CHECK": return "text-warning";
      case "NO GO": return "text-error";
      default: return "text-text-muted";
    }
  };
  const getVerdictIcon = (verdict: VerificationCheck['verdict']) => {
    switch (verdict) {
        case "GO": return <ThumbsUp size={14} />;
        case "CHECK": return <HelpCircle size={14} />;
        case "NO GO": return <ThumbsDown size={14} />;
        default: return <Info size={14} />;
    }
  }

  // Ensure check and check.reason are defined before trying to access properties
  const reasonText = check && check.reason ? check.reason : "No specific reason provided.";
  const verdictText = check && check.verdict ? check.verdict : "N/A";
  const scoreText = check && check.score !== undefined && check.score !== null ? ` (${check.score}/100)` : "";


  return (
    <div className="p-3 bg-bg-secondary rounded-lg border border-surface-border">
      <div className="flex items-center justify-between mb-1">
        <h5 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          {icon || <Lightbulb size={14}/>} {title}
        </h5>
        <span className={`text-xs font-bold ${getVerdictColor(verdictText as VerificationCheck['verdict'])} flex items-center gap-1`}>
          {getVerdictIcon(verdictText as VerificationCheck['verdict'])} {verdictText}
          {scoreText}
        </span>
      </div>
      <p className="text-xs text-text-muted leading-relaxed">{reasonText}</p>
    </div>
  );
};


const DocumentSummary: React.FC<DocumentSummaryProps> = ({ results, analysis: initialAnalysis, isLoading, extractionData }) => {
  if (isLoading && !initialAnalysis && !extractionData) {
    // Skeleton Loader
    return (
      <div className="w-full mb-10 opacity-0 animate-fade-up [animation-delay:200ms]">
        <div className="summary-card p-6 md:p-8 glass-card">
          <div className="h-10 bg-bg-secondary rounded w-3/4 shimmer mb-4"></div> {/* Title placeholder */}
          <div className="h-20 bg-bg-secondary rounded-lg shimmer mb-6"></div> {/* Overall status placeholder */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-24 bg-bg-secondary rounded-lg shimmer"></div>)}
          </div>
           <div className="mt-6 pt-4 border-t border-surface-border">
             <div className="h-6 bg-bg-secondary rounded w-1/2 shimmer mb-3"></div>
             <div className="h-16 bg-bg-secondary rounded-lg shimmer"></div>
           </div>
        </div>
      </div>
    );
  }

  const currentContentAnalysis = extractionData?.analysis || initialAnalysis;

  if (!currentContentAnalysis) {
    return <div className="w-full mb-10 text-center text-text-muted p-6 summary-card glass-card">Document analysis data is not available. Please process a document.</div>;
  }

  const goCount = results.filter(r => r.multi_dimensional_verification?.final_verdict === 'GO').length;
  const checkCount = results.filter(r => r.multi_dimensional_verification?.final_verdict === 'CHECK').length;
  const noGoCount = results.filter(r => r.multi_dimensional_verification?.final_verdict === 'NO GO').length;
  const totalVerifiedClaims = results.length;

  const overallAccuracyScore = totalVerifiedClaims > 0
    ? Math.round(results.reduce((sum, r) => sum + (r.multi_dimensional_verification?.confidence_calibration?.score || 0), 0) / totalVerifiedClaims)
    : 0;

  let overallStatusText = 'Analysis Pending';
  let OverallStatusIconComp = Info; // Use component directly
  let overallStatusColor = 'text-info';
  let overallStatusDescription = 'The document has not been fully processed or no verifiable claims were found.';

  if (totalVerifiedClaims > 0) {
    if (noGoCount > 0 || checkCount > totalVerifiedClaims * 0.3) {
      overallStatusText = 'Major Revisions Recommended';
      OverallStatusIconComp = XCircle;
      overallStatusColor = 'text-error';
      overallStatusDescription = `Significant issues found. ${noGoCount} claim(s) assessed as "NO GO", ${checkCount} as "CHECK". Careful review and revision are strongly advised.`;
    } else if (checkCount > 0) {
      overallStatusText = 'Minor Revisions Suggested';
      OverallStatusIconComp = AlertCircle;
      overallStatusColor = 'text-warning';
      overallStatusDescription = `${checkCount} claim(s) require review ("CHECK"). The document is mostly sound but some areas need attention.`;
    } else {
      overallStatusText = 'Largely Accurate';
      OverallStatusIconComp = ShieldCheck;
      overallStatusColor = 'text-success';
      overallStatusDescription = 'All verified claims were assessed as "GO". The document appears factually sound based on the analysis.';
    }
  } else if (extractionData && extractionData.totalClaimsExtracted === 0 && !isLoading) {
      overallStatusText = 'No Verifiable Claims';
      OverallStatusIconComp = Info;
      overallStatusColor = 'text-info';
      overallStatusDescription = 'No verifiable claims were extracted from the document for analysis.';
  }

  const avgSourceAuthority = results.length > 0 && results[0].multi_dimensional_verification?.enhanced_source_summary?.source_authority_score?.score !== undefined
    ? Math.round(results.reduce((sum, r) => sum + (r.multi_dimensional_verification?.enhanced_source_summary?.source_authority_score?.score || 0), 0) / results.length)
    : null; // Use null if not calculable

  // Default check for cases where MDV might be missing (e.g. during error or partial processing)
  const defaultMdvCheck: VerificationCheck = { verdict: "N/A", reason: "Data not available." };


  return (
    <div className="w-full mb-10 opacity-0 animate-fade-up [animation-delay:200ms]">
      <div className="summary-card p-6 md:p-8 glass-card">
        <h2 className="text-2xl md:text-3xl font-bold mb-6 flex items-center gap-3 text-text-primary">
          <FileText size={28} className="text-accent-primary" />
          Document Verification Overview
        </h2>

        <div className={`p-5 md:p-6 rounded-xl mb-8 border bg-opacity-10 ${
            overallStatusColor === 'text-success' ? 'bg-success border-success/30' :
            overallStatusColor === 'text-warning' ? 'bg-warning border-warning/30' :
            overallStatusColor === 'text-error' ? 'bg-error border-error/30' :
            'bg-info border-info/30'
        }`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <OverallStatusIconComp size={36} className={`${overallStatusColor} flex-shrink-0`} />
            <div>
              <h3 className={`text-lg md:text-xl font-semibold ${overallStatusColor}`}>
                {overallStatusText}
              </h3>
              <p className="text-sm text-text-secondary mt-1">{overallStatusDescription}</p>
            </div>
          </div>
           {totalVerifiedClaims > 0 && (
             <div className="mt-4 pt-3 border-t border-current/20 flex flex-wrap gap-x-6 gap-y-2 text-xs">
                <span className="flex items-center gap-1.5"><ThumbsUp size={14} className="text-success"/> GO: {goCount}</span>
                <span className="flex items-center gap-1.5"><HelpCircle size={14} className="text-warning"/> CHECK: {checkCount}</span>
                <span className="flex items-center gap-1.5"><ThumbsDown size={14} className="text-error"/> NO GO: {noGoCount}</span>
                <span className="flex items-center gap-1.5"><Gauge size={14} className={overallStatusColor}/> Avg. Confidence: {overallAccuracyScore}%</span>
             </div>
           )}
        </div>

        <div className="mb-6">
            <h4 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Document Profile</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-3 md:gap-4 text-sm">
                <StatDisplay icon={<BookOpen size={20}/>} label="Topic" value={extractionData?.topic || currentContentAnalysis.topic} size="large" tooltip={extractionData?.topic || currentContentAnalysis.topic}/>
                <StatDisplay icon={<Tag size={20}/>} label="Category" value={extractionData?.category || currentContentAnalysis.category} size="large" tooltip={extractionData?.category || currentContentAnalysis.category}/>
                <StatDisplay icon={<FileCheck size={20}/>} label="Doc Type" value={extractionData?.document_type} size="large" tooltip={extractionData?.document_type}/>
                <StatDisplay icon={<BarChart3 size={20}/>} label="Words" value={currentContentAnalysis.wordCount?.toLocaleString()} />
                <StatDisplay icon={<ListChecks size={20}/>} label="Sentences" value={currentContentAnalysis.sentenceCount?.toLocaleString()} />
                <StatDisplay icon={<Brain size={20}/>} label="Claims Extracted" value={extractionData?.totalClaimsExtracted ?? 'N/A'} />
                <StatDisplay icon={<Users size={20}/>} label="Words/Sentence" value={currentContentAnalysis.averageWordsPerSentence} />
                <StatDisplay icon={<Hash size={20}/>} label="References (doc)" value={extractionData?.references_in_doc_count === 0 ? "0" : extractionData?.references_in_doc_count} tooltip="References cited within the document body."/>
                <StatDisplay icon={<TrendingUp size={20}/>} label="Typical Accuracy" value={extractionData?.expected_accuracy_range} tooltip="Expected accuracy range for this document type and category."/>
            </div>
        </div>

        {results.length > 0 && results[0].multi_dimensional_verification && (
            <div className="mb-6">
                <h4 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Overall Source Quality (Average for Verified Claims)</h4>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                    <VerificationCheckDisplay title="Avg. Source Authority" check={{...(results[0].multi_dimensional_verification.enhanced_source_summary.source_authority_score || defaultMdvCheck), score: avgSourceAuthority, reason: `Average authority score of sources used for verified claims. Higher scores indicate more reputable sources.`}} icon={<ShieldCheck size={14}/>} />
                    <VerificationCheckDisplay title="Source Freshness" check={results[0].multi_dimensional_verification.enhanced_source_summary.source_freshness_index || defaultMdvCheck} icon={<CalendarDays size={14}/>}/>
                    <VerificationCheckDisplay title="Source Bias" check={results[0].multi_dimensional_verification.enhanced_source_summary.source_bias_detection || defaultMdvCheck} icon={<Scale size={14}/>}/>
                    <VerificationCheckDisplay title="Source Consensus" check={results[0].multi_dimensional_verification.enhanced_source_summary.source_consensus_mapping || defaultMdvCheck} icon={<Link2 size={14}/>}/>
                </div>
            </div>
        )}

        {(extractionData?.funding_source && extractionData.funding_source !== "Not Mentioned") || (extractionData?.author_credibility && extractionData.author_credibility !== "No specific author information to assess") ? (
          <div className="mt-6 pt-4 border-t border-surface-border">
              <h4 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Additional Document Context</h4>
              <div className="space-y-3 text-sm">
                  {extractionData?.funding_source && extractionData.funding_source !== "Not Mentioned" && (
                    <div className="p-3 bg-bg-secondary rounded-md border border-surface-border">
                      <span className="text-text-muted font-medium block text-xs mb-0.5">Funding Source Mentioned:</span>
                      <span className="text-text-secondary">{extractionData.funding_source}</span>
                    </div>
                  )}
                  {extractionData?.author_credibility && extractionData.author_credibility !== "No specific author information to assess" && (
                    <div className="p-3 bg-bg-secondary rounded-md border border-surface-border">
                      <span className="text-text-muted font-medium block text-xs mb-0.5">Author Credibility Note:</span>
                      <span className="text-text-secondary">{extractionData.author_credibility}</span>
                    </div>
                  )}
              </div>
          </div>
        ) : null}

        {currentContentAnalysis.warnings && currentContentAnalysis.warnings.length > 0 && (
          <div className="mt-6 pt-4 border-t border-surface-border">
              <h4 className="text-sm font-semibold text-warning mb-2 flex items-center gap-2">
                  <AlertTriangle size={16}/> Processing Notes:
              </h4>
              <ul className="list-disc list-inside text-xs text-warning/80 space-y-1 pl-2">
                  {/* Explicitly type 'warning' as string here */}
                  {currentContentAnalysis.warnings.map((warning: string, idx: number) => <li key={idx}>{warning}</li>)}
              </ul>
          </div>
        )}

      </div>
    </div>
  );
};

export default DocumentSummary;

