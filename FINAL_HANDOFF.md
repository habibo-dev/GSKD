# FINAL HANDOFF — AutoStock / GSKD

Date : 2026-09-06
Branche : `arena/01a076c2-gskd`
Commit de code final : `3925659`
Dernier commit de la branche : voir `git log --oneline -1` (ce fichier de handoff y est inclus)

---

## 0. Résultat global

- **STATUS : NOT COMPLETE** (validation produit terminée, déploiement production bloqué).
- **URL de production : AUCUNE URL PUBLIQUE RÉELLE**.
- **URL de prévisualisation temporaire (éphémère) : serveur `next start` actif sur le
  port 3000, exposé par Arena pour cette session. Ce n'est PAS une URL de production.**
- La branche est poussée ; le code est propre, typechecké, linté, buildé, testé avec
  les vraies données client.

---

## 1. Déploiement (BLOCKED)

### Choix retenu
- **Vercel** (ou un équivalent serverless managé) est le bon hébergeur.
- GitHub Pages est **inadapté** : application Next.js App Router avec routes API
  dynamiques + base de données. Ne pas insister sur Pages.
- Le projet contient `vercel.json`, `next.config.ts` et un support PostgreSQL externe
  (`DATABASE_URL=postgres://...`) + mode PGlite local (`pglite://...`).

### Pourquoi ce n'est pas déployé
1. **Pas de jeton Vercel** : `VERCEL_TOKEN` absent, CLI Vercel absente,
   `gh secret list` renvoie `403 Resource not accessible by integration`.
2. **Sortie réseau vers Vercel bloquée dans le sandbox** :
   - `curl https://api.vercel.com` → `OpenSSL SSL_connect: SSL_ERROR_SYSCALL`.
   - `curl https://vercel.com` → même erreur.
   - GitHub et npm sont accessibles ; Vercel ne l'est pas.
3. **Aucun projet / compte Vercel relié** au dépôt GitHub. Le dépôt n'a pas de
   workflow de déploiement et n'a pas de secret de déploiement accessible.
4. **Aucune base PostgreSQL managée fournie**. L'app exige `DATABASE_URL` en
   production. Les identifiants de base doivent être fournis (Neon/Supabase/Railway…).

### Exact next step pour déployer
1. Fournir ou connecter Vercel (token `VERCEL_TOKEN`) **ou** une base PostgreSQL
   managée + un hôte serverless (Neon + Vercel est le plus simple).
2. Définir les variables d'environnement sur Vercel :
   - `DATABASE_URL=postgres://...`
   - `AUTH_SECRET=<openssl rand -base64 32>`
   - `ADMIN_USERNAME=admin`
   - `ADMIN_PASSWORD=<mot de passe fort>`
   - `NEXT_PUBLIC_APP_NAME=AutoStock`
   - `NEXT_PUBLIC_CURRENCY=DA`
3. Pousser la branche `arena/01a076c2-gskd` (ou `main`) et faire déployer le projet
   Vercel relié. Le build Vercel fait `npm run db:setup && npm run build`.
4. Après le premier déploiement, lancer :
   ```bash
   # import des données réelles dans la base de production (si non déjà importées)
   DATABASE_URL=postgres://... npm run data:load
   ```
5. Vérifier `/api/health` → `{"ok":true}` et `GET /api/parts?perPage=1` → `total=138`.

---

## 2. Données réelles client (fait)

Fichiers réels présents dans `data/` (non commités, ignorés par git) :
- `Liste-des-Articles-samedi-11-04-2026-.csv` (142 lignes)
- `Liste des Articles samedi 11-04-2026 .xls` (142 lignes, même contenu)
- `ArticlePVPhoto.pdf 13 06 2026.pdf` (20 pages)

### Import CSV
`npm run data:load -- --file=Liste-des-Articles` sur base PGlite fraîche :
- **138 créées / 0 maj / 4 doublons / 0 invalides**.
- Les 4 doublons sont **2 paires en conflit**, toutes marquées `doublon_fichier`,
  aucune ligne importée silencieusement :
  - ligne 9 `.DG343` vs ligne 10 `DG343`
  - ligne 47 `.7701464165` vs ligne 48 `7701464165`
- Détail et tableau complet : `REVIEW_CLIENT_DATA.md`.

### Import XLS (via API)
Pipeline `/api/import/preview` → `/validate` → `/execute` :
- `preview` : lecture OK, 142 lignes, mapping auto complet.
- `validate` : 142 lignes, 4 doublons, 138 existants, 0 erreur.
- `execute` : **138 mis à jour / 0 créé / 4 doublons / 0 invalide**.
- L'import XLS réutilise exactement le même pipeline que le CSV.

### Références multiples
- Ligne 6 : `7703800107 /8200651172` → **une seule pièce id 5**,
  `referenceRaw = "7703800107 /8200651172"`, quantité 20, PD 805.
- `GET /api/search?q=7703800107` → id 5.
- `GET /api/search?q=8200651172` → id 5.
- `altCount = 2`.

### PDF / OCR
- Pipeline exécuté sur les 20 pages : `scripts/extract-pdf-catalogue.ts`.
- Résultat : **199 lignes OCR** ; **52 ont une référence candidate correspondant à
  l'inventaire importé** ; toutes `manual_review` / `NEEDS_REVIEW`.
