"use client";
import { useState } from 'react';
import { Twitter, Linkedin, Users } from 'lucide-react';

export default function ShareButtons() {
    const [copyMessage, setCopyMessage] = useState('');
    const toolUrl = 'https://demo.exa.ai/hallucination-detector';
    const shareText = `Just saw this AI tool which can detect hallucinations in your content, seems cool \n\n${toolUrl}`;

    const shareOnTwitter = () => {
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
        window.open(twitterUrl, '_blank');
    };

    const shareOnLinkedIn = () => {
        const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(toolUrl)}`;
        window.open(linkedinUrl, '_blank');
    };

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(toolUrl);
            setCopyMessage('Copied! Now share the link with your team 🚀');
            setTimeout(() => setCopyMessage(''), 3000);
        } catch (err) {
            setCopyMessage('Failed to copy');
        }
    };

    return (
        <div className="my-12 pt-12 space-y-6 opacity-0 animate-fade-up">
            <h3 className="text-lg text-center text-primary-color mb-6"> {/* Updated text color */}
                Share this hallucinations detector tool now!
            </h3>
            <div className="flex flex-col sm:flex-row justify-center gap-8">
                <button
                    onClick={shareOnTwitter}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-[#1DA1F2] text-white rounded-md hover:bg-[#1a8cd8] transition-all duration-200 shadow-lg hover:shadow-cyan-500/50" /* Added rounded-md & shadows */
                >
                    <Twitter size={20} />
                    <span>Share on Twitter</span>
                </button>

                <button
                    onClick={shareOnLinkedIn}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-[#0A66C2] text-white rounded-md hover:bg-[#094d92] transition-all duration-200 shadow-lg hover:shadow-blue-500/50" /* Added rounded-md & shadows */
                >
                    <Linkedin size={20} />
                    <span>Share on LinkedIn</span>
                </button>

                <button
                    onClick={copyToClipboard}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-all duration-200 shadow-lg hover:shadow-gray-500/50" /* Added rounded-md & shadows, updated color */
                >
                    <Users size={20} />
                    <span>Share with Your Team</span>
                </button>
            </div>
            {copyMessage && (
                <div className="text-center text-green-500 font-medium mt-4 animate-fade-up"> {/* Updated text color */}
                    {copyMessage}
                </div>
            )}
        </div>
    );
}