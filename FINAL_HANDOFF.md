# FINAL HANDOFF — AutoStock / GSKD

Date : 2026-09-06
Branche : `arena/01a076c2-gskd`
Dernier commit : `e6d3b61`

---

## 1. Résumé exécutif

Le projet est en phase de finalisation. L'application Next.js + PostgreSQL est
fonctionnelle localement avec un mode démonstration incorporé (PGlite), le
schéma complet est idempotent, l'import/export CSV-Excel est opérationnel, le
système de stock par mouvements est audité, les ventes sont enregistrées, et
l'authentification optionnelle a été revue et corrigée.

Deux éléments bloquent la validation finale « production avec les données
réelles » :

1. **Aucun déploiement de production n'a pu être exécuté** (pas de jeton Vercel,
   pas de CLI, accès GitHub Secrets interdit). GitHub Pages est inadapté à une
   application Next.js avec API + base de données.
2. **Les fichiers réels du client sont absents** : ni le CSV inventaire ni le
   PDF catalogue n'ont été fournis dans `data/`.

---

## 2. État actuel

- Le dépôt est sur `arena/01a076c2-gskd`, propre après push.
- Le build production passe (`next build`) sans erreur.
- `npm run test` passe : typecheck + lint + 19 assertions de fumée.
- Les API testées fonctionnent : recherche, pièces, mouvements, ventes,
  import CSV, import Excel multi-étapes, export Excel, image produit.
- Un serveur de prévisualisation locale tourne sur port `3000` (URL live
  Arena) avec `DATABASE_URL=pglite:///tmp/autostock-pglite`.

---

## 3. Dernier commit / branche

- Branch : `arena/01a076c2-gskd`
- Latest commit : `e6d3b61`
- Message : `Add FINAL_HANDOFF.md with production status and next-agent handoff`
  (commit précécent contenant le code : `85b684e`)

---

## 4. URL de production / statut déploiement

### Statut : BLOCKED

- **URL de production : aucune URL de production réelle n'a été créée.**
- GitHub Pages (`https://habibo-dev.github.io/GSKD/`) renvoie encore 404 et ne
  peut pas héberger cette application (Next.js + API + base de données).
- Le choix retenu est **Vercel** (ou un équivalent serverless avec PostgreSQL
  managé). Le projet contient maintenant `vercel.json`.
- Bloqué par : absence de `VERCEL_TOKEN`, absence de CLI Vercel, `gh secret
  list` renvoyant 403, aucun accès à un projet Vercel existant.

### URL de démonstration locale (aperçu)

Un serveur `next start` est exposé par Arena sur le port `3000` ; l'URL est
affichée dans l'UI du preview. Elle est éphémère et n'est **pas** une URL de
production.

---

## 5. Base de données / schéma

- `src/db/index.ts` : supporte deux moteurs :
  - `DATABASE_URL=postgres://...` → PostgreSQL externe (production).
  - `DATABASE_URL=pglite://...` → PGlite embarqué (démo locale, tests).
- `src/db/bootstrap.ts` : `ensureSchema()` crée/ajuste toutes les tables
  (`users`, `settings`, `brands`, `categories`, `suppliers`, `parts`,
  `part_references`, `images`, `sales`, `sale_items`, `stock_movements`,
  `import_batches`, `vehicles`, `compatibilities`) et tous les index.
- `npm run db:setup` : crée le schéma.
- `npm run db:seed` : insère un jeu de démonstration (35 pièces), idempotent.
- `src/db/setup.ts` : petit script CLI pour `db:setup`.

---

## 6. Imports CSV / Excel

- Import direct CSV : `POST /api/import/csv`.
- Import Excel multi-étapes : `POST /api/import/preview`, `/validate`,
  `/execute`.
- `src/lib/imports.ts` + `src/lib/excel.ts` : mapping auto, validation,
  doublons, références alternatives, mise à jour avec réconciliation de stock
  tracée par un mouvement `ajustement_*`.
- Nouveau `npm run data:load` lit tous les fichiers `.csv/.xlsx/.xls` placés
  dans `data/` et applique le même pipeline.

Testé avec un CSV et un XLSX. Résultat : création, mise à jour, doublons,
validations OK.

---

## 7. Export

- `GET /api/export?type=stock|catalogue|stock-faible|ruptures|ventes|mouvements`.
- `src/lib/export.ts` génère un vrai fichier `.xlsx` avec colonnes métier
  françaises, prix, UM, rayon, stock initial / entrées / sorties / restant.
- Testé : export stock non vide, lisible par `xlsx`.

---

## 8. Référence & recherche

- Référence principale + `referenceRaw` conservée.
- Références alternatives dans `part_references`.
- La recherche `7703800107` et `8200651172` retrouve la même pièce.
- Normalisation conservative : casse, accents, ponctuation parasite,
  `6455-EK` conservé.
