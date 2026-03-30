import { useQuery } from "@tanstack/react-query";
import { fetchAppSettings } from "@/services/appSettingsService";

export function useAppSettingsQuery() {
  return useQuery({
    queryKey: ["app-settings"],
    queryFn: fetchAppSettings,
    staleTime: 5 * 60_000,
  });
}
