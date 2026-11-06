import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/crm";

export type Me = {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  team_id: string | null;
  roles: AppRole[];
  isAdmin: boolean;
  isManager: boolean;
  canManage: boolean;
};

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    staleTime: 60_000,
    queryFn: async (): Promise<Me | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const [{ data: p, error: pe }, { data: r, error: re }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      ]);
      if (pe) throw pe;
      if (re) throw re;
      const roles = (r ?? []).map((x) => x.role);
      const isAdmin = roles.includes("super_admin") && !!p?.is_active;
      const isManager = roles.includes("manager") && !!p?.is_active;
      return {
        id: u.user.id,
        email: u.user.email ?? "",
        full_name: p?.full_name ?? "",
        is_active: !!p?.is_active,
        team_id: p?.team_id ?? null,
        roles,
        isAdmin,
        isManager,
        canManage: isAdmin || isManager,
      };
    },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, is_active, team_id")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });
}

export function useRefData() {
  return useQuery({
    queryKey: ["refdata"],
    staleTime: 60_000,
    queryFn: async () => {
      const [c, s, cp, t] = await Promise.all([
        supabase.from("courses").select("*").order("name"),
        supabase.from("lead_sources").select("*").order("label"),
        supabase.from("campaigns").select("id, name, source_platform, status").order("name"),
        supabase.from("tags").select("*").order("name"),
      ]);
      for (const r of [c, s, cp, t]) if (r.error) throw r.error;
      return { courses: c.data!, sources: s.data!, campaigns: cp.data!, tags: t.data! };
    },
  });
}
