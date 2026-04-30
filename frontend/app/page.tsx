import WebcamFeed from "@/components/WebcamFeed";

export default function CustomerPage() {
  return (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Brand header */}
        <div className="bg-slate-800 px-8 py-6">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Satisfaction Meter
          </h1>
          <p className="mt-1 text-sm text-slate-400">Tell us how you feel</p>
        </div>

        <div className="px-8 py-7 space-y-6">
          {/* Email input */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Your email address{" "}
              <span className="text-red-500" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-600 focus:border-transparent transition"
            />
          </div>

          {/* Webcam feed */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              Camera preview
            </p>
            <WebcamFeed />
          </div>

          <p className="text-xs text-slate-400 text-center pb-1">
            Your photo is processed for emotion detection and deleted within 30
            days.
          </p>
        </div>
      </div>
    </main>
  );
}
