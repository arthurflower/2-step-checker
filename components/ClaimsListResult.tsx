// components/ClaimsListResult.tsx
import React, { useState } from 'react';
import { ChevronRight, ExternalLink, AlertCircle, CheckCircle2, XCircle, Copy, Check } from 'lucide-react';

interface TwoStepVerification {
  reality_check: "GO" | "CHECK" | "NO GO";
  reality_check_reason: string;
  reliability_check: "GO" | "CHECK" | "NO GO";
  reliability_check_reason: string;
  final_verdict: "GO" | "CHECK" | "NO GO";
}

interface ClaimsListResult {
  claim: string;
  assessment: string;
  summary: string;
  fixed_original_text: string;
  confidence_score: number;
  url_sources?: string[];
  two_step_verification?: TwoStepVerification;
  original_text?: string;
}

interface ClaimsListResultsProps {
  results: ClaimsListResult[];
}

const ClaimsListResults: React.FC<ClaimsListResultsProps> = ({ results }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

  const copyToClipboard = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedCards(newExpanded);
  };

  const getStatusIcon = (assessment: string) => {
    const isTrue = assessment.toLowerCase().includes('true');
    return isTrue ? (
      <CheckCircle2 className="w-5 h-5" />
    ) : (
      <XCircle className="w-5 h-5" />
    );
  };

  const getStatusBadge = (assessment: string) => {
    const isTrue = assessment.toLowerCase().includes('true');
    return (
      <span
        className={`badge ${isTrue ? 'badge-success' : 'badge-error'} flex items-center`}
      >
        {getStatusIcon(assessment)}
        <span>{isTrue ? 'Verified' : 'Incorrect'}</span>
      </span>
    );
  };

  const getVerificationIcon = (verdict: string) => {
    switch (verdict) {
      case 'GO': return <CheckCircle2 className="w-4 h-4" />;
      case 'CHECK': return <AlertCircle className="w-4 h-4" />;
      case 'NO GO': return <XCircle className="w-4 h-4" />;
      default: return null;
    }
  };

  const getVerificationStyle = (verdict: string) => {
    switch (verdict) {
      case 'GO': return 'badge-success';
      case 'CHECK': return 'badge-warning';
      case 'NO GO': return 'badge-error';
      default: return '';
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="space-y-6">
      {results
        .filter((result) => result.assessment.toLowerCase() !== 'insufficient information')
        .map((result, index) => {
          const isExpanded = expandedCards.has(index);
          const hasFix = result.fixed_original_text !== result.original_text;
          
          return (
            <div
              key={index}
              className="claim-card glass-card"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-semibold text-lg text-primary flex-1 pr-4">
                  {result.claim}
                </h3>
                <button
                  onClick={() => toggleExpanded(index)}
                  className="text-text-muted hover:text-text-primary transition-colors"
                >
                  <ChevronRight 
                    className={`w-5 h-5 transform transition-transform ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                </button>
              </div>

              {/* Status Row */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                {getStatusBadge(result.assessment)}
                
                <div className="flex items-center gap-2">
                  <span className="text-text-muted text-sm">Confidence:</span>
                  <span className={`font-semibold ${getConfidenceColor(result.confidence_score)}`}>
                    {result.confidence_score}%
                  </span>
                </div>

                {result.two_step_verification && (
                  <span className={`badge ${getVerificationStyle(result.two_step_verification.final_verdict)}`}>
                    {getVerificationIcon(result.two_step_verification.final_verdict)}
                    <span>{result.two_step_verification.final_verdict}</span>
                  </span>
                )}
              </div>

              {/* Summary */}
              <p className="text-text-secondary mb-4">
                {result.summary}
              </p>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="space-y-4 mt-4 pt-4 border-t border-surface-border animate-fade-up">
                  {/* Verification Details */}
                  {result.two_step_verification && (
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm text-text-secondary uppercase tracking-wider">
                        Verification Process
                      </h4>
                      
                      <div className="verification-step">
                        <span className={`badge ${getVerificationStyle(result.two_step_verification.reality_check)}`}>
                          {getVerificationIcon(result.two_step_verification.reality_check)}
                          Reality Check
                        </span>
                        <p className="text-sm text-text-secondary flex-1">
                          {result.two_step_verification.reality_check_reason}
                        </p>
                      </div>

                      <div className="verification-step">
                        <span className={`badge ${getVerificationStyle(result.two_step_verification.reliability_check)}`}>
                          {getVerificationIcon(result.two_step_verification.reliability_check)}
                          Reliability Check
                        </span>
                        <p className="text-sm text-text-secondary flex-1">
                          {result.two_step_verification.reliability_check_reason}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Suggested Fix */}
                  {hasFix && (
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm text-text-secondary uppercase tracking-wider">
                        Suggested Correction
                      </h4>
                      
                      <div className="space-y-2">
                        <div className="p-3 rounded-lg bg-red-900/20 border border-red-500/30">
                          <p className="text-sm text-red-400 line-through">
                            {result.original_text}
                          </p>
                        </div>
                        
                        <div className="p-3 rounded-lg bg-green-900/20 border border-green-500/30">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-green-400 flex-1">
                              {result.fixed_original_text}
                            </p>
                            <button
                              onClick={() => copyToClipboard(result.fixed_original_text, index)}
                              className="text-green-400 hover:text-green-300 transition-colors"
                            >
                              {copiedIndex === index ? (
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
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm text-text-secondary uppercase tracking-wider flex items-center gap-2">
                      <ExternalLink className="w-4 h-4" />
                      Verification Sources
                    </h4>
                    
                    <div className="space-y-2">
                      {result.url_sources && result.url_sources.length > 0 ? (
                        result.url_sources.map((source, idx) => (
                          <a
                            key={idx}
                            href={source}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-accent-primary hover:text-accent-tertiary transition-colors group"
                          >
                            <span className="w-2 h-2 rounded-full bg-accent-primary group-hover:bg-accent-tertiary" />
                            <span className="break-all">{getDomainName(source)}</span>
                            <ExternalLink className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                          </a>
                        ))
                      ) : (
                        <p className="text-sm text-text-muted italic">No .org sources available</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
};

// Helper function
const getDomainName = (url: string): string => {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch (e) {
    return url;
  }
};

export default ClaimsListResults;