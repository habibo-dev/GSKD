"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentType,
} from "react";
import {
  LayoutDashboard,
  Search,
  BookOpen,
  Package,
  Boxes,
  ShoppingCart,
  ArrowLeftRight,
  FileSpreadsheet,
  BarChart3,
  Car,
  Link2,
  Settings,
  Gauge,
  Menu,
  X,
  Camera,
} from "lucide-react";
import { stockStatusLabel, STATUS_BADGE } from "@/lib/status-ui";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
};

const NAV_SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Principal",
    items: [
      { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
      { href: "/recherche", label: "Recherche", icon: Search },
      { href: "/catalogue", label: "Catalogue", icon: BookOpen },
    ],
  },
  {
    title: "Gestion",
    items: [
      { href: "/pieces", label: "Pièces", icon: Package },
      { href: "/stock", label: "Stock", icon: Boxes },
      { href: "/ventes", label: "Ventes", icon: ShoppingCart },
      { href: "/mouvements", label: "Mouvements", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Données",
    items: [
      { href: "/import-export", label: "Import / Export", icon: FileSpreadsheet },
      { href: "/rapports", label: "Rapports", icon: BarChart3 },
    ],
  },
  {
    title: "Automobile",
    items: [
      { href: "/vehicules", label: "Véhicules", icon: Car },
      { href: "/compatibilite", label: "Compatibilité", icon: Link2 },
    ],
  },
  {
    title: "Système",
    items: [{ href: "/parametres", label: "Paramètres", icon: Settings }],
  },
];

const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, "Tableau de bord"],
  [/^\/recherche/, "Recherche de pièces"],
  [/^\/catalogue/, "Catalogue — Liste des Articles au Prix de Vente"],
  [/^\/pieces\/nouvelle/, "Nouvelle pièce"],
  [/^\/pieces\/\d+\/modifier/, "Modifier la pièce"],
  [/^\/pieces\/\d+/, "Fiche pièce"],
  [/^\/pieces/, "Pièces détachées"],
  [/^\/stock/, "Gestion du stock"],
  [/^\/ventes\/nouvelle/, "Nouvelle vente"],
  [/^\/ventes/, "Ventes"],
  [/^\/mouvements/, "Mouvements de stock"],
  [/^\/import-export/, "Import / Export Excel"],
  [/^\/rapports/, "Rapports"],
  [/^\/vehicules/, "Véhicules"],
  [/^\/compatibilite/, "Compatibilité pièces / véhicules"],
  [/^\/parametres/, "Paramètres"],
];

function titleFor(pathname: string): string {
  for (const [re, t] of TITLES) if (re.test(pathname)) return t;
  return "AutoStock";
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

type SearchHit = {
  id: number;
  reference: string;
  designation: string;
  brand: string | null;
  location: string | null;
  status: "disponible" | "faible" | "rupture";
  currentStock: number;
  retailPrice: number;
  image: string | null;
};

function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}&limit=7`);
        const data = (await res.json()) as { results: SearchHit[] };
        setHits(data.results);
        setOpen(true);
      } catch {
        /* silencieux */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const goSearch = () => {
    if (q.trim()) {
      setOpen(false);
      router.push(`/recherche?q=${encodeURIComponent(q.trim())}`);
    }
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-xl">
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (hits.length > 0) {
              setOpen(false);
              router.push(`/pieces/${hits[0].id}`);
            } else {
              goSearch();
            }
          }
        }}
        placeholder="Rechercher une pièce (référence, désignation, marque…) — touche /"
        className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-16 text-[13px] shadow-sm placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
        Entrée ↵
      </kbd>
      {open && hits.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {hits.map((h) => (
            <button
              key={h.id}
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
                router.push(`/pieces/${h.id}`);
              }}
              className="flex w-full items-center gap-3 border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-slate-50"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                {h.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Camera size={14} className="text-slate-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-slate-900">
                  <span className="mono font-semibold">{h.reference}</span>
                  <span className="text-slate-400"> · </span>
                  {h.designation}
                </div>
                <div className="truncate text-[11px] text-slate-500">
                  {h.brand ?? "—"} {h.location ? `· Rayon ${h.location}` : ""} · Stock : {h.currentStock}
                </div>
              </div>
              <span className={`badge ${STATUS_BADGE[h.status]}`}>
                <span className="dot" />
                {stockStatusLabel(h.status)}
              </span>
            </button>
          ))}
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              goSearch();
            }}
            className="w-full bg-slate-50 px-3 py-2 text-center text-[12px] font-medium text-blue-700 hover:bg-slate-100"
          >
            Voir tous les résultats pour « {q} »
          </button>
        </div>
      )}
      {loading && (
        <div className="absolute right-12 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sidebar = (
    <aside className="app-sidebar flex h-full w-[248px] flex-col bg-[#0b1220] text-slate-300">
      <Link href="/" className="flex items-center gap-2.5 px-5 pb-5 pt-5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-950/50">
          <Gauge size={19} strokeWidth={2.2} />
        </span>
        <span>
          <span className="block text-[15px] font-bold tracking-tight text-white">
            AutoStock
          </span>
          <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
            Pièces automobiles
          </span>
        </span>
      </Link>
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mt-3 first:mt-0">
            <div className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
              {section.title}
            </div>
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-white/10 text-white"
                      : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-blue-500" />
                  )}
                  <Icon size={16} strokeWidth={2} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-white/[0.06] px-5 py-3.5 text-[11px] leading-snug text-slate-500">
        Gestion intelligente des
        <br />
        pièces automobiles
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen">
      {/* Sidebar bureau */}
      <div className="fixed inset-y-0 left-0 z-30 hidden lg:block">{sidebar}</div>
      {/* Sidebar mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 shadow-2xl">{sidebar}</div>
          <button
            className="absolute left-[256px] top-4 grid h-9 w-9 place-items-center rounded-lg bg-white text-slate-700"
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer le menu"
          >
            <X size={18} />
          </button>
        </div>
      )}

      <div className="app-main flex min-h-screen flex-col lg:ml-[248px]">
        <header className="app-topbar sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-6">
          <button
            className="btn btn-ghost btn-sm -ml-2 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu size={18} />
          </button>
          <h1 className="hidden whitespace-nowrap text-[15px] font-bold tracking-tight text-slate-900 md:block">
            {titleFor(pathname)}
          </h1>
          <div className="flex-1">
            <GlobalSearch />
          </div>
          <Link href="/ventes/nouvelle" className="btn btn-primary btn-sm no-print">
            <ShoppingCart size={14} />
            <span className="hidden sm:inline">Nouvelle vente</span>
            <span className="sm:hidden">Vente</span>
          </Link>
        </header>
        <main className="flex-1 px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
