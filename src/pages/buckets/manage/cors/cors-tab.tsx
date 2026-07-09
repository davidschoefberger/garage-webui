import { useEffect, useState } from "react";
import { Card, Loading } from "react-daisyui";
import { Plus, Trash } from "lucide-react";
import Button from "@/components/ui/button";
import { toast } from "sonner";
import { handleError } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useBucketContext } from "../context";
import { CorsRule, useCors, useSetCors } from "../hooks";

const METHODS = ["GET", "PUT", "POST", "DELETE", "HEAD"];

type RuleForm = {
  origins: string;
  methods: string[];
  headers: string;
  expose: string;
  maxAge: string;
};

const toForm = (r: CorsRule): RuleForm => ({
  origins: (r.allowedOrigins || []).join("\n"),
  methods: r.allowedMethods || [],
  headers: (r.allowedHeaders || []).join(", "),
  expose: (r.exposeHeaders || []).join(", "),
  maxAge: r.maxAgeSeconds ? String(r.maxAgeSeconds) : "",
});

const splitLines = (s: string) =>
  s.split("\n").map((x) => x.trim()).filter(Boolean);
const splitCommas = (s: string) =>
  s.split(",").map((x) => x.trim()).filter(Boolean);

const emptyRule = (): RuleForm => ({
  origins: "",
  methods: ["GET"],
  headers: "*",
  expose: "",
  maxAge: "3600",
});

const CorsTab = () => {
  const { bucket } = useBucketContext();
  const queryClient = useQueryClient();
  const { data, isLoading } = useCors(bucket.id);
  const [rules, setRules] = useState<RuleForm[]>([]);

  const setCors = useSetCors(bucket.id, {
    onSuccess: () => {
      toast.success("CORS configuration saved!");
      queryClient.invalidateQueries({ queryKey: ["cors", bucket.id] });
    },
    onError: handleError,
  });

  useEffect(() => {
    if (data) setRules(data.rules.map(toForm));
  }, [data]);

  const updateRule = (i: number, patch: Partial<RuleForm>) =>
    setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const toggleMethod = (i: number, m: string) =>
    setRules((prev) =>
      prev.map((r, idx) =>
        idx === i
          ? {
              ...r,
              methods: r.methods.includes(m)
                ? r.methods.filter((x) => x !== m)
                : [...r.methods, m],
            }
          : r
      )
    );

  const removeRule = (i: number) =>
    setRules((prev) => prev.filter((_, idx) => idx !== i));
  const addRule = () => setRules((prev) => [...prev, emptyRule()]);

  const onSave = () => {
    const payload: CorsRule[] = rules
      .map((r) => ({
        allowedOrigins: splitLines(r.origins),
        allowedMethods: r.methods,
        allowedHeaders: splitCommas(r.headers),
        exposeHeaders: splitCommas(r.expose),
        maxAgeSeconds: Number(r.maxAge) || 0,
      }))
      .filter((r) => r.allowedOrigins.length && r.allowedMethods.length);
    setCors.mutate({ rules: payload });
  };

  if (isLoading) {
    return (
      <div className="h-[200px] flex items-center justify-center">
        <Loading />
      </div>
    );
  }

  return (
    <Card>
      <Card.Body>
        <div className="flex items-center justify-between">
          <Card.Title>CORS</Card.Title>
          <Button icon={Plus} size="sm" onClick={addRule}>
            Add rule
          </Button>
        </div>
        <p className="text-sm text-base-content/60">
          Allow browser apps from other origins to access this bucket directly
          (e.g. presigned uploads/downloads). Leave empty if only server-side
          clients use this bucket.
        </p>

        {rules.length === 0 && (
          <p className="py-10 text-center text-base-content/60">
            No CORS rules configured.
          </p>
        )}

        {rules.map((rule, i) => (
          <div
            key={i}
            className="border border-base-300 rounded-lg p-4 mt-4 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">Rule {i + 1}</span>
              <Button
                icon={Trash}
                size="sm"
                color="ghost"
                className="text-error"
                onClick={() => removeRule(i)}
              />
            </div>

            <label className="block">
              <span className="text-sm text-base-content/70">
                Allowed origins (one per line, <code>*</code> for any)
              </span>
              <textarea
                className="textarea textarea-bordered w-full mt-1"
                rows={2}
                value={rule.origins}
                onChange={(e) => updateRule(i, { origins: e.target.value })}
                placeholder="https://app.example.com"
              />
            </label>

            <div>
              <span className="text-sm text-base-content/70">
                Allowed methods
              </span>
              <div className="flex flex-wrap gap-4 mt-1">
                {METHODS.map((m) => (
                  <label
                    key={m}
                    className="flex items-center gap-1.5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={rule.methods.includes(m)}
                      onChange={() => toggleMethod(i, m)}
                    />
                    {m}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-sm text-base-content/70">
                  Allowed headers
                </span>
                <input
                  className="input input-bordered w-full mt-1"
                  value={rule.headers}
                  onChange={(e) => updateRule(i, { headers: e.target.value })}
                  placeholder="*"
                />
              </label>
              <label className="block">
                <span className="text-sm text-base-content/70">
                  Expose headers
                </span>
                <input
                  className="input input-bordered w-full mt-1"
                  value={rule.expose}
                  onChange={(e) => updateRule(i, { expose: e.target.value })}
                  placeholder="ETag"
                />
              </label>
              <label className="block">
                <span className="text-sm text-base-content/70">
                  Max age (seconds)
                </span>
                <input
                  type="number"
                  className="input input-bordered w-full mt-1"
                  value={rule.maxAge}
                  onChange={(e) => updateRule(i, { maxAge: e.target.value })}
                />
              </label>
            </div>
          </div>
        ))}

        <div className="flex justify-end mt-4">
          <Button
            color="primary"
            onClick={onSave}
            loading={setCors.isPending}
            disabled={setCors.isPending}
          >
            Save
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
};

export default CorsTab;
