'use client';
import { useEffect, useState } from 'react';

export default function VideoPlayer({ uid }: { uid: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/stream-token/${uid}`, { cache: 'no-store' })
      .then((r) =>
        r.text().then((raw) => {
          let data: unknown = {};
          try {
            if (raw) data = JSON.parse(raw);
          } catch {
            // non-JSON (HTML/error/empty) → leave data as {}
          }

          // Narrow the unknown into the shapes we expect
          const maybeObj = data as {
            token?: string;
            result?: { token?: string };
            error?: string;
          };

          const extractedToken =
            maybeObj.token ?? maybeObj.result?.token ?? null;

          if (!r.ok || !extractedToken) {
            const message =
              maybeObj.error ||
              `Token request failed (${r.status}${
                raw ? `, body: ${raw.slice(0, 120)}…` : ''
              })`;
            throw new Error(message);
          }

          return extractedToken;
        })
      )
      .then((t) => setToken(t))
      .catch((err: unknown) => {
        const msg =
          err instanceof Error ? err.message : 'Failed to load stream token';
        setError(msg);
      });
  }, [uid]);

  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!token) return <div className="p-6">Unlocking your video…</div>;

  return (
    <iframe
      className="w-full aspect-video rounded-2xl shadow"
      allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      src={`https://customer-${process.env.NEXT_PUBLIC_CLOUDFLARE_EMBED_ID}.cloudflarestream.com/${uid}/iframe?token=${encodeURIComponent(
        token
      )}`}
    />
  );
}
