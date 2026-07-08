import { DeepPartial, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ExpirationSchema, expirationSchema } from "../schema";
import { useEffect } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useLifecycle, useSetLifecycle } from "../hooks";
import { InputField } from "@/components/ui/input";
import { ToggleField } from "@/components/ui/toggle";
import { useBucketContext } from "../context";
import { handleError } from "@/lib/utils";

const ExpirationSection = () => {
  const { bucket } = useBucketContext();
  const { data } = useLifecycle(bucket.id);

  const form = useForm<ExpirationSchema>({
    resolver: zodResolver(expirationSchema),
    defaultValues: { enabled: false, days: null },
  });
  const isEnabled = useWatch({ control: form.control, name: "enabled" });

  const setMutation = useSetLifecycle(bucket.id, { onError: handleError });

  const onChange = useDebounce((values: DeepPartial<ExpirationSchema>) => {
    const enabled = !!values.enabled;
    const days = Number(values.days);

    // Wait for a valid day count before persisting an enabled rule.
    if (enabled && !(days > 0)) {
      return;
    }

    setMutation.mutate({ enabled, days: enabled ? days : 0 });
  });

  useEffect(() => {
    form.reset({
      enabled: !!data?.enabled,
      days: data?.days || null,
    });

    const { unsubscribe } = form.watch((values) => onChange(values));
    return unsubscribe;
  }, [data]);

  return (
    <div className="mt-8">
      <ToggleField
        form={form}
        name="enabled"
        title="Object Expiration"
        label="Enabled"
      />

      {isEnabled && (
        <InputField
          form={form}
          name="days"
          title="Expire objects after (days)"
          type="number"
        />
      )}
    </div>
  );
};

export default ExpirationSection;
