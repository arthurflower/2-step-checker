// app/splitter/page.tsx
import DocumentSplitter from "../../components/DocumentSplitter";

export const metadata = {
  title: "Document Splitter - Hallucination Detector",
  description:
    "Split large documents into manageable chunks for the AI Hallucination Detector",
};

export default function SplitterPage() {
  return (
    <main className="flex relative min-h-screen flex-col items-center justify-start p-4 md:p-6 pt-12 md:pt-20">
      {/* Background grid */}
      <div className="absolute inset-0 -z-0 h-full w-full bg-[radial-gradient(#80808060_1px,transparent_1px)] [background-size:30px_30px]"></div>

      <div className="w-full max-w-5xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl pb-3 font-bold opacity-0 animate-fade-up [animation-delay:200ms] tracking-tight">
            Document
            <span className="text-text-muted"> Splitter</span>
          </h1>
          <p className="text-text-secondary mb-8 text-base sm:text-lg opacity-0 animate-fade-up [animation-delay:400ms]">
            Break large documents into optimized chunks for the Hallucination
            Detector. Perfect for processing 100+ page documents without
            timeouts.
          </p>
        </div>

        <DocumentSplitter />

        {/* How it Works Section */}
        <div className="mt-16 opacity-0 animate-fade-up [animation-delay:600ms]">
          <div className="glass-card">
            <h2 className="text-2xl font-bold text-text-primary mb-6">
              How It Works
            </h2>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-accent-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-accent-primary">
                    1
                  </span>
                </div>
                <h3 className="font-semibold text-text-primary mb-2">
                  Upload & Analyze
                </h3>
                <p className="text-text-secondary text-sm">
                  Upload your large DOCX file and let our analyzer understand
                  its structure, word count, and optimal splitting strategy.
                </p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 bg-accent-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-accent-primary">
                    2
                  </span>
                </div>
                <h3 className="font-semibold text-text-primary mb-2">
                  Smart Splitting
                </h3>
                <p className="text-text-secondary text-sm">
                  Documents are intelligently split by sentences or paragraphs,
                  preserving context and ensuring no claims are cut mid-thought.
                </p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 bg-accent-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-accent-primary">
                    3
                  </span>
                </div>
                <h3 className="font-semibold text-text-primary mb-2">
                  Download & Process
                </h3>
                <p className="text-text-secondary text-sm">
                  Download individual text chunks and process them one by one in
                  the main Hallucination Detector for complete analysis.
                </p>
              </div>
            </div>

            <div className="mt-8 p-4 bg-accent-primary/10 rounded-lg border border-accent-primary/20">
              <h4 className="font-semibold text-accent-primary mb-2">
                💡 Pro Tips:
              </h4>
              <ul className="text-text-secondary text-sm space-y-1">
                <li>
                  • Keep chunks between 5000-7000 words for optimal processing
                  speed
                </li>
                <li>
                  • Use sentence-based splitting to preserve claim context
                </li>
                <li>
                  • Process chunks during off-peak hours for faster results
                </li>
                <li>
                  • Save all individual results to compile your complete
                  analysis
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="mt-12 text-center opacity-0 animate-fade-up [animation-delay:800ms]">
          <a href="/" className="btn-secondary inline-flex items-center gap-2">
            ← Back to Hallucination Detector
          </a>
        </div>
      </div>
    </main>
  );
}
