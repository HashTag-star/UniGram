'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex min-h-screen items-center justify-center bg-gray-950 px-6 py-16 text-center text-gray-200">
          <div className="max-w-lg rounded-2xl border border-gray-800 bg-gray-900/80 p-8 shadow-2xl">
            <h2 className="mb-3 text-2xl font-semibold">Something went wrong</h2>
            <p className="text-sm text-gray-400">
              UniGram has recorded this failure and the team will investigate it.
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