- Aucune donnée de compatibilité véhicule inventée : les tables existent, mais
  ne sont remplies que si une source le fournit.

---

## 9. Stock / mouvements / audit

- Table `stock_movements` types : `entree`, `retour`, `sortie`,
  `ajustement_pos`, `ajustement_neg`, `vente`.
- `src/lib/movements.ts` : verrouillage de ligne, contrôle de stock, écriture
  du mouvement + mise à jour `currentStock` et `sold_quantity`.
- `POST /api/movements` : entrées / sorties / ajustements, refus du stock
  négatif sauf réglage explicite.
- `GET /api/movements` : filtres `partId`, `type`, `q`, `limit`.
- Testé : entrée 10 → 15, vente 15 → 13, sold quantity = 2, lien vente →
  mouvement.

---

## 10. Ventes

- `src/lib/movements.ts` `createSale()` : crée la vente, les lignes, applique
  le mouvement `vente`, calcule les totaux.
- `POST /api/sales`, `GET /api/sales`.
- Testé : vente avec prix détail, total correct, historique correct.

---

## 11. Images produits

- Table `images` avec **une image canonique par pièce** (contrainte `UNIQUE`).
- `POST /api/parts/[id]/image`, `DELETE`, `GET /api/images/parts/[file]`.
- `src/lib/images.ts` : enregistre dans `uploads/parts/`, remplace l'ancienne
  image, ne duplique jamais.
- Testé : upload PNG, lecture via URL, remplacement logique conservée.

---

## 12. PDF / OCR / matching

- `scripts/extract-pdf-catalogue.ts` : rend les pages PDF, OCR local
  (tesseract.js), découpe les zones photo, écrit `matches.json` / `.csv`.
- Statut par défaut `manual_review` / `NEEDS_REVIEW` — **aucune association
  d'image automatique définitive**.
- `scripts/README.md` explique la calibration.
- **Non testé avec le vrai PDF** : le fichier `ArticlePVPhoto.pdf 13 06
  2026.pdf` n'est pas présent dans `data/`.

---

## 13. Authentification / rôles / sécurité

- Cookies httpOnly signés HMAC-SHA256, TTL 12h.
- Rôles : `admin` / `employe`.
- `authEnabled` est désactivé par défaut pour ne pas bloquer la consultation
  publique.
- Quand activé :
  - `requireAdmin` protège : parts (creation/édition/suppression), images,
    imports, settings, meta POST, vehicles, compatibilities, admin reset,
    mouvements.
  - `requireAuth` (nouveau) protège les ventes, permet à un employé connecté
    de vendre.
- **Bug corrigé** : `ensureAuthReady()` exécutait plusieurs instructions SQL
  dans un seul `db.execute`, ce qui échouait avec PGlite et empêchait la
  création de l'utilisateur admin. Le bootstrap utilise maintenant
  `runBatchSql()` (PGlite `exec` / Pool `query`).
- Testé : `admin/admin` se connecte, `/api/meta` reste public, les mutations
  sans cookie renvoient 401, avec cookie admin elles passent, vente avec cookie
  passe.

---

## 14. Tests exécutés

| Test | Résultat |
|---|---|
| `npm run typecheck` | OK |
| `npm run lint` | OK (0 erreur, 1 warning font Next) |
| `npm run build` | OK |
| `npm run test` (smoke PGlite) | 19 succès / 0 échec |
| Import CSV direct | OK |
| Import XLSX multi-étapes | OK |
| Export XLSX stock | OK |
| Recherche `7703800107` / `8200651172` | OK |
| Création / édition pièce | OK (avec correctif « ne pas écraser les prix ») |
| Mouvement entrée | OK |
| Vente + audit | OK |
| Upload image / lecture URL | OK |
| Auth activée / rôle admin | OK |

---

## 15. Données réelles client

- **Absentes de `data/`.** Aucun fichier répercuté.
- Le script `npm run data:load` est prêt ; dès que les fichiers sont placés
  dans `data/`, il faut lancer :
  ```bash
  DATABASE_URL=postgres://... npm run data:load
  npm run pdf:extract -- "data/ArticlePVPhoto.pdf 13 06 2026.pdf"
  ```
- Les données synthétiques de démonstration restent clairement identifiées
  (`import_batches` `status=demo`) et peuvent être purgées.

---

## 16. Bugs corrigés pendant cette passe

1. PGlite incompatible avec le bundle Next → `serverExternalPackages`.
2. `ensureAuthReady()` multi-commandes échouait → `runBatchSql()`.
3. PATCH pièce avec champ prix absent remettait 0 → conserve la valeur
   existante.
4. PATCH settings avec `defaultMinStock` absent remettait 0 → conserve.
5. `GET /api/movements` ne filtrait pas par `partId` → ajouté.
6. Liste des mouvements ne renvoyait pas `saleId` → ajouté.
7. Routes non protégées quand l'auth est activée → protections ajoutées.

