'use client';
import { useEffect, useState } from 'react';


export default function VideoPlayer({ uid }: { uid: string }) {
const [token, setToken] = useState<string | null>(null);


useEffect(() => {
fetch(`/api/stream-token/${uid}`)
.then((r) => r.json())
.then((t) => setToken(t.token))
.catch(() => setToken(null));
}, [uid]);


if (!token) return <div className="p-6">Unlocking your video…</div>;


return (
<iframe
className="w-full aspect-video rounded-2xl shadow"
allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
allowFullScreen
src={`https://customer-${process.env.NEXT_PUBLIC_CLOUDFLARE_EMBED_ID}.cloudflarestream.com/${uid}/iframe?token=${token}`}
/>
);
}
