import { Modal } from "react-daisyui";
import { createPortal } from "react-dom";
import { Object } from "./types";
import Button from "@/components/ui/button";
import {
  DownloadIcon,
  EllipsisVertical,
  Pencil,
  Share2,
  Trash,
} from "lucide-react";
import { useDeleteObject, useRenameObject } from "./hooks";
import { useBucketContext } from "../context";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { handleError } from "@/lib/utils";
import { API_URL } from "@/lib/api";
import { shareDialog } from "./share-dialog";
import { useDisclosure } from "@/hooks/useDisclosure";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  prefix?: string;
  object: Pick<Object, "objectKey" | "url">;
  end?: boolean;
};

const ObjectActions = ({ prefix = "", object }: Props) => {
  const { bucket } = useBucketContext();
  const queryClient = useQueryClient();
  const isDirectory = object.objectKey.endsWith("/");

  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["browse", bucket.id] });

  const deleteObject = useDeleteObject(bucket.id, {
    onSuccess: () => {
      toast.success("Object deleted!");
      invalidate();
    },
    onError: handleError,
  });

  const rename = useDisclosure();

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 192;
    const height = 148;
    let left = rect.right - width;
    if (left < 8) left = 8;
    let top = rect.bottom + 4;
    if (top + height > window.innerHeight) top = rect.top - height - 4;
    if (top < 8) top = 8;
    setPos({ top, left });
    setMenuOpen(true);
  };

  // Close the floating menu on scroll / resize / escape.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => closeMenu();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, closeMenu]);

  const onDownload = () => {
    window.open(API_URL + object.url + "?dl=1", "_blank");
  };

  const onDelete = () => {
    if (
      window.confirm(
        `Are you sure you want to delete this ${
          isDirectory ? "directory and its content" : "object"
        }?`
      )
    ) {
      deleteObject.mutate({
        key: prefix + object.objectKey,
        recursive: isDirectory,
      });
    }
  };

  const runAndClose = (fn: () => void) => () => {
    closeMenu();
    fn();
  };

  return (
    <td className="!p-0 w-auto">
      <span className="w-full flex flex-row justify-end pr-2">
        {!isDirectory && (
          <Button icon={DownloadIcon} color="ghost" onClick={onDownload} />
        )}

        <Button
          ref={btnRef}
          icon={EllipsisVertical}
          color="ghost"
          onClick={openMenu}
        />
      </span>

      {menuOpen &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[90]" onClick={closeMenu} />
            <ul
              className="menu bg-base-100 rounded-box shadow-lg w-48 p-2 gap-y-1 fixed z-[100]"
              style={{ top: pos.top, left: pos.left }}
            >
              <li>
                <a onClick={runAndClose(rename.onOpen)}>
                  <Pencil size={16} /> Rename
                </a>
              </li>
              <li>
                <a
                  onClick={runAndClose(() =>
                    shareDialog.open({ key: object.objectKey, prefix })
                  )}
                >
                  <Share2 size={16} /> Share
                </a>
              </li>
              <li>
                <a
                  className="text-error"
                  onClick={runAndClose(onDelete)}
                >
                  <Trash size={16} /> Delete
                </a>
              </li>
            </ul>
          </>,
          document.body
        )}

      <RenameDialog
        isOpen={rename.isOpen}
        onClose={rename.onClose}
        isDirectory={isDirectory}
        fromKey={prefix + object.objectKey}
        onRenamed={invalidate}
      />
    </td>
  );
};

type RenameDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  isDirectory: boolean;
  fromKey: string;
  onRenamed: () => void;
};

const RenameDialog = ({
  isOpen,
  onClose,
  isDirectory,
  fromKey,
  onRenamed,
}: RenameDialogProps) => {
  const { bucket } = useBucketContext();

  // Split the source key into its parent directory and current name.
  const core = isDirectory ? fromKey.replace(/\/$/, "") : fromKey;
  const lastSlash = core.lastIndexOf("/");
  const parentDir = lastSlash >= 0 ? core.slice(0, lastSlash + 1) : "";
  const currentName = core.slice(lastSlash + 1);

  const [name, setName] = useState(currentName);

  useEffect(() => {
    if (isOpen) setName(currentName);
  }, [isOpen, currentName]);

  const renameObject = useRenameObject(bucket.id, {
    onSuccess: () => {
      toast.success("Renamed!");
      onRenamed();
      onClose();
    },
    onError: handleError,
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.includes("/")) {
      toast.error("Name must not be empty or contain a slash");
      return;
    }
    const to = parentDir + trimmed + (isDirectory ? "/" : "");
    if (to === fromKey) {
      onClose();
      return;
    }
    renameObject.mutate({ from: fromKey, to });
  };

  return (
    <Modal open={isOpen}>
      <Modal.Header>Rename {isDirectory ? "Folder" : "Object"}</Modal.Header>

      <form onSubmit={onSubmit}>
        <Modal.Body>
          <input
            autoFocus
            className="input input-bordered w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Modal.Body>

        <Modal.Actions>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            color="primary"
            disabled={renameObject.isPending}
          >
            Rename
          </Button>
        </Modal.Actions>
      </form>
    </Modal>
  );
};

export default ObjectActions;
