import Button from "@/components/ui/button";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Card } from "react-daisyui";
import { useForm } from "react-hook-form";
import { loginSchema } from "./schema";
import { InputField } from "@/components/ui/input";
import { useLogin } from "./hooks";
import garageLogo from "@/assets/garage-logo.svg";
import { useAuth } from "@/hooks/useAuth";
import { useSearchParams } from "react-router-dom";
import { API_URL } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CircleAlert, LogIn } from "lucide-react";

// The backend only passes error codes; unknown values get a generic message so
// a crafted link can't inject text into the page.
const OIDC_ERRORS: Record<string, string> = {
  provider_unreachable: "The identity provider is unreachable.",
  provider_rejected: "Login was rejected by the identity provider.",
  session_expired: "Login session expired, please try again.",
  invalid_state: "Invalid login state, please try again.",
  forbidden: "You are not allowed to access this application.",
  login_failed: "Login failed.",
};

export default function LoginPage() {
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });
  const login = useLogin();
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const errorCode = searchParams.get("error");
  const error = errorCode
    ? OIDC_ERRORS[errorCode] || OIDC_ERRORS.login_failed
    : null;

  return (
    <form
      className="w-full max-w-md"
      onSubmit={form.handleSubmit((v) => login.mutate(v))}
    >
      <Card className="w-full" bordered>
        <Card.Body>
          <img
            src={garageLogo}
            alt="Garage"
            className="w-full max-w-[120px] mx-auto mb-2"
          />
          <Card.Title tag="h2">Login</Card.Title>

          {error ? (
            <Alert status="error" icon={<CircleAlert size={18} />}>
              {error}
            </Alert>
          ) : null}

          {auth.passwordEnabled ? (
            <>
              <p className="text-base-content/60">
                Enter username and password below to log in to your account
              </p>

              <InputField
                form={form}
                name="username"
                title="Username"
                placeholder="Enter your username"
              />

              <InputField
                form={form}
                name="password"
                title="Password"
                type="password"
                placeholder="Enter your password"
              />

              <Card.Actions className="mt-4">
                <Button
                  type="submit"
                  color="primary"
                  className="w-full md:w-auto min-w-[100px]"
                  loading={login.isPending}
                >
                  Login
                </Button>
              </Card.Actions>
            </>
          ) : null}

          {auth.oidcEnabled ? (
            <>
              {auth.passwordEnabled ? (
                <div className="divider text-base-content/50 text-sm">or</div>
              ) : null}
              <a
                href={API_URL + "/auth/oidc/login"}
                className={cn(
                  "btn w-full",
                  !auth.passwordEnabled && "btn-neutral mt-2",
                )}
              >
                <LogIn size={18} className="-ml-1" />
                Login with {auth.oidcName}
              </a>
            </>
          ) : null}
        </Card.Body>
      </Card>
    </form>
  );
}
