import { Loading } from "react-daisyui";
import { ChevronRight, Folder, Home } from "lucide-react";
import { useBrowseObjects } from "./hooks";

const folderName = (p: string) => p.replace(/\/$/, "").split("/").pop() || p;

type Props = {
  bucketId: string;
  /** Currently selected destination prefix ("" = bucket root). */
  prefix: string;
  onChange: (prefix: string) => void;
};

// A small folder browser used to pick a destination without typing a path.
// Navigating into a folder selects it as the destination.
const FolderPicker = ({ bucketId, prefix, onChange }: Props) => {
  const { data, isLoading } = useBrowseObjects(bucketId, {
    prefix,
    limit: 1000,
  });

  const segments = prefix ? prefix.replace(/\/$/, "").split("/") : [];

  return (
    <div className="border border-base-300 rounded-lg overflow-hidden">
      <div className="flex items-center gap-1 flex-wrap bg-base-200 px-2 py-1 text-sm">
        <button
          type="button"
          className="p-1 rounded hover:bg-base-300"
          title="Bucket root"
          onClick={() => onChange("")}
        >
          <Home size={15} />
        </button>
        {segments.map((seg, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={14} className="opacity-50" />
            <button
              type="button"
              className="px-1 rounded hover:bg-base-300 max-w-[140px] truncate"
              onClick={() => onChange(segments.slice(0, i + 1).join("/") + "/")}
            >
              {seg}
            </button>
          </span>
        ))}
      </div>

      <div className="max-h-56 overflow-y-auto p-1">
        {isLoading ? (
          <div className="h-24 flex items-center justify-center">
            <Loading size="sm" />
          </div>
        ) : data?.prefixes?.length ? (
          data.prefixes.map((p) => (
            <button
              key={p}
              type="button"
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-base-200 text-left"
              onClick={() => onChange(p)}
            >
              <Folder size={16} className="text-primary shrink-0" />
              <span className="truncate">{folderName(p)}</span>
            </button>
          ))
        ) : (
          <p className="text-center text-sm text-base-content/50 py-4">
            No subfolders here
          </p>
        )}
      </div>
    </div>
  );
};

export default FolderPicker;
