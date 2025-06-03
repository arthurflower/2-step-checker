// components/ClaimsListResult.tsx
"use client";
import React, { useState } from "react";
import {
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  MessageSquareQuote,
  Edit3,
  Info,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  ShieldCheck,
  Eye,
  CalendarDays,
  Link2,
  Scale,
  Gauge,
  Lightbulb,
  Brain,
  Layers3,
  Clock4,
  Target,
  FileText,
  Users,
  BookOpen,
  Globe,
  Type, // Added more icons
} from "lucide-react";

// --- Interfaces to match FactChecker.tsx and verifyclaims/route.ts (v2) ---
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
  text: string; // This should be the relevant snippet used by the AI
  url: string;
  source_type: "org" | "edu_gov" | "other";
  title?: string;
  publication_date?: string;
}

interface ClaimResult {
  // This is FactCheckResponse from FactChecker
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
}
// --- End of Interfaces ---

interface ClaimsListResultsProps {
  results: ClaimResult[];
}

const getDomainName = (url: string): string => {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch (e) {
    return url.length > 40 ? url.substring(0, 37) + "..." : url;
  }
};

const SourceCard: React.FC<{ source: ExaSourceForResponse; index: number }> = ({
  source,
  index,
}) => {
  const getSourceTypeIconAndColor = (
    type: ExaSourceForResponse["source_type"],
  ) => {
    switch (type) {
      case "org":
        return {
          icon: <Users size={14} />,
          color: "text-accent-primary",
          label: ".ORG Source",
        };
      case "edu_gov":
        return {
          icon: <BookOpen size={14} />,
          color: "text-accent-tertiary",
          label: ".EDU/.GOV Source",
        };
      default:
        return {
          icon: <Globe size={14} />,
          color: "text-text-muted",
          label: "Other Web Source",
        };
    }
  };
  const typeInfo = getSourceTypeIconAndColor(source.source_type);

  return (
    <div className="source-entry p-3 bg-bg-secondary border border-surface-border rounded-md hover:border-accent-primary transition-all duration-200 group">
      <div className="flex items-center justify-between mb-1.5">
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-accent-primary hover:text-accent-secondary group-hover:underline truncate flex items-center"
          title={source.url}
        >
          <span className="truncate">
            {source.title || getDomainName(source.url)}
          </span>
          <ExternalLink
            size={12}
            className="ml-1.5 flex-shrink-0 opacity-70 group-hover:opacity-100"
          />
        </a>
        <span
          className={`flex items-center text-xs font-medium ${typeInfo.color}`}
        >
          {typeInfo.icon}
          <span className="ml-1 hidden sm:inline">{typeInfo.label}</span>
        </span>
      </div>
      {source.publication_date && source.publication_date !== "N/A" && (
        <p className="text-xs text-text-muted mb-1.5">
          Published: {source.publication_date}
        </p>
      )}
      {source.text && source.text.trim() !== "" && (
        <p className="text-xs text-text-secondary bg-bg-primary p-2 rounded border border-surface-border-strong italic">
          Relevant Snippet: "
          {source.text.length > 200
            ? source.text.substring(0, 197) + "..."
            : source.text}
          "
        </p>
      )}
      {!source.text ||
        (source.text.trim() === "" && (
          <p className="text-xs text-text-muted italic p-2">
            No specific snippet provided by AI for this source.
          </p>
        ))}
    </div>
  );
};

