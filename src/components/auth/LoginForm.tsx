import { LogIn } from "lucide-react";
import React, { useState } from "react";
import { authService } from "../../services/authService";
import { useAuthStore } from "../../store/useAuthStore";

const LoginForm: React.FC = () => {
  const [email, setEmail] = useState("dispatch@citytaxi.com");
  const [password, setPassword] = useState("changepassword");

  // Use separate selectors to avoid infinite loop
  const setCredentials = useAuthStore((state) => state.setCredentials);
  const setLoading = useAuthStore((state) => state.setLoading);
  const setError = useAuthStore((state) => state.setError);
  const loading = useAuthStore((state) => state.loading);
  const error = useAuthStore((state) => state.error);

  const useDemoCredentials = () => {
    setEmail("dispatch@citytaxi.com");
    setPassword("changepassword");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await authService.login(email.trim(), password);
      if (response.user.role !== "DISPATCHER") {
        setError("Only dispatcher accounts can access this console.");
        setLoading(false);
        return;
      }
      setCredentials(response.token, response.user);
    } catch (loginError: any) {
      console.error("Dispatch login failed", loginError);
      const message =
        loginError?.response?.data?.message ||
        "Unable to sign in. Check credentials and try again.";
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <LogIn size={20} />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">
            Dispatcher Login
          </h1>
          <p className="text-sm text-slate-600">
            Sign in with your company dispatcher credentials to continue.
          </p>
        </div>
        {error ? (
          <div className="mb-4 rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="dispatcher@company.com"
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="Enter your password"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={useDemoCredentials}
            disabled={loading}
            className="w-full rounded-md border border-slate-300 bg-slate-50 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Use City Taxi Demo Credentials
          </button>
        </form>
        <p className="mt-6 text-center text-[11px] text-slate-500">
          Having trouble? Contact your fleet administrator to reset your
          dispatcher credentials.
        </p>
      </div>
    </div>
  );
};

export default LoginForm;
