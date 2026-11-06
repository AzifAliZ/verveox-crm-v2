import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  KanbanSquare,
  CalendarClock,
  Megaphone,
  Upload,
  BarChart3,
  UserCog,
  Plug,
  ScrollText,
  Settings,
  Bell,
  Search,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-auth";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABEL, fmtDate } from "@/lib/crm";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Access = "all" | "manage" | "admin";
const NAV: { to: string; label: string; icon: typeof Users; access: Access }[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, access: "all" },
  { to: "/leads", label: "Leads", icon: Users, access: "all" },
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare, access: "all" },
  { to: "/followups", label: "Follow-ups & Tasks", icon: CalendarClock, access: "all" },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone, access: "all" },
  { to: "/import", label: "Import / Export", icon: Upload, access: "all" },
  { to: "/reports", label: "Reports & Analytics", icon: BarChart3, access: "all" },
  { to: "/team", label: "Team Members", icon: UserCog, access: "manage" },
  { to: "/integrations", label: "Integrations", icon: Plug, access: "admin" },
  { to: "/audit", label: "Audit Logs", icon: ScrollText, access: "admin" },
  { to: "/settings", label: "Settings", icon: Settings, access: "admin" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const notifs = useQuery({
    queryKey: ["notifications", me?.id],
    enabled: !!me?.is_active,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data;
    },
  });
  const unread = notifs.data?.filter((n) => !n.read_at).length ?? 0;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }

  if (isLoading)
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>
    );
  if (!me)
    return (
      <div className="grid min-h-screen place-items-center">
        <p>Unable to verify your account. Please sign in again.</p>
        <Button onClick={signOut}>Sign out</Button>
      </div>
    );
  if (me && !me.is_active) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="max-w-md rounded-xl border bg-card p-8 text-center">
          <BrandMark />
          <h1 className="mt-6 text-lg font-semibold">Awaiting administrator approval</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account ({me.email}) is inactive. Ask a Super Admin to activate it from Team
            Members.
          </p>
          <Button variant="outline" className="mt-6" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  const items = NAV.filter(
    (i) =>
      i.access === "all" ||
      (i.access === "manage" && me?.canManage) ||
      (i.access === "admin" && me?.isAdmin),
  );
  const requestedPage = NAV.find((item) => path === item.to || path.startsWith(item.to + "/"));
  const permitted = !requestedPage || items.includes(requestedPage);
  const role = me?.isAdmin ? "super_admin" : me?.isManager ? "manager" : "employee";

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Main">
      <div className="mb-4 px-2 py-1">
        <BrandMark />
      </div>
      {items.map((i) => {
        const active = path === i.to || path.startsWith(i.to + "/");
        return (
          <Link
            key={i.to}
            to={i.to}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <i.icon className={cn("h-4 w-4", active && "text-primary")} />
            {i.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        {sidebar}
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-background/80" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r bg-sidebar">
            <button
              className="absolute right-3 top-3"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <form
            className="relative max-w-md flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              nav({ to: "/leads", search: { q } as never });
            }}
          >
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search leads by name, email, phone…"
              className="h-9 pl-8"
              aria-label="Search leads"
            />
          </form>
          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                  {unread > 0 && (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex items-center justify-between">
                  Notifications
                  {unread > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const { error } = await supabase
                          .from("notifications")
                          .update({ read_at: new Date().toISOString() })
                          .is("read_at", null);
                        if (error) {
                          toast.error(error.message);
                          return;
                        }
                        notifs.refetch();
                      }}
                    >
                      Mark all read
                    </Button>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifs.error && (
                  <div className="p-3 text-sm text-destructive">Unable to load notifications.</div>
                )}
                {notifs.data?.length ? (
                  notifs.data.map((n) => (
                    <DropdownMenuItem
                      key={n.id}
                      onClick={async () => {
                        const { error } = await supabase
                          .from("notifications")
                          .update({ read_at: new Date().toISOString() })
                          .eq("id", n.id);
                        if (error) toast.error(error.message);
                        else notifs.refetch();
                        if (n.link?.startsWith("/leads/"))
                          nav({ to: "/leads/$id", params: { id: n.link.slice(7) } });
                      }}
                      className="flex flex-col items-start gap-0.5"
                    >
                      <span className={cn("text-sm", !n.read_at && "font-semibold")}>
                        {n.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {n.body} · {fmtDate(n.created_at, true)}
                      </span>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <div className="p-3 text-sm text-muted-foreground">No notifications.</div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-info text-xs font-semibold text-info-foreground">
                    {(me?.full_name || me?.email || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden text-sm sm:inline">{me?.full_name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <div>{me?.email}</div>
                  <div className="text-xs font-normal text-muted-foreground">
                    {ROLE_LABEL[role]}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => nav({ to: "/profile" })}>
                  My profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">
          {permitted ? (
            children
          ) : (
            <div className="py-12">
              <h1 className="text-xl font-semibold">Access denied</h1>
              <p className="mt-2 text-muted-foreground">Your role cannot open this page.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <div className="font-medium">{title}</div>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
