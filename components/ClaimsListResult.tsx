import React from 'react';
import { ChevronRight } from 'lucide-react';

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
}

interface ClaimsListResultsProps {
  results: ClaimsListResult[];
}

const ClaimsListResults: React.FC<ClaimsListResultsProps> = ({ results }) => {
  const getStatusBadge = (assessment: string) => {
      // ... (keep existing function)
      const isTrue = assessment.toLowerCase().includes('true');
      return (
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${
            isTrue
              ? 'bg-green-900/20 border-success text-success'
              : 'bg-red-900/20 border-error text-error'
          }`}
        >
          <span className="mr-2">{isTrue ? '✓' : '✗'}</span>
          {isTrue ? 'Verified' : 'Incorrect'}
        </span>
      );
  };

  const getVerificationEmoji = (verdict: string) => {
      // ... (keep existing function)
      switch (verdict) {
        case 'GO': return '✅';
        case 'CHECK': return '⚠️';
        case 'NO GO': return '❌';
        default: return '❓';
      }
  };

  const getVerificationStyle = (verdict: string) => {
      // ... (keep existing function)
       switch (verdict) {
        case 'GO': return 'border-success text-success bg-green-900/20';
        case 'CHECK': return 'border-warning text-warning bg-yellow-900/20';
        case 'NO GO': return 'border-error text-error bg-red-900/20';
        default: return 'border-text-muted text-text-muted bg-gray-900/20';
      }
  };

  return (
    <div className="mt-6 w-full space-y-8"> {/* Increased spacing */}
      {results
      .filter((result) => result.assessment.toLowerCase() !== 'insufficient information')
      .map((result, index) => (
        <div key={index} className="bg-white p-6 border border-surface-border rounded-lg shadow-xl hover:shadow-2xl transition-shadow duration-300"> {/* Use .bg-white for glass effect */}
          <h3 className="font-semibold text-xl text-text-primary mb-4">{result.claim}</h3> {/* Increased size/margin */}

          <div className="flex items-center space-x-4 mb-5"> {/* Increased spacing/margin */}
            {getStatusBadge(result.assessment)}
            <span className="text-text-muted text-sm">
              {result.confidence_score}% Confidence
            </span>
          </div>

          {/* --- MODIFICATION: Removed the outer box styling --- */}
          {result.two_step_verification && (
            <div className="mb-6 mt-5 space-y-4 border-t border-b border-surface-border py-5"> {/* Removed box, added border-t/b & padding */}
              <h4 className="font-semibold text-sm text-text-secondary mb-3 uppercase tracking-wider">2-Step Verification</h4>

              <div className="flex items-start space-x-3">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getVerificationStyle(result.two_step_verification.reality_check)}`}>
                  {getVerificationEmoji(result.two_step_verification.reality_check)} Reality Check
                </span>
                <p className="text-sm text-text-secondary flex-1">{result.two_step_verification.reality_check_reason}</p>
              </div>

              <div className="flex items-start space-x-3">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getVerificationStyle(result.two_step_verification.reliability_check)}`}>
                  {getVerificationEmoji(result.two_step_verification.reliability_check)} Reliability Check
                </span>
                <p className="text-sm text-text-secondary flex-1">{result.two_step_verification.reliability_check_reason}</p>
              </div>

              <div className="pt-3"> {/* Removed border */}
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-text-secondary">Final Verdict:</span>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getVerificationStyle(result.two_step_verification.final_verdict)}`}>
                    {getVerificationEmoji(result.two_step_verification.final_verdict)} {result.two_step_verification.final_verdict}
                  </span>
                </div>
              </div>
            </div>
          )}
          {/* --- END MODIFICATION --- */}

          <p className="text-text-secondary mb-5">{result.summary}</p>

          <div className="pt-4"> {/* Removed border */}
            <div className="flex items-center space-x-2 text-text-muted mb-3">
              <ChevronRight size={18} />
              <span className="font-medium text-sm uppercase tracking-wider">Sources</span>
            </div>

            <ul className="space-y-2 pl-6">
              {result.url_sources && result.url_sources.length > 0 ? (
                result.url_sources.map((source, idx) => (
                  <li key={idx}>
                    <a
                      href={source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-teal hover:text-white text-sm hover:underline break-all"
                    >
                      {getDomainName(source)} {/* Use helper here too */}
                    </a>
                  </li>
                ))
              ) : (
                <li className="text-text-muted italic text-sm">No .org sources available</li>
              )}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
};

// Helper function (add if not globally available)
const getDomainName = (url: string): string => {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch (e) {
    return url;
  }
};


export default ClaimsListResults;