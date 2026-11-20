import { KeyRound, LogIn, ShieldCheck } from "lucide-react";

export default function AccessShell({ children, variant = "ranger", recovery = false }) {
  const Icon = recovery ? KeyRound : variant === "admin" ? ShieldCheck : LogIn;
  return (
    <main className="access-shell" data-variant={variant}>
      <div className="access-brand">
        <img src="/bantay-dagat.png" alt="" width="34" height="34" />
        <span>BantayDagat</span>
      </div>
      <section className="access-card">
        <span className="access-symbol" aria-hidden="true"><Icon size={22} /></span>
        {children}
      </section>
    </main>
  );
}
