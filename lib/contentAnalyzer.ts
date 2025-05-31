// lib/contentAnalyzer.ts
console.log("contentAnalyzer.ts module loading..."); // Diagnostic log

export interface ContentAnalysis {
  wordCount: number;
  characterCount: number;
  sentenceCount: number; 
  estimatedPages: number;
  estimatedClaims: number;
  estimatedProcessingTime: number; 
  processingStrategy: 'direct' | 'chunked' | 'too-large';
  chunks?: ContentChunk[];
  warnings: string[];
  canProcess: boolean;
  topic?: string; 
  category?: string; 
  averageWordsPerSentence?: number; 
}

export interface ContentChunk {
  id: string;
  content: string;
  wordCount: number;
  sentenceCount: number; 
  startIndex: number;
  endIndex: number;
}

export class ContentAnalyzer {
  static readonly LIMITS = {
    MAX_WORDS_PER_REQUEST: 5000, 
    MAX_CHARS_PER_REQUEST: 30000,
    MAX_WORDS_TOTAL: 50000, 
    MAX_CHUNKS: 10,
    WORDS_PER_PAGE: 250,
    AVG_CLAIMS_PER_PAGE: 3, 
    PROCESSING_TIME_PER_CLAIM: 2, 
  };

  private static getSentences(text: string): string[] {
    if (!text) return [];
    const sentences = text.match(/[^.!?]+[.!?](?=\s+|$|[^A-Z0-9])/g) || [];
    if (sentences.length === 0) {
        return text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    }
    return sentences.map(s => s.trim()).filter(s => s.length > 0);
  }

  static analyze(content: string): ContentAnalysis {
    console.log("ContentAnalyzer.analyze() called"); // Diagnostic log
    if (typeof content !== 'string') {
      console.error("ContentAnalyzer.analyze received non-string input:", content);
      // Return a default or error state for ContentAnalysis
      return {
        wordCount: 0, characterCount: 0, sentenceCount: 0, estimatedPages: 0,
        estimatedClaims: 0, estimatedProcessingTime: 0, processingStrategy: 'too-large',
        warnings: ['Invalid content input to analyze.'], canProcess: false,
        averageWordsPerSentence: 0,
      };
    }
    const words = content.split(/\s+/).filter(word => word.length > 0);
    const sentences = this.getSentences(content);
    const wordCount = words.length;
    const characterCount = content.length;
    const sentenceCount = sentences.length;
    const averageWordsPerSentence = sentenceCount > 0 ? parseFloat((wordCount / sentenceCount).toFixed(1)) : 0;

    const estimatedPages = Math.ceil(wordCount / this.LIMITS.WORDS_PER_PAGE);
    const estimatedClaims = sentenceCount > 0 ? sentenceCount : Math.ceil(estimatedPages * this.LIMITS.AVG_CLAIMS_PER_PAGE);
    const estimatedProcessingTime = estimatedClaims * this.LIMITS.PROCESSING_TIME_PER_CLAIM;
    
    const warnings: string[] = [];
    let processingStrategy: 'direct' | 'chunked' | 'too-large' = 'direct';
    let canProcess = true;

    if (wordCount > this.LIMITS.MAX_WORDS_TOTAL) {
      processingStrategy = 'too-large';
      canProcess = false;
      warnings.push(`Content exceeds maximum limit of ${this.LIMITS.MAX_WORDS_TOTAL.toLocaleString()} words (${Math.round(this.LIMITS.MAX_WORDS_TOTAL / this.LIMITS.WORDS_PER_PAGE)} pages)`);
    } else if (wordCount > this.LIMITS.MAX_WORDS_PER_REQUEST || sentenceCount > 150) { 
      processingStrategy = 'chunked';
      warnings.push('Content will be processed in multiple chunks for better performance and accuracy.');
    }

    if (estimatedProcessingTime > 60) {
      warnings.push(`Estimated processing time: ~${Math.ceil(estimatedProcessingTime / 60)} minutes`);
    }

    if (estimatedProcessingTime > 300 && processingStrategy !== 'too-large') { 
      warnings.push('Consider processing smaller sections for faster results if this takes too long.');
    }

    let chunks: ContentChunk[] | undefined;
    if (processingStrategy === 'chunked' && canProcess) {
      chunks = this.createChunks(content, words, sentences);
    }

    return {
      wordCount, characterCount, sentenceCount, averageWordsPerSentence,
      estimatedPages, estimatedClaims, estimatedProcessingTime,
      processingStrategy, chunks, warnings, canProcess,
      topic: undefined, category: undefined,
    };
  }

