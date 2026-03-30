import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addGroupMember,
  createStorageGroup,
  fetchGroupMembersWithLocations,
  fetchStorageGroupMetrics,
  fetchUnassignedActiveDepositIds,
  recommendStorageGroupsForMeta,
  removeGroupMember,
  setStorageGroupActive,
  updateMemberOrden,
  updateStorageGroup,
  type UpsertStorageGroupInput,
} from "@/services/groupService";

export function useStorageGroupMetricsQuery() {
  return useQuery({
    queryKey: ["storage-groups", "metrics"],
    queryFn: fetchStorageGroupMetrics,
  });
}

/** Para la fase Pedidos: grupos con stock libre ≥ cantidad (RPC). */
export function useRecommendStorageGroupsQuery(cantidadMetaKilos: number, enabled = true) {
  return useQuery({
    queryKey: ["storage-groups", "recommend", cantidadMetaKilos],
    queryFn: () => recommendStorageGroupsForMeta(cantidadMetaKilos),
    enabled: enabled && cantidadMetaKilos > 0,
  });
}

export function useGroupMembersQuery(groupId: string | null, open: boolean) {
  return useQuery({
    queryKey: ["storage-groups", "members", groupId],
    queryFn: () => fetchGroupMembersWithLocations(groupId!),
    enabled: open && !!groupId,
  });
}

export function useUnassignedDepositsQuery(open: boolean) {
  return useQuery({
    queryKey: ["storage-groups", "unassigned-deposits"],
    queryFn: fetchUnassignedActiveDepositIds,
    enabled: open,
  });
}

export function useStorageGroupMutations(userId: string | undefined) {
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["storage-groups"] });
  };

  const create = useMutation({
    mutationFn: (input: UpsertStorageGroupInput) => {
      if (!userId) throw new Error("Sin usuario");
      return createStorageGroup(input, userId);
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpsertStorageGroupInput }) => {
      if (!userId) throw new Error("Sin usuario");
      return updateStorageGroup(id, input, userId);
    },
    onSuccess: invalidate,
  });

  const setActive = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) => {
      if (!userId) throw new Error("Sin usuario");
      return setStorageGroupActive(id, activo, userId);
    },
    onSuccess: invalidate,
  });

  const addMember = useMutation({
    mutationFn: ({
      groupId,
      storageLocationId,
      orden,
    }: {
      groupId: string;
      storageLocationId: string;
      orden: number | null;
    }) => addGroupMember(groupId, storageLocationId, orden),
    onSuccess: invalidate,
  });

  const removeMember = useMutation({
    mutationFn: removeGroupMember,
    onSuccess: invalidate,
  });

  const patchOrden = useMutation({
    mutationFn: ({ memberId, orden }: { memberId: string; orden: number | null }) =>
      updateMemberOrden(memberId, orden),
    onSuccess: invalidate,
  });

  return { create, update, setActive, addMember, removeMember, patchOrden };
}
