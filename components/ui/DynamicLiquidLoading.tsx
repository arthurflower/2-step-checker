// components/ui/DynamicLiquidLoading.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import {
  Zap,
  Search,
  CheckCircle,
  FileText,
  ListChecks,
  AlertTriangle,
  Loader2,
  Database,
  Shield,
  Globe,
} from "lucide-react";

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

interface DynamicLiquidLoadingProps {
  isGenerating: boolean;
  progress?: ProgressUpdate | null;
}

const stageConfig = {
  idle: {
    icon: Loader2,
    color: "#00ffff",
    bgColor: "rgba(0, 255, 255, 0.1)",
    liquidColor: "#00ffff",
    speed: 2,
    intensity: 0.3,
  },
  parsing_file: {
    icon: FileText,
    color: "#ffff00",
    bgColor: "rgba(255, 255, 0, 0.1)",
    liquidColor: "#ffff00",
    speed: 3,
    intensity: 0.4,
  },
  uploading_file: {
    icon: FileText,
    color: "#ffff00",
    bgColor: "rgba(255, 255, 0, 0.1)",
    liquidColor: "#ffff00",
    speed: 2.5,
    intensity: 0.35,
  },
  analyzing_content: {
    icon: Zap,
    color: "#ff00ff",
    bgColor: "rgba(255, 0, 255, 0.1)",
    liquidColor: "#ff00ff",
    speed: 4,
    intensity: 0.6,
  },
  extracting_claims_chunk: {
    icon: ListChecks,
    color: "#00ff00",
    bgColor: "rgba(0, 255, 0, 0.1)",
    liquidColor: "#00ff00",
    speed: 3.5,
    intensity: 0.5,
  },
  extracting_claims_full: {
    icon: ListChecks,
    color: "#00ff00",
    bgColor: "rgba(0, 255, 0, 0.1)",
    liquidColor: "#00ff00",
    speed: 3,
    intensity: 0.45,
  },
  searching_sources: {
    icon: Search,
    color: "#ff8800",
    bgColor: "rgba(255, 136, 0, 0.1)",
    liquidColor: "#ff8800",
    speed: 5,
    intensity: 0.8,
  },
  verifying_claims: {
    icon: Shield,
    color: "#8800ff",
    bgColor: "rgba(136, 0, 255, 0.1)",
    liquidColor: "#8800ff",
    speed: 4.5,
    intensity: 0.7,
  },
  complete: {
    icon: CheckCircle,
    color: "#00ff00",
    bgColor: "rgba(0, 255, 0, 0.1)",
    liquidColor: "#00ff00",
    speed: 1,
    intensity: 0.2,
  },
  error: {
    icon: AlertTriangle,
    color: "#ff0000",
    bgColor: "rgba(255, 0, 0, 0.1)",
    liquidColor: "#ff0000",
    speed: 1,
    intensity: 0.3,
  },
};

const DynamicLiquidLoading: React.FC<DynamicLiquidLoadingProps> = ({
  isGenerating,
  progress,
}) => {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [bubbles, setBubbles] = useState<
    Array<{ id: number; x: number; size: number; delay: number }>
  >([]);
  const [liquidOffset, setLiquidOffset] = useState(0);
  const [pulseIntensity, setPulseIntensity] = useState(0.5);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number>(Date.now());

  // Get current stage configuration
  const currentStage = progress?.stage || "idle";
  const stageInfo = stageConfig[currentStage];
  const targetProgress = progress?.overallProgress || 0;

  // Smooth progress animation
  useEffect(() => {
    if (!isGenerating) {
      setAnimatedProgress(0);
      return;
    }

    const animate = () => {
      setAnimatedProgress((prev) => {
        const diff = targetProgress - prev;
        const increment = diff * 0.1; // Smooth easing
        return prev + increment;
      });

      // Update liquid animation
      setLiquidOffset((prev) => (prev + stageInfo.speed) % 360);

      // Dynamic pulse based on stage intensity and progress
      const baseIntensity = stageInfo.intensity;
      const progressBoost = (targetProgress / 100) * 0.3;
      const timeVariation = Math.sin(Date.now() / 1000) * 0.1;
      setPulseIntensity(baseIntensity + progressBoost + timeVariation);

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isGenerating, targetProgress, stageInfo.speed, stageInfo.intensity]);

  // Generate dynamic bubbles
  useEffect(() => {
    if (!isGenerating) {
      setBubbles([]);
      return;
    }

    const generateBubbles = () => {
      const bubbleCount = Math.floor(5 + pulseIntensity * 10);
      const newBubbles = Array.from({ length: bubbleCount }, (_, i) => ({
        id: Date.now() + i,
        x: Math.random() * 100,
        size: 4 + Math.random() * 8 + pulseIntensity * 5,
        delay: Math.random() * 2,
      }));
      setBubbles(newBubbles);
    };

    generateBubbles();
    const interval = setInterval(generateBubbles, 1500);

    return () => clearInterval(interval);
  }, [isGenerating, pulseIntensity]);

  if (!isGenerating || !progress) {
    return null;
  }

  const IconComponent = stageInfo.icon;
  const progressPercentage = Math.max(0, Math.min(100, animatedProgress));

  // Dynamic messages based on stage and progress
  const getStageSpecificMessage = () => {
    switch (currentStage) {
      case "searching_sources":
        return `🔍 AGGRESSIVE SOURCE HUNT: Scanning ${progress.current || 0}/${progress.total || 0} claims across .org, .edu, .gov domains...`;
      case "verifying_claims":
        return `🛡️ DEEP VERIFICATION: Cross-referencing claim ${progress.current || 0}/${progress.total || 0} with ${15} .org sources + academic databases...`;
      case "extracting_claims_chunk":
        return `📄 CHUNK ANALYSIS: Processing section ${progress.current || 0}/${progress.total || 0} - extracting verifiable facts...`;
      default:
        return progress.message;
    }
  };

  const formatTimeRemaining = (ms?: number) => {
    if (!ms || ms <= 0) return "";
    const seconds = Math.ceil(ms / 1000);
    if (seconds > 60) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `~${minutes}m ${remainingSeconds}s remaining`;
    }
    return `~${seconds}s remaining`;
  };

  return (
    <div className="w-full mt-12 mb-24 opacity-0 animate-fade-up animation-delay-[200ms]">
      <div className="relative overflow-hidden p-8 bg-surface-glass border border-surface-border-strong rounded-xl shadow-2xl">
        {/* Animated Background Particles */}
        <div className="absolute inset-0 overflow-hidden">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-accent-primary rounded-full opacity-30"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animation: `float ${3 + Math.random() * 4}s infinite ease-in-out`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
          ))}
        </div>

        {/* Stage Icon and Main Message */}
        <div className="relative z-10 flex flex-col items-center space-y-6">
          {/* Animated Icon */}
          <div
            className="relative flex items-center justify-center w-20 h-20 rounded-full transition-all duration-500"
            style={{
              backgroundColor: stageInfo.bgColor,
              boxShadow: `0 0 ${20 + pulseIntensity * 30}px ${stageInfo.color}40`,
            }}
          >
            <IconComponent
              size={32}
              className={`transition-all duration-300 ${currentStage === "idle" ? "animate-spin" : ""}`}
              style={{
                color: stageInfo.color,
                filter: `drop-shadow(0 0 ${5 + pulseIntensity * 10}px ${stageInfo.color})`,
              }}
            />

            {/* Pulsing rings */}
            <div
              className="absolute inset-0 rounded-full border-2 animate-ping"
              style={{
                borderColor: stageInfo.color + "40",
                animationDuration: "2s",
              }}
            />
          </div>

          {/* Dynamic Message */}
          <div className="text-center space-y-2">
            <h3 className="text-xl font-bold text-text-primary">
              {getStageSpecificMessage()}
            </h3>
            {progress.subMessage && (
              <p className="text-sm text-text-secondary italic animate-pulse">
                {progress.subMessage}
              </p>
            )}
          </div>

          {/* Liquid Progress Bar */}
          <div className="w-full max-w-2xl relative">
            <div
              className="h-8 rounded-full border-2 overflow-hidden relative"
              style={{
                borderColor: stageInfo.color + "60",
                backgroundColor: "rgba(0, 0, 0, 0.2)",
              }}
            >
              {/* Liquid fill */}
              <div
                className="absolute inset-0 transition-all duration-300 ease-out"
                style={{
                  width: `${progressPercentage}%`,
                  background: `linear-gradient(90deg, ${stageInfo.liquidColor}80, ${stageInfo.liquidColor})`,
                  clipPath: `polygon(0 0, 100% 0, 100% ${100 - Math.sin((liquidOffset * Math.PI) / 180) * 10}%, 0 ${100 + Math.sin((liquidOffset * Math.PI) / 180) * 10}%)`,
                }}
              >
                {/* Animated wave effect */}
                <div
                  className="absolute inset-0 opacity-60"
                  style={{
                    background: `repeating-linear-gradient(
                      90deg,
                      transparent,
                      transparent 10px,
                      ${stageInfo.liquidColor}40 10px,
                      ${stageInfo.liquidColor}40 20px
                    )`,
                    transform: `translateX(${liquidOffset % 20}px)`,
                  }}
                />
              </div>

              {/* Floating bubbles */}
              {bubbles.map((bubble) => (
                <div
                  key={bubble.id}
                  className="absolute rounded-full opacity-60 animate-bounce"
                  style={{
                    left: `${bubble.x}%`,
                    bottom: "10%",
                    width: `${bubble.size}px`,
                    height: `${bubble.size}px`,
                    backgroundColor: stageInfo.liquidColor + "80",
                    animationDelay: `${bubble.delay}s`,
                    animationDuration: "2s",
                  }}
                />
              ))}

              {/* Progress percentage overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className="text-sm font-bold mix-blend-difference"
                  style={{ color: "white" }}
                >
                  {Math.round(progressPercentage)}%
                </span>
              </div>
            </div>

            {/* Progress details */}
            <div className="flex justify-between items-center mt-3 text-xs text-text-muted">
              <span>Overall Progress</span>
              <span className="text-accent-primary font-medium">
                {formatTimeRemaining(progress.msRemaining)}
              </span>
            </div>
          </div>

          {/* Stage-specific indicators */}
          {currentStage === "searching_sources" && (
            <div className="flex items-center space-x-4 text-xs">
              <div className="flex items-center gap-1 px-2 py-1 bg-orange-500/20 rounded-full">
                <Globe size={12} className="text-orange-400" />
                <span className="text-orange-300">15+ .ORG Sources</span>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 rounded-full">
                <Database size={12} className="text-blue-400" />
                <span className="text-blue-300">Academic Databases</span>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 bg-green-500/20 rounded-full">
                <Shield size={12} className="text-green-400" />
                <span className="text-green-300">Gov Sources</span>
              </div>
            </div>
          )}

          {currentStage === "verifying_claims" && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="text-center p-2 bg-purple-500/20 rounded-lg">
                <div className="text-purple-400 font-bold">Reality Check</div>
                <div className="text-purple-300">Cross-referencing facts</div>
              </div>
              <div className="text-center p-2 bg-cyan-500/20 rounded-lg">
                <div className="text-cyan-400 font-bold">Source Authority</div>
                <div className="text-cyan-300">Evaluating credibility</div>
              </div>
              <div className="text-center p-2 bg-yellow-500/20 rounded-lg">
                <div className="text-yellow-400 font-bold">Bias Detection</div>
                <div className="text-yellow-300">Analyzing perspectives</div>
              </div>
              <div className="text-center p-2 bg-pink-500/20 rounded-lg">
                <div className="text-pink-400 font-bold">Consensus</div>
                <div className="text-pink-300">Measuring agreement</div>
              </div>
            </div>
          )}

          {/* Aggressive search mode indicator */}
          {(currentStage === "searching_sources" ||
            currentStage === "verifying_claims") && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-red-400 text-sm font-bold">
                <Zap size={14} className="animate-pulse" />
                AGGRESSIVE VERIFICATION MODE ACTIVE
              </div>
              <div className="text-xs text-red-300 mt-1">
                • Scanning 50+ sources per claim • 15+ .org domains required • 8
                search strategies • Multi-dimensional fact-checking
              </div>
            </div>
          )}

          {/* Processing tip for long operations */}
          {(currentStage === "searching_sources" ||
            currentStage === "verifying_claims") &&
            progressPercentage < 75 &&
            (progress.total > 10 || (progress.msRemaining || 0) > 60000) && (
              <div className="text-xs text-text-muted text-center max-w-md mt-4 p-3 bg-surface-glass-hover rounded-lg border border-surface-border">
                <div className="flex items-center gap-2 justify-center mb-1">
                  <Database size={12} className="text-accent-primary" />
                  <span className="font-medium text-accent-primary">
                    Deep Source Analysis
                  </span>
                </div>
                <p>
                  Performing comprehensive verification with multiple academic
                  databases, government sources, and .org domains. Quality over
                  speed approach ensures maximum accuracy.
                </p>
              </div>
            )}
        </div>
      </div>

      {/* CSS for custom animations */}
      <style jsx>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-10px) rotate(180deg);
          }
        }

        @keyframes liquidWave {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        @keyframes bubbleRise {
          0% {
            transform: translateY(0) scale(0);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(-100px) scale(1);
            opacity: 0;
          }
        }

        .liquid-wave {
          animation: liquidWave 3s linear infinite;
        }

        .bubble-animation {
          animation: bubbleRise 4s ease-out infinite;
        }
      `}</style>
    </div>
  );
};

export default DynamicLiquidLoading;
