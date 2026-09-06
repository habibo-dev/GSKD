"use client";

import { useEffect, useState } from "react";
import { LogIn, LogOut, ShieldCheck, Loader2 } from "lucide-react";

type AuthState = {
  enabled: boolean;
  user: { name: string; role: string } | null;
};

export function AuthStatus() {
  const [state, setState] = useState<AuthState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => setState({ enabled: Boolean(d.enabled), user: d.user ?? null }))
      .catch(() => setState({ enabled: false, user: null }));
  }, []);

  const logout = async () => {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/auth", { method: "DELETE" });
      window.location.reload();
    } catch {
      setError("Déconnexion impossible.");
      setBusy(false);
    }
  };

  if (!state) {
    return (
      <div className="flex items-center gap-1.5 px-2 text-[11.5px] text-slate-400">
        <Loader2 size={12} className="animate-spin" /> Sécurité…
      </div>
    );
  }

  if (!state.enabled) {
    return (
      <div className="hidden items-center gap-1.5 px-2 text-[11.5px] text-slate-400 md:flex" title="La sécurité multi-utilisateurs est désactivée dans Paramètres.">
        <ShieldCheck size={12} className="text-slate-300" />
        Sécurité désactivée
      </div>
    );
  }

  if (state.user) {
    const isAdmin = state.user.role === "admin";
    return (
      <div className="flex items-center gap-2">
        <span className="badge badge-slate">
          <ShieldCheck size={11} />
          {state.user.name}
          <span className={isAdmin ? "text-blue-700" : "text-slate-500"}>
            · {isAdmin ? "Admin" : "Employé"}
          </span>
        </span>
        <button className="btn btn-ghost btn-xs" onClick={logout} disabled={busy} title="Se déconnecter">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
          Déconnexion
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="badge badge-amber">
        <ShieldCheck size={11} />
        Non connecté
      </span>
      <a href="/login" className="btn btn-secondary btn-xs">
        <LogIn size={12} /> Connexion
      </a>
      {error && <span className="text-[11px] text-rose-600">{error}</span>}
    </div>
  );
}
