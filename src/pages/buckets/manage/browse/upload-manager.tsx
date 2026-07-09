import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Modal } from "react-daisyui";
import {
  CheckCircle2,
  FileIcon,
  Loader2,
  RotateCw,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import Button from "@/components/ui/button";
import { cn, readableBytes } from "@/lib/utils";
import { uploadObject } from "./hooks";

type UploadStatus = "uploading" | "done" | "error" | "canceled";

type UploadItem = {
  id: string;
  file: File;
  key: string;
  name: string;
  size: number;
  progress: number;
  status: UploadStatus;
  error?: string;
};

type UploadContextValue = {
  enqueue: (files: FileList | File[], prefix: string) => void;
};

const UploadContext = createContext<UploadContextValue | null>(null);

export const useUpload = () => {
  const ctx = useContext(UploadContext);
  if (!ctx) {
    throw new Error("useUpload must be used within an UploadProvider");
  }
  return ctx;
};

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

const dragHasFiles = (types?: DOMStringList | readonly string[] | null) =>
  Array.from(types || []).includes("Files");

type UploadProviderProps = {
  bucketId: string;
  prefix: string;
  children: ReactNode;
};

export const UploadProvider = ({
  bucketId,
  prefix,
  children,
}: UploadProviderProps) => {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const queryClient = useQueryClient();

  const controllers = useRef<Map<string, AbortController>>(new Map());
  const dragCounter = useRef(0);
  const prefixRef = useRef(prefix);
  prefixRef.current = prefix;

  const update = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
    );
  }, []);

  const start = useCallback(
    (item: UploadItem) => {
      const controller = new AbortController();
      controllers.current.set(item.id, controller);
      update(item.id, { status: "uploading", progress: 0, error: undefined });

      uploadObject(bucketId, item.key, item.file, {
        onProgress: (p) => update(item.id, { progress: p }),
        signal: controller.signal,
      })
        .then(() => {
          update(item.id, { progress: 100, status: "done" });
          queryClient.invalidateQueries({ queryKey: ["browse", bucketId] });
        })
        .catch((err) => {
          if (controller.signal.aborted) {
            update(item.id, { status: "canceled" });
          } else {
            update(item.id, {
              status: "error",
              error: (err as Error)?.message || "Upload failed",
            });
          }
        })
        .finally(() => controllers.current.delete(item.id));
    },
    [bucketId, queryClient, update]
  );

  const enqueue = useCallback(
    (files: FileList | File[], atPrefix: string) => {
      const list = Array.from(files);
      if (!list.length) return;

      const newItems: UploadItem[] = list.map((file) => ({
        id: uuid(),
        file,
        key: atPrefix + file.name,
        name: file.name,
        size: file.size,
        progress: 0,
        status: "uploading",
      }));

      // Start a fresh batch once the previous one has fully settled.
      setItems((prev) =>
        prev.some((i) => i.status === "uploading")
          ? [...prev, ...newItems]
          : newItems
      );
      setOpen(true);
      newItems.forEach(start);
    },
    [start]
  );

  const cancel = (id: string) => controllers.current.get(id)?.abort();
  const retry = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (item) start(item);
  };

  // Whole-page drag & drop while the browse tab is mounted.
  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!dragHasFiles(e.dataTransfer?.types)) return;
      e.preventDefault();
      dragCounter.current += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (dragHasFiles(e.dataTransfer?.types)) e.preventDefault();
    };
    const onLeave = () => {
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setDragging(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setDragging(false);
      if (e.dataTransfer?.files?.length) {
        enqueue(e.dataTransfer.files, prefixRef.current);
      }
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [enqueue]);

  const active = items.filter((i) => i.status === "uploading").length;
  const done = items.filter((i) => i.status === "done").length;
  const errored = items.filter((i) => i.status === "error").length;
  const overall = items.length
    ? Math.round(items.reduce((a, i) => a + i.progress, 0) / items.length)
    : 0;
  const finished = items.length > 0 && active === 0;

  const close = () => {
    setOpen(false);
    if (finished) setItems([]);
  };

  return (
    <UploadContext.Provider value={{ enqueue }}>
      {children}

      {dragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-base-100/70 backdrop-blur-sm pointer-events-none">
          <div className="rounded-2xl border-2 border-dashed border-primary bg-base-100/90 px-12 py-10 flex flex-col items-center">
            <UploadCloud className="text-primary" size={56} />
            <p className="mt-4 text-xl font-medium">Drop files to upload</p>
            <p className="text-sm text-base-content/60">
              They'll be uploaded to the current folder
            </p>
          </div>
        </div>
      )}

      <Modal open={open} className="max-w-lg">
        <Modal.Header className="mb-1 flex items-center gap-2">
          {finished ? (
            errored ? (
              <XCircle className="text-error" size={22} />
            ) : (
              <CheckCircle2 className="text-success" size={22} />
            )
          ) : (
            <Loader2 className="text-primary animate-spin" size={22} />
          )}
          <span>
            {finished
              ? errored
                ? "Upload finished with errors"
                : "Upload complete"
              : "Uploading files"}
          </span>
        </Modal.Header>

        <Modal.Body>
          <div className="flex items-center justify-between text-sm text-base-content/70 mb-1">
            <span>
              {done}/{items.length} done
              {errored > 0 ? ` · ${errored} failed` : ""}
            </span>
            <span>{overall}%</span>
          </div>
          <progress
            className={cn(
              "progress w-full",
              errored ? "progress-error" : "progress-success"
            )}
            value={overall}
            max={100}
          />

          <div className="mt-4 max-h-[45vh] overflow-y-auto flex flex-col gap-3 pr-1">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="shrink-0">
                  {item.status === "done" ? (
                    <CheckCircle2 className="text-success" size={20} />
                  ) : item.status === "error" || item.status === "canceled" ? (
                    <XCircle className="text-error" size={20} />
                  ) : (
                    <FileIcon className="text-base-content/60" size={20} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm">{item.name}</p>
                    <span className="shrink-0 text-xs text-base-content/50">
                      {item.status === "error"
                        ? "Failed"
                        : item.status === "canceled"
                          ? "Canceled"
                          : item.status === "done"
                            ? readableBytes(item.size)
                            : `${item.progress}%`}
                    </span>
                  </div>

                  {item.status === "error" && item.error ? (
                    <p className="text-xs text-error truncate">{item.error}</p>
                  ) : (
                    <progress
                      className={cn(
                        "progress w-full mt-1 h-2",
                        item.status === "canceled" || item.status === "error"
                          ? "progress-error"
                          : "progress-success"
                      )}
                      value={item.progress}
                      max={100}
                    />
                  )}
                </div>

                <div className="shrink-0">
                  {item.status === "uploading" ? (
                    <Button
                      icon={X}
                      color="ghost"
                      size="sm"
                      title="Cancel"
                      onClick={() => cancel(item.id)}
                    />
                  ) : item.status === "error" || item.status === "canceled" ? (
                    <Button
                      icon={RotateCw}
                      color="ghost"
                      size="sm"
                      title="Retry"
                      onClick={() => retry(item.id)}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Modal.Body>

        <Modal.Actions>
          <Button color={finished ? "primary" : "ghost"} onClick={close}>
            {finished ? "Done" : "Hide"}
          </Button>
        </Modal.Actions>
      </Modal>
    </UploadContext.Provider>
  );
};
