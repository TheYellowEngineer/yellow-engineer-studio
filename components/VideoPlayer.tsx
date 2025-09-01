'use client';
import { useEffect, useState } from 'react';

export default function VideoPlayer({ uid }: { uid: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/stream-token/${uid}`)
      .then((r) => r.json())
      .then((data) => {
        // normalize: handle { token } or { result: { token } }
        if (data.token) setToken(data.token);
        else if (data.result?.token) setToken(data.result.token);
        else throw new Error('No token in response');
      })
      .catch((err) => {
        setError(err.message);
      });
  }, [uid]);

  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!token) return <div className="p-6">Unlocking your video…</div>;

  return (
    <iframe
      className="w-full aspect-video rounded-2xl shadow"
      allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      src={`https://customer-${process.env.NEXT_PUBLIC_CLOUDFLARE_EMBED_ID}.cloudflarestream.com/${uid}/iframe?token=${encodeURIComponent(token)}`}
    />
  );
}