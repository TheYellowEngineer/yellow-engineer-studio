'use client';
import { useEffect, useState } from 'react';

export default function VideoPlayer({ uid }: { uid: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/stream-token/${uid}`, { cache: 'no-store' });
        const ct = res.headers.get('content-type') ?? '';

        if (!ct.includes('application/json')) {
          const text = await res.text();
          throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
        }

        const bodyUnknown: unknown = await res.json();
        const body = bodyUnknown as { token?: string; error?: string; detail?: string };

        if (!res.ok) {
          throw new Error(`${body.error ?? 'error'}${body.detail ? `: ${body.detail}` : ''}`);
        }
        if (!body.token) {
          throw new Error('No token in response');
        }

        if (!cancelled) setToken(body.token);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        if (!cancelled) setErr(message);
      }
    })();
    return () => { cancelled = true; };
  }, [uid]);

  if (err) return <p className="text-red-500 text-sm">Error: {err}</p>;
  if (!token) return <p className="text-stone-400 text-sm">Loading video…</p>;

  const src = `https://customer-${process.env.NEXT_PUBLIC_CLOUDFLARE_EMBED_ID}.cloudflarestream.com/${uid}/iframe?token=${encodeURIComponent(token)}`;

  return (
    <iframe
      className="w-full aspect-video rounded-2xl border"
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      src={src}
    />
  );
}
