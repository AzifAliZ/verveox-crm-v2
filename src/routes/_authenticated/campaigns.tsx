import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchAllPages } from "@/lib/persistence";
import { useMe } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaigns — Verveox CRM" },
      { name: "description", content: "Campaign attribution and performance." },
      { property: "og:title", content: "Campaigns — Verveox CRM" },
      { property: "og:description", content: "Campaign attribution and performance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Campaigns,
});

function Campaigns() {
  const { data: me } = useMe();
  const q = useQuery({
    queryKey: ["campaigns-stats"],
    queryFn: async () => {
      const [c, l] = await Promise.all([
        supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
        fetchAllPages((from, to) =>
          supabase
            .from("leads")
            .select("campaign_id, temperature, stage")
            .is("archived_at", null)
            .order("id")
            .range(from, to),
        ),
      ]);
      if (c.error) throw c.error;
      return c.data.map((cp) => {
        const ls = l.filter((x) => x.campaign_id === cp.id);
        return {
          ...cp,
          leads: ls.length,
          hot: ls.filter((x) => x.temperature === "hot").length,
          qualified: ls.filter((x) =>
            ["qualified", "application_started", "enrolled"].includes(x.stage),
          ).length,
          converted: ls.filter((x) => x.stage === "enrolled").length,
        };
      });
    },
  });
  async function add() {
    const name = prompt("Campaign name");
    if (!name?.trim()) return;
    const platform =
      prompt("Platform (facebook, instagram, website, whatsapp, referral, other)", "facebook")
        ?.trim()
        .toLowerCase() || "other";
    const spend = prompt("Actual spend so far (leave blank if unknown)");
    const { error } = await supabase.from("campaigns").insert({
      name: name.trim().slice(0, 200),
      source_platform: platform,
      spend: spend && !isNaN(Number(spend)) ? Number(spend) : null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Campaign added");
      q.refetch();
    }
  }
  async function setSpend(id: string) {
    const v = prompt("Actual spend (blank = unknown)");
    if (v === null) return;
    const { error } = await supabase
      .from("campaigns")
      .update({ spend: v.trim() === "" ? null : Number(v) })
      .eq("id", id)
      .select("id")
      .single();
    if (error) toast.error(error.message);
    else q.refetch();
  }
  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Conversion rate = enrolled ÷ leads. Cost per lead appears only when real spend has been entered or synced."
        actions={me?.canManage && <Button onClick={add}>Add campaign</Button>}
      />
      {q.data?.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Campaigns are created automatically from Meta leads, or add one manually."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Campaign</th>
                <th className="p-3">Platform</th>
                <th className="p-3">Status</th>
                <th className="p-3">Leads</th>
                <th className="p-3">Hot</th>
                <th className="p-3">Qualified</th>
                <th className="p-3">Enrolled</th>
                <th className="p-3">Conv. rate</th>
                <th className="p-3">Spend</th>
                <th className="p-3">Cost / lead</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3">{c.source_platform}</td>
                  <td className="p-3">
                    <Badge variant="muted">{c.status}</Badge>
                  </td>
                  <td className="p-3">{c.leads}</td>
                  <td className="p-3 text-hot">{c.hot}</td>
                  <td className="p-3">{c.qualified}</td>
                  <td className="p-3 text-success">{c.converted}</td>
                  <td className="p-3">
                    {c.leads ? `${Math.round((c.converted / c.leads) * 100)}%` : "—"}
                  </td>
                  <td className="p-3">
                    {c.spend == null ? (
                      <span className="text-muted-foreground">Not available</span>
                    ) : (
                      `₹${Number(c.spend).toLocaleString()}`
                    )}
                    {me?.canManage && (
                      <Button size="sm" variant="ghost" onClick={() => setSpend(c.id)}>
                        Edit
                      </Button>
                    )}
                  </td>
                  <td className="p-3">
                    {c.spend != null && c.leads ? (
                      `₹${(Number(c.spend) / c.leads).toFixed(0)}`
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
