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

export default function LoginPage() {
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });
  const login = useLogin();
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");

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
          ) : (
            <p className="text-base-content/60">
              Log in with your {auth.oidcName} account
            </p>
          )}

          {auth.oidcEnabled ? (
            <>
              {auth.passwordEnabled ? (
                <div className="divider text-base-content/50 text-sm">or</div>
              ) : null}
              <a
                href={API_URL + "/auth/oidc/login"}
                className={cn(
                  "btn w-full",
                  !auth.passwordEnabled && "btn-primary mt-4"
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
