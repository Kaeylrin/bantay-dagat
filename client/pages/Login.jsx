import { useState } from "react";
import { useNavigate } from "react-router-dom";
export default function Login() {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const handleSubmit = async (e)=>{
        e.preventDefault();
        setError("");
        setIsLoading(true);
        // Simulate login
        setTimeout(()=>{
            if (email && password) {
                // Store a simple auth token
                localStorage.setItem("authToken", "token_" + Date.now());
                localStorage.setItem("userEmail", email);
                navigate("/dashboard");
            } else {
                setError("Please enter both email and password");
            }
            setIsLoading(false);
        }, 500);
    };
    return <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        { /* Logo/Branding */ }
        <div className="text-center mb-8">
          <h1 className="text-3xl font-header font-bold text-foreground mb-2">
            BantayDagat
          </h1>
          <p className="text-muted-foreground">
            IoT-Based Water Quality Monitoring
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Sea Turtle Release Safety System
          </p>
        </div>

        { /* Login Card */ }
        <div className="bg-white rounded-xl shadow-sm border border-secondary p-8">
          <h2 className="text-xl font-header font-bold text-foreground mb-6">
            Staff Login
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            { /* Email Input */ }
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                Email Address
              </label>
              <input id="email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="staff@sanctuary.org" className="w-full px-4 py-2 rounded-lg border border-secondary bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"/>
            </div>

            { /* Password Input */ }
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
                Password
              </label>
              <input id="password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="••••••••" className="w-full px-4 py-2 rounded-lg border border-secondary bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"/>
            </div>

            { /* Error Message */ }
            {error && <div className="bg-danger/10 border border-danger/30 rounded-lg p-3">
                <p className="text-sm text-danger">{error}</p>
              </div>}

            { /* Login Button */ }
            <button type="submit" disabled={isLoading} className="w-full bg-primary text-white font-medium py-2.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6">
              {isLoading ? "Logging in..." : "Login"}
            </button>
          </form>

          { /* Demo Note */ }
          <div className="mt-6 p-3 bg-secondary/50 rounded-lg border border-secondary">
            <p className="text-xs text-muted-foreground">
              Demo: Use any email and password to login. This is a demonstration system.
            </p>
          </div>
        </div>

        { /* Footer */ }
        <p className="text-center text-xs text-muted-foreground mt-8">
          Sanctuary Marine Conservation System
        </p>
      </div>
    </div>;
}