  private static createChunks(content: string, words: string[], sentences: string[]): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    const preferSentenceChunking = sentences.length > 150; 
    const maxSentencesPerChunk = 100; 
    const wordsPerChunk = this.LIMITS.MAX_WORDS_PER_REQUEST;

    if (preferSentenceChunking) {
        let currentSentenceIndex = 0;
        while (currentSentenceIndex < sentences.length) {
            const chunkSentences = sentences.slice(currentSentenceIndex, currentSentenceIndex + maxSentencesPerChunk);
            const chunkContent = chunkSentences.join(' ');
            const chunkWords = chunkContent.split(/\s+/).filter(word => word.length > 0);
            
            const firstSentence = chunkSentences[0];
            const lastSentence = chunkSentences[chunkSentences.length - 1];
            
            let startIndex = -1;
            let endIndex = -1;

            if (chunks.length > 0) {
                startIndex = content.indexOf(firstSentence, chunks[chunks.length - 1].endIndex);
            } else {
                startIndex = content.indexOf(firstSentence);
            }

            if (startIndex !== -1) {
                endIndex = content.indexOf(lastSentence, startIndex) + lastSentence.length;
            } else { 
                startIndex = chunks.length > 0 ? chunks[chunks.length - 1].endIndex : 0;
                endIndex = startIndex + chunkContent.length;
            }
            
            chunks.push({
                id: `chunk-${chunks.length + 1}`, content: chunkContent,
                wordCount: chunkWords.length, sentenceCount: chunkSentences.length,
                startIndex, endIndex
            });
            currentSentenceIndex += maxSentencesPerChunk;
        }
    } else { 
        let currentWordIndex = 0;
        while (currentWordIndex < words.length) {
            const chunkWords = words.slice(currentWordIndex, currentWordIndex + wordsPerChunk);
            const chunkContent = chunkWords.join(' ');
            const chunkSentences = this.getSentences(chunkContent);

            const firstWord = chunkWords[0];
            
            let startIndex = -1;
            let endIndex = -1;

            if (chunks.length > 0) {
                startIndex = content.indexOf(firstWord, chunks[chunks.length - 1].endIndex);
            } else {
                startIndex = content.indexOf(firstWord);
            }
            
            if (startIndex !== -1) {
                let tempEndIndex = startIndex;
                for(let k=0; k<chunkWords.length; k++){
                    let wordIndex = content.indexOf(chunkWords[k], tempEndIndex);
                    if(wordIndex !== -1){
                        tempEndIndex = wordIndex + chunkWords[k].length;
                    } else {
                        break;
                    }
                }
                endIndex = tempEndIndex;
            } else { 
                startIndex = chunks.length > 0 ? chunks[chunks.length - 1].endIndex : 0;
                endIndex = startIndex + chunkContent.length;
            }

            chunks.push({
                id: `chunk-${chunks.length + 1}`, content: chunkContent,
                wordCount: chunkWords.length, sentenceCount: chunkSentences.length,
                startIndex, endIndex
            });
            currentWordIndex += wordsPerChunk;
        }
    }
    
    if (chunks.length > this.LIMITS.MAX_CHUNKS) {
        console.warn(`Generated ${chunks.length} chunks, exceeding limit of ${this.LIMITS.MAX_CHUNKS}. Truncating.`);
        return chunks.slice(0, this.LIMITS.MAX_CHUNKS);
    }
    
    return chunks;
  }

  static estimateCost(analysis: ContentAnalysis): {
    geminiCalls: number;
    serperCalls: number;
    estimatedCost: string;
  } {
    const extractionCalls = analysis.processingStrategy === 'chunked' && analysis.chunks ? analysis.chunks.length : 1;
    const verificationCalls = analysis.estimatedClaims; 
    const geminiCalls = extractionCalls + verificationCalls;
    const serperCalls = analysis.estimatedClaims; 
    
    const geminiCostPerCall = 0.000125; 
    const serperCostPerCall = 0.001; 
    
    const totalCost = (geminiCalls * geminiCostPerCall * (analysis.characterCount / 1000)) + (serperCalls * serperCostPerCall);
    
    return {
      geminiCalls, serperCalls,
      estimatedCost: totalCost < 0.01 ? 'Less than $0.01' : `$${totalCost.toFixed(2)}`
    };
  }
}

// Another log to see if the class itself is defined at the end of the module
if (typeof ContentAnalyzer !== 'undefined') {
  console.log("ContentAnalyzer class is defined in contentAnalyzer.ts");
} else {
  console.error("ContentAnalyzer class is UNDEFINED at the end of contentAnalyzer.ts!");
}
