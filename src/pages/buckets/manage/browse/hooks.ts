import api, { API_URL, APIError } from "@/lib/api";
import { url as buildUrl } from "@/lib/utils";
import {
  useMutation,
  UseMutationOptions,
  useQuery,
} from "@tanstack/react-query";
import {
  GetObjectsResult,
  PutObjectPayload,
  UseBrowserObjectOptions,
} from "./types";

// Encode each path segment while preserving the "/" delimiters so object keys
// containing characters like "=", "#" or spaces route correctly (issue #52).
const encodeKey = (key: string) =>
  key
    .split("/")
    .map(encodeURIComponent)
    .join("/");

// Upload a file via XMLHttpRequest so we can report upload progress (issue #70).
const uploadObject = (
  bucket: string,
  key: string,
  file: File,
  onProgress?: (percent: number) => void
) =>
  new Promise<unknown>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${API_URL}/browse/${bucket}/${encodeKey(key)}`, true);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress?.(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 401) {
        window.location.href = buildUrl("/auth/login");
        reject(new APIError("unauthorized", 401));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(xhr.responseText ? JSON.parse(xhr.responseText) : null);
        } catch {
          resolve(xhr.responseText);
        }
        return;
      }
      let message = xhr.statusText;
      try {
        message = JSON.parse(xhr.responseText)?.message || message;
      } catch {
        if (xhr.responseText) message = xhr.responseText;
      }
      reject(new APIError(message, xhr.status));
    };

    xhr.onerror = () => reject(new APIError("Network error", xhr.status || 0));

    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });

export const useBrowseObjects = (
  bucket: string,
  options?: UseBrowserObjectOptions
) => {
  return useQuery({
    queryKey: ["browse", bucket, options],
    queryFn: () =>
      api.get<GetObjectsResult>(`/browse/${bucket}`, { params: options }),
  });
};

export const usePutObject = (
  bucket: string,
  options?: UseMutationOptions<any, Error, PutObjectPayload>
) => {
  return useMutation({
    mutationFn: async (body) => {
      // Files are uploaded via XHR so we can surface progress; folder creation
      // (no file) still goes through the regular JSON/FormData path.
      if (body.file) {
        return uploadObject(bucket, body.key, body.file, body.onProgress);
      }

      return api.put(`/browse/${bucket}/${encodeKey(body.key)}`, {
        body: new FormData(),
      });
    },
    ...options,
  });
};

export const useDeleteObject = (
  bucket: string,
  options?: UseMutationOptions<any, Error, { key: string; recursive?: boolean }>
) => {
  return useMutation({
    mutationFn: (data) =>
      api.delete(`/browse/${bucket}/${encodeKey(data.key)}`, {
        params: { recursive: data.recursive },
      }),
    ...options,
  });
};