---

## 17. Fichiers importants

- `src/db/index.ts`, `src/db/bootstrap.ts`, `src/db/setup.ts`, `src/db/seed.ts`
- `src/lib/auth.ts`, `src/lib/settings.ts`
- `src/lib/movements.ts`, `src/lib/queries.ts`, `src/lib/imports.ts`,
  `src/lib/excel.ts`, `src/lib/export.ts`, `src/lib/images.ts`
- `src/app/api/**` (routes API)
- `scripts/extract-pdf-catalogue.ts`, `scripts/load-client-data.ts`,
  `scripts/smoke-test.ts`, `scripts/smoke-test.sh`
- `next.config.ts`, `vercel.json`, `.env.example`
- `data/README.md`

---

## 18. Problèmes restants

1. **Aucune URL de production** : déploiement Vercel bloqué par absence de
   jeton / accès.
2. **Fichiers réels absents** : validation finale avec données client
   impossible.
3. **PDF/OCR non calibré** : le vrai PDF n'étant pas présent, les zones photo
   et les correspondances doivent être vérifiées manuellement.
4. **PGlite mono-processus** : la démo locale ne supporte pas deux processus
   (serveur + CLI) ouvrant le même répertoire de données en même temps.
   C'est un choix de démo ; en production, utiliser PostgreSQL.
5. Warning ESLint `@next/next/no-page-custom-font` sur `layout.tsx`
   (non bloquant).

---

## 19. Instructions d'exécution / déploiement

### Local avec PGlite (démo)

```bash
DATABASE_URL=pglite://./data/autostock.db npm run db:seed
DATABASE_URL=pglite://./data/autostock.db npm run dev
```

### Tests

```bash
npm run test
```

### Production / Vercel

1. Créer un projet Vercel et le lier au dépôt `habibo-dev/GSKD`.
2. Configurer les variables d'environnement :
   - `DATABASE_URL=postgres://...` (Neon, Supabase, Railway…)
   - `AUTH_SECRET=...` (`openssl rand -base64 32`)
   - `ADMIN_USERNAME=admin`
   - `ADMIN_PASSWORD=...`
3. Le buildCommand de `vercel.json` exécute `npm run db:setup && npm run build`.
4. Récupérer l'URL de déploiement Vercel et la mettre comme URL de production.

### Charger les données réelles du client

```bash
cp "${HOME}/.../Liste-des-Articles-samedi-11-04-2026-.csv" data/
DATABASE_URL=postgres://... npm run data:load
DATABASE_URL=postgres://... npm run pdf:extract -- "data/ArticlePVPhoto.pdf 13 06 2026.pdf"
```

---

## 20. Prochaine étape exacte

1. Obtenir un accès de déploiement (jeton Vercel ou lien d'import Vercel du
   dépôt) puis pousser sur `arena/01a076c2-gskd` et déclencher un déploiement
   Vercel de démonstration.
2. Fournir les deux fichiers réels dans `data/`.
3. Exécuter `data:load`, puis `pdf:extract`.
4. Vérifier les matchs `manual_review / NEEDS_REVIEW`, copier les images
   confirmées dans `uploads/parts/` et lier une image canonique par pièce.
5. Relancer `npm run test` et les parcours UI sur la base réelle.

---

## NEXT AGENT HANDOFF

**État** : PARTIEL — application fonctionnelle localement, code prêt pour la
production, mais **pas de Production URL** et **pas de données réelles**.

**Fait**
- Schéma DB complet, PGlite supporté, `db:setup`, `db:seed`, `data:load`.
- Import CSV + XLSX, export XLSX, stock par mouvements, ventes, recherche de
  références alternatives, images canoniques.
- Auth corrigée et protections ajoutées.
- Smoke test automatisé (`npm run test`) passant (19/19).
- Build production passe.

**Pas fait**
- Déploiement Vercel (aucun jeton).
- Validation avec fichiers réels (absents de `data/`).
- Calibration/révision du pipeline PDF réel.

**Prochaine étape exacte**
Mettre en place un projet Vercel lié au dépôt, configurer `DATABASE_URL`
PostgreSQL + `AUTH_SECRET`, déployer la branche `arena/01a076c2-gskd`, puis
fournir les fichiers réels du client dans `data/` et lancer `npm run data:load`.

**Commandes de test**
```bash
npm run test
DATABASE_URL=postgres://... npm run db:setup
DATABASE_URL=postgres://... npm run data:load
DATABASE_URL=postgres://... npm run pdf:extract -- "data/ArticlePVPhoto.pdf 13 06 2026.pdf"
```

**Production URL** : aucune (BLOCKED).
**Repo** : `https://github.com/habibo-dev/GSKD`
**Branche** : `arena/01a076c2-gskd`
**Dernier commit** : `e6d3b61`