- **Aucune image reliée automatiquement** (correct : OCR bruité, recadrages
  parfois multi-cellules).
- Sortie générée dans `data/pdf-extract/` (ignorée par git).

---

## 3. Tests exécutés dans cette passe

| Test | Résultat |
|---|---|
| `npm run typecheck` | OK |
| `npm run lint` | OK (0 erreur, 1 warning font Next non bloquant) |
| `npm run build` (production, PGlite) | OK |
| `npm run test` (smoke PGlite) | 19 succès / 0 échec |
| Import CSV réel | 138 créées / 4 doublons |
| Import XLS réel | 138 maj / 4 doublons |
| Recherche `7703800107` / `8200651172` | OK, même pièce id 5 |
| Pages HTML en production | 12/12 → 200 |
| APIs production | health, parts, search, movements, sales, export → 200 |
| Export XLSX stock | OK, fichier généré (92 Ko) |
| Vente V-00001 | OK (total 805, stock 20 → 19) |
| Retour après vente | OK : stock 19 → 20 et `soldQuantity` 1 → 0 (bug corrigé) |
| PDF OCR 20 pages | OK : 199 lignes, 52 candidats méritant revue |

### Bug supplémentaire corrigé
- **`retour` ne décrémentait pas `soldQuantity`**.
  - `applyStockChange()` : `retour` → `soldQuantity = max(0, soldNow - qty)`.
  - `recomputePartStock()` : `soldQuantity = max(0, Σventes - Σretours)`.
  - Vérifié en prod locale : vente 1 → `soldQuantity=1` ; retour 1 →
    `soldQuantity=0`, stock restauré à 20.

---

## 4. Fonctionnalités déjà opérationnelles

- Mouvements de stock : `entree`, `sortie`, `retour`, `ajustement_pos`,
  `ajustement_neg`, `vente` ; audit tracé, refus stock négatif par défaut.
- Ventes : `POST /api/sales`, lignes mise en lien avec mouvements, totaux DZD.
- Import : CSV direct (`/api/import/csv`) et assistant Excel multi-étapes.
- Export Excel : stock, catalogue, faibles, ruptures, ventes, mouvements.
- Images : une image canonique par pièce (`images.part_id` unique).
- Authentification optionnelle : admin / employé, cookies HMAC, `requireAuth`
  pour les ventes, `requireAdmin` pour mutations sensibles.
- Recherche par normalisation de références, `referenceRaw` conservé.
- Tables vehicules/compatibilités existent mais **aucune donnée inventée**.

---

## 5. Données non commitées (à ne pas pousser)

- `data/*.csv`, `data/*.xls`, `data/*.pdf` : fichiers client sensibles, ignorés.
- `data/pdf-extract/` : volumineux (5,2 Mo), ignoré.
- Aucun de ces fichiers ne doit être ajouté au dépôt.

---

## 6. Problèmes restants

1. **Déploiement**: aucun token Vercel, réseau sortant Vercel bloqué, aucune base
   managée fournie → aucune URL de production réelle.
2. **4 doublons CSV/XLS à trancher manuellement** (deux paires en conflit) :
   `.DG343`/`DG343` et `.7701464165`/`7701464165`.
3. **Images PDF** : aucune association automatique ; il faut calibrer les zones de
   découpe et confirmer ligne par ligne. 52 candidats en revue.
4. **PGlite mono-processus** : la démo locale ne doit pas être ouverte par deux
   processus sur le même répertoire en même temps. Production → PostgreSQL managé.

---

## 7. NEXT EXACT STEP (handoff immédiat)

1. **Obtenir un moyen de déploiement réel** (priorité absolue) :
   - soit `VERCEL_TOKEN` + brancher Vercel au dépôt GitHub,
   - soit une base PostgreSQL managée + un hôte serverless accessible.
2. Déployer `arena/01a076c2-gskd` (ou `main`) avec les variables env du §1.
3. Après déploiement, vérifier publiquement :
   - `https://<domaine>/api/health` → `{"ok":true}`,
   - `https://<domaine>/api/parts?perPage=1` → `total=138`,
   - `https://<domaine>/api/search?q=7703800107` et `?q=8200651172` → id 5.
4. Troncher les 2 paires de doublons avec le client, puis relancer l'import dans
   la base de production.
5. Calibrer `scripts/extract-pdf-catalogue.ts` (zones photo) et confirmer les
   images manuellement ; n'associer aucune image sans confirmation.
6. Mettre à jour ce fichier avec le nouveau commit et le domaine de production.

---

## 8. Commandes utiles

```bash
# Imports / validation
DATABASE_URL=pglite:///tmp/autostock-real npm run db:setup
DATABASE_URL=pglite:///tmp/autostock-real npm run data:load -- --file=Liste-des-Articles
DATABASE_URL=pglite:///tmp/autostock-real npm run data:load -- --file="Liste des Articles" # XLS
DATABASE_URL=pglite:///tmp/autostock-real npm run pdf:extract -- "data/ArticlePVPhoto.pdf 13 06 2026.pdf" --out=data/pdf-extract

# Tests / build
npm run typecheck
npm run lint
npm run test
npm run build
```
