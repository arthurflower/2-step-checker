// PreviewClaimCard.tsx
import React from "react";
import { ChevronRight } from "lucide-react";

interface TwoStepVerification {
  reality_check: "GO" | "CHECK" | "NO GO";
  reality_check_reason: string;
  reliability_check: "GO" | "CHECK" | "NO GO";
  reliability_check_reason: string;
  final_verdict: "GO" | "CHECK" | "NO GO";
}

interface Claim {
  claim: string;
  assessment: string;
  summary: string;
  original_text: string;
  fixed_original_text: string;
  confidence_score: number;
  url_sources?: string[];
  two_step_verification?: TwoStepVerification;
}

interface PreviewClaimCardProps {
  claim: Claim;
  onAcceptFix: (claim: Claim) => void;
}

export const PreviewClaimCard: React.FC<PreviewClaimCardProps> = ({
  claim,
  onAcceptFix,
}) => {
  const isTrue = claim.assessment.toLowerCase().includes("true");
  const hasFix = claim.fixed_original_text !== claim.original_text;

  const getVerificationEmoji = (verdict: string) => {
    switch (verdict) {
      case "GO":
        return "✅";
      case "CHECK":
        return "⚠️";
      case "NO GO":
        return "❌";
      default:
        return "❓";
    }
  };

  const getVerificationStyle = (verdict: string) => {
    switch (verdict) {
      case "GO":
        return "text-green-700 bg-green-50 border-green-200";
      case "CHECK":
        return "text-yellow-700 bg-yellow-50 border-yellow-200";
      case "NO GO":
        return "text-red-700 bg-red-50 border-red-200";
      default:
        return "text-gray-700 bg-gray-50 border-gray-200";
    }
  };

  return (
    <div className="bg-white border rounded-lg shadow-sm p-6 space-y-4 opacity-0 animate-fade-up [animation-delay:600ms]">
      <h3 className="font-semibold text-lg text-gray-900">{claim.claim}</h3>

      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium ${
            isTrue
              ? "bg-green-100 text-green-800 border border-green-200"
              : "bg-red-100 text-red-800 border border-red-200"
          }`}
        >
          <span className="mr-2">{isTrue ? "✅" : "❌"}</span>
          {isTrue ? "Supported" : "Refuted"}
        </span>
        <span className="text-gray-600 text-sm">
          {claim.confidence_score}% Confident
        </span>
      </div>

      {/* 2-Step Verification Section */}
      {claim.two_step_verification && (
        <div className="bg-gray-50 p-3 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <span
              className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${getVerificationStyle(claim.two_step_verification.reality_check)}`}
            >
              {getVerificationEmoji(claim.two_step_verification.reality_check)}{" "}
              Reality
            </span>
            <span
              className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${getVerificationStyle(claim.two_step_verification.reliability_check)}`}
            >
              {getVerificationEmoji(
                claim.two_step_verification.reliability_check,
              )}{" "}
              Reliability
            </span>
            <span
              className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${getVerificationStyle(claim.two_step_verification.final_verdict)}`}
            >
              {getVerificationEmoji(claim.two_step_verification.final_verdict)}{" "}
              Final
            </span>
          </div>
        </div>
      )}

      <p className="text-gray-700">{claim.summary}</p>

      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-2 text-gray-700">
          <ChevronRight size={20} />
          <span className="font-medium">Sources</span>
        </div>

        <ul className="space-y-2 pl-6">
          {claim.url_sources && claim.url_sources.length > 0 ? (
            claim.url_sources.slice(0, 2).map((source, idx) => (
              <li key={idx}>
                <a
                  href={source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 hover:underline text-sm break-all"
                >
                  {new URL(source).hostname.replace("www.", "")}
                </a>
              </li>
            ))
          ) : (
            <li className="text-gray-500 italic">No sources available</li>
          )}
        </ul>
      </div>

      {hasFix && (
        <div className="pt-5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700">Suggested Fix</span>
          </div>
          <div className="space-y-2 pb-2">
            <p className="text-gray-500 line-through">{claim.original_text}</p>
            <p className="text-green-700">{claim.fixed_original_text}</p>
          </div>
          <button
            onClick={() => onAcceptFix(claim)}
            className="w-full mt-4 px-4 py-2 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-900 transition-colors"
          >
            Accept Fix
          </button>
        </div>
      )}
    </div>
  );
};
