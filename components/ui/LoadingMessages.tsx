// components/ui/LoadingMessages.tsx
import { useEffect, useState } from "react";

interface ProgressUpdate {
  stage: 'extracting' | 'searching' | 'verifying' | 'complete';
  current: number;
  total: number;
  message: string;
}

type LoadingMessagesProps = {
  isGenerating: boolean;
  progress?: ProgressUpdate | null;
};

const loadingMessages = [
  "Analyzing your content...",
  "Extracting key claims...",
  "Searching for reliable sources...",
  "Verifying claim accuracy...",
  "Generating results...",
  "Almost complete..."
];

const LoadingMessages: React.FC<LoadingMessagesProps> = ({ isGenerating, progress }) => {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isGenerating && !progress) {
      setCurrentMessageIndex(0);

      intervalId = setInterval(() => {
        setCurrentMessageIndex((prevIndex) => {
          const nextIndex = prevIndex + 1;

          if (nextIndex < loadingMessages.length) {
            return nextIndex;
          } else {
            clearInterval(intervalId);
            return prevIndex;
          }
        });
      }, 2000);
    } else {
      setCurrentMessageIndex(0);
    }

    return () => clearInterval(intervalId);
  }, [isGenerating, progress]);

  const getProgressPercentage = () => {
    if (!progress || progress.total === 0) return 0;
    return Math.round((progress.current / progress.total) * 100);
  };

  const getStageIcon = (stage: string) => {
    switch (stage) {
      case 'extracting':
        return '🔍';
      case 'searching':
        return '🌐';
      case 'verifying':
        return '✓';
      case 'complete':
        return '✨';
      default:
        return '⏳';
    }
  };

  return (
    <div className="w-full mt-12 mb-24">
      <div className="flex flex-col items-center space-y-6">
        {/* Spinner or Progress */}
        {!progress ? (
          <div className="relative">
            <div className="w-12 h-12 border-4 border-gray-200 rounded-full"></div>
            <div className="absolute top-0 left-0 w-12 h-12 border-4 border-gray-800 rounded-full animate-spin border-t-transparent"></div>
          </div>
        ) : (
          <div className="w-full max-w-md space-y-4">
            {/* Progress Bar */}
            <div className="relative">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-500 ease-out"
                  style={{ width: `${getProgressPercentage()}%` }}
                />
              </div>
              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-2xl">
                {getStageIcon(progress.stage)}
              </div>
            </div>
            
            {/* Progress Stats */}
            <div className="flex justify-between text-sm text-gray-600">
              <span>{progress.current} / {progress.total}</span>
              <span>{getProgressPercentage()}%</span>
            </div>
          </div>
        )}
        
        {/* Message */}
        <div className="text-gray-600 text-lg opacity-0 animate-fade-up [animation-delay:200ms] text-center">
          {progress ? progress.message : (isGenerating ? loadingMessages[currentMessageIndex] : "")}
        </div>

        {/* Additional Context for Long Operations */}
        {progress && progress.total > 10 && (
          <div className="text-sm text-gray-500 text-center max-w-md opacity-0 animate-fade-up [animation-delay:400ms]">
            Processing multiple claims in parallel for faster results...
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadingMessages;