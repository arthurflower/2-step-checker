/** @type {import('next').NextConfig} */

const nextConfig = {
  // basePath is only set for production.
  // In development (npm run dev), basePath will be undefined, and the app runs at the root.
  ...(process.env.NODE_ENV === 'production'
    ? { basePath: '/hallucination-detector' }
    : {}),

  images: {
    unoptimized: true, // Kept from previous, adjust if you have specific image optimization needs
  },

  // REMOVED: output: 'export' (This was likely the main issue)

  // Optional: If you are using server actions and they are part of the issue,
  // you might need to adjust experimental.serverActions or comment it out for debugging.
  // For now, keeping it as in your original files if it's essential.
  experimental: {
    serverActions: {
      // Ensure localhost is allowed if server actions are called from the client in dev
      // For API routes called via fetch, this is less relevant.
      // allowedOrigins: ["demo.exa.ai", "localhost:3000"], // Example if needed
      // allowedForwardedHosts: ["demo.exa.ai", "localhost"], // Example if needed
       allowedOrigins: ["demo.exa.ai"], // from your original file
       allowedForwardedHosts: ["demo.exa.ai"], // from your original file
    },
  },

  reactStrictMode: true, // Recommended for development
};

export default nextConfig;