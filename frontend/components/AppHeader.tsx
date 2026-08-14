export default function AppHeader() {
  return (
    <header className="bg-[var(--bg-surface)] border-b border-[var(--rule)] px-8 py-6">
      <div className="max-w-6xl mx-auto flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="display text-[32px] leading-none">Satisfaction Meter</h1>
          <p className="eyebrow">Live Demo Dashboard</p>
        </div>
        <p className="text-[13px] text-[var(--ink-tertiary)]">Public access</p>
      </div>
    </header>
  );
}
