import { supabaseServerComponent } from '@/lib/supabase';
import VideoPlayer from '@/components/VideoPlayer';
import Link from 'next/link';

export default async function TutorialPage(
  { params }: { params: Promise<{ slug: string }> }   // <- params is a Promise now
) {
  const { slug } = await params;                       // <- await it

  const supabase = await supabaseServerComponent();

  const { data: t } = await supabase
    .from('tutorials')
    .select('id, title, description, cf_stream_uid, price_cents')
    .eq('slug', slug)
    .single();

  if (!t) return <div>Not found</div> as any;

  const { data: { user } } = await supabase.auth.getUser();

  let hasAccess = false;
  if (user) {
    const { data: p } = await supabase
      .from('purchases')
      .select('id')
      .eq('user_id', user.id)
      .eq('tutorial_id', t.id)
      .maybeSingle();
    hasAccess = !!p;
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-3">{t.title}</h1>
      <p className="mb-6 text-stone-600">{t.description}</p>

      {hasAccess ? (
        <VideoPlayer uid={t.cf_stream_uid} />
      ) : (
        <div className="rounded-xl border p-6">
          <div className="text-lg mb-4">This tutorial costs ${(t.price_cents / 100).toFixed(2)}</div>
          <form action="/api/checkout" method="POST">
            <input type="hidden" name="tutorialId" value={t.id} />
            <button className="px-4 py-2 rounded-lg bg-black text-white">Buy access</button>
          </form>
          <p className="mt-3 text-sm text-stone-500">After purchase, this page will unlock instantly.</p>
          <p className="mt-3 text-sm"><Link href="/projects">Back to all tutorials →</Link></p>
        </div>
      )}
    </main>
  );
}
