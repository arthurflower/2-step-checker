// lib/contentAnalyzer.ts
console.log("contentAnalyzer.ts module loading (v2)..."); // Diagnostic log

export interface ContentAnalysis {
  wordCount: number;
  characterCount: number;
  sentenceCount: number;
  estimatedPages: number;
  estimatedClaims: number; // This will be an initial estimate; final count comes from extraction
  estimatedProcessingTime: number; // In seconds
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
  startIndex: number; // Character start index in the original full content
  endIndex: number;   // Character end index in the original full content
}

export class ContentAnalyzer {
  static readonly LIMITS = {
    // Increased limits for larger documents (e.g., up to 300 pages)
    // Assuming 300 pages * ~500 words/page = 150,000 words.
    // Let's set a practical limit slightly above that, e.g., 200,000 words.
    MAX_WORDS_PER_REQUEST: 7000, // Max words per individual LLM request for claim extraction (if chunking)
    MAX_CHARS_PER_REQUEST: 45000, // Corresponding character limit
    MAX_WORDS_TOTAL: 200000,     // Max total words for the entire document
    MAX_CHUNKS: 30,              // Max number of chunks (200,000 words / 7000 words/chunk approx 28 chunks)
    WORDS_PER_PAGE: 350,         // Average words per page (can be adjusted)
    AVG_CLAIMS_PER_SENTENCE: 0.7, // Estimated claims per sentence (can be refined)
    PROCESSING_TIME_PER_CLAIM: 3, // Estimated seconds per claim for full verification (search + LLM)
    MIN_WORDS_FOR_PROCESSING: 10, // Minimum words to attempt processing
  };

  private static getSentences(text: string): string[] {
    if (!text) return [];
    // Improved regex to better handle various sentence endings and avoid splitting mid-sentence (e.g., Mr. Smith)
    // This regex looks for standard terminators (. ! ?) followed by a space and an uppercase letter, or end of string/line.
    // It also tries to handle cases where sentences might just end with a newline.
    const sentences = text.match(/[^.!?\n]+(?:[.!?](?!\s*[a-z0-9])|\n+|$)/g) || [];

    if (sentences.length === 0 && text.trim().length > 0) {
        // If no standard sentences found, split by newline as a fallback
        const lines = text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
        if (lines.length > 0) return lines;
        return [text.trim()]; // Treat as single sentence if all else fails
    }
    return sentences.map(s => s.trim()).filter(s => s.length > 0);
  }

