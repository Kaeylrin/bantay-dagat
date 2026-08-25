import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/authContext";

const NotFound = () => {
  const location = useLocation();
  const { currentUser } = useAuth();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  const returnTo = currentUser ? "/dashboard" : "/login";
  const returnLabel = currentUser ? "Return to Dashboard" : "Return to Login";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md">
        <AlertTriangle className="w-16 h-16 text-danger mx-auto mb-4" />
        <h1 className="text-5xl font-header font-bold text-foreground mb-3">
          404
        </h1>
        <p className="text-xl text-muted-foreground mb-2">Page Not Found</p>
        <p className="text-sm text-muted-foreground mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to={returnTo}
          className="inline-block px-6 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          {returnLabel}
        </Link>
      </div>
    </div>
  );
};
export default NotFound;
