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

export class AbortError extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortError";
  }
}

type UploadObjectOptions = {
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

// Upload a file via XMLHttpRequest so we can report progress (#70) and support
// cancellation via an AbortSignal.
export const uploadObject = (
  bucket: string,
  key: string,
  file: File,
  options?: UploadObjectOptions
) =>
  new Promise<unknown>((resolve, reject) => {
    const signal = options?.signal;
    if (signal?.aborted) {
      reject(new AbortError());
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${API_URL}/browse/${bucket}/${encodeKey(key)}`, true);
    xhr.withCredentials = true;

    if (signal) {
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        options?.onProgress?.(Math.round((e.loaded / e.total) * 100));
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

    xhr.onabort = () => reject(new AbortError());
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
        return uploadObject(bucket, body.key, body.file, {
          onProgress: body.onProgress,
        });
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

export const useRenameObject = (
  bucket: string,
  options?: UseMutationOptions<any, Error, { from: string; to: string }>
) => {
  return useMutation({
    mutationFn: (data) =>
      api.post(`/browse/${bucket}/rename`, { body: data }),
    ...options,
  });
};