  static analyze(content: string): ContentAnalysis {
    console.log("ContentAnalyzer.analyze(v2) called");
    if (typeof content !== 'string') {
      console.error("ContentAnalyzer.analyze received non-string input:", content);
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
    // Estimate claims based on sentences or words if sentence count is low
    const estimatedClaims = sentenceCount > 2 ? Math.ceil(sentenceCount * this.LIMITS.AVG_CLAIMS_PER_SENTENCE) : Math.ceil(wordCount / (averageWordsPerSentence > 5 ? averageWordsPerSentence : 15));
    const estimatedProcessingTime = Math.max(5, estimatedClaims * this.LIMITS.PROCESSING_TIME_PER_CLAIM); // Min 5 seconds

    const warnings: string[] = [];
    let processingStrategy: 'direct' | 'chunked' | 'too-large' = 'direct';
    let canProcess = true;

    if (wordCount < this.LIMITS.MIN_WORDS_FOR_PROCESSING) {
      processingStrategy = 'too-large'; // Using 'too-large' to signify not processable due to being too short
      canProcess = false;
      warnings.push(`Content is too short. Minimum ${this.LIMITS.MIN_WORDS_FOR_PROCESSING} words required.`);
    } else if (wordCount > this.LIMITS.MAX_WORDS_TOTAL) {
      processingStrategy = 'too-large';
      canProcess = false;
      warnings.push(`Content exceeds maximum limit of ${this.LIMITS.MAX_WORDS_TOTAL.toLocaleString()} words (approx. ${Math.round(this.LIMITS.MAX_WORDS_TOTAL / this.LIMITS.WORDS_PER_PAGE)} pages). Your content has ${wordCount.toLocaleString()} words.`);
    } else if (wordCount > this.LIMITS.MAX_WORDS_PER_REQUEST || characterCount > this.LIMITS.MAX_CHARS_PER_REQUEST) {
      processingStrategy = 'chunked';
      warnings.push('Content will be processed in multiple chunks for better performance and accuracy due to its size.');
    }

    if (estimatedProcessingTime > 120) { // 2 minutes
      const timeInMinutes = Math.ceil(estimatedProcessingTime / 60);
      warnings.push(`Estimated processing time: ~${timeInMinutes} minutes. This may vary.`);
    } else if (estimatedProcessingTime > 30) {
        warnings.push(`Estimated processing time: ~${Math.ceil(estimatedProcessingTime)} seconds.`);
    }


    if (estimatedProcessingTime > 300 && processingStrategy !== 'too-large' && canProcess) { // 5 minutes
      warnings.push('For very large documents, consider processing smaller sections if this takes too long.');
    }

    let chunks: ContentChunk[] | undefined;
    if (processingStrategy === 'chunked' && canProcess) {
      chunks = this.createChunks(content, words, sentences);
      if (chunks.length > this.LIMITS.MAX_CHUNKS) {
        warnings.push(`Document split into ${chunks.length} chunks, exceeding the processing limit of ${this.LIMITS.MAX_CHUNKS} chunks. Only the first ${this.LIMITS.MAX_CHUNKS} will be processed.`);
        // canProcess might be set to false here, or handled by API only sending limited chunks
      }
    }

    return {
      wordCount, characterCount, sentenceCount, averageWordsPerSentence,
      estimatedPages, estimatedClaims, estimatedProcessingTime,
      processingStrategy, chunks, warnings, canProcess,
      topic: undefined, category: undefined, // These will be populated by the extraction API
    };
  }

  private static createChunks(content: string, words: string[], sentences: string[]): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    // Prefer sentence-based chunking if sentence detection is reliable, else word-based.
    const preferSentenceChunking = sentences.length > (words.length / 25); // Heuristic: if avg sentence length < 25 words, sentence splitting might be okay.
    
    const maxWordsPerChunk = this.LIMITS.MAX_WORDS_PER_REQUEST;
    const maxCharsPerChunk = this.LIMITS.MAX_CHARS_PER_REQUEST;
    // Aim for a target number of sentences per chunk if using sentence chunking, but respect word/char limits.
    const targetSentencesPerChunk = Math.max(10, Math.ceil(sentences.length / (this.LIMITS.MAX_WORDS_TOTAL / maxWordsPerChunk)));


    let currentGlobalCharIndex = 0;

    if (preferSentenceChunking && sentences.length > 0) {
        let currentSentenceNum = 0;
        while(currentSentenceNum < sentences.length) {
            let chunkContent = "";
            let chunkWordCount = 0;
            let chunkSentenceCount = 0;
            const chunkSentencesArray: string[] = [];
            let chunkStartIndexInFullDoc = content.indexOf(sentences[currentSentenceNum], currentGlobalCharIndex);
            if(chunkStartIndexInFullDoc === -1 && currentSentenceNum > 0) { // Safety if sentence not found, try after previous chunk
                chunkStartIndexInFullDoc = content.indexOf(sentences[currentSentenceNum], chunks[chunks.length-1].endIndex);
            }
            if(chunkStartIndexInFullDoc === -1) chunkStartIndexInFullDoc = currentGlobalCharIndex; // Fallback


            for (let i = currentSentenceNum; i < sentences.length; i++) {
                const sentence = sentences[i];
                const sentenceWords = sentence.split(/\s+/).filter(Boolean).length;

                if (chunkWordCount + sentenceWords > maxWordsPerChunk || chunkContent.length + sentence.length > maxCharsPerChunk || chunkSentenceCount >= targetSentencesPerChunk * 1.5) { // Added a bit of leeway for target sentences
                    if (chunkSentenceCount === 0) { // Ensure at least one sentence if it's too large itself
                        chunkSentencesArray.push(sentence);
                        chunkContent += (chunkContent.length > 0 ? " " : "") + sentence;
                        chunkWordCount += sentenceWords;
                        chunkSentenceCount++;
                        currentSentenceNum = i + 1;
                    }
                    break; 
                }
                chunkSentencesArray.push(sentence);
                chunkContent += (chunkContent.length > 0 ? " " : "") + sentence;
                chunkWordCount += sentenceWords;
                chunkSentenceCount++;
                currentSentenceNum = i + 1;
                if (chunkSentenceCount >= targetSentencesPerChunk && chunkWordCount > maxWordsPerChunk * 0.7) break; // Break if target met and substantial size
            }

            if (chunkSentenceCount > 0) {
                const chunkEndIndexInFullDoc = chunkStartIndexInFullDoc + chunkContent.length;
                chunks.push({
                    id: `chunk-s-${chunks.length + 1}`, content: chunkContent,
                    wordCount: chunkWordCount, sentenceCount: chunkSentenceCount,
                    startIndex: chunkStartIndexInFullDoc, endIndex: chunkEndIndexInFullDoc
                });
                currentGlobalCharIndex = chunkEndIndexInFullDoc;
            }
            if(chunks.length >= this.LIMITS.MAX_CHUNKS * 1.2) break; // Safety break if too many chunks are being generated
        }

    } else { // Word-based chunking
        let currentWordNum = 0;
        while(currentWordNum < words.length) {
            let chunkContentWords: string[] = [];
            let currentChunkWordCount = 0;
            let currentChunkCharCount = 0;
            let chunkStartIndexInFullDoc = currentGlobalCharIndex; // Approximate start

            for (let i = currentWordNum; i < words.length; i++) {
                const word = words[i];
                if (currentChunkWordCount + 1 > maxWordsPerChunk || currentChunkCharCount + word.length + 1 > maxCharsPerChunk) {
                     if (currentChunkWordCount === 0) { // Ensure at least one word
                        chunkContentWords.push(word);
                        currentChunkWordCount++;
                        currentChunkCharCount += word.length +1;
                        currentWordNum = i + 1;
                    }
                    break;
                }
                chunkContentWords.push(word);
                currentChunkWordCount++;
                currentChunkCharCount += word.length + 1; // +1 for space
                currentWordNum = i + 1;
            }
            
            if (currentChunkWordCount > 0) {
                const finalChunkContent = chunkContentWords.join(' ');
                 // Try to find the actual start index of this chunk content
                let actualStartIndex = content.indexOf(finalChunkContent, currentGlobalCharIndex - finalChunkContent.length > 0 ? currentGlobalCharIndex - finalChunkContent.length : 0); // Search in a window
                if (actualStartIndex === -1) actualStartIndex = content.indexOf(chunkContentWords[0], currentGlobalCharIndex);
                if (actualStartIndex === -1) actualStartIndex = chunkStartIndexInFullDoc; // Fallback

                const chunkSentences = this.getSentences(finalChunkContent);
                chunks.push({
                    id: `chunk-w-${chunks.length + 1}`, content: finalChunkContent,
                    wordCount: currentChunkWordCount, sentenceCount: chunkSentences.length,
                    startIndex: actualStartIndex, endIndex: actualStartIndex + finalChunkContent.length
                });
                currentGlobalCharIndex = actualStartIndex + finalChunkContent.length;
            }
             if(chunks.length >= this.LIMITS.MAX_CHUNKS * 1.2) break; // Safety break
        }
    }
    
    // Consolidate very small trailing chunks if any
    if (chunks.length > 1) {
        const lastChunk = chunks[chunks.length - 1];
        if (lastChunk.wordCount < maxWordsPerChunk * 0.1 && chunks.length <= this.LIMITS.MAX_CHUNKS) { // If last chunk is tiny
            const secondLastChunk = chunks[chunks.length - 2];
            if (secondLastChunk.wordCount + lastChunk.wordCount <= maxWordsPerChunk && 
                secondLastChunk.content.length + lastChunk.content.length <= maxCharsPerChunk) {
                secondLastChunk.content += " " + lastChunk.content;
                secondLastChunk.wordCount += lastChunk.wordCount;
                secondLastChunk.sentenceCount += lastChunk.sentenceCount;
                secondLastChunk.endIndex = lastChunk.endIndex;
                chunks.pop();
            }
        }
    }
    
    return chunks.slice(0, this.LIMITS.MAX_CHUNKS); // Ensure we don't exceed max chunks due to safety breaks
  }

