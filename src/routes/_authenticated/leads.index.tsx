import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Download, Columns3, X, Save, ArrowUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LeadFormDialog } from "@/components/lead-form-dialog";
import { TempBadge, StageBadge, PriorityBadge } from "@/components/lead-badges";
import { useMe, useProfiles, useRefData } from "@/hooks/use-auth";
import {
  applyLeadFilters,
  fetchLeadIdsForTag,
  SAVED_PRESETS,
  type LeadFilters,
} from "@/lib/lead-query";
import { EXPORT_COLUMNS, STAGES, TEMPERATURES, fmtDate } from "@/lib/crm";
import { fetchAllPages, requireAffectedRows } from "@/lib/persistence";
import { useServerFn } from "@tanstack/react-start";
import { createLeadExport, downloadTransfer } from "@/lib/transfer.functions";

export const Route = createFileRoute("/_authenticated/leads/")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { q?: string; filters?: LeadFilters; page?: number; sort?: string; asc?: boolean } => ({
    q: typeof s.q === "string" ? s.q : undefined,
    filters: s.filters && typeof s.filters === "object" ? (s.filters as LeadFilters) : {},
    page: typeof s.page === "number" ? s.page : 0,
    sort: typeof s.sort === "string" ? s.sort : "created_at",
    asc: s.asc === true,
  }),
  head: () => ({
    meta: [
      { title: "Leads — Verveox CRM" },
      { name: "description", content: "Search and manage candidate leads." },
      { property: "og:title", content: "Leads — Verveox CRM" },
      { property: "og:description", content: "Search and manage candidate leads." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeadsPage,
});

const PAGE = 25;
const COLS = [
  { key: "contact", label: "Contact" },
  { key: "course", label: "Course" },
  { key: "source", label: "Source / campaign" },
  { key: "stage", label: "Stage" },
  { key: "temperature", label: "Temperature" },
  { key: "score", label: "Score" },
  { key: "priority", label: "Priority" },
  { key: "owner", label: "Owner" },
  { key: "next", label: "Next follow-up" },
  { key: "created", label: "Created" },
];
type SortKey = "created_at" | "score" | "full_name" | "next_followup_at";

function LeadsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/leads/" });
  const { data: me } = useMe();
  const { data: ref } = useRefData();
  const { data: profiles } = useProfiles();
  const qc = useQueryClient();
  const f: LeadFilters = useMemo(
    () => ({ ...search.filters, q: search.q }),
    [search.filters, search.q],
  );
  const setF = (next: LeadFilters | ((previous: LeadFilters) => LeadFilters)) => {
    const value = typeof next === "function" ? next(f) : next;
    const { q, ...filters } = value;
    void navigate({ search: (previous) => ({ ...previous, q, filters, page: 0 }), replace: true });
  };
  const [qInput, setQInput] = useState(search.q ?? "");
  const page = Math.max(0, Math.floor(search.page ?? 0));
  const setPage = (next: number | ((previous: number) => number)) =>
    void navigate({
      search: (previous) => ({ ...previous, page: typeof next === "function" ? next(page) : next }),
    });
  const sort = {
    key: (["created_at", "score", "full_name", "next_followup_at"].includes(search.sort ?? "")
      ? search.sort
      : "created_at") as SortKey,
    asc: search.asc ?? false,
  };
  const setSort = (
    next: (previous: { key: SortKey; asc: boolean }) => { key: SortKey; asc: boolean },
  ) => {
    const value = next(sort);
    void navigate({
      search: (previous) => ({ ...previous, sort: value.key, asc: value.asc, page: 0 }),
    });
  };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allFiltered, setAllFiltered] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [bulk, setBulk] = useState<null | "archive" | "restore" | "delete">(null);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    setQInput(search.q ?? "");
  }, [search.q]);
  useEffect(() => {
    setSelected(new Set());
    setAllFiltered(false);
  }, [f, search.sort, search.asc]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (f.q !== (qInput || undefined)) setF({ ...f, q: qInput || undefined });
    }, 350);
    return () => clearTimeout(t);
  }, [qInput]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function buildQuery(select: string, opts?: { count?: "exact" }): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from("leads").select(select, opts);
    q = applyLeadFilters(q, f, me?.id);
    if (f.tag) {
      const ids = await fetchLeadIdsForTag(f.tag);
      q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    }
    return { query: q };
  }

  const list = useQuery({
    queryKey: ["leads", f, page, sort, me?.id],
    enabled: !!me,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { query: q } = await buildQuery(
        "*, courses(name), campaigns(name), owner:profiles!leads_assigned_to_fkey(full_name, email)",
        { count: "exact" },
      );
      const { data, error, count } = await q
        .order(sort.key, { ascending: sort.asc, nullsFirst: false })
        .order("id")
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { rows: data as any[], count: count ?? 0 };
    },
  });

  const views = useQuery({
    queryKey: ["saved_views"],
    queryFn: async () => {
      const { data, error } = await supabase.from("saved_views").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  async function targetIds(): Promise<string[]> {
    if (!allFiltered) return [...selected];
    const data = await fetchAllPages<{ id: string }>(async (from, to) => {
      const { query } = await buildQuery("id");
      return query.order("id").range(from, to);
    });
    return data.map((row) => row.id);
  }

  const bulkUpdate = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const ids = await targetIds();
      if (!ids.length) throw new Error("No leads selected");
      let updated = 0;
      for (let offset = 0; offset < ids.length; offset += 200) {
        const chunk = ids.slice(offset, offset + 200);
        const { data, error } = await supabase
          .from("leads")
          .update(patch as never)
          .in("id", chunk)
          .select("id");
        if (error) throw new Error(`${updated} records saved before failure: ${error.message}`);
        updated += data.length;
        requireAffectedRows(data.length, chunk.length);
      }
      return { requested: ids.length, updated };
    },
    onSuccess: (r) => {
      toast.success(
        `Updated ${r.updated} of ${r.requested} leads${r.updated < r.requested ? " (others not permitted)" : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["leads"] });
      setSelected(new Set());
      setAllFiltered(false);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
  const bulkTag = useMutation({
    mutationFn: async (tagId: string) => {
      const ids = await targetIds();
      for (let offset = 0; offset < ids.length; offset += 200) {
        const { error } = await supabase.from("lead_tags").upsert(
          ids.slice(offset, offset + 200).map((lead_id) => ({ lead_id, tag_id: tagId })),
          { ignoreDuplicates: true },
        );
        if (error) throw new Error(`${offset} leads tagged before failure: ${error.message}`);
      }
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`Tagged ${n} leads`);
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
  const bulkDelete = useMutation({
    mutationFn: async () => {
      const ids = await targetIds();
      let deleted = 0;
      for (let offset = 0; offset < ids.length; offset += 200) {
        const chunk = ids.slice(offset, offset + 200);
        const { data, error } = await supabase.from("leads").delete().in("id", chunk).select("id");
        if (error) throw new Error(`${deleted} leads deleted before failure: ${error.message}`);
        deleted += data.length;
        requireAffectedRows(data.length, chunk.length);
      }
      return deleted;
    },
    onSuccess: (n) => {
      toast.success(`Permanently deleted ${n} leads`);
      qc.invalidateQueries({ queryKey: ["leads"] });
      setSelected(new Set());
      setAllFiltered(false);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const saveView = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from("saved_views")
        .insert({ name, filters: f as never, user_id: me?.id ?? "" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("View saved");
      views.refetch();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const rows = list.data?.rows ?? [];
  const total = list.data?.count ?? 0;
  const selCount = allFiltered ? total : selected.size;
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const show = (k: string) => !hidden.has(k);
  const activeFilterCount =
    Object.entries(f).filter(([k, v]) => k !== "q" && v !== undefined && v !== "" && v !== false)
      .length + (f.q ? 1 : 0);
  const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  const setFilter = (k: keyof LeadFilters, v: string) =>
    setF((p) => ({
      ...p,
      [k]: v === "" ? undefined : k === "minScore" || k === "maxScore" ? Number(v) : v,
    }));
  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, asc: s.key === key ? !s.asc : key === "full_name" }));

  return (
    <div>
      <PageHeader
        title="Leads"
        description={`${total} matching lead${total === 1 ? "" : "s"}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setExportOpen(true)}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add lead
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {SAVED_PRESETS.map((p) => (
          <Button key={p.name} size="sm" variant="secondary" onClick={() => setF(p.filters)}>
            {p.name}
          </Button>
        ))}
        {views.data?.map((v) => (
          <span key={v.id} className="inline-flex items-center rounded-md bg-secondary">
            <Button size="sm" variant="ghost" onClick={() => setF(v.filters as LeadFilters)}>
              {v.name}
            </Button>
            <button
              className="pr-2 text-muted-foreground hover:text-foreground"
              aria-label={`Delete view ${v.name}`}
              onClick={async () => {
                const result = await supabase
                  .from("saved_views")
                  .delete()
                  .eq("id", v.id)
                  .select("id")
                  .single();
                if (result.error) toast.error(result.error.message);
                else views.refetch();
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          placeholder="Search name, email, phone, college"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          className="h-9 w-64"
          aria-label="Search"
        />
        <select
          className={sel}
          value={f.stage ?? ""}
          onChange={(e) => setFilter("stage", e.target.value)}
          aria-label="Stage"
        >
          <option value="">Any stage</option>
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className={sel}
          value={f.temperature ?? ""}
          onChange={(e) => setFilter("temperature", e.target.value)}
          aria-label="Temperature"
        >
          <option value="">Any temperature</option>
          {TEMPERATURES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className={sel}
          value={f.course ?? ""}
          onChange={(e) => setFilter("course", e.target.value)}
          aria-label="Course"
        >
          <option value="">Any course</option>
          {ref?.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className={sel}
          value={f.source ?? ""}
          onChange={(e) => setFilter("source", e.target.value)}
          aria-label="Source"
        >
          <option value="">Any source</option>
          {ref?.sources.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className={sel}
          value={f.campaign ?? ""}
          onChange={(e) => setFilter("campaign", e.target.value)}
          aria-label="Campaign"
        >
          <option value="">Any campaign</option>
          {ref?.campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className={sel}
          value={f.owner ?? ""}
          onChange={(e) => setFilter("owner", e.target.value)}
          aria-label="Owner"
        >
          <option value="">Any owner</option>
          <option value="me">Me</option>
          <option value="unassigned">Unassigned</option>
          {profiles?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name || p.email}
            </option>
          ))}
        </select>
        <select
          className={sel}
          value={f.followup ?? ""}
          onChange={(e) => setFilter("followup", e.target.value)}
          aria-label="Follow-up"
        >
          <option value="">Any follow-up</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="scheduled">Scheduled</option>
          <option value="none">None scheduled</option>
        </select>
        <select
          className={sel}
          value={f.tag ?? ""}
          onChange={(e) => setFilter("tag", e.target.value)}
          aria-label="Tag"
        >
          <option value="">Any tag</option>
          {ref?.tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <Input
          type="date"
          className="h-9 w-auto"
          value={f.from ?? ""}
          onChange={(e) => setFilter("from", e.target.value)}
          aria-label="Created from"
        />
        <Input
          type="date"
          className="h-9 w-auto"
          value={f.to ?? ""}
          onChange={(e) => setFilter("to", e.target.value)}
          aria-label="Created to"
        />
        <Input
          type="number"
          min={0}
          max={100}
          placeholder="Min score"
          className="h-9 w-24"
          value={f.minScore ?? ""}
          onChange={(e) => setFilter("minScore", e.target.value)}
        />
        <Input
          type="number"
          min={0}
          max={100}
          placeholder="Max score"
          className="h-9 w-24"
          value={f.maxScore ?? ""}
          onChange={(e) => setFilter("maxScore", e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={!!f.archived}
            onCheckedChange={(v) => setF((p) => ({ ...p, archived: !!v || undefined }))}
          />
          Archived
        </label>
        {activeFilterCount > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setF({});
              setQInput("");
            }}
          >
            <X className="mr-1 h-3 w-3" />
            Clear filters
          </Button>
        )}
        {activeFilterCount > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const n = prompt("Name this view");
              if (n?.trim()) saveView.mutate(n.trim().slice(0, 60));
            }}
          >
            <Save className="mr-1 h-3 w-3" />
            Save view
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="ml-auto">
              <Columns3 className="mr-1 h-4 w-4" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {COLS.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.key}
                checked={show(c.key)}
                onCheckedChange={() =>
                  setHidden((h) => {
                    const n = new Set(h);
                    if (n.has(c.key)) {
                      n.delete(c.key);
                    } else {
                      n.add(c.key);
                    }
                    return n;
                  })
                }
              >
                {c.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {selCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-info/40 bg-info/10 p-2 text-sm">
          <span className="font-medium">{selCount} selected</span>
          {!allFiltered && allOnPage && total > rows.length && (
            <Button size="sm" variant="link" onClick={() => setAllFiltered(true)}>
              Select all {total} filtered
            </Button>
          )}
          <select
            className={sel}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) bulkUpdate.mutate({ stage: e.target.value });
              e.target.value = "";
            }}
            aria-label="Bulk stage"
          >
            <option value="">Set stage…</option>
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            className={sel}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              if (v) bulkUpdate.mutate({ manual_temperature_override: v === "auto" ? null : v });
              e.target.value = "";
            }}
            aria-label="Bulk temperature"
          >
            <option value="">Set temperature…</option>
            {TEMPERATURES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label} (manual)
              </option>
            ))}
            <option value="auto">Return to automatic</option>
          </select>
          {me?.canManage && (
            <select
              className={sel}
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                if (v) bulkUpdate.mutate({ assigned_to: v === "none" ? null : v });
                e.target.value = "";
              }}
              aria-label="Bulk assign"
            >
              <option value="">Assign to…</option>
              <option value="none">Unassigned</option>
              {profiles
                ?.filter((p) => p.is_active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
            </select>
          )}
          <select
            className={sel}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) bulkTag.mutate(e.target.value);
              e.target.value = "";
            }}
            aria-label="Bulk tag"
          >
            <option value="">Add tag…</option>
            {ref?.tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {f.archived ? (
            <Button size="sm" variant="outline" onClick={() => setBulk("restore")}>
              Restore
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setBulk("archive")}>
              Archive
            </Button>
          )}
          {me?.isAdmin && f.archived && (
            <Button size="sm" variant="destructive" onClick={() => setBulk("delete")}>
              Delete permanently
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelected(new Set());
              setAllFiltered(false);
            }}
          >
            Clear
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-10 p-3">
                <Checkbox
                  aria-label="Select page"
                  checked={allOnPage}
                  onCheckedChange={(v) => {
                    setAllFiltered(false);
                    setSelected((s) => {
                      const n = new Set(s);
                      rows.forEach((r) => (v ? n.add(r.id) : n.delete(r.id)));
                      return n;
                    });
                  }}
                />
              </th>
              <th className="p-3">
                <button
                  className="inline-flex items-center gap-1"
                  onClick={() => toggleSort("full_name")}
                >
                  Name
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              {show("contact") && <th className="p-3">Contact</th>}
              {show("course") && <th className="p-3">Course</th>}
              {show("source") && <th className="p-3">Source / campaign</th>}
              {show("stage") && <th className="p-3">Stage</th>}
              {show("temperature") && <th className="p-3">Temp.</th>}
              {show("score") && (
                <th className="p-3">
                  <button
                    className="inline-flex items-center gap-1"
                    onClick={() => toggleSort("score")}
                  >
                    Score
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              )}
              {show("priority") && <th className="p-3">Priority</th>}
              {show("owner") && <th className="p-3">Owner</th>}
              {show("next") && (
                <th className="p-3">
                  <button
                    className="inline-flex items-center gap-1"
                    onClick={() => toggleSort("next_followup_at")}
                  >
                    Next follow-up
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              )}
              {show("created") && (
                <th className="p-3">
                  <button
                    className="inline-flex items-center gap-1"
                    onClick={() => toggleSort("created_at")}
                  >
                    Created
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {list.isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={12} className="p-3">
                      <Skeleton className="h-6" />
                    </td>
                  </tr>
                ))
              : rows.map((r) => {
                  const overdue = r.next_followup_at && new Date(r.next_followup_at) < new Date();
                  return (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="p-3">
                        <Checkbox
                          aria-label={`Select ${r.full_name}`}
                          checked={allFiltered || selected.has(r.id)}
                          onCheckedChange={(v) => {
                            setAllFiltered(false);
                            setSelected((s) => {
                              const n = new Set(s);
                              if (v) {
                                n.add(r.id);
                              } else {
                                n.delete(r.id);
                              }
                              return n;
                            });
                          }}
                        />
                      </td>
                      <td className="p-3 font-medium">
                        <Link to="/leads/$id" params={{ id: r.id }} className="hover:text-info">
                          {r.full_name}
                        </Link>
                        {r.marketing_opt_out && (
                          <Badge variant="muted" className="ml-2">
                            Opted out
                          </Badge>
                        )}
                      </td>
                      {show("contact") && (
                        <td className="p-3 text-xs text-muted-foreground">
                          {r.email}
                          <br />
                          {r.phone}
                        </td>
                      )}
                      {show("course") && <td className="p-3">{r.courses?.name ?? "—"}</td>}
                      {show("source") && (
                        <td className="p-3 text-xs">
                          {r.source}
                          <br />
                          <span className="text-muted-foreground">
                            {r.campaigns?.name ?? r.campaign_name_snapshot ?? ""}
                          </span>
                        </td>
                      )}
                      {show("stage") && (
                        <td className="p-3">
                          <StageBadge s={r.stage} />
                        </td>
                      )}
                      {show("temperature") && (
                        <td className="p-3">
                          <TempBadge
                            t={r.temperature}
                            manual={r.classification_mode === "manual"}
                          />
                        </td>
                      )}
                      {show("score") && <td className="p-3 tabular-nums">{r.score}</td>}
                      {show("priority") && (
                        <td className="p-3">
                          <PriorityBadge p={r.priority} />
                        </td>
                      )}
                      {show("owner") && (
                        <td className="p-3 text-xs">
                          {r.owner?.full_name || r.owner?.email || (
                            <span className="text-muted-foreground">Unassigned</span>
                          )}
                        </td>
                      )}
                      {show("next") && (
                        <td className={`p-3 text-xs ${overdue ? "text-hot" : ""}`}>
                          {fmtDate(r.next_followup_at, true)}
                        </td>
                      )}
                      {show("created") && (
                        <td className="p-3 text-xs text-muted-foreground">
                          {fmtDate(r.created_at)}
                        </td>
                      )}
                    </tr>
                  );
                })}
          </tbody>
        </table>
        {!list.isLoading && rows.length === 0 && (
          <div className="p-6">
            <EmptyState
              title="No leads found"
              description={
                activeFilterCount
                  ? "Try clearing some filters."
                  : "Add a lead manually or import a file."
              }
              action={<Button onClick={() => setCreateOpen(true)}>Add lead</Button>}
            />
          </div>
        )}
        {list.error && (
          <p className="p-4 text-sm text-destructive">
            Couldn't load leads: {(list.error as Error).message}
          </p>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE))}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0 || list.isFetching}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={(page + 1) * PAGE >= total || list.isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <LeadFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        selCount={selCount}
        getIds={targetIds}
        filters={f}
        total={total}
      />

      <AlertDialog open={!!bulk} onOpenChange={(o) => !o && setBulk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulk === "delete"
                ? "Permanently delete"
                : bulk === "archive"
                  ? "Archive"
                  : "Restore"}{" "}
              {selCount} leads?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulk === "delete"
                ? "This cannot be undone. All notes, follow-ups and history for these leads will be removed."
                : bulk === "archive"
                  ? "Archived leads are hidden from lists and dashboards and can be restored later."
                  : "These leads will return to active lists."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (bulk === "delete") bulkDelete.mutate();
                else
                  bulkUpdate.mutate({
                    archived_at: bulk === "archive" ? new Date().toISOString() : null,
                  });
                setBulk(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ExportDialog({
  open,
  onOpenChange,
  selCount,
  getIds,
  filters,
  total,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selCount: number;
  getIds: () => Promise<string[]>;
  filters: LeadFilters;
  total: number;
}) {
  const [cols, setCols] = useState<Set<string>>(() => new Set(EXPORT_COLUMNS.map((c) => c.key)));
  const [scope, setScope] = useState<"selected" | "filtered">("filtered");
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setScope(selCount ? "selected" : "filtered");
  }, [open, selCount]);
  const headers = useMemo(() => EXPORT_COLUMNS.filter((c) => cols.has(c.key)), [cols]);
  const exportFn = useServerFn(createLeadExport),
    downloadFn = useServerFn(downloadTransfer);
  const qc = useQueryClient();

  async function run() {
    if (!headers.length) return toast.error("Choose at least one column");
    setBusy(true);
    try {
      const result = await exportFn({
        data: {
          columns: headers.map((h) => h.key),
          format,
          filters,
          ...(scope === "selected" ? { ids: await getIds() } : {}),
        },
      });
      const link = await downloadFn({ data: { id: result.id } });
      const a = document.createElement("a");
      a.href = link.url;
      a.download = "";
      a.click();
      qc.invalidateQueries({ queryKey: ["transfer_jobs"] });
      toast.success(`Exported ${result.rows} leads`);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export leads</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={scope === "filtered"}
                onChange={() => setScope("filtered")}
              />
              All filtered ({total})
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                disabled={!selCount}
                checked={scope === "selected"}
                onChange={() => setScope("selected")}
              />
              Selected ({selCount})
            </label>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input type="radio" checked={format === "csv"} onChange={() => setFormat("csv")} />
              CSV
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={format === "xlsx"} onChange={() => setFormat("xlsx")} />
              Excel
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {EXPORT_COLUMNS.map((c) => (
              <label key={c.key} className="flex items-center gap-2">
                <Checkbox
                  checked={cols.has(c.key)}
                  onCheckedChange={() =>
                    setCols((s) => {
                      const n = new Set(s);
                      if (n.has(c.key)) {
                        n.delete(c.key);
                      } else {
                        n.add(c.key);
                      }
                      return n;
                    })
                  }
                />
                {c.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Maximum 5,000 leads per file. Private downloads expire after 24 hours.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={run} disabled={busy}>
            {busy ? "Exporting…" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
