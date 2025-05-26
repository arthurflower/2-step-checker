import { useEffect, useState } from "react";

type LoadingMessagesProps = {
  isGenerating: boolean;
};

const loadingMessages = [
  "Analyzing your content...",
  "Extracting key claims...",
  "Searching for reliable sources...",
  "Verifying claim accuracy...",
  "Generating results...",
  "Almost complete..."
];

const LoadingMessages: React.FC<LoadingMessagesProps> = ({ isGenerating }) => {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isGenerating) {
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
  }, [isGenerating]);

  return (
    <div className="w-full mt-12 mb-24">
      <div className="flex flex-col items-center space-y-4">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-gray-200 rounded-full"></div>
          <div className="absolute top-0 left-0 w-12 h-12 border-4 border-gray-800 rounded-full animate-spin border-t-transparent"></div>
        </div>
        
        <div className="text-gray-600 text-lg opacity-0 animate-fade-up [animation-delay:200ms]">
          {isGenerating ? loadingMessages[currentMessageIndex] : ""}
        </div>
      </div>
    </div>
  );
};

export default LoadingMessages;