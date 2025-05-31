// lib/contentAnalyzer.ts

export interface ContentAnalysis {
  wordCount: number;
  characterCount: number;
  estimatedPages: number;
  estimatedClaims: number;
  estimatedProcessingTime: number; // in seconds
  processingStrategy: 'direct' | 'chunked' | 'too-large';
  chunks?: ContentChunk[];
  warnings: string[];
  canProcess: boolean;
}

export interface ContentChunk {
  id: string;
  content: string;
  wordCount: number;
  startIndex: number;
  endIndex: number;
}

export class ContentAnalyzer {
  // Limits based on your infrastructure
  static readonly LIMITS = {
    MAX_WORDS_PER_REQUEST: 5000, // ~20 pages
    MAX_CHARS_PER_REQUEST: 30000,
    MAX_WORDS_TOTAL: 50000, // ~200 pages
    MAX_CHUNKS: 10,
    WORDS_PER_PAGE: 250,
    AVG_CLAIMS_PER_PAGE: 3,
    PROCESSING_TIME_PER_CLAIM: 3, // seconds
  };

  static analyze(content: string): ContentAnalysis {
    const words = content.split(/\s+/).filter(word => word.length > 0);
    const wordCount = words.length;
    const characterCount = content.length;
    const estimatedPages = Math.ceil(wordCount / this.LIMITS.WORDS_PER_PAGE);
    const estimatedClaims = Math.ceil(estimatedPages * this.LIMITS.AVG_CLAIMS_PER_PAGE);
    const estimatedProcessingTime = estimatedClaims * this.LIMITS.PROCESSING_TIME_PER_CLAIM;
    
    const warnings: string[] = [];
    let processingStrategy: 'direct' | 'chunked' | 'too-large' = 'direct';
    let canProcess = true;

    // Determine processing strategy
    if (wordCount > this.LIMITS.MAX_WORDS_TOTAL) {
      processingStrategy = 'too-large';
      canProcess = false;
      warnings.push(`Content exceeds maximum limit of ${this.LIMITS.MAX_WORDS_TOTAL.toLocaleString()} words (${Math.round(this.LIMITS.MAX_WORDS_TOTAL / this.LIMITS.WORDS_PER_PAGE)} pages)`);
    } else if (wordCount > this.LIMITS.MAX_WORDS_PER_REQUEST) {
      processingStrategy = 'chunked';
      warnings.push('Content will be processed in multiple chunks for better performance');
    }

    // Add time warnings
    if (estimatedProcessingTime > 60) {
      warnings.push(`Estimated processing time: ${Math.ceil(estimatedProcessingTime / 60)} minutes`);
    }

    if (estimatedProcessingTime > 300) {
      warnings.push('Consider processing smaller sections for faster results');
    }

    // Create chunks if needed
    let chunks: ContentChunk[] | undefined;
    if (processingStrategy === 'chunked') {
      chunks = this.createChunks(content, words);
    }

    return {
      wordCount,
      characterCount,
      estimatedPages,
      estimatedClaims,
      estimatedProcessingTime,
      processingStrategy,
      chunks,
      warnings,
      canProcess
    };
  }

  private static createChunks(content: string, words: string[]): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    const wordsPerChunk = this.LIMITS.MAX_WORDS_PER_REQUEST;
    
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      const chunkWords = words.slice(i, i + wordsPerChunk);
      const chunkContent = chunkWords.join(' ');
      
      // Find actual character positions in original content
      const firstWord = chunkWords[0];
      const lastWord = chunkWords[chunkWords.length - 1];
      const startIndex = content.indexOf(firstWord, i > 0 ? chunks[chunks.length - 1].endIndex : 0);
      const endIndex = content.indexOf(lastWord, startIndex) + lastWord.length;
      
      chunks.push({
        id: `chunk-${chunks.length + 1}`,
        content: chunkContent,
        wordCount: chunkWords.length,
        startIndex,
        endIndex
      });
    }
    
    return chunks;
  }

  static estimateCost(analysis: ContentAnalysis): {
    geminiCalls: number;
    serperCalls: number;
    estimatedCost: string;
  } {
    const geminiCalls = Math.ceil(analysis.estimatedClaims * 2); // extraction + verification
    const serperCalls = analysis.estimatedClaims;
    
    // Rough cost estimates (adjust based on your API pricing)
    const geminiCostPerCall = 0.00001; // Gemini Flash is very cheap
    const serperCostPerCall = 0.001; // Serper is $50 for 50k searches
    
    const totalCost = (geminiCalls * geminiCostPerCall) + (serperCalls * serperCostPerCall);
    
    return {
      geminiCalls,
      serperCalls,
      estimatedCost: totalCost < 0.01 ? 'Less than $0.01' : `$${totalCost.toFixed(2)}`
    };
  }
}