import { useQuery } from "@tanstack/react-query";
import { fetchLocationTypes } from "@/services/locationTypesService";

export function useLocationTypesQuery(includeInactive = false) {
  return useQuery({
    queryKey: ["storage-location-types", includeInactive],
    queryFn: () => fetchLocationTypes(includeInactive),
  });
}
