// components/ClaimsListResult.tsx
import React, { useState } from 'react';
import { ExternalLink, AlertCircle, CheckCircle2, XCircle, Copy, Check, MessageSquareQuote, Edit3, Info } from 'lucide-react';

interface TwoStepVerification {
  reality_check: "GO" | "CHECK" | "NO GO";
  reality_check_reason: string;
  reliability_check: "GO" | "CHECK" | "NO GO";
  reliability_check_reason: string;
  final_verdict: "GO" | "CHECK" | "NO GO";
  contradiction_level: "None" | "Low" | "Medium" | "High";
  source_quality_assessment: "Poor" | "Mixed" | "Good" | "Excellent";
}

interface ClaimsListResult {
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

interface ClaimsListResultsProps {
  results: ClaimsListResult[];
}

const ClaimsListResults: React.FC<ClaimsListResultsProps> = ({ results }) => {
  const [copiedText, setCopiedText] = useState<{type: string, id: string} | null>(null);

  const copyToClipboard = async (text: string, type: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText({type, id});
      setTimeout(() => setCopiedText(null), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const getStatusIconAndClass = (assessment: string, finalVerdict?: string) => {
    const verdict = finalVerdict || assessment; 
    switch (verdict.toLowerCase()) {
      case 'true':
      case 'go':
        return { icon: <CheckCircle2 className="w-5 h-5" />, badgeClass: 'badge-success', text: 'Verified' };
      case 'false':
      case 'no go':
        return { icon: <XCircle className="w-5 h-5" />, badgeClass: 'badge-error', text: 'Incorrect' };
      case 'ambiguous/partially true':
      case 'check':
        return { icon: <AlertCircle className="w-5 h-5" />, badgeClass: 'badge-warning', text: 'Needs Review' };
      case 'insufficient information':
        return { icon: <Info className="w-5 h-5" />, badgeClass: 'badge-info', text: 'Unverified' }; // Using Info icon
      default:
        return { icon: <Info className="w-5 h-5" />, badgeClass: 'badge-info', text: 'Status Unknown' };
    }
  };

  const getVerificationIcon = (verdict: string) => {
    switch (verdict) {
      case 'GO': return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'CHECK': return <AlertCircle className="w-3.5 h-3.5" />;
      case 'NO GO': return <XCircle className="w-3.5 h-3.5" />;
      default: return <Info className="w-3.5 h-3.5"/>;
    }
  };

  const getVerificationStyle = (verdict: string) => {
    switch (verdict) {
      case 'GO': return 'badge-success';
      case 'CHECK': return 'badge-warning';
      case 'NO GO': return 'badge-error';
      default: return 'badge-info';
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    if (score >= 30) return 'text-orange-400'; 
    return 'text-error';
  };

  if (results.length === 0) {
    return (
        <div className="text-center py-10 px-4 claim-card-expanded">
            <Info size={48} className="mx-auto text-accent-primary mb-4" />
            <h3 className="text-xl font-semibold text-text-primary mb-2">No Claims to Display</h3>
            <p className="text-text-secondary">There are no claims matching the current filter, or no claims were processed.</p>
        </div>
    );
  }

  return (
    <div className="space-y-6">
      {results.map((result, index) => {
          const hasMeaningfulFix = result.fixed_original_text && result.fixed_original_text.trim() !== result.original_sentence.trim() && result.fixed_original_text.trim() !== "";
          const { icon: statusIcon, badgeClass: statusBadgeClass, text: statusText } = getStatusIconAndClass(result.assessment, result.two_step_verification?.final_verdict);
          const uniqueClaimId = result.claim_id || `claim-${index}`;
          
          return (
            <div key={uniqueClaimId} className="claim-card-expanded p-5 md:p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-base md:text-lg text-text-primary flex-1 pr-4">
                  <span className="text-accent-tertiary mr-1.5 font-medium">S{result.sentence_number}:</span>{result.claim_text}
                </h3>
                {/* Expansion arrow removed */}
              </div>

              {/* Status Row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-sm">
                <span className={`badge ${statusBadgeClass} flex items-center`}>
                  {statusIcon}
                  <span>{statusText}</span>
                </span>
                
                <div className="flex items-center gap-1.5">
                  <span className="text-text-muted">Confidence:</span>
                  <span className={`font-semibold ${getConfidenceColor(result.confidence_score)}`}>
                    {result.confidence_score}%
                  </span>
                </div>

                {result.two_step_verification && (
                  <span className={`badge ${getVerificationStyle(result.two_step_verification.final_verdict)}`}>
                    {getVerificationIcon(result.two_step_verification.final_verdict)}
                    <span>Final: {result.two_step_verification.final_verdict}</span>
                  </span>
                )}
              </div>

              {/* Summary */}
              <p className="text-text-secondary text-sm md:text-base mb-4">
                {result.summary}
              </p>

              {/* Always Expanded Content */}
              <div className="space-y-5 mt-4 pt-4 border-t border-surface-border-strong">
                  {/* Original Sentence */}
                   <div className="space-y-2">
                    <h4 className="detail-header">
                      <MessageSquareQuote className="w-3.5 h-3.5" />
                      Original Context (Sentence #{result.sentence_number})
                    </h4>
                    <div className="detail-content-box italic">
                      "{result.original_sentence}"
                    </div>
                  </div>

                  {/* Verification Details */}
                  {result.two_step_verification && (
                    <div className="space-y-3">
                      <h4 className="detail-header">
                        Verification Breakdown
                      </h4>
                      
                      <div className="verification-step-expanded p-3">
                        <div className="flex items-center justify-between w-full mb-1">
                            <span className={`badge ${getVerificationStyle(result.two_step_verification.reality_check)} text-xs`}>
                            {getVerificationIcon(result.two_step_verification.reality_check)}
                            Reality Check
                            </span>
                            <span className={`text-xs font-medium ${getVerificationStyle(result.two_step_verification.reality_check).replace('badge-', 'text-')}`}>
                                {result.two_step_verification.reality_check}
                            </span>
                        </div>
                        <p className="text-xs md:text-sm text-text-secondary">
                          {result.two_step_verification.reality_check_reason}
                        </p>
                      </div>

                      <div className="verification-step-expanded p-3">
                         <div className="flex items-center justify-between w-full mb-1">
                            <span className={`badge ${getVerificationStyle(result.two_step_verification.reliability_check)} text-xs`}>
                            {getVerificationIcon(result.two_step_verification.reliability_check)}
                            Reliability Check
                            </span>
                            <span className={`text-xs font-medium ${getVerificationStyle(result.two_step_verification.reliability_check).replace('badge-', 'text-')}`}>
                                {result.two_step_verification.reliability_check}
                            </span>
                        </div>
                        <p className="text-xs md:text-sm text-text-secondary">
                          {result.two_step_verification.reliability_check_reason}
                        </p>
                      </div>
                       <div className="grid grid-cols-2 gap-3 text-xs md:text-sm">
                            <div className="detail-content-box p-2">
                                <span className="block text-text-muted text-xs">Contradiction:</span>
                                <span className="font-medium text-text-primary">{result.two_step_verification.contradiction_level}</span>
                            </div>
                            <div className="detail-content-box p-2">
                                <span className="block text-text-muted text-xs">Source Quality:</span>
                                <span className="font-medium text-text-primary">{result.two_step_verification.source_quality_assessment}</span>
                            </div>
                        </div>
                    </div>
                  )}

                  {/* Suggested Fix */}
                  {hasMeaningfulFix && (result.assessment.toLowerCase() === 'false' || result.assessment.toLowerCase() === 'ambiguous/partially true') && (
                    <div className="space-y-2">
                      <h4 className="detail-header">
                        <Edit3 className="w-3.5 h-3.5" />
                        Suggested Correction for Original Sentence
                      </h4>
                      
                      <div className="space-y-2">
                        <div className="p-3 rounded-md bg-error/10 border border-error/30">
                          <p className="text-sm text-error/90 line-through">
                            {result.original_sentence}
                          </p>
                        </div>
                        
                        <div className="p-3 rounded-md bg-success/10 border border-success/30">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-success/90 flex-1">
                              {result.fixed_original_text}
                            </p>
                            <button
                              onClick={() => copyToClipboard(result.fixed_original_text, 'fix', uniqueClaimId)}
                              className="text-success hover:text-success/80 transition-colors p-1"
                              aria-label="Copy suggested fix"
                            >
                              {copiedText?.type === 'fix' && copiedText.id === uniqueClaimId ? (
                                <Check className="w-4 h-4" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sources */}
                  {(result.url_sources && result.url_sources.length > 0) && (
                    <div className="space-y-2">
                      <h4 className="detail-header">
                        <ExternalLink className="w-3.5 h-3.5" />
                        Verification Sources ({result.url_sources.length})
                      </h4>
                      
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                        {result.url_sources.map((source, idx) => (
                          <a
                            key={idx}
                            href={source}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="source-link group"
                            title={source}
                          >
                            <span className="source-link-icon" />
                            <span className="truncate break-all">{getDomainName(source)}</span>
                            <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 ml-auto flex-shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {(!result.url_sources || result.url_sources.length === 0) && (
                     <div className="space-y-2">
                        <h4 className="detail-header">
                            <ExternalLink className="w-3.5 h-3.5" />
                            Verification Sources
                        </h4>
                        <p className="text-xs md:text-sm text-text-muted italic p-1.5 detail-content-box">No web sources were found or used for this specific claim's verification by the AI.</p>
                    </div>
                  )}
                </div>
              {/* End of Always Expanded Content */}
            </div>
          );
        })}
    </div>
  );
};

const getDomainName = (url: string): string => {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch (e) {
    return url.length > 40 ? url.substring(0, 37) + '...' : url;
  }
};

export default ClaimsListResults;
