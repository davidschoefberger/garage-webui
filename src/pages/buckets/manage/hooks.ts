import api from "@/lib/api";
import {
  MutationOptions,
  useMutation,
  UseMutationOptions,
  useQuery,
} from "@tanstack/react-query";
import { Bucket, Permissions } from "../types";

export const useBucket = (id?: string | null) => {
  return useQuery({
    queryKey: ["bucket", id],
    queryFn: () => api.get<Bucket>("/v2/GetBucketInfo", { params: { id } }),
    enabled: !!id,
  });
};

export const useUpdateBucket = (id?: string | null) => {
  return useMutation({
    mutationFn: (values: any) => {
      return api.post<any>("/v2/UpdateBucket", {
        params: { id },
        body: values,
      });
    },
  });
};

export const useAddAlias = (
  bucketId?: string | null,
  options?: UseMutationOptions<any, Error, string>
) => {
  return useMutation({
    mutationFn: (alias: string) => {
      return api.post("/v2/AddBucketAlias", {
        body: { bucketId, globalAlias: alias },
      });
    },
    ...options,
  });
};

export const useRemoveAlias = (
  bucketId?: string | null,
  options?: UseMutationOptions<any, Error, string>
) => {
  return useMutation({
    mutationFn: (alias: string) => {
      return api.post("/v2/RemoveBucketAlias", {
        body: { bucketId, globalAlias: alias },
      });
    },
    ...options,
  });
};

export const useAllowKey = (
  bucketId?: string | null,
  options?: MutationOptions<
    any,
    Error,
    { keyId: string; permissions: Permissions }[]
  >
) => {
  return useMutation({
    mutationFn: async (payload) => {
      for (const key of payload) {
        await api.post("/v2/AllowBucketKey", {
          body: {
            bucketId,
            accessKeyId: key.keyId,
            permissions: key.permissions,
          },
        });
      }

      // Verify the permissions were actually applied. Garage can return a
      // success status without persisting the grant, which previously made
      // this fail silently (issue #63).
      const info = await api.get<Bucket>("/v2/GetBucketInfo", {
        params: { id: bucketId },
      });

      for (const key of payload) {
        const applied = info.keys?.find((k) => k.accessKeyId === key.keyId);
        const p = applied?.permissions;
        if (
          (key.permissions.read && !p?.read) ||
          (key.permissions.write && !p?.write) ||
          (key.permissions.owner && !p?.owner)
        ) {
          throw new Error(
            `Could not apply permissions for key ${
              key.keyId?.substring(0, 8) || key.keyId
            }. The Garage admin API accepted the request but the grant was not persisted.`
          );
        }
      }

      // Drop the backend's cached credentials so browsing picks up the change.
      await api.post(`/browse/${bucketId}/invalidate-cache`).catch(() => {});

      return info;
    },
    ...options,
  });
};

export const useDenyKey = (
  bucketId?: string | null,
  options?: MutationOptions<
    any,
    Error,
    { keyId: string; permissions: Permissions }
  >
) => {
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.post("/v2/DenyBucketKey", {
        body: {
          bucketId,
          accessKeyId: payload.keyId,
          permissions: payload.permissions,
        },
      });
      await api.post(`/browse/${bucketId}/invalidate-cache`).catch(() => {});
      return res;
    },
    ...options,
  });
};

export const useRemoveBucket = (
  options?: MutationOptions<any, Error, string>
) => {
  return useMutation({
    mutationFn: (id) => api.post("/v2/DeleteBucket", { params: { id } }),
    ...options,
  });
};

export type LifecycleConfig = { enabled: boolean; days: number };

export const useLifecycle = (id?: string | null) => {
  return useQuery({
    queryKey: ["lifecycle", id],
    queryFn: () => api.get<LifecycleConfig>(`/buckets/${id}/lifecycle`),
    enabled: !!id,
  });
};

export const useSetLifecycle = (
  id?: string | null,
  options?: MutationOptions<any, Error, LifecycleConfig>
) => {
  return useMutation({
    mutationFn: (body) => api.put(`/buckets/${id}/lifecycle`, { body }),
    ...options,
  });
};

export type CorsRule = {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders?: string[];
  exposeHeaders?: string[];
  maxAgeSeconds: number;
};

export type CorsConfig = { rules: CorsRule[] };

export const useCors = (id?: string | null) => {
  return useQuery({
    queryKey: ["cors", id],
    queryFn: () => api.get<CorsConfig>(`/buckets/${id}/cors`),
    enabled: !!id,
  });
};

export const useSetCors = (
  id?: string | null,
  options?: MutationOptions<any, Error, CorsConfig>
) => {
  return useMutation({
    mutationFn: (body) => api.put(`/buckets/${id}/cors`, { body }),
    ...options,
  });
};
