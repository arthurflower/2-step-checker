// components/DocumentSummary.tsx
import React from 'react';
import { CheckCircle, XCircle, AlertCircle, FileText, Info, ListChecks, BarChart3, BookOpen, Tag, Brain, Users } from 'lucide-react';
import { ContentAnalysis } from '@/lib/contentAnalyzer';

interface TwoStepVerification {
  reality_check: "GO" | "CHECK" | "NO GO";
  reality_check_reason: string;
  reliability_check: "GO" | "CHECK" | "NO GO";
  reliability_check_reason: string;
  final_verdict: "GO" | "CHECK" | "NO GO";
}

interface ClaimResult {
  claim_id: string;
  claim_text: string;
  assessment: string;
  summary: string;
  fixed_original_text: string;
  confidence_score: number;
  url_sources?: string[];
  two_step_verification?: TwoStepVerification;
  original_sentence: string;
  sentence_number: number;
}

interface DocumentSummaryProps {
  results: ClaimResult[];
  analysis: ContentAnalysis | null;
  isLoading: boolean;
}

const DocumentSummary: React.FC<DocumentSummaryProps> = ({ results, analysis, isLoading }) => {
  if (isLoading && !analysis) {
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

  if (!analysis) {
    return <div className="w-full mb-10 text-center text-text-muted p-6 summary-card">Document analysis data is not available. Please try again.</div>;
  }
  
  const relevantResults = results.filter(
    (result) => result.assessment.toLowerCase() !== 'insufficient information'
  );

  const goCount = relevantResults.filter(r => r.two_step_verification?.final_verdict === 'GO').length;
  const checkCount = relevantResults.filter(r => r.two_step_verification?.final_verdict === 'CHECK').length;
  const noGoCount = relevantResults.filter(r => r.two_step_verification?.final_verdict === 'NO GO').length;
  const totalVerifiedClaims = relevantResults.length;
  const totalClaimsProcessed = results.length;

  let overallStatus = 'Verified';
  let statusIcon = <CheckCircle className="w-7 h-7" />;
  let statusColor = 'text-success';
  let statusBg = 'bg-success/10';
  let statusBorder = 'border-success/30';
  let statusMessage = 'Content appears largely accurate based on verified claims.';

  if (noGoCount > 0) {
    overallStatus = 'Problematic';
    statusIcon = <XCircle className="w-7 h-7" />;
    statusColor = 'text-error';
    statusBg = 'bg-error/10';
    statusBorder = 'border-error/30';
    statusMessage = 'Content contains significant inaccuracies or unverified claims.';
  } else if (checkCount > Math.max(2, totalVerifiedClaims * 0.2)) { // If more than 2 or 20% need review
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
    statusMessage = 'Could not verify claims due to insufficient information from sources.';
  }

  const StatDisplay: React.FC<{icon: React.ReactNode, label: string, value: string | number | undefined, unit?: string, colorClass?: string, size?: 'normal' | 'large'}> = 
    ({icon, label, value, unit, colorClass = 'text-text-primary', size = 'normal'}) => (
    <div className={`stat-item p-4 rounded-lg bg-surface-glass border border-surface-border flex flex-col ${size === 'large' ? 'items-start col-span-2 md:col-span-1' : 'items-center text-center'}`}>
      <div className={`mb-1.5 ${colorClass || 'text-accent-primary'}`}>{icon}</div>
      <div className={`font-bold ${colorClass} ${size === 'large' ? 'text-2xl' : 'text-xl'}`}>
        {value ?? <span className="text-text-muted text-base">N/A</span>}
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
          Document Analysis Report
        </h2>
        
        <div className="mb-6 grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 text-sm">
            <StatDisplay icon={<BookOpen size={20}/>} label="Topic" value={analysis.topic || "Pending..."} size="large"/>
            <StatDisplay icon={<Tag size={20}/>} label="Category" value={analysis.category || "Pending..."} size="large"/>
            <StatDisplay icon={<BarChart3 size={20}/>} label="Words" value={analysis.wordCount.toLocaleString()} />
            <StatDisplay icon={<ListChecks size={20}/>} label="Sentences" value={analysis.sentenceCount.toLocaleString()} />
            <StatDisplay icon={<Users size={20}/>} label="Words/Sentence" value={analysis.averageWordsPerSentence} />
            <StatDisplay icon={<Info size={20}/>} label="Pages (est.)" value={analysis.estimatedPages} />
        </div>

       {totalClaimsProcessed > 0 && (
        <div className={`p-5 rounded-xl mb-6 ${statusBg} border ${statusBorder} backdrop-blur-sm`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={statusColor}>{statusIcon}</div>
              <div>
                <h3 className="text-lg font-semibold">
                  Overall Assessment: {overallStatus}
                </h3>
                <p className="text-text-secondary text-sm mt-0.5">{statusMessage}</p>
              </div>
            </div>
          </div>
        </div>
       )}

      {totalClaimsProcessed > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Claim Verification Counts:</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
            <StatDisplay icon={<CheckCircle size={20}/>} label="Verified Accurate (GO)" value={goCount} colorClass="text-success" />
            <StatDisplay icon={<AlertCircle size={20}/>} label="Needs Review (CHECK)" value={checkCount} colorClass="text-warning" />
            <StatDisplay icon={<XCircle size={20}/>} label="Inaccurate (NO GO)" value={noGoCount} colorClass="text-error" />
          </div>
        </div>
      )}
      
      {analysis.warnings && analysis.warnings.length > 0 && (
        <div className="mt-6 pt-4 border-t border-surface-border-strong">
            <h4 className="text-sm font-semibold text-warning mb-2 flex items-center gap-2">
                <AlertTriangle size={16}/> Analysis Notes & Warnings:
            </h4>
            <ul className="list-disc list-inside text-xs text-warning/80 space-y-1 pl-2">
                {analysis.warnings.map((warning, idx) => <li key={idx}>{warning}</li>)}
            </ul>
        </div>
      )}

      </div>
    </div>
  );
};

export default DocumentSummary;
