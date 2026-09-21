import Page from "@/context/page-context";
import { useClusterStatus, useNodeInfo } from "./hooks";
import { Card } from "react-daisyui";
import NodesList from "./components/nodes-list";
import { useMemo, type ReactNode } from "react";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { ArrowUpCircle } from "lucide-react";

const ClusterPage = () => {
  const { data } = useClusterStatus();
  const { data: node } = useNodeInfo();
  const { data: update } = useUpdateCheck();

  const nodes = useMemo(() => {
    if (!data) return [];

    if (Array.isArray(data.knownNodes)) {
      return data.knownNodes.map((node) => ({
        ...node,
        role: data.layout?.roles.find((role) => role.id === node.id),
      }));
    }

    return data.nodes || [];
  }, [data]);

  return (
    <div className="container">
      <Page title="Cluster" />

      <Card>
        <Card.Body className="gap-1">
          <Card.Title className="mb-2">Details</Card.Title>

          {/* <DetailItem title="Node ID" value={node?.nodeId} /> */}
          <DetailItem title="Garage Version" value={node?.garageVersion}>
            {update?.garage.updateAvailable && (
              <a
                href={update.garage.url}
                target="_blank"
                rel="noreferrer"
                className="badge badge-warning border-0 gap-1 h-auto py-0.5 text-xs font-medium hover:underline"
                title={`Latest release: ${update.garage.latest}`}
              >
                <ArrowUpCircle size={12} />
                Update to {update.garage.latest}
              </a>
            )}
          </DetailItem>
          {/* <DetailItem title="Rust version" value={data?.rustVersion} /> */}
          <DetailItem title="DB engine" value={node?.dbEngine} />
          <DetailItem
            title="Layout version"
            value={data?.layoutVersion || data?.layout?.version || "-"}
          />
        </Card.Body>
      </Card>

      <Card className="mt-4 md:mt-8">
        <Card.Body>
          <Card.Title>Nodes</Card.Title>

          <NodesList nodes={nodes} />
        </Card.Body>
      </Card>
    </div>
  );
};

type DetailItemProps = {
  title: string;
  value?: string | number | null;
  children?: ReactNode;
};

const DetailItem = ({ title, value, children }: DetailItemProps) => {
  return (
    <div className="flex flex-row items-start max-w-xl gap-3 text-left text-sm">
      <div className="shrink-0 w-1/3 max-w-[200px]">
        <p className="text-base-content/80">{title}</p>
      </div>
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="truncate">{value}</p>
        {children}
      </div>
    </div>
  );
};

export default ClusterPage;
