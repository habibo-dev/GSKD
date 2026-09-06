# Audit du projet AutoStock

Date d'audit : 2026-09-06 (branche `arena/01a076c2-gskd`)
Branche de travail : `arena/01a076c2-gskd` (commit `4e074874`)
Stack : Next.js 16 (App Router) + React 19 + TypeScript + PostgreSQL + Drizzle ORM + Tailwind CSS + `xlsx` (import/export Excel) + `tesseract.js` (OCR local).

---

## 0. État des fichiers réels fournis

**Les deux fichiers de référence n'étaient PAS présents dans le workspace / le dépôt GitHub au moment de l'audit :**

- `Liste des Articles samedi 11-04-2026.xls`
- `ArticlePVPhoto 10 04 2026.pdf`

Recherchés dans :
- `/home/user/GSKD`
- `/home/user` (tous fichiers)
- Dépôt GitHub `habibo-dev/GSKD` (via `gh api`)
- Référence déployée `https://3000-ita3p5omnacoc4x0gls0a.e2b.app` (injoignable / SSL refusé)

Conséquence : l'ingestion réelle des 142 produits du PDF et l'import initial de l'inventaire Excel ne peuvent **pas encore** être exécutés. Le code qui les prend en charge existe / a été renforcé, mais les tests 1 à 4 et 7 à 10 restent à exécuter dès que les fichiers sont fournis.

---

## A. Ce qui fonctionne déjà (existant) ✅

Un socle fonctionnel très large est déjà présent. Bonne nouvelle : il n'y a **pas** besoin de repartir de zéro.

### Architecture / base de données
- Tables PostgreSQL gérées via Drizzle :
  `users`, `settings`, `brands`, `categories`, `suppliers`, `parts`, `part_references`, `images`, `sales`, `sale_items`, `stock_movements`, `import_batches`, `vehicles`, `compatibilities`.
