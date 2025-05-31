// components/DocumentSummary.tsx
import React from 'react';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Info,
  ListChecks,
  BarChart3,
  BookOpen,
  Tag,
  Brain,
  Users,
  AlertTriangle, // <<< ADDED AlertTriangle HERE
  TrendingUp,
  FileCheck,
  Hash
} from 'lucide-react';
import { ContentAnalysis } from '@/lib/contentAnalyzer'; // Assuming path is correct

interface TwoStepVerification {
  reality_check: "GO" | "CHECK" | "NO GO";
  reality_check_reason: string; // Corrected from previous Claude versions
  reliability_check: "GO" | "CHECK" | "NO GO";
  reliability_check_reason: string; // Corrected from previous Claude versions
  final_verdict: "GO" | "CHECK" | "NO GO";
  contradiction_level: "None" | "Low" | "Medium" | "High";
  source_quality_assessment: "Poor" | "Mixed" | "Good" | "Excellent"; // Corrected from previous Claude versions
}

interface ClaimResult {
  claim_id: string;
  claim_text: string;
  assessment: string;
  summary: string;
  fixed_original_text: string; // Corrected from previous Claude versions
  confidence_score: number;
  url_sources?: string[];
  two_step_verification?: TwoStepVerification; // Corrected from previous Claude versions
  original_sentence: string;
  sentence_number: number;
}

interface DocumentSummaryProps {
  results: ClaimResult[];
  analysis: ContentAnalysis | null;
  isLoading: boolean;
  extractionData?: any; // Using 'any' for now as its structure has varied
}

