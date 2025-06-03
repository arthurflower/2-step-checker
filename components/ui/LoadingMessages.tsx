// components/ui/LoadingMessages.tsx
"use client";
import { useEffect, useState } from "react";
import { CheckCircle, AlertTriangle, Loader2, Zap, Search, FileText, ListChecks } from "lucide-react"; // Added more icons

interface ProgressUpdate {
  stage: 'idle' | 'analyzing_content' | 'extracting_claims_chunk' | 'extracting_claims_full' | 'searching_sources' | 'verifying_claims' | 'complete' | 'error' | 'parsing_file' | 'uploading_file';
  current: number;
  total: number;
  subMessage?: string;
  overallProgress?: number; // Percentage 0-100 for the entire operation
  message: string;
  msRemaining?: number; // Estimated milliseconds remaining
}

type LoadingMessagesProps = {
  isGenerating: boolean;
  progress?: ProgressUpdate | null;
};

const stageDetails: Record<ProgressUpdate['stage'], { icon: React.ReactNode; defaultMessage: string }> = {
  idle: { icon: <Loader2 className="animate-spin" />, defaultMessage: "Initializing..." },
  parsing_file: { icon: <FileText />, defaultMessage: "Reading file..." },
  uploading_file: { icon: <FileText />, defaultMessage: "Uploading file..." },
  analyzing_content: { icon: <Zap />, defaultMessage: "Analyzing content structure..." },
  extracting_claims_chunk: { icon: <ListChecks />, defaultMessage: "Extracting claims from chunks..." },
  extracting_claims_full: { icon: <ListChecks />, defaultMessage: "Extracting all claims..." },
  searching_sources: { icon: <Search />, defaultMessage: "Searching for verification sources..." },
  verifying_claims: { icon: <CheckCircle />, defaultMessage: "Verifying claims..." },
  complete: { icon: <CheckCircle className="text-green-500" />, defaultMessage: "Analysis complete!" },
  error: { icon: <AlertTriangle className="text-red-500" />, defaultMessage: "An error occurred." },
};


const LoadingMessages: React.FC<LoadingMessagesProps> = ({ isGenerating, progress }) => {
  const [displayMessage, setDisplayMessage] = useState("Initializing analysis...");
  const [estimatedTime, setEstimatedTime] = useState<string>("");

  useEffect(() => {
    if (isGenerating && progress) {
      setDisplayMessage(progress.message);

      if (progress.msRemaining !== undefined) {
        const totalSeconds = Math.ceil(progress.msRemaining / 1000);
        if (totalSeconds > 60) {
          const minutes = Math.floor(totalSeconds / 60);
          const seconds = totalSeconds % 60;
          setEstimatedTime(`~${minutes}m ${seconds}s remaining`);
        } else if (totalSeconds > 0) {
          setEstimatedTime(`~${totalSeconds}s remaining`);
        } else {
          setEstimatedTime("");
        }
      } else {
        setEstimatedTime("");
      }
    } else if (!isGenerating) {
      setDisplayMessage("Analysis complete or not started.");
      setEstimatedTime("");
    }
  }, [isGenerating, progress]);

  if (!isGenerating || !progress) {
    return null; // Don't render anything if not generating or no progress
  }

  const currentStageInfo = stageDetails[progress.stage] || stageDetails.idle;
  const overallProgressPercentage = progress.overallProgress !== undefined ? Math.max(0, Math.min(100, progress.overallProgress)) : 0;

  // Determine current/total for stage if available
  let stageProgressText = "";
  if (progress.total > 1 && (progress.stage === 'extracting_claims_chunk' || progress.stage === 'searching_sources' || progress.stage === 'verifying_claims')) {
    stageProgressText = `(${progress.current}/${progress.total})`;
  }

  return (
    <div className="w-full mt-12 mb-24 opacity-0 animate-fade-up animation-delay-[200ms]">
      <div className="flex flex-col items-center space-y-5 p-6 bg-surface-glass border border-surface-border-strong rounded-xl shadow-xl">
        
        {/* Icon and Main Message */}
        <div className="flex items-center text-xl font-semibold text-text-primary">
          <span className="mr-3 text-accent-primary">{currentStageInfo.icon}</span>
          {displayMessage} {stageProgressText}
        </div>

        {/* Overall Progress Bar */}
        <div className="w-full max-w-md bg-surface-base rounded-full h-3 overflow-hidden border border-surface-border">
          <div
            className="h-full bg-gradient-to-r from-accent-primary/70 to-accent-secondary/70 transition-all duration-300 ease-out rounded-full"
            style={{ width: `${overallProgressPercentage}%` }}
            aria-valuenow={overallProgressPercentage}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        
        <div className="flex justify-between w-full max-w-md text-xs text-text-muted">
            <span>Overall Progress: {Math.round(overallProgressPercentage)}%</span>
            {estimatedTime && <span>{estimatedTime}</span>}
        </div>


        {/* Sub-message / Details */}
        {progress.subMessage && (
          <p className="text-sm text-text-secondary text-center italic">
            {progress.subMessage}
          </p>
        )}

        {/* Tip for long operations */}
        {(progress.stage === 'extracting_claims_chunk' || progress.stage === 'verifying_claims') && overallProgressPercentage < 75 && (progress.total > 10 || (progress.msRemaining || 0) > 60000) && (
          <p className="text-xs text-text-muted text-center mt-3 max-w-sm">
            Large document analysis can take a few minutes. Processing claims and sources in batches for efficiency...
          </p>
        )}
      </div>
    </div>
  );
};

export default LoadingMessages;


