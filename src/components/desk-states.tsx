import { UserButton } from "@/lib/auth/gates";
import { LeeLogo } from "@/components/mark";

export function DeskLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 text-ink">
      <div className="w-full max-w-sm">
        <LeeLogo className="w-full max-w-xs" />
        <p className="mt-6 text-2xl font-semibold tracking-tight">Lee Hub</p>
        <h1 className="mt-3 text-3xl font-semibold">Opening the office</h1>
        <p className="mt-3 text-muted">Checking your login.</p>
      </div>
    </main>
  );
}

export function GateState({ title, body }: { title: string; body: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 py-16 text-ink">
      <div className="w-full max-w-md">
        <LeeLogo className="w-full max-w-xs" />
        <p className="mt-6 text-2xl font-semibold tracking-tight">Lee Hub</p>
        <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
        <p className="mt-3 text-muted">{body}</p>
        <div className="mt-8 rounded-lg border border-line bg-surface p-4">
          <UserButton />
        </div>
      </div>
    </main>
  );
}
