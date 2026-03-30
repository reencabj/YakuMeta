import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { type HistoryFilters, fetchHistoryEvents } from "@/services/historyService";

export function useHistoryEvents(filters: HistoryFilters) {
  const { user, profile } = useAuth();
  const scope = { isAdmin: profile?.role === "admin", userId: user?.id ?? "" };

  return useQuery({
    queryKey: ["history-events", filters, scope.isAdmin, scope.userId],
    queryFn: () => fetchHistoryEvents(filters, scope, 800),
    enabled: !!user?.id,
  });
}
