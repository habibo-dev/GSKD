"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Loader2, CircleAlert } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Connexion impossible.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Erreur réseau, réessayez.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center">
      <form onSubmit={submit} className="card w-full p-6">
        <div className="mb-4 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-blue-600 text-white">
            <LogIn size={20} />
          </span>
          <h1 className="mt-3 text-lg font-bold text-slate-900">Connexion</h1>
          <p className="mt-1 text-[12.5px] text-slate-500">
            Espace sécurisé — gère les droits administrateur / employé.
          </p>
        </div>
        {error && (
          <p className="mb-3 flex items-center gap-2 rounded-lg bg-rose-50 p-2.5 text-[12.5px] font-medium text-rose-700">
            <CircleAlert size={14} /> {error}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <div>
            <label className="label label-required">Nom d&apos;utilisateur</label>
            <input className="input" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>
          <div>
            <label className="label label-required">Mot de passe</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <button className="btn btn-primary mt-2" disabled={busy || !username.trim() || !password}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
            Se connecter
          </button>
          <p className="mt-1 text-center text-[11.5px] text-slate-400">
            Compte initial par défaut : <span className="mono font-semibold">admin / admin</span>
            (à changer immédiatement en production).
          </p>
        </div>
      </form>
    </div>
  );
}
