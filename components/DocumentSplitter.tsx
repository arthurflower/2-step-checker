// components/DocumentSplitter.tsx
"use client";

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  Download,
  FileText,
  Scissors,
  Settings,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Copy,
  Package,
} from "lucide-react";

interface DocumentChunk {
  index: number;
  content: string;
  wordCount: number;
  sentenceCount: number;
  method: string;
  filename: string;
}

interface DocumentStats {
  wordCount: number;
  sentenceCount: number;
  paragraphCount: number;
  characterCount: number;
  estimatedPages: number;
  estimatedProcessingTime: number;
}

const DocumentSplitter = () => {
  const [file, setFile] = useState<File | null>(null);
  const [documentText, setDocumentText] = useState<string>("");
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Settings
  const [wordsPerChunk, setWordsPerChunk] = useState(5000);
  const [splitMethod, setSplitMethod] = useState<
    "sentences" | "paragraphs" | "pages"
  >("sentences");
  const [overlapWords, setOverlapWords] = useState(100);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith(".docx")) {
      setError("Please select a .docx file");
      return;
    }

    setFile(selectedFile);
    setError(null);
    setSuccess(
      `File selected: ${selectedFile.name} (${formatFileSize(selectedFile.size)})`,
    );
    setChunks([]);
    setStats(null);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const processDocument = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setProgress(0);
    setProgressText("Reading DOCX file...");

    try {
      // Import mammoth dynamically
      const mammoth = await import("mammoth");

      setProgress(20);
      setProgressText("Extracting text from document...");

      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value;

      setDocumentText(text);
      setProgress(40);
      setProgressText("Analyzing document structure...");

      // Analyze document
      const documentStats = analyzeDocument(text);
      setStats(documentStats);

      setProgress(60);
      setProgressText("Creating optimized chunks...");

      // Create chunks
      const createdChunks = createChunks(
        text,
        wordsPerChunk,
        splitMethod,
        overlapWords,
        file.name,
      );
      setChunks(createdChunks);

      setProgress(100);
      setProgressText("Complete!");
      setSuccess(
        `Document successfully split into ${createdChunks.length} chunks!`,
      );

      setTimeout(() => {
        setIsProcessing(false);
      }, 1000);
    } catch (err) {
      console.error("Error processing document:", err);
      setError(
        `Error processing document: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
      setIsProcessing(false);
    }
  };

  const analyzeDocument = (text: string): DocumentStats => {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

    return {
      wordCount: words.length,
      sentenceCount: sentences.length,
      paragraphCount: paragraphs.length,
      characterCount: text.length,
      estimatedPages: Math.ceil(words.length / 350),
      estimatedProcessingTime: Math.ceil(words.length / 1000), // rough estimate in minutes
    };
  };

  const createChunks = (
    text: string,
    wordsPerChunk: number,
    method: string,
    overlap: number,
    originalFilename: string,
  ): DocumentChunk[] => {
    const chunks: DocumentChunk[] = [];
    const baseName = originalFilename.replace(".docx", "");

    if (method === "sentences") {
      return createSentenceBasedChunks(text, wordsPerChunk, overlap, baseName);
    } else if (method === "paragraphs") {
      return createParagraphBasedChunks(text, wordsPerChunk, overlap, baseName);
    } else {
      return createWordBasedChunks(text, wordsPerChunk, overlap, baseName);
    }
  };

  const createSentenceBasedChunks = (
    text: string,
    wordsPerChunk: number,
    overlap: number,
    baseName: string,
  ): DocumentChunk[] => {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: DocumentChunk[] = [];
    let currentChunk = "";
    let currentWordCount = 0;
    let chunkIndex = 1;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      const sentenceWords = sentence.split(/\s+/).length;

      if (
        currentWordCount + sentenceWords > wordsPerChunk &&
        currentChunk.length > 0
      ) {
        // Add overlap from next sentences
        let overlapText = "";
        let overlapWordCount = 0;
        for (
          let j = i;
          j < sentences.length && overlapWordCount < overlap;
          j++
        ) {
          const nextSentence = sentences[j].trim();
          const nextWords = nextSentence.split(/\s+/).length;
          if (overlapWordCount + nextWords <= overlap) {
            overlapText += " " + nextSentence;
            overlapWordCount += nextWords;
          } else {
            break;
          }
        }

        chunks.push({
          index: chunkIndex++,
          content: (currentChunk + overlapText).trim(),
          wordCount: currentWordCount + overlapWordCount,
          sentenceCount: currentChunk
            .split(/[.!?]+/)
            .filter((s) => s.trim().length > 0).length,
          method: "sentence-based",
          filename: `${baseName}_chunk_${String(chunkIndex - 1).padStart(2, "0")}.txt`,
        });

        currentChunk = sentence;
        currentWordCount = sentenceWords;
      } else {
        currentChunk += (currentChunk ? " " : "") + sentence;
        currentWordCount += sentenceWords;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push({
        index: chunkIndex,
        content: currentChunk.trim(),
        wordCount: currentWordCount,
        sentenceCount: currentChunk
          .split(/[.!?]+/)
          .filter((s) => s.trim().length > 0).length,
        method: "sentence-based",
        filename: `${baseName}_chunk_${String(chunkIndex).padStart(2, "0")}.txt`,
      });
    }

    return chunks;
  };

  const createParagraphBasedChunks = (
    text: string,
    wordsPerChunk: number,
    overlap: number,
    baseName: string,
  ): DocumentChunk[] => {
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    const chunks: DocumentChunk[] = [];
    let currentChunk = "";
    let currentWordCount = 0;
    let chunkIndex = 1;

    for (const paragraph of paragraphs) {
      const paragraphWords = paragraph.trim().split(/\s+/).length;

      if (
        currentWordCount + paragraphWords > wordsPerChunk &&
        currentChunk.length > 0
      ) {
        chunks.push({
          index: chunkIndex++,
          content: currentChunk.trim(),
          wordCount: currentWordCount,
          sentenceCount: currentChunk
            .split(/[.!?]+/)
            .filter((s) => s.trim().length > 0).length,
          method: "paragraph-based",
          filename: `${baseName}_chunk_${String(chunkIndex - 1).padStart(2, "0")}.txt`,
        });
        currentChunk = paragraph + "\n\n";
        currentWordCount = paragraphWords;
      } else {
        currentChunk += paragraph + "\n\n";
        currentWordCount += paragraphWords;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push({
        index: chunkIndex,
        content: currentChunk.trim(),
        wordCount: currentWordCount,
        sentenceCount: currentChunk
          .split(/[.!?]+/)
          .filter((s) => s.trim().length > 0).length,
        method: "paragraph-based",
        filename: `${baseName}_chunk_${String(chunkIndex).padStart(2, "0")}.txt`,
      });
    }

    return chunks;
  };

  const createWordBasedChunks = (
    text: string,
    wordsPerChunk: number,
    overlap: number,
    baseName: string,
  ): DocumentChunk[] => {
    const words = text.split(/\s+/);
    const chunks: DocumentChunk[] = [];
    let chunkIndex = 1;

    for (let i = 0; i < words.length; i += wordsPerChunk - overlap) {
      const chunkWords = words.slice(i, i + wordsPerChunk);
      const content = chunkWords.join(" ");

      chunks.push({
        index: chunkIndex++,
        content,
        wordCount: chunkWords.length,
        sentenceCount: content
          .split(/[.!?]+/)
          .filter((s) => s.trim().length > 0).length,
        method: "word-based",
        filename: `${baseName}_chunk_${String(chunkIndex - 1).padStart(2, "0")}.txt`,
      });
    }

    return chunks;
  };

  const downloadChunk = (chunk: DocumentChunk) => {
    const blob = new Blob([chunk.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = chunk.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAllChunks = () => {
    chunks.forEach((chunk, index) => {
      setTimeout(() => {
        downloadChunk(chunk);
      }, index * 300); // Stagger downloads
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="w-full space-y-6 opacity-0 animate-fade-up [animation-delay:200ms]">
      <div className="glass-card">
        <div className="flex items-center gap-3 mb-6">
          <Scissors className="w-8 h-8 text-accent-primary" />
          <div>
            <h2 className="text-2xl font-bold text-text-primary">
              Document Splitter
            </h2>
            <p className="text-text-secondary">
              Split large documents into manageable chunks for analysis
            </p>
          </div>
        </div>

        {/* File Upload Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 cursor-pointer ${
            file
              ? "border-accent-primary bg-accent-primary/5"
              : "border-surface-border-strong hover:border-accent-primary hover:bg-accent-primary/5"
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            onChange={handleFileChange}
            className="hidden"
          />

          {file ? (
            <div className="space-y-2">
              <CheckCircle className="w-12 h-12 text-accent-primary mx-auto" />
              <h3 className="text-lg font-semibold text-text-primary">
                {file.name}
              </h3>
              <p className="text-text-secondary">
                Size: {formatFileSize(file.size)}
              </p>
              <p className="text-accent-primary font-medium">
                Ready to process!
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="w-12 h-12 text-text-muted mx-auto" />
              <h3 className="text-lg font-semibold text-text-primary">
                Upload DOCX File
              </h3>
              <p className="text-text-secondary">
                Drag and drop or click to browse
              </p>
              <p className="text-xs text-text-muted">
                Supports .docx files up to 500MB
              </p>
            </div>
          )}
        </div>

        {/* Advanced Settings */}
        <div className="mt-6">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-accent-primary hover:text-accent-secondary transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span>Advanced Settings</span>
            {showAdvanced ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {showAdvanced && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-surface-glass rounded-lg border border-surface-border">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Words per Chunk
                </label>
                <input
                  type="number"
                  value={wordsPerChunk}
                  onChange={(e) => setWordsPerChunk(parseInt(e.target.value))}
                  min="1000"
                  max="10000"
                  step="500"
                  className="w-full p-2 border border-surface-border-strong rounded-md bg-surface-glass text-text-primary"
                />
                <p className="text-xs text-text-muted mt-1">
                  Recommended: 5000-7000
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Split Method
                </label>
                <select
                  value={splitMethod}
                  onChange={(e) =>
                    setSplitMethod(
                      e.target.value as "sentences" | "paragraphs" | "pages",
                    )
                  }
                  className="w-full p-2 border border-surface-border-strong rounded-md bg-surface-glass text-text-primary"
                >
                  <option value="sentences">By Sentences (Recommended)</option>
                  <option value="paragraphs">By Paragraphs</option>
                  <option value="pages">By Word Count</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Overlap Words
                </label>
                <input
                  type="number"
                  value={overlapWords}
                  onChange={(e) => setOverlapWords(parseInt(e.target.value))}
                  min="0"
                  max="500"
                  step="50"
                  className="w-full p-2 border border-surface-border-strong rounded-md bg-surface-glass text-text-primary"
                />
                <p className="text-xs text-text-muted mt-1">
                  Context preservation
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <button
            onClick={processDocument}
            disabled={!file || isProcessing}
            className={`btn-primary flex-1 flex items-center justify-center gap-2 ${
              !file || isProcessing ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Scissors className="w-4 h-4" />
                Split Document
              </>
            )}
          </button>

          {chunks.length > 0 && (
            <button
              onClick={downloadAllChunks}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <Package className="w-4 h-4" />
              Download All ({chunks.length})
            </button>
          )}
        </div>

        {/* Progress Bar */}
        {isProcessing && (
          <div className="mt-6 p-4 bg-surface-glass rounded-lg border border-surface-border">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="w-5 h-5 animate-spin text-accent-primary" />
              <span className="text-text-primary font-medium">
                Processing Document
              </span>
            </div>
            <div className="w-full bg-surface-base rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent-primary to-accent-secondary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-text-secondary mt-2">{progressText}</p>
          </div>
        )}

        {/* Status Messages */}
        {error && (
          <div className="mt-4 p-4 bg-error/10 border border-error/30 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-error flex-shrink-0" />
            <span className="text-error">{error}</span>
          </div>
        )}

        {success && !error && (
          <div className="mt-4 p-4 bg-success/10 border border-success/30 rounded-lg flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
            <span className="text-success">{success}</span>
          </div>
        )}
      </div>

      {/* Document Stats */}
      {stats && (
        <div className="glass-card">
          <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent-primary" />
            Document Analysis
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="text-center p-3 bg-surface-glass rounded-lg">
              <div className="text-2xl font-bold text-accent-primary">
                {stats.wordCount.toLocaleString()}
              </div>
              <div className="text-xs text-text-muted">Words</div>
            </div>
            <div className="text-center p-3 bg-surface-glass rounded-lg">
              <div className="text-2xl font-bold text-accent-primary">
                {stats.sentenceCount.toLocaleString()}
              </div>
              <div className="text-xs text-text-muted">Sentences</div>
            </div>
            <div className="text-center p-3 bg-surface-glass rounded-lg">
              <div className="text-2xl font-bold text-accent-primary">
                {stats.paragraphCount.toLocaleString()}
              </div>
              <div className="text-xs text-text-muted">Paragraphs</div>
            </div>
            <div className="text-center p-3 bg-surface-glass rounded-lg">
              <div className="text-2xl font-bold text-accent-primary">
                {stats.estimatedPages}
              </div>
              <div className="text-xs text-text-muted">Est. Pages</div>
            </div>
            <div className="text-center p-3 bg-surface-glass rounded-lg">
              <div className="text-2xl font-bold text-accent-primary">
                {chunks.length}
              </div>
              <div className="text-xs text-text-muted">Chunks</div>
            </div>
            <div className="text-center p-3 bg-surface-glass rounded-lg">
              <div className="text-2xl font-bold text-accent-primary">
                ~{stats.estimatedProcessingTime}m
              </div>
              <div className="text-xs text-text-muted">Est. Time</div>
            </div>
          </div>
        </div>
      )}

      {/* Chunks List */}
      {chunks.length > 0 && (
        <div className="glass-card">
          <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-accent-primary" />
            Generated Chunks
          </h3>

          <p className="text-text-secondary mb-4">
            Each chunk is optimized for the Hallucination Detector. Process them
            individually for best results.
          </p>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {chunks.map((chunk) => (
              <div
                key={chunk.index}
                className="flex items-center justify-between p-4 bg-surface-glass rounded-lg border border-surface-border hover:border-accent-primary transition-colors"
              >
                <div className="flex-1">
                  <h4 className="font-medium text-text-primary">
                    Chunk {chunk.index}
                  </h4>
                  <div className="text-sm text-text-muted">
                    {chunk.wordCount.toLocaleString()} words •{" "}
                    {chunk.sentenceCount} sentences • {chunk.method}
                  </div>
                  <div className="text-xs text-text-muted mt-1">
                    {Math.ceil(chunk.content.length / 1000)}KB •{" "}
                    {chunk.filename}
                  </div>
                </div>

                <button
                  onClick={() => downloadChunk(chunk)}
                  className="btn-secondary flex items-center gap-2 ml-4"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentSplitter;
