"use client";
import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { fetchCampaigns, CampaignsResponse } from "@/lib/analytics";

export default function CampaignsCard() {
  const [data, setData] = useState<CampaignsResponse | null>(null);
  const [err, setErr]   = useState<string | null>(null);

  useEffect(() => {
    fetchCampaigns().then(setData).catch(e => setErr((e as Error).message));
  }, []);

  return (
    <Card eyebrow="Campaigns" title="Sent by template">
      {err && <p className="text-[13px]" style={{ color: "var(--status-error)" }}>{err}</p>}
      {!err && !data && <p className="eyebrow">Loading…</p>}
      {data && (
        <table className="w-full text-[13px]">
          <tbody>
            {Object.entries(data.perTemplate || data.byTemplate || {}).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
              <tr key={t} className="border-b border-[var(--rule)] last:border-0">
                <td className="py-2 capitalize">{t}</td>
                <td className="py-2 text-right numeric">{n}</td>
              </tr>
            ))}
            <tr>
              <td className="pt-3 eyebrow">Total</td>
              <td className="pt-3 text-right numeric font-semibold">{data.totalSent || data.total}</td>
            </tr>
          </tbody>
        </table>
      )}
    </Card>
  );
}