  // Estimate cost (very rough, for indicative purposes only)
  static estimateCost(analysis: ContentAnalysis): {
    geminiExtractionCalls: number;
    geminiVerificationCalls: number;
    serperCalls: number;
    estimatedCost: string; // e.g., "$0.XX - $Y.YY"
  } {
    const extractionCalls = analysis.processingStrategy === 'chunked' && analysis.chunks ? analysis.chunks.length : 1;
    const verificationCalls = analysis.estimatedClaims; // This is an estimate
    
    // Rough cost estimates (these can vary greatly based on model and usage tiers)
    // Gemini 1.5 Flash: ~$0.000125 / 1k characters for input, ~$0.000375 / 1k characters for output (simplified)
    // Assuming input is roughly 2x output for extraction, 1x for verification
    const avgCharsPerExtractionChunk = analysis.characterCount / extractionCalls;
    const costPerExtractionCall = (avgCharsPerExtractionChunk / 1000 * 0.000125) + (avgCharsPerExtractionChunk / 2000 * 0.000375); // Simplified
    const costPerVerificationCall = (1000 / 1000 * 0.000125) + (500 / 1000 * 0.000375); // Assuming ~1k char input, 0.5k output for verification
    
    const serperCostPerCall = 0.001; // Assuming $1 per 1000 searches

    const totalGeminiCost = (extractionCalls * costPerExtractionCall) + (verificationCalls * costPerVerificationCall);
    const totalSerperCost = verificationCalls * serperCostPerCall;
    const totalEstimatedCost = totalGeminiCost + totalSerperCost;

    return {
      geminiExtractionCalls: extractionCalls,
      geminiVerificationCalls: verificationCalls,
      serperCalls: verificationCalls,
      estimatedCost: totalEstimatedCost < 0.01 ? '< $0.01' : `$${totalEstimatedCost.toFixed(2)}`
    };
  }
}

if (typeof ContentAnalyzer !== 'undefined') {
  console.log("ContentAnalyzer class is defined in contentAnalyzer.ts (v2)");
} else {
  console.error("ContentAnalyzer class is UNDEFINED at the end of contentAnalyzer.ts (v2)!");
}
