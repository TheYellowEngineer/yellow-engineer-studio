'use client';

import { Suspense, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { useSearchParams } from 'next/navigation';

// Optional: prevents static prerendering complaints for a purely client page
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto p-8">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const sp = useSearchParams();            // ✅ now wrapped in <Suspense>
  const next = sp.get('next') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const supabase = supabaseBrowser();

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) setErrorMsg(error.message);
    else window.location.href = next;      // return to original page
  }

  return (
    <main className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">Sign in</h1>
      <form onSubmit={handleLogin} className="space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border px-3 py-2"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border px-3 py-2"
          required
        />
        <button className="w-full py-2 rounded bg-black text-white">Sign in</button>
        {errorMsg && <p className="text-red-600">{errorMsg}</p>}
      </form>
    </main>
  );
}