const IndividualClaimCard: React.FC<{ claim: ClaimResult }> = ({ claim }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedText, setCopiedText] = useState<{
    type: string;
    id: string;
  } | null>(null);

  const mdv = claim.multi_dimensional_verification;

  const copyToClipboard = async (text: string, type: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText({ type, id });
      setTimeout(() => setCopiedText(null), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const getOverallStatus = (
    finalVerdict: VerificationCheck["verdict"],
    assessment: ClaimResult["assessment"],
  ) => {
    switch (finalVerdict) {
      case "GO":
        return {
          icon: <ShieldCheck className="w-5 h-5" />,
          badgeClass: "badge-success",
          text: "Verified (GO)",
        };
      case "NO GO":
        return {
          icon: <XCircle className="w-5 h-5" />,
          badgeClass: "badge-error",
          text: "Incorrect (NO GO)",
        };
      case "CHECK":
        return {
          icon: <AlertCircle className="w-5 h-5" />,
          badgeClass: "badge-warning",
          text: "Review (CHECK)",
        };
      default:
        if (assessment === "Insufficient Information")
          return {
            icon: <Info className="w-5 h-5" />,
            badgeClass: "badge-info",
            text: "Unverified",
          };
        if (assessment === "Needs Specialist Review")
          return {
            icon: <Brain className="w-5 h-5" />,
            badgeClass: "badge-info",
            text: "Specialist Review",
          };
        return {
          icon: <HelpCircle className="w-5 h-5" />,
          badgeClass: "badge-info",
          text: "Status Unknown",
        };
    }
  };

  const {
    icon: statusIcon,
    badgeClass: statusBadgeClass,
    text: statusText,
  } = getOverallStatus(mdv.final_verdict, claim.assessment);
  const confidenceScore = mdv.confidence_calibration.score;

  const getConfidenceColor = (score: number | null | undefined) => {
    if (score === null || score === undefined) return "text-text-muted";
    if (score >= 75) return "text-success";
    if (score >= 50) return "text-warning";
    return "text-error";
  };

  const hasMeaningfulFix =
    claim.fixed_original_text &&
    claim.fixed_original_text.trim() !== claim.original_sentence.trim() &&
    claim.fixed_original_text.trim() !== "";

  const DetailSection: React.FC<{
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    count?: number;
  }> = ({ title, children, defaultOpen = false, count }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
      <div className="py-3 border-b border-surface-border last:border-b-0">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between w-full text-left text-sm font-semibold text-text-secondary hover:text-accent-primary transition-colors"
        >
          <span>
            {title} {count !== undefined && `(${count})`}
          </span>
          {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {isOpen && <div className="mt-2 space-y-3 pl-1 pr-1">{children}</div>}
      </div>
    );
  };

  const VerificationCheckItem: React.FC<{
    title: string;
    check: VerificationCheck;
    icon?: React.ReactNode;
  }> = ({ title, check, icon }) => {
    const getVerdictColor = (verdict: VerificationCheck["verdict"]) => {
      switch (verdict) {
        case "GO":
          return "text-success";
        case "CHECK":
          return "text-warning";
        case "NO GO":
          return "text-error";
        default:
          return "text-text-muted";
      }
    };
    const getVerdictIcon = (verdict: VerificationCheck["verdict"]) => {
      switch (verdict) {
        case "GO":
          return <ThumbsUp size={14} />;
        case "CHECK":
          return <HelpCircle size={14} />;
        case "NO GO":
          return <ThumbsDown size={14} />;
        default:
          return <Info size={14} />;
      }
    };

    return (
      <div
        className={`p-3 rounded-lg bg-bg-secondary border border-surface-border transition-all duration-300 ease-in-out`}
      >
        <div className="flex items-center justify-between mb-1">
          <h5 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
            {icon || <Lightbulb size={14} />} {title}
          </h5>
          <span
            className={`text-xs font-bold ${getVerdictColor(check.verdict)} flex items-center gap-1`}
          >
            {getVerdictIcon(check.verdict)} {check.verdict}
            {check.score !== undefined &&
              check.score !== null &&
              ` (${check.score}/100)`}
          </span>
        </div>
        <p className="text-xs text-text-muted leading-relaxed">
          {check.reason || "No specific reason provided."}
        </p>
      </div>
    );
  };

  return (
    <div className="claim-card-expanded p-5 md:p-6 glass-card">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-base md:text-lg text-text-primary flex-1 pr-2">
          <span className="text-accent-secondary mr-1.5 font-bold">
            S{claim.sentence_number}:
          </span>
          {claim.claim_text}
        </h3>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 text-text-muted hover:text-accent-primary transition-colors rounded-md hover:bg-surface-glass-hover"
          aria-label={isExpanded ? "Collapse details" : "Expand details"}
        >
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-sm">
        <span className={`badge ${statusBadgeClass} flex items-center`}>
          {statusIcon}
          <span>{statusText}</span>
        </span>
        <div className="flex items-center gap-1.5 text-text-muted">
          <Gauge size={14} />
          <span>Confidence:</span>
          <span
            className={`font-semibold ${getConfidenceColor(confidenceScore)}`}
          >
            {confidenceScore !== null && confidenceScore !== undefined
              ? `${confidenceScore}%`
              : "N/A"}
          </span>
        </div>
      </div>

      <p className="text-text-secondary text-sm md:text-base mb-4 leading-relaxed">
        {claim.summary}
      </p>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-surface-border-strong space-y-4 animate-fade-up">
          <DetailSection title="Original Context" defaultOpen={true}>
            <div className="detail-content-box italic p-3 text-sm">
              "{claim.original_sentence}"
            </div>
          </DetailSection>

          {hasMeaningfulFix &&
            (mdv.final_verdict === "NO GO" ||
              mdv.final_verdict === "CHECK" ||
              claim.assessment === "False" ||
              claim.assessment === "Ambiguous/Partially True") && (
              <DetailSection title="Suggested Correction" defaultOpen={true}>
                <div className="p-3 rounded-md bg-error/10 border border-error/30 mb-2">
                  <p className="text-sm text-error/90 line-through">
                    {claim.original_sentence}
                  </p>
                </div>
                <div className="p-3 rounded-md bg-success/10 border border-success/30">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-success/90 flex-1">
                      {claim.fixed_original_text}
                    </p>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          claim.fixed_original_text,
                          "fix",
                          claim.claim_id,
                        )
                      }
                      className="text-success hover:text-success/80 transition-colors p-1 flex-shrink-0"
                      aria-label="Copy suggested fix"
                    >
                      {copiedText?.type === "fix" &&
                      copiedText.id === claim.claim_id ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </DetailSection>
            )}

          <DetailSection title="Verification Breakdown" defaultOpen={true}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <VerificationCheckItem
                title="Reality Check"
                check={mdv.reality_check}
                icon={<Eye size={14} />}
              />
              <VerificationCheckItem
                title="Reliability Check"
                check={mdv.reliability_check}
                icon={<ShieldCheck size={14} />}
              />
              <VerificationCheckItem
                title="Context Coherence"
                check={mdv.context_coherence_check}
                icon={<FileText size={14} />}
              />
              <VerificationCheckItem
                title="Temporal Consistency"
                check={mdv.temporal_consistency_check}
                icon={<CalendarDays size={14} />}
              />
              <VerificationCheckItem
                title="Cross-Reference Validation"
                check={mdv.cross_reference_validation}
                icon={<Link2 size={14} />}
              />
              <VerificationCheckItem
                title="Overall Bias Detection"
                check={mdv.bias_detection_analysis_overall}
                icon={<Scale size={14} />}
              />
              {mdv.predictive_accuracy_score_for_claim.verdict !== "N/A" && (
                <VerificationCheckItem
                  title="Predictive Accuracy"
                  check={mdv.predictive_accuracy_score_for_claim}
                  icon={<Target size={14} />}
                />
              )}
            </div>
          </DetailSection>

          <DetailSection title="Claim Characteristics">
            <VerificationCheckItem
              title="Claim Complexity"
              check={mdv.advanced_claim_details.claim_complexity_score}
              icon={<Layers3 size={14} />}
            />
            <VerificationCheckItem
              title="Claim Type"
              check={mdv.advanced_claim_details.claim_type_classification}
              icon={<Type size={14} />}
            />{" "}
            {/* Changed icon */}
          </DetailSection>

          <DetailSection title="Source Analysis Summary">
            <VerificationCheckItem
              title="Source Authority"
              check={mdv.enhanced_source_summary.source_authority_score}
              icon={<ShieldCheck size={14} />}
            />
            <VerificationCheckItem
              title="Source Freshness"
              check={mdv.enhanced_source_summary.source_freshness_index}
              icon={<Clock4 size={14} />}
            />
            <VerificationCheckItem
              title="Source Bias (Collective)"
              check={mdv.enhanced_source_summary.source_bias_detection}
              icon={<Scale size={14} />}
            />
            <VerificationCheckItem
              title="Source Consensus"
              check={mdv.enhanced_source_summary.source_consensus_mapping}
              icon={<Users size={14} />}
            />
          </DetailSection>

          {claim.url_sources_used && claim.url_sources_used.length > 0 ? (
            <DetailSection
              title="Verification Sources Used"
              count={claim.url_sources_used.length}
              defaultOpen={true}
            >
              {" "}
              {/* Always open if sources exist */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {" "}
                {/* Increased max-h */}
                {claim.url_sources_used.map((source, idx) => (
                  <SourceCard key={idx} source={source} index={idx} />
                ))}
              </div>
            </DetailSection>
          ) : (
            <DetailSection title="Verification Sources Used" count={0}>
              <p className="text-xs text-text-muted italic p-1.5 detail-content-box">
                No specific web sources were cited by the AI for this claim's
                verification, or sources were not applicable.
              </p>
            </DetailSection>
          )}
        </div>
      )}
    </div>
  );
};

const ClaimsListResults: React.FC<ClaimsListResultsProps> = ({ results }) => {
  if (results.length === 0) {
    return (
      <div className="text-center py-10 px-4 glass-card">
        <Info size={48} className="mx-auto text-accent-primary mb-4" />
        <h3 className="text-xl font-semibold text-text-primary mb-2">
          No Claims to Display
        </h3>
        <p className="text-text-secondary">
          There are no claims matching the current filter, or no claims were
          processed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {results.map((result) => (
        <IndividualClaimCard
          key={
            result.claim_id ||
            `claim-${result.sentence_number}-${Math.random()}`
          }
          claim={result}
        />
      ))}
    </div>
  );
};

export default ClaimsListResults;
