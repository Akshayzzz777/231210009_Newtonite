import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, oklch(0.65 0.22 264), transparent)' }} />
        <div className="absolute inset-0"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, oklch(1 0 0 / 3%) 1px, transparent 0)', backgroundSize: '32px 32px' }} />
      </div>

      {/* Navbar */}
      <nav className="relative flex items-center justify-between px-8 py-5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, oklch(0.65 0.22 264), oklch(0.65 0.22 300))' }}>
            <span className="text-white font-bold">N</span>
          </div>
          <span className="text-xl font-bold gradient-text">Newtonite</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login"
            className="px-5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200">
            Sign in
          </Link>
          <Link href="/register"
            className="px-5 py-2 text-sm font-semibold rounded-xl text-white transition-all duration-200 hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, oklch(0.55 0.22 264), oklch(0.55 0.22 290))' }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium mb-8">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          Enterprise Work Management Platform
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight max-w-4xl leading-tight">
          Ship faster with{' '}
          <span className="gradient-text">intelligent</span>{' '}
          work tracking
        </h1>

        <p className="text-xl text-muted-foreground max-w-2xl mt-6 leading-relaxed">
          Newtonite gives your team a single source of truth — with real-time collaboration,
          smart prioritization, and complete audit history built in from day one.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 mt-10">
          <Link
            href="/register"
            id="hero-cta"
            className="px-8 py-4 rounded-2xl font-semibold text-white text-lg transition-all duration-200 hover:opacity-90 hover:scale-105 active:scale-[0.98] shadow-2xl"
            style={{ background: 'linear-gradient(135deg, oklch(0.55 0.22 264), oklch(0.55 0.22 290))' }}>
            Start for free
          </Link>
          <Link
            href="/login"
            className="px-8 py-4 rounded-2xl font-semibold text-foreground text-lg border border-border hover:border-primary/50 transition-all duration-200">
            Sign in →
          </Link>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-3 mt-16">
          {[
            '⚡ Real-time updates',
            '🔒 Role-based access control',
            '📊 Smart dashboards',
            '🔄 Activity history',
            '🔍 Advanced search',
            '⚠️ Conflict detection',
          ].map((feat) => (
            <div key={feat} className="glass rounded-full px-5 py-2.5 text-sm text-muted-foreground">
              {feat}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