const DocumentSummary: React.FC<DocumentSummaryProps> = ({ results, analysis, isLoading, extractionData }) => {
  if (isLoading && !analysis && !extractionData) {
    return (
      <div className="w-full mb-10 opacity-0 animate-fade-up [animation-delay:200ms]">
        <div className="summary-card p-6 md:p-8 space-y-6">
          <div className="h-8 bg-surface-border rounded w-3/4 shimmer"></div> {/* Title placeholder */}
          <div className="h-16 bg-surface-border rounded shimmer"></div> {/* Overall status placeholder */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-20 bg-surface-border rounded shimmer"></div>)}
          </div>
        </div>
      </div>
    );
  }

  // Use analysis from extractionData if available, otherwise use the direct analysis prop
  const currentAnalysisDetails = extractionData?.analysis || analysis;

  if (!currentAnalysisDetails) {
    return <div className="w-full mb-10 text-center text-text-muted p-6 summary-card">Document analysis data is not available. Please process a document.</div>;
  }

  const relevantResults = results.filter(
    (result) => result.assessment && result.assessment.toLowerCase() !== 'insufficient information'
  );

  const goCount = relevantResults.filter(r => r.two_step_verification?.final_verdict === 'GO').length;
  const checkCount = relevantResults.filter(r => r.two_step_verification?.final_verdict === 'CHECK').length;
  const noGoCount = relevantResults.filter(r => r.two_step_verification?.final_verdict === 'NO GO').length;
  const totalVerifiedClaims = relevantResults.length;
  const totalClaimsProcessed = results.length > 0 ? results.length : (extractionData?.claims?.length || 0) ;


  const accuracyPercentage = totalVerifiedClaims > 0
    ? Math.round((goCount / totalVerifiedClaims) * 100)
    : 0;

  let overallStatus = 'Needs Analysis';
  let statusIcon = <Info className="w-7 h-7" />;
  let statusColor = 'text-info';
  let statusBg = 'bg-info/10';
  let statusBorder = 'border-info/30';
  let statusMessage = 'Analysis pending or no verifiable claims processed.';

  if (totalClaimsProcessed > 0) {
      overallStatus = 'Verified';
      statusIcon = <CheckCircle className="w-7 h-7" />;
      statusColor = 'text-success';
      statusBg = 'bg-success/10';
      statusBorder = 'border-success/30';
      statusMessage = 'Content appears largely accurate based on verified claims.';

      if (noGoCount > Math.max(0, totalVerifiedClaims * 0.05)) { // If more than 5% or any NO GO is problematic
        overallStatus = 'Problematic';
        statusIcon = <XCircle className="w-7 h-7" />;
        statusColor = 'text-error';
        statusBg = 'bg-error/10';
        statusBorder = 'border-error/30';
        statusMessage = `Content contains ${noGoCount > 0 ? 'significant inaccuracies' : 'unverified claims'}.`;
      } else if (checkCount > Math.max(1, totalVerifiedClaims * 0.15)) { // If more than 1 or 15% need review
        overallStatus = 'Needs Review';
        statusIcon = <AlertCircle className="w-7 h-7" />;
        statusColor = 'text-warning';
        statusBg = 'bg-warning/10';
        statusBorder = 'border-warning/30';
        statusMessage = 'Content has areas requiring careful review for accuracy.';
      }
      if (totalVerifiedClaims === 0 && totalClaimsProcessed > 0) {
        overallStatus = 'Unverifiable';
        statusIcon = <Info className="w-7 h-7" />;
        statusColor = 'text-info';
        statusBg = 'bg-info/10';
        statusBorder = 'border-info/30';
        statusMessage = 'Could not verify claims; sources may be insufficient or claims unsuited for verification.';
      }
  }


  const StatDisplay: React.FC<{icon: React.ReactNode, label: string, value: string | number | undefined, unit?: string, colorClass?: string, size?: 'normal' | 'large'}> =
    ({icon, label, value, unit, colorClass = 'text-text-primary', size = 'normal'}) => (
    <div className={`stat-item p-4 rounded-lg bg-surface-glass border border-surface-border flex flex-col ${size === 'large' ? 'items-start col-span-2 sm:col-span-1' : 'items-center text-center'}`}>
      <div className={`mb-1.5 ${colorClass || 'text-accent-primary'}`}>{icon}</div>
      <div className={`font-bold ${colorClass} ${size === 'large' ? 'text-2xl' : 'text-xl'}`}>
        {(value === undefined || value === null || value === "") ? <span className="text-text-muted text-base">N/A</span> : value}
        {value && unit && <span className="text-xs text-text-muted ml-1">{unit}</span>}
      </div>
      <div className={`text-xs text-text-muted ${size === 'large' ? 'mt-0.5' : 'mt-0.5'}`}>{label}</div>
    </div>
  );

  return (
    <div className="w-full mb-10 opacity-0 animate-fade-up [animation-delay:200ms]">
      <div className="summary-card p-6 md:p-8">
        <h2 className="text-2xl md:text-3xl font-bold mb-6 flex items-center gap-3 text-text-primary">
          <FileText className="w-7 h-7 text-accent-primary" />
          Document Verification Summary
        </h2>

        {/* Document Metadata */}
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4 text-sm">
            <StatDisplay icon={<BookOpen size={20}/>} label="Topic" value={extractionData?.topic || currentAnalysisDetails.topic || "Pending..."} size="large"/>
            <StatDisplay icon={<Tag size={20}/>} label="Category" value={extractionData?.category || currentAnalysisDetails.category || "Pending..."} size="large"/>
            <StatDisplay icon={<FileCheck size={20}/>} label="Document Type" value={extractionData?.document_type || "Unknown"} size="large"/>
            <StatDisplay icon={<BarChart3 size={20}/>} label="Words" value={currentAnalysisDetails.wordCount?.toLocaleString()} />
            <StatDisplay icon={<ListChecks size={20}/>} label="Sentences" value={currentAnalysisDetails.sentenceCount?.toLocaleString()} />
            <StatDisplay icon={<Users size={20}/>} label="Words/Sentence" value={currentAnalysisDetails.averageWordsPerSentence} />
            <StatDisplay icon={<Info size={20}/>} label="Pages (est.)" value={currentAnalysisDetails.estimatedPages} />
            <StatDisplay icon={<Hash size={20}/>} label="References Found" value={extractionData?.references_count === 0 ? "0" : extractionData?.references_count || "N/A"} />
            <StatDisplay icon={<Brain size={20}/>} label="Claims Extracted" value={extractionData?.totalClaimsExtracted === 0 ? "0" : extractionData?.totalClaimsExtracted || totalClaimsProcessed} />
        </div>

        {/* Expected Accuracy Range */}
        {extractionData?.expected_accuracy_range && extractionData.expected_accuracy_range !== "Unknown" && (
          <div className="mb-6 p-4 rounded-lg bg-info/10 border border-info/30">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-info" />
              <span className="text-sm font-medium text-info">Note on Document Type: "{extractionData.document_type}" documents typically have an expected accuracy around {extractionData.expected_accuracy_range}.</span>
            </div>
          </div>
        )}

       {/* Overall Assessment */}
       {totalClaimsProcessed > 0 && (
        <div className={`p-5 rounded-xl mb-6 ${statusBg} border ${statusBorder} backdrop-blur-sm`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={statusColor}>{statusIcon}</div>
              <div>
                <h3 className="text-lg font-semibold">
                  Overall Assessment: {overallStatus}
                  {totalVerifiedClaims > 0 && ` (${accuracyPercentage}% Accuracy of Verified)`}
                </h3>
                <p className="text-text-secondary text-sm mt-0.5">{statusMessage}</p>
              </div>
            </div>
          </div>
        </div>
       )}

      {/* Verification Results Counts */}
      {totalClaimsProcessed > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Sentence-Level Verification Results:
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
            <StatDisplay icon={<CheckCircle size={20}/>} label="Verified Accurate (GO)" value={goCount} colorClass="text-success" />
            <StatDisplay icon={<AlertCircle size={20}/>} label="Needs Review (CHECK)" value={checkCount} colorClass="text-warning" />
            <StatDisplay icon={<XCircle size={20}/>} label="Inaccurate (NO GO)" value={noGoCount} colorClass="text-error" />
          </div>
        </div>
      )}

      {/* Additional Document Context from Extraction */}
      {(extractionData?.funding_source && extractionData.funding_source !== "Not Mentioned") || (extractionData?.author_credibility && extractionData.author_credibility !== "No specific author information to assess") ? (
        <div className="mt-6 pt-4 border-t border-surface-border-strong">
            <h4 className="text-sm font-semibold text-text-secondary mb-3">Additional Document Context:</h4>
            <div className="space-y-2 text-sm">
                {extractionData?.funding_source && extractionData.funding_source !== "Not Mentioned" && (
                  <div className="flex items-start gap-2">
                    <span className="text-text-muted font-medium">Funding:</span>
                    <span className="text-text-secondary">{extractionData.funding_source}</span>
                  </div>
                )}
                {extractionData?.author_credibility && extractionData.author_credibility !== "No specific author information to assess" && (
                  <div className="flex items-start gap-2">
                    <span className="text-text-muted font-medium">Author Note:</span>
                    <span className="text-text-secondary">{extractionData.author_credibility}</span>
                  </div>
                )}
            </div>
        </div>
      ) : null}

      {/* Analysis Warnings/Notes */}
      {currentAnalysisDetails.warnings && currentAnalysisDetails.warnings.length > 0 && (
        <div className="mt-6 pt-4 border-t border-surface-border-strong">
            {/* This is where the error was happening */}
            <h4 className="text-sm font-semibold text-warning mb-2 flex items-center gap-2">
                <AlertTriangle size={16}/> Processing Notes:
            </h4>
            <ul className="list-disc list-inside text-xs text-warning/80 space-y-1 pl-2">
                {currentAnalysisDetails.warnings.map((warning, idx) => <li key={idx}>{warning}</li>)}
            </ul>
        </div>
      )}

      </div>
    </div>
  );
};

export default DocumentSummary;