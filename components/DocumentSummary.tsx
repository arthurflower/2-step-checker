// components/DocumentSummary.tsx
import React from 'react';

interface TwoStepVerification {
  reality_check: "GO" | "CHECK" | "NO GO";
  reality_check_reason: string;
  reliability_check: "GO" | "CHECK" | "NO GO";
  reliability_check_reason: string;
  final_verdict: "GO" | "CHECK" | "NO GO";
}

interface ClaimResult {
  claim: string;
  assessment: string;
  summary: string;
  fixed_original_text: string;
  confidence_score: number;
  url_sources?: string[];
  two_step_verification?: TwoStepVerification;
}

interface DocumentSummaryProps {
  results: ClaimResult[];
}

const DocumentSummary: React.FC<DocumentSummaryProps> = ({ results }) => {
  const filteredResults = results.filter(
    (result) => result.assessment.toLowerCase() !== 'insufficient information'
  );

  const goCount = filteredResults.filter(
    (result) => result.two_step_verification?.final_verdict === 'GO'
  ).length;

  const checkCount = filteredResults.filter(
    (result) => result.two_step_verification?.final_verdict === 'CHECK'
  ).length;

  const noGoCount = filteredResults.filter(
    (result) => result.two_step_verification?.final_verdict === 'NO GO'
  ).length;

  const totalSentences = filteredResults.length;

  // Determine overall document decision
  let overallDecision = 'GO';
  let overallEmoji = '✅';
  let overallStyle = 'bg-green-50 text-green-800 border-green-200';
  let overallMessage = 'Document is highly accurate and reliable';

  if (noGoCount > 0) {
    overallDecision = 'NO GO';
    overallEmoji = '❌';
    overallStyle = 'bg-red-50 text-red-800 border-red-200';
    overallMessage = 'Document contains significant factual inaccuracies';
  } else if (checkCount > 2 || (checkCount / totalSentences) > 0.3) {
    overallDecision = 'CHECK';
    overallEmoji = '⚠️';
    overallStyle = 'bg-yellow-50 text-yellow-800 border-yellow-200';
    overallMessage = 'Document needs manual review for some claims';
  }

  return (
    <div className="w-full mb-8 opacity-0 animate-fade-up [animation-delay:200ms]">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Document Verification Summary</h2>
        
        {/* Overall Verdict */}
        <div className={`p-4 rounded-lg mb-4 border ${overallStyle}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">{overallEmoji}</span>
              <div>
                <h3 className="text-lg font-semibold">Overall Document: {overallDecision}</h3>
                <p className="text-sm mt-1">{overallMessage}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-sm text-gray-600">Total Claims Analyzed</p>
            <p className="text-2xl font-semibold text-gray-900">{totalSentences}</p>
          </div>
          
          <div className="bg-green-50 p-3 rounded-lg border border-green-200">
            <p className="text-sm text-green-700">✅ GO (Verified)</p>
            <p className="text-2xl font-semibold text-green-800">{goCount}</p>
          </div>
          
          <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
            <p className="text-sm text-yellow-700">⚠️ CHECK (Review)</p>
            <p className="text-2xl font-semibold text-yellow-800">{checkCount}</p>
          </div>
          
          <div className="bg-red-50 p-3 rounded-lg border border-red-200">
            <p className="text-sm text-red-700">❌ NO GO (Failed)</p>
            <p className="text-2xl font-semibold text-red-800">{noGoCount}</p>
          </div>
        </div>

        {/* Problem Claims List */}
        {(noGoCount > 0 || checkCount > 0) && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            {noGoCount > 0 && (
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-red-700 mb-2">❌ Failed Verification Claims:</h4>
                <ul className="space-y-1">
                  {filteredResults
                    .filter(result => result.two_step_verification?.final_verdict === 'NO GO')
                    .map((result, idx) => (
                      <li key={idx} className="text-sm text-gray-700">
                        • {result.claim.substring(0, 100)}...
                      </li>
                    ))}
                </ul>
              </div>
            )}
            
            {checkCount > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-yellow-700 mb-2">⚠️ Claims Needing Review:</h4>
                <ul className="space-y-1">
                  {filteredResults
                    .filter(result => result.two_step_verification?.final_verdict === 'CHECK')
                    .map((result, idx) => (
                      <li key={idx} className="text-sm text-gray-700">
                        • {result.claim.substring(0, 100)}...
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentSummary;