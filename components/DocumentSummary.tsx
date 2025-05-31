// components/DocumentSummary.tsx
import React from 'react';
import { AlertTriangle, CheckCircle, XCircle, TrendingUp, Shield, AlertCircle } from 'lucide-react';

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

  const totalClaims = filteredResults.length;
  const accuracyRate = totalClaims > 0 ? Math.round((goCount / totalClaims) * 100) : 0;
  const avgConfidence = totalClaims > 0 
    ? Math.round(filteredResults.reduce((acc, r) => acc + r.confidence_score, 0) / totalClaims)
    : 0;

  // Determine overall document status
  let overallStatus = 'verified';
  let statusIcon = <CheckCircle className="w-8 h-8" />;
  let statusColor = 'text-green-400';
  let statusBg = 'bg-green-500/10';
  let statusBorder = 'border-green-500/30';
  let statusMessage = 'Document contains accurate information';

  if (noGoCount > 0 || accuracyRate < 70) {
    overallStatus = 'problematic';
    statusIcon = <XCircle className="w-8 h-8" />;
    statusColor = 'text-red-400';
    statusBg = 'bg-red-500/10';
    statusBorder = 'border-red-500/30';
    statusMessage = 'Document contains significant inaccuracies';
  } else if (checkCount > 2 || accuracyRate < 85) {
    overallStatus = 'needs-review';
    statusIcon = <AlertCircle className="w-8 h-8" />;
    statusColor = 'text-yellow-400';
    statusBg = 'bg-yellow-500/10';
    statusBorder = 'border-yellow-500/30';
    statusMessage = 'Document requires careful review';
  }

  // Calculate progress values for visual bars
  const goProgress = totalClaims > 0 ? (goCount / totalClaims) * 100 : 0;
  const checkProgress = totalClaims > 0 ? (checkCount / totalClaims) * 100 : 0;
  const noGoProgress = totalClaims > 0 ? (noGoCount / totalClaims) * 100 : 0;

  return (
    <div className="w-full mb-8 opacity-0 animate-fade-up [animation-delay:200ms]">
      <div className="glass-card p-8">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
          <Shield className="w-6 h-6 text-accent-primary" />
          Document Verification Summary
        </h2>
        
        {/* Overall Status Card */}
        <div className={`p-6 rounded-xl mb-6 ${statusBg} border ${statusBorder} backdrop-blur-md`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={statusColor}>
                {statusIcon}
              </div>
              <div>
                <h3 className="text-xl font-bold">
                  Overall Assessment: {overallStatus.toUpperCase().replace('-', ' ')}
                </h3>
                <p className="text-text-secondary mt-1">{statusMessage}</p>
              </div>
            </div>
            
            {/* Accuracy Badge */}
            <div className="text-center">
              <div className={`text-3xl font-bold ${statusColor}`}>
                {accuracyRate}%
              </div>
              <div className="text-sm text-text-muted">Accuracy Rate</div>
            </div>
          </div>
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="glass-card p-4 text-center">
            <div className="text-3xl font-bold text-text-primary mb-1">
              {totalClaims}
            </div>
            <div className="text-sm text-text-muted">Total Claims</div>
          </div>
          
          <div className="glass-card p-4 text-center border-green-500/30">
            <div className="text-3xl font-bold text-green-400 mb-1">
              {goCount}
            </div>
            <div className="text-sm text-green-400">Verified</div>
          </div>
          
          <div className="glass-card p-4 text-center border-yellow-500/30">
            <div className="text-3xl font-bold text-yellow-400 mb-1">
              {checkCount}
            </div>
            <div className="text-sm text-yellow-400">Need Review</div>
          </div>
          
          <div className="glass-card p-4 text-center border-red-500/30">
            <div className="text-3xl font-bold text-red-400 mb-1">
              {noGoCount}
            </div>
            <div className="text-sm text-red-400">Failed</div>
          </div>
        </div>

        {/* Visual Progress Bars */}
        <div className="space-y-3 mb-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-green-400">Verified Claims</span>
              <span className="text-green-400">{goCount} / {totalClaims}</span>
            </div>
            <div className="progress-bar">
              <div 
                className="progress-fill bg-gradient-to-r from-green-500 to-green-400"
                style={{ width: `${goProgress}%` }}
              />
            </div>
          </div>

          {checkCount > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-yellow-400">Claims Needing Review</span>
                <span className="text-yellow-400">{checkCount} / {totalClaims}</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill bg-gradient-to-r from-yellow-500 to-yellow-400"
                  style={{ width: `${checkProgress}%` }}
                />
              </div>
            </div>
          )}

          {noGoCount > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-red-400">Failed Verifications</span>
                <span className="text-red-400">{noGoCount} / {totalClaims}</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill bg-gradient-to-r from-red-500 to-red-400"
                  style={{ width: `${noGoProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Additional Metrics */}
        <div className="flex items-center justify-between p-4 bg-surface-glass rounded-lg">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-accent-primary" />
            <span className="text-sm text-text-secondary">Average Confidence Score</span>
          </div>
          <div className={`text-lg font-bold ${avgConfidence >= 80 ? 'text-green-400' : avgConfidence >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
            {avgConfidence}%
          </div>
        </div>

        {/* Problem Claims Preview */}
        {(noGoCount > 0 || checkCount > 0) && (
          <div className="mt-6 pt-6 border-t border-surface-border">
            <h4 className="font-semibold text-text-secondary mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Claims Requiring Attention
            </h4>
            
            <div className="space-y-2">
              {filteredResults
                .filter(r => r.two_step_verification?.final_verdict === 'NO GO' || 
                            r.two_step_verification?.final_verdict === 'CHECK')
                .slice(0, 3)
                .map((result, idx) => (
                  <div key={idx} className="p-3 bg-surface-glass rounded-lg border border-surface-border">
                    <div className="flex items-start gap-3">
                      <span className={`badge ${
                        result.two_step_verification?.final_verdict === 'NO GO' 
                          ? 'badge-error' 
                          : 'badge-warning'
                      } text-xs`}>
                        {result.two_step_verification?.final_verdict}
                      </span>
                      <p className="text-sm text-text-secondary flex-1">
                        {result.claim.substring(0, 100)}...
                      </p>
                    </div>
                  </div>
                ))}
              
              {(noGoCount + checkCount) > 3 && (
                <p className="text-sm text-text-muted italic pl-3">
                  And {(noGoCount + checkCount) - 3} more claims requiring attention...
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentSummary;