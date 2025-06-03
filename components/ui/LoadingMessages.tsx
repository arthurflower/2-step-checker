// components/ui/LoadingMessages.tsx - Updated with Dynamic Liquid Loading
"use client";
import DynamicLiquidLoading from "./DynamicLiquidLoading";

interface ProgressUpdate {
  stage:
    | "idle"
    | "analyzing_content"
    | "extracting_claims_chunk"
    | "extracting_claims_full"
    | "searching_sources"
    | "verifying_claims"
    | "complete"
    | "error"
    | "parsing_file"
    | "uploading_file";
  current: number;
  total: number;
  subMessage?: string;
  overallProgress?: number;
  message: string;
  msRemaining?: number;
}

type LoadingMessagesProps = {
  isGenerating: boolean;
  progress?: ProgressUpdate | null;
};

const LoadingMessages: React.FC<LoadingMessagesProps> = ({
  isGenerating,
  progress,
}) => {
  return (
    <DynamicLiquidLoading isGenerating={isGenerating} progress={progress} />
  );
};

export default LoadingMessages;