- `parts.reference` + table `part_references` pour les **références multiples / alternatives** (`7703800107 / 8200651172`).
- `reference_raw` conserve la **valeur brute d'origine** sans la détruire.
- `images` : **une image canonique par produit** (`part_id` unique), réutilisée partout.
- `stock_movements` : modèle de mouvement **audité** (jusqu'à maintenant : entrée, vente, retour, ajustement ± ; `sortie` ajouté dans cette passe).
- `sales` + `sale_items` : ventes avec total, type de prix (`gros` / `detail`), quantité, lignes figées pour l'historique.
- `vehicles` + `compatibilities` : structure prête pour la compatibilité, sans données inventées.

### Import / Export Excel
- Import multi-étapes avec `xlsx` :
  upload → analyse feuilles/colonnes → mapping (détection automatique par alias) → aperçu → validation (référence manquante, doublons fichier, existant en base, quantités/prix invalides) → upsert intelligent.
- Un import existant **met à jour** les prix / désignation / marque / rayon, ajoute les nouvelles références alternatives et trace tout écart de quantité par un ajustement.
- Export Excel : stock, catalogue, stock faible, ruptures, ventes, mouvements.

### Fonctionnalités métier
- Tableau de bord avec **valeurs réelles** depuis la base (références, quantités, disponibles, stock faible, ruptures, ventes du jour, CA, valeur stock).
- Recherche rapide (topbar) + page Recherche : référence, référence alternative, désignation, marque, catégorie, rayon.
- Catalogue public / client.
- Ventes (module rapide) → réduit le stock, crée la vente + les lignes + les mouvements `vente`.
- Entrée / retour / ajustement via dialogues.
- Fiche produit avec image, références, prix, stock, historique, compatibilité.
- Rapports (ventes par jour, top ventes, valeur stock).
- Paramètres (nom entreprise, devise DA, stock minimum par défaut, stock négatif, utilisateur par défaut, prix du catalogue).

### Qualité technique
- `npm run typecheck` : ✅ passe.
- `npm run build` : ✅ passe.
- `npm run lint` : ✅ passe (0 erreur, 1 warning de police dans `layout.tsx`).

---

## B. Ce qui est fake / démo ⚠️

- `src/db/seed.ts` insère **des données de démonstration** (uniquement si la table `parts` est vide). Ces données sont inévitables pour démarrer une base vide, mais **elles ne doivent pas rester la source de vérité** du client.
- L'import de réel inventaire doit être la **première** opération sur une base réelle.
- Le PDF du catalogue n'est pas encore exploité comme bibliothèque d'images.

---

## C. Ce qui est branché sur une vraie base de données ✅

Toutes les pages/API principales :
- `/`, `/pieces`, `/stock`, `/ventes`, `/mouvements`, `/rapports`, `/catalogue`, `/import-export`, `/vehicules`, `/compatibilite`, `/parametres`, `/pieces/[id]`.
- API : `/api/parts`, `/api/parts/[id]`, `/api/search`, `/api/sales`, `/api/movements`, `/api/import/*`, `/api/export`, `/api/settings`, `/api/vehicles`, `/api/compatibilities`, `/api/meta`, `/api/health`, `/api/admin/reset`.

---

## D. Ce qui manque / à compléter 🔲

### 1. Bloqués par les fichiers réels (HAUTE priorité)
- Import initial du vrai **`.xls`** d'inventaire.
- Association des **142 produits du PDF** avec leurs **photos réelles** (extraction + rattachement canonique).
- Alimentation des champs `marque`, `prix gros`, `prix détail`, `quantité`, `rayon` depuis la vraie source.
- Tester « 7703800107 / 8200651172 » comme **une seule pièce recherchable par l'une ou l'autre référence**.
- AUCUNE données de compatibilité véhicule ne doit être inventée ; il n'y en a pas dans les fichiers fournis (à confirmer).

### 2. Ajouté / renforcé dans cette passe (pipeline « sortie » + recherche)
- ✅ Nouveau type de mouvement **`SORTIE`** (sortie de magasin, distincte de la vente) :
  - `src/lib/movements.ts`, `src/lib/format.ts`, `src/lib/export.ts`, `/api/movements`, badge UI, bouton « Sortie » sur Stock et fiche produit.
- ✅ Recherche **compatibilité véhicule** (`Clio`, `1.5 dCi`, `Peugeot`, etc.) via `compatibilities`/`vehicles`.
- ✅ Normalisation des références (`normReference`) pour comparer `7703800107` vs `.7703800107`, espaces, tirets, slash.
- ✅ Import : les doublons / existants sont désormais comparés sur la référence **normalisée** (plus robuste face aux points de tête, espaces, casse).

### 3. À faire dès que les fichiers sont fournis (et tester)
- Pipeline PDF → images : extraire la grille `N° / Référence / Désignation / Prix Vente / Photo / Marque`, cropper la photo, associer par référence à la pièce, marquer les lignes non identifiées pour revue manuelle (jamais d'association aléatoire).
- Écran d'import PDF avec **revue manuelle** avant écriture.
- Import initial Excel depuis le vrai fichier (ou fichier normalisé) sans doublons.
- Tests d'acceptation complets (voir section 24 du cahier des charges).

---

## E. Ce qui peut être réutilisé 🔁

- Le modèle `parts` / `part_references` / `images` (canonical image) est **exactement** la bonne architecture.
- `applyStockChange()` transactionnel avec verrouillage (`FOR UPDATE`) est solide.
- Le wizard d'import Excel existant est très bon ; on l'étend plutôt qu'on le réécrit.
- La gestion d'image existante (upload / suppression / URL via `/api/images/parts/...`) est réutilisable pour les images extraites du PDF (il suffit de copier les fichiers dans `uploads/parts` et lier via `images`).
- UI française existante, cohérente et rapide.

---

## F. Ce qui mérite un refactoring 🔧

- `src/components/app-shell.tsx` : recherche globale et fermeture menu mobile — les `setState` synchrones dans les `useEffect` ont été réduits (répartition des résultats visibles dérivée de la requête ; fermeture du menu sur clic de lien).
- `src/components/sale-form.tsx` / `compat-manager.tsx` : recherche débouncée restructurée pour respecter les règles React (`set-state-in-effect`).
- `src/lib/queries.ts` : la recherche texte est un gros `OR` SQL ; acceptable pour une petite/moyenne base, à indexer si la base dépasse quelques dizaines de milliers de lignes.
- `seed.ts` : conserver uniquement pour une base vide / démo, jamais comme source réelle.

---

## G. Ce qui doit être complètement implémenté 🆕

1. **Extraction d'images depuis le PDF fourni** (bloqué par l'absence du fichier).
2. **Revue / correction manuelle des images** (export de la liste de correspondances non confirmées).
3. **Import initial réel** (bloqué par l'absence du `.xls`).
4. **Éventuellement un rôle / permission Admin vs Employé** : actuellement il n'y a pas d'authentification métier ; une simple sélection « effectué par » sert d'audit. À faire si le client veut une sécurité multi-utilisateurs.
5. **Traitement des cas d'erreur** côté import PDF / OCR.

---

## Statut des validations

| Vérification | Résultat |
|---|---|
| `npm install` | ✅ |
| `npm run typecheck` | ✅ |
| `npm run build` | ✅ |
| `npm run lint` | ✅ (0 erreur) |
| Base de données locale disponible dans le sandbox | ❌ (pas de PostgreSQL lancé ici ; `DATABASE_URL` absent) |
| Fichiers `.xls` / `.pdf` réels présents | ❌ |
| Import réel Excel | ⏳ à exécuter |
| Extraction images du PDF | ⏳ à exécuter |
| Tests d'acceptation 1–10 | ⏳ à exécuter |

---

## Prochaines actions recommandées (dès que les 2 fichiers sont mis à disposition)

1. Déposer les fichiers dans `/home/user/GSKD/data/` (ou les joindre au chat).
2. Exécuter l'import réel `.xls` (workflow Import / Export déjà en place).
3. Exécuter l'extraction PDF (à brancher sur les 18 pages / 142 produits) avec revue manuelle des correspondances.
4. Vérifier `7703800107` et `8200651172` → même pièce.
5. Lancer les 10 tests d'acceptation.
