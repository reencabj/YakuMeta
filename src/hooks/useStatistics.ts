import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import {
  type StatisticsFilters,
  type StatsGranularity,
  fetchStatisticsReport,
} from "@/services/statisticsService";

export function useStatisticsReport(filters: StatisticsFilters, granularity: StatsGranularity) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["statistics-report", filters, granularity],
    queryFn: () => fetchStatisticsReport(filters, granularity),
    enabled: !!user?.id,
  });
}
