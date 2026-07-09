import { Dropdown, Modal } from "react-daisyui";
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
import { useEffect, useState } from "react";

type Props = {
  prefix?: string;
  object: Pick<Object, "objectKey" | "url">;
  end?: boolean;
};

const ObjectActions = ({ prefix = "", object, end }: Props) => {
  const { bucket } = useBucketContext();
  const queryClient = useQueryClient();
  const isDirectory = object.objectKey.endsWith("/");

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

  return (
    <td className="!p-0 w-auto">
      <span className="w-full flex flex-row justify-end pr-2">
        {!isDirectory && (
          <Button icon={DownloadIcon} color="ghost" onClick={onDownload} />
        )}

        <Dropdown end vertical={end ? "top" : "bottom"}>
          <Dropdown.Toggle button={false}>
            <Button icon={EllipsisVertical} color="ghost" />
          </Dropdown.Toggle>

          <Dropdown.Menu className="gap-y-1">
            <Dropdown.Item onClick={rename.onOpen}>
              <Pencil /> Rename
            </Dropdown.Item>
            <Dropdown.Item
              onClick={() =>
                shareDialog.open({ key: object.objectKey, prefix })
              }
            >
              <Share2 /> Share
            </Dropdown.Item>
            <Dropdown.Item
              className="text-error bg-error/10"
              onClick={onDelete}
            >
              <Trash /> Delete
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </span>

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
