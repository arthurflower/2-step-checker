import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Skip all middleware logic in development
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next();
  }

  // Production logic (if needed beyond Next.js basePath handling)
  // This section might need to be adjusted based on your Vercel deployment and domain setup.
  // For now, the primary goal is to ensure development works.
  // The original middleware was for redirecting a specific hostname.
  // If basePath is '/hallucination-detector', Next.js handles serving from that path.
  // A simple production middleware might look like this if you need to enforce the basePath:

  const { pathname } = request.nextUrl;

  // Example: Redirect root to basePath if not already there
  // if (pathname === '/') {
  //   return NextResponse.redirect(new URL('/hallucination-detector', request.url), 301);
  // }

  // The previous complex production logic might be unnecessary if basePath works as expected.
  // For now, let's keep it simple for production and focus on fixing dev.
  if (request.headers.get('host') === 'exa-hallucination-detector.vercel.app') { // original redirect logic
    return NextResponse.redirect('https://demo.exa.ai/hallucination-detector', {
      status: 301
    });
  }

  return NextResponse.next();
}

export const config = {
  // Apply middleware to all paths except static files, images, and API routes if they handle basePath themselves
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};