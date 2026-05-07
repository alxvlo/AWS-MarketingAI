"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import EmotionCapturePanel from "@/components/home/EmotionCapturePanel";
import KpiStrip from "@/components/home/KpiStrip";
import EmotionDistributionCard from "@/components/home/EmotionDistributionCard";
import CampaignsCard from "@/components/home/CampaignsCard";
import TrendsCard from "@/components/home/TrendsCard";
import SubmissionsAuditCard from "@/components/home/SubmissionsAuditCard";

export default function HomePage() {
  const router = useRouter();
  const { isAuthed, hydrated } = useAuth();

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthed) router.replace("/login/");
  }, [hydrated, isAuthed, router]);

  if (!hydrated || !isAuthed) {
    return (
      <main className="min-h-screen bg-[var(--bg-canvas)] flex items-center justify-center">
        <p className="eyebrow">Loading…</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)]">
      <AppHeader />
      <main className="max-w-[1280px] mx-auto px-12 py-10 space-y-6">
        {/* KPI strip — H1 */}
        <div className="grid grid-cols-12 gap-6">
          <KpiStrip />
        </div>

        {/* Primary grid */}
        <div className="grid grid-cols-12 gap-6">
          {/* Capture card — G1 */}
          <div className="col-span-7">
            <EmotionCapturePanel />
          </div>
          <div className="col-span-5 space-y-6">
            {/* H2 + H3 slots */}
            <EmotionDistributionCard />
            <CampaignsCard />
          </div>

          {/* H4 slot */}
          <div className="col-span-12">
            <TrendsCard />
          </div>
          {/* H5 slot */}
          <div className="col-span-12">
            <SubmissionsAuditCard />
          </div>
        </div>
      </main>
    </div>
  );
}
