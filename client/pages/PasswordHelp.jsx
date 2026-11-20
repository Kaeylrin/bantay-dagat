import { Link, useSearchParams } from "react-router-dom";
import AccessShell from "@/components/AccessShell";

export default function PasswordHelp() {
  const [params] = useSearchParams();
  const admin = params.get("role") === "admin";
  return (
    <AccessShell variant={admin ? "admin" : "ranger"} recovery>
      <h1 className="text-2xl font-bold">Forgot your password?</h1>
      <p className="my-5 leading-relaxed text-muted-foreground">
        {admin
          ? "Contact the person who manages administrator accounts to request a reset link."
          : "Ask your administrator to send a password reset link to your registered email."}
        {" "}Open the email and follow the link to choose a new password.
      </p>
      <Link className="block rounded-xl bg-primary px-4 py-3 text-center font-semibold text-primary-foreground" to={admin ? "/admin-login" : "/login"}>Back to sign in</Link>
    </AccessShell>
  );
}
