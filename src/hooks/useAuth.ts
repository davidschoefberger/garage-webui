import api from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

type AuthResponse = {
  enabled: boolean;
  authenticated: boolean;
  methods?: {
    password: boolean;
    oidc: boolean;
  };
  oidcName?: string;
  user?: string;
};

export const useAuth = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["auth"],
    queryFn: () => api.get<AuthResponse>("/auth/status"),
    retry: false,
  });
  return {
    isLoading,
    isEnabled: data?.enabled,
    isAuthenticated: data?.authenticated,
    // Older backends don't report methods; they only support password login.
    passwordEnabled: data?.methods?.password ?? true,
    oidcEnabled: data?.methods?.oidc ?? false,
    oidcName: data?.oidcName || "SSO",
    user: data?.user,
  };
};
