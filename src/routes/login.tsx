import { useEffect, useState } from "react";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { officeStatus } from "@/lib/portal.functions";
import { createFirstAdmin, setupStatus } from "@/lib/first-admin";
import { rememberSessionToken } from "@/lib/remember-session";
import { LeeLogo } from "@/components/mark";
import { Button, TextField } from "@/components/ui";
import { DeskLoading } from "@/components/desk-states";

export const Route = createFileRoute("/login")({ component: LoginPage });

function messageOf(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Something went wrong. Try again.";
}

function LoginPage() {
  const { user, isPending } = useCurrentUserState();
  const [officeName, setOfficeName] = useState("Lee & Associates");
  const [setup, setSetup] = useState<boolean | null>(null);

  useEffect(() => {
    let cancel = false;
    officeStatus()
      .then((next) => {
        if (!cancel) setOfficeName(next.officeName);
      })
      .catch(() => {
        if (!cancel) setOfficeName("Lee & Associates");
      });
    setupStatus()
      .then((next) => {
        if (!cancel) setSetup(next.needed);
      })
      .catch(() => {
        if (!cancel) setSetup(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  if (isPending || setup === null) return <DeskLoading />;
  if (user) return <Navigate to="/" />;

  return (
    <main className="min-h-screen bg-paper text-ink md:grid md:grid-cols-2">
      <section className="flex flex-col border-b border-line bg-surface px-6 py-8 text-ink md:border-r md:border-b-0 md:px-12 md:py-12">
        <LeeLogo className="w-full max-w-sm" />
        <div className="mt-10 md:mt-auto md:pt-16">
          <h1 className="text-5xl font-semibold tracking-tight">Lee Hub</h1>
          <p className="mt-4 max-w-md text-xl text-ink">The office, in one place.</p>
          <p className="mt-4 max-w-sm text-muted">
            Research, deal tools, and the logins this office shares. Administrators set up who can get in.
          </p>
        </div>
        <p className="mt-10 text-sm text-muted">{officeName}</p>
      </section>
      <section className="flex items-center px-6 py-10 md:px-12">
        <div className="w-full max-w-md">
          {setup ? <FirstAdminForm /> : <SignInForm officeName={officeName} />}
        </div>
      </section>
    </main>
  );
}

function FirstAdminForm() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium text-crimson">First time only</p>
      <h2 className="text-3xl font-semibold">Create the administrator</h2>
      <p className="text-muted">
        This office has no logins yet. The account you create here is the administrator. After that, this page goes away.
      </p>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          const created = await createFirstAdmin({ data: { name, email, password } });
          if (!created.ok) {
            setBusy(false);
            setError(created.error);
            return;
          }
          const result = await authClient.signIn.email({ email, password });
          if (result.error || !result.data) {
            setBusy(false);
            setError(messageOf(result.error) === "Something went wrong. Try again."
              ? "Your administrator account was saved. Sign in with that same email and password."
              : messageOf(result.error));
            return;
          }
          rememberSessionToken(result.data.token);
          await authClient.getSession();
          setBusy(false);
          await navigate({ to: "/" });
        }}
      >
        <TextField id="name" label="Your name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
        <TextField id="email" label="Work email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
        <TextField id="password" label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
        {error ? (
          <p className="text-sm text-deep" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create administrator"}
        </Button>
      </form>
    </div>
  );
}

function SignInForm({ officeName }: { officeName: string }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium text-crimson">{officeName}</p>
      <h2 className="text-3xl font-semibold">Sign in</h2>
      <p className="text-muted">Use the email and password an administrator created for you.</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          const result = await authClient.signIn.email({ email, password });
          if (result.error || !result.data) {
            setBusy(false);
            setError(messageOf(result.error));
            return;
          }
          rememberSessionToken(result.data.token);
          await authClient.getSession();
          setBusy(false);
          await navigate({ to: "/" });
        }}
      >
        <TextField id="email" label="Work email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
        <TextField id="password" label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        {error ? (
          <p className="text-sm text-deep" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Enter Lee Hub"}
        </Button>
      </form>
      <div className="flex items-center gap-3 text-sm text-faint">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      {GROK_PROVIDERS.map((provider) => (
        <Button
          key={provider.providerId}
          variant="secondary"
          onClick={() => signIn(provider.providerId, { callbackURL: "/" })}
        >
          Continue with {provider.label}
        </Button>
      ))}
    </div>
  );
}
