// components/PreviewBox.tsx
// This component is currently NOT rendered directly in FactChecker.tsx to avoid redundant text display.
// It can be repurposed for a more focused sentence-level preview or editing interface if needed.
import React, { useState, useEffect, useMemo } from 'react';
import { Copy, CheckCheck, Edit } from 'lucide-react';

interface ClaimForPreview {
  claim_id: string;
  claim_text: string;
  assessment: string;
  original_sentence: string; // The sentence from which the claim was derived
  sentence_number: number;
  fixed_original_text?: string; // The suggested fix for the original_sentence
  // Add other relevant fields from FactCheckResponse if needed for preview logic
  two_step_verification?: {
    final_verdict: "GO" | "CHECK" | "NO GO";
  };
}

interface PreviewBoxProps {
  originalContent: string; // The full original text input by the user
  claims: ClaimForPreview[]; // All claims with their sentence context
  onAcceptFix?: (claimId: string, newSentenceText: string) => void; // Callback to apply a fix
  // onSelectSentence?: (sentenceNumber: number) => void; // Callback when a sentence is clicked
}

const PreviewBox: React.FC<PreviewBoxProps> = ({ originalContent, claims, onAcceptFix }) => {
  const [editableContent, setEditableContent] = useState(originalContent);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEditableContent(originalContent);
  }, [originalContent]);

  const handleAcceptFix = (claim: ClaimForPreview) => {
    if (onAcceptFix && claim.fixed_original_text) {
      // This logic would need to be more sophisticated to replace only the specific sentence
      // in the larger `editableContent`. For now, it's a placeholder.
      // A more robust solution would involve splitting `editableContent` into sentences,
      // replacing the target sentence, and rejoining.
      const sentences = editableContent.split(/(?<=[.!?])\s+/); // Basic sentence split
      if (claim.sentence_number -1 < sentences.length) {
        sentences[claim.sentence_number -1] = claim.fixed_original_text;
        setEditableContent(sentences.join(' ')); // Rejoin with spaces, might need refinement
      }
      onAcceptFix(claim.claim_id, claim.fixed_original_text);
    }
  };
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(editableContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Memoize sentence splitting to avoid re-computation on every render
  const contentSentences = useMemo(() => {
    if (!editableContent) return [];
    // This basic split might need to be more robust, similar to ContentAnalyzer
    return editableContent.match(/[^.!?]+[.!?](?=\s+|$|[^A-Z0-9])|[^.!?]+$/g) || [editableContent];
  }, [editableContent]);

  const getClaimForSentence = (sentenceIndex: number): ClaimForPreview | undefined => {
    // Find the first claim associated with this sentence number (1-based index)
    return claims.find(c => c.sentence_number === sentenceIndex + 1);
  };

  return (
    <div className="space-y-4 w-full opacity-0 animate-fade-up [animation-delay:400ms]">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-text-primary">
          Content Review & Editor
        </h3>
        <button
            onClick={handleCopy}
            className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5"
            aria-label="Copy corrected text"
          >
            {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy Text'}
        </button>
      </div>
      
      <div 
        className="w-full min-h-[250px] max-h-[500px] overflow-y-auto p-4 md:p-6 glass-card leading-relaxed text-text-secondary text-base"
        // `contentEditable` can be used for direct editing, but state management becomes complex.
        // For now, displaying sentences and allowing fixes via buttons is safer.
        // contentEditable={!onAcceptFix} // Allow editing if no fix handler
        // onInput={e => setEditableContent(e.currentTarget.textContent || '')}
        // suppressContentEditableWarning={true}
      >
        {contentSentences.map((sentence, index) => {
          const claim = getClaimForSentence(index);
          let sentenceStyle = "inline"; // Default style
          let title = `Sentence ${index + 1}`;

          if (claim) {
            title += ` - Claim: "${claim.claim_text}"`;
            if (claim.two_step_verification?.final_verdict === 'NO GO' || claim.assessment?.toLowerCase() === 'false') {
              sentenceStyle = "bg-red-500/10 border-b-2 border-red-500/50 cursor-pointer hover:bg-red-500/20";
              title += " (Incorrect)";
            } else if (claim.two_step_verification?.final_verdict === 'CHECK' || claim.assessment?.toLowerCase() === 'ambiguous/partially true') {
              sentenceStyle = "bg-yellow-500/10 border-b-2 border-yellow-500/50 cursor-pointer hover:bg-yellow-500/20";
              title += " (Needs Review)";
            } else if (claim.two_step_verification?.final_verdict === 'GO' || claim.assessment?.toLowerCase() === 'true') {
              sentenceStyle = "bg-green-500/10 cursor-default";
               title += " (Verified)";
            }
          }

          return (
            <span key={index} className={sentenceStyle} title={title}>
              {sentence.trim()}
              {/* Add a space after each sentence unless it's the last one */}
              {index < contentSentences.length - 1 && ' '} 
              {claim && claim.fixed_original_text && claim.fixed_original_text !== claim.original_sentence && onAcceptFix && (
                <button 
                  onClick={() => handleAcceptFix(claim)}
                  className="ml-1 px-1.5 py-0.5 text-xs bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 rounded inline-flex items-center gap-1"
                  title={`Accept fix for S${claim.sentence_number}`}
                >
                  <Edit size={12}/> Accept Fix
                </button>
              )}
            </span>
          );
        })}
      </div>
      <p className="text-xs text-text-muted text-center">
        This preview highlights sentences associated with extracted claims. Click on problematic sentences to see details in the analysis section.
      </p>
    </div>
  );
};

export default PreviewBox;
