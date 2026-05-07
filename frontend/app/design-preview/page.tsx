import Card from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";

export default function Preview() {
  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] px-12 py-16">
      <div className="max-w-[1280px] mx-auto space-y-6">
        <header className="flex items-baseline justify-between border-b border-[var(--rule)] pb-6">
          <h1 className="display text-[40px] leading-none">Satisfaction Meter</h1>
          <p className="eyebrow">Design Preview · 2026-05-08</p>
        </header>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-3">
            <Card eyebrow="Total submissions" title="1,284" />
          </div>
          <div className="col-span-3">
            <Card eyebrow="Emails sent" title="971" />
          </div>
          <div className="col-span-3">
            <Card eyebrow="Failed" title="14" />
          </div>
          <div className="col-span-3">
            <Card eyebrow="Top emotion" title="Happy" />
          </div>

          <div className="col-span-8">
            <Card eyebrow="Live capture" title="Emotion Detection">
              <p className="text-[var(--ink-secondary)]">Webcam panel mounts here.</p>
            </Card>
          </div>
          <div className="col-span-4 space-y-4">
            <Card eyebrow="Statuses">
              <div className="flex flex-wrap gap-2">
                {["pending","emotion_detected","email_sent","email_failed","no_face_detected"].map(s => (
                  <StatusBadge key={s} status={s} />
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
