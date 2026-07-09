import Page from "@/context/page-context";
import { useNodesHealth } from "./hooks";
import StatsCard from "./components/stats-card";
import {
  Boxes,
  Database,
  DatabaseZap,
  HardDrive,
  HardDriveDownload,
  HardDriveUpload,
  Leaf,
  PieChart,
} from "lucide-react";
import { cn, readableBytes, ucfirst } from "@/lib/utils";
import { useBuckets } from "../buckets/hooks";
import { useClusterStatus } from "../cluster/hooks";
import { useMemo } from "react";

const HomePage = () => {
  const { data: health } = useNodesHealth();
  const { data: buckets } = useBuckets();
  const { data: status } = useClusterStatus();

  const totalUsage = useMemo(() => {
    return buckets?.reduce((acc, bucket) => acc + bucket.bytes, 0);
  }, [buckets]);

  const capacity = useMemo(() => {
    let available = 0;
    let total = 0;
    for (const node of status?.nodes || []) {
      if (node.dataPartition) {
        available += node.dataPartition.available;
        total += node.dataPartition.total;
      }
    }
    return { available, total };
  }, [status]);

  return (
    <div className="container">
      <Page title="Dashboard" />

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <StatsCard
          title="Status"
          icon={Leaf}
          value={ucfirst(health?.status)}
          valueClassName={cn(
            "text-lg",
            health?.status === "healthy"
              ? "text-success"
              : health?.status === "degraded"
                ? "text-warning"
                : "text-error"
          )}
        />
        <StatsCard title="Nodes" icon={HardDrive} value={health?.knownNodes} />
        <StatsCard
          title="Connected Nodes"
          icon={HardDriveUpload}
          value={health?.connectedNodes}
        />
        <StatsCard
          title="Storage Nodes"
          icon={Database}
          value={health?.storageNodes}
        />
        <StatsCard
          title="Active Storage Nodes"
          icon={DatabaseZap}
          value={health?.storageNodesUp}
        />
        <StatsCard
          title="Total Usage"
          icon={PieChart}
          value={readableBytes(totalUsage)}
        />
        <StatsCard
          title="Free Space"
          icon={HardDriveDownload}
          value={capacity.total > 0 ? readableBytes(capacity.available) : "n/a"}
        />
        <StatsCard
          title="Disk Capacity"
          icon={Database}
          value={capacity.total > 0 ? readableBytes(capacity.total) : "n/a"}
        />
        <StatsCard title="Buckets" icon={Boxes} value={buckets?.length} />
      </section>
    </div>
  );
};

export default HomePage;
