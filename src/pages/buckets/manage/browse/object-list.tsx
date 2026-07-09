import { Alert, Loading, Modal, Table } from "react-daisyui";
import { useBrowseObjects, useDeleteObject, useRenameObject } from "./hooks";
import { dayjs, readableBytes } from "@/lib/utils";
import mime from "mime/lite";
import { Object } from "./types";
import { API_URL } from "@/lib/api";
import {
  CircleXIcon,
  FileArchive,
  FileIcon,
  FileType,
  Folder,
  FolderInput,
  Search,
  Trash,
  X,
} from "lucide-react";
import { useBucketContext } from "../context";
import ObjectActions from "./object-actions";
import GotoTopButton from "@/components/ui/goto-top-btn";
import Button from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type Props = {
  prefix?: string;
  onPrefixChange?: (prefix: string) => void;
};

const folderName = (p: string) =>
  p.substring(0, p.lastIndexOf("/")).split("/").pop() || p;

const baseName = (key: string) => {
  const isDir = key.endsWith("/");
  const core = isDir ? key.slice(0, -1) : key;
  const seg = core.slice(core.lastIndexOf("/") + 1);
  return isDir ? seg + "/" : seg;
};

const ObjectList = ({ prefix, onPrefixChange }: Props) => {
  const { bucket } = useBucketContext();
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useBrowseObjects(bucket.id, {
    prefix,
    limit: 1000,
  });

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const del = useDeleteObject(bucket.id);
  const rename = useRenameObject(bucket.id);

  // Reset selection & search when navigating to another folder.
  useEffect(() => {
    setSelected(new Set());
    setSearch("");
  }, [prefix]);

  const q = search.trim().toLowerCase();
  const folders = useMemo(
    () =>
      (data?.prefixes || []).filter((p) =>
        folderName(p).toLowerCase().includes(q)
      ),
    [data, q]
  );
  const files = useMemo(
    () =>
      (data?.objects || []).filter((o) =>
        o.objectKey.toLowerCase().includes(q)
      ),
    [data, q]
  );

  const fileKey = (o: Object) => (data?.prefix || "") + o.objectKey;
  const visibleKeys = useMemo(
    () => [...folders, ...files.map(fileKey)],
    [folders, files, data]
  );
  const allSelected =
    visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k));

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(visibleKeys));

  const clearSelection = () => setSelected(new Set());

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["browse", bucket.id] });

  const onObjectClick = (object: Object) => {
    window.open(API_URL + object.url + "?view=1", "_blank");
  };

  const onBulkDelete = async () => {
    const keys = [...selected];
    if (!keys.length) return;
    if (
      !window.confirm(
        `Delete ${keys.length} selected item${keys.length > 1 ? "s" : ""}?`
      )
    ) {
      return;
    }

    setBusy(true);
    const results = await Promise.allSettled(
      keys.map((key) =>
        del.mutateAsync({ key, recursive: key.endsWith("/") })
      )
    );
    setBusy(false);

    const failed = results.filter((r) => r.status === "rejected").length;
    invalidate();
    clearSelection();
    if (failed) toast.error(`${failed} item(s) could not be deleted`);
    else toast.success("Deleted!");
  };

  const onBulkMove = async (dest: string) => {
    const keys = [...selected];
    if (!keys.length) return;
    const destPrefix = dest && !dest.endsWith("/") ? dest + "/" : dest;

    setBusy(true);
    const results = await Promise.allSettled(
      keys
        .map((key) => ({ from: key, to: destPrefix + baseName(key) }))
        .filter(({ from, to }) => from !== to)
        .map(({ from, to }) => rename.mutateAsync({ from, to }))
    );
    setBusy(false);

    const failed = results.filter((r) => r.status === "rejected").length;
    setMoveOpen(false);
    invalidate();
    clearSelection();
    if (failed) toast.error(`${failed} item(s) could not be moved`);
    else toast.success("Moved!");
  };

  return (
    <div className="min-h-[400px]">
      <div className="flex items-center gap-2 px-2 pb-2">
        <label className="input input-bordered input-sm flex items-center gap-2 flex-1 max-w-xs">
          <Search size={16} className="text-base-content/50" />
          <input
            type="text"
            className="grow"
            placeholder="Filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} title="Clear">
              <X size={14} />
            </button>
          )}
        </label>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 mx-2 mb-2 px-3 py-2 rounded-lg bg-base-200">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex-1" />
          <Button
            icon={FolderInput}
            size="sm"
            onClick={() => setMoveOpen(true)}
            disabled={busy}
          >
            Move
          </Button>
          <Button
            icon={Trash}
            size="sm"
            color="error"
            onClick={onBulkDelete}
            disabled={busy}
          >
            Delete
          </Button>
          <Button icon={X} size="sm" color="ghost" onClick={clearSelection} />
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <Table.Head>
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={allSelected}
              onChange={toggleAll}
            />
            <span>Name</span>
            <span>Size</span>
            <span>Last Modified</span>
          </Table.Head>

          <Table.Body>
            {isLoading ? (
              <tr>
                <td colSpan={5}>
                  <div className="h-[320px] flex items-center justify-center">
                    <Loading />
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5}>
                  <Alert status="error" icon={<CircleXIcon />}>
                    <span>{error.message}</span>
                  </Alert>
                </td>
              </tr>
            ) : !folders.length && !files.length ? (
              <tr>
                <td className="text-center py-16" colSpan={5}>
                  {q ? "No matches" : "No objects"}
                </td>
              </tr>
            ) : null}

            {folders.map((folder) => (
              <tr
                key={folder}
                className="hover:bg-neutral/60 hover:text-neutral-content group"
              >
                <td>
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={selected.has(folder)}
                    onChange={() => toggle(folder)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td
                  className="cursor-pointer"
                  role="button"
                  onClick={() => onPrefixChange?.(folder)}
                >
                  <span className="flex items-center gap-2 font-normal">
                    <Folder size={20} className="text-primary" />
                    {folderName(folder)}
                  </span>
                </td>
                <td colSpan={2} />
                <ObjectActions object={{ objectKey: folder, url: "" }} />
              </tr>
            ))}

            {files.map((object, idx) => {
              const extIdx = object.objectKey.lastIndexOf(".");
              const filename =
                extIdx >= 0
                  ? object.objectKey.substring(0, extIdx)
                  : object.objectKey;
              const ext =
                extIdx >= 0 ? object.objectKey.substring(extIdx) : null;
              const key = fileKey(object);

              return (
                <tr
                  key={object.objectKey}
                  className="hover:bg-neutral/60 hover:text-neutral-content group"
                >
                  <td>
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={selected.has(key)}
                      onChange={() => toggle(key)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td
                    className="cursor-pointer"
                    role="button"
                    onClick={() => onObjectClick(object)}
                  >
                    <span className="flex items-center font-normal w-full">
                      <FilePreview ext={ext?.substring(1)} object={object} />
                      <span className="truncate max-w-[40vw]">{filename}</span>
                      {ext && (
                        <span className="text-base-content/60">{ext}</span>
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    {readableBytes(object.size)}
                  </td>
                  <td className="whitespace-nowrap">
                    {dayjs(object.lastModified).fromNow()}
                  </td>
                  <ObjectActions
                    prefix={data?.prefix}
                    object={object}
                    end={idx >= files.length - 2 && files.length > 5}
                  />
                </tr>
              );
            })}
          </Table.Body>
        </Table>
      </div>

      <MoveDialog
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        defaultDest={data?.prefix || ""}
        count={selected.size}
        busy={busy}
        onMove={onBulkMove}
      />

      <GotoTopButton />
    </div>
  );
};

type MoveDialogProps = {
  open: boolean;
  onClose: () => void;
  defaultDest: string;
  count: number;
  busy: boolean;
  onMove: (dest: string) => void;
};

const MoveDialog = ({
  open,
  onClose,
  defaultDest,
  count,
  busy,
  onMove,
}: MoveDialogProps) => {
  const [dest, setDest] = useState(defaultDest);

  useEffect(() => {
    if (open) setDest(defaultDest);
  }, [open, defaultDest]);

  return (
    <Modal open={open}>
      <Modal.Header>Move {count} item(s)</Modal.Header>
      <Modal.Body>
        <p className="text-sm text-base-content/70 mb-2">
          Destination folder (relative to the bucket root, empty = root):
        </p>
        <input
          className="input input-bordered w-full"
          placeholder="e.g. archive/2026/"
          value={dest}
          onChange={(e) => setDest(e.target.value)}
        />
      </Modal.Body>
      <Modal.Actions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          color="primary"
          onClick={() => onMove(dest)}
          loading={busy}
          disabled={busy}
        >
          Move
        </Button>
      </Modal.Actions>
    </Modal>
  );
};

type FilePreviewProps = {
  ext?: string | null;
  object: Object;
};

const FilePreview = ({ ext, object }: FilePreviewProps) => {
  const type = mime.getType(ext || "")?.split("/")[0];
  let Icon = FileIcon;

  if (
    ["zip", "rar", "7z", "iso", "tar", "gz", "bz2", "xz"].includes(ext || "")
  ) {
    Icon = FileArchive;
  }

  if (type === "image") {
    const thumbnailSupport = ["jpg", "jpeg", "png", "gif"].includes(ext || "");
    return (
      <img
        src={API_URL + object.url + (thumbnailSupport ? "?thumb=1" : "?view=1")}
        alt={object.objectKey}
        className="size-5 object-cover overflow-hidden mr-2"
      />
    );
  }

  if (type === "text") {
    Icon = FileType;
  }

  return (
    <Icon
      size={20}
      className="text-base-content/60 group-hover:text-neutral-content/80 mr-2"
    />
  );
};

export default ObjectList;
