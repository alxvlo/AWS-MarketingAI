import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] flex items-center justify-center px-6">
      <div className="w-full max-w-[440px]">
        <header className="mb-8 text-center">
          <p className="eyebrow mb-2">Satisfaction Meter</p>
          <h1 className="display text-[36px] leading-tight">Admin Sign-in</h1>
          <p className="mt-3 text-[14px] text-[var(--ink-tertiary)]">
            Authorized personnel only.
          </p>
        </header>
        <div className="bg-[var(--bg-surface)] border border-[var(--rule)] p-8" style={{ borderRadius: 2 }}>
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-[12px] text-[var(--ink-tertiary)]">
          Photos processed for emotion detection are deleted within 30 days.
        </p>
      </div>
    </main>
  );
}
