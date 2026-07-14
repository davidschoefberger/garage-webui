import api from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export type UpdateComponent = {
  current: string;
  latest: string;
  updateAvailable: boolean;
  url: string;
};

export type UpdateCheck = {
  webui: UpdateComponent;
  garage: UpdateComponent;
};

// Checks (via the backend) whether newer versions of garage-webui or Garage
// are available. Result is cached server-side; keep it fresh for an hour here.
export const useUpdateCheck = () => {
  return useQuery({
    queryKey: ["update-check"],
    queryFn: () =>
      api.get<UpdateCheck>("/update/check", {
        params: { webui: __APP_VERSION__ },
      }),
    staleTime: 1000 * 60 * 60,
    retry: false,
  });
};
