# Review — Données réelles du client (finalisation)

Date : 2026-09-06
Base de validation : `data/Liste-des-Articles-samedi-11-04-2026-.csv` + `data/Liste des Articles samedi 11-04-2026 .xls` + `data/ArticlePVPhoto.pdf 13 06 2026.pdf`

## 1. Inventaire CSV / XLS

- Fichiers présents localement dans `data/` (non commités : données client sensibles, ignorées par `.gitignore`).
- CSV : 142 lignes, 0 référence vide, 0 désignation vide, 0 quantité invalide.
- XLS : même contenu (142 lignes), mêmes colonnes (`Référence`, `Désignation`, `Marque`, `Quantité`, `Prix d'Achat`, `Prix Gros`, `Prix Détail`, `UM`, `Rayon`).
- Import du CSV réel : **138 pièces créées**, 0 mise à jour, **4 doublons détectés**, 0 invalide.
- Les 4 doublons sont deux paires de lignes qui partagent la même référence normalisée mais ont des données différentes. Pour ne pas « choisir silencieusement » une ligne, **aucune des deux lignes de chaque paire n'a été importée**. Elles doivent être tranchées manuellement.

### Paires en conflit à réviser (NEEDS_REVIEW)

| Ligne CSV | Référence brute | Désignation | Marque | Qté | PA | PG | PD |
|---|---|---|---|---|---|---|---|
| 9 | `.DG343` | ROULMONT BAGUE VOLANT REN/PGT TT | CHINA | 7 | 500 | 650 | 700 |
| 10 | `DG343` | ROULMONT BAGUE VOLANT REN/PGT TT | TAIBA CHINA | 20 | 550 | 700 | 770 |
| 47 | `.7701464165` | CABLE MARCHE ARR EXP | CHINA | 20 | 70 | 100 | 98 |
| 48 | `7701464165` | CABLE MARCHE ARR EXP | TAIBA CHINA | 240 | 75 | 100 | 105 |

## 2. Références multiples

- 16 lignes du fichier contiennent plusieurs références (séparées par `/`, `;`, `,`…).
- Exemple central :
  - CSV/XLS ligne 6 : `7703800107 /8200651172`
  - Désignation : `ROULEMENT TASSEAU CLIO2 KANGO SYMBOL`
  - Marque : `TAIBA CHINA`
  - Quantité : 20, PA 575, PG 700, PD 805
- Importé comme **une seule pièce** : id **5**, référence primaire `7703800107`, `referenceRaw = "7703800107 /8200651172"`.
- Recherche vérifiée :
  - `/api/search?q=7703800107` → id 5
  - `/api/search?q=8200651172` → id 5

## 3. PDF réel

- Fichier : `data/ArticlePVPhoto.pdf 13 06 2026.pdf` (1.8 Mo, 20 pages).
- Pipeline exécuté :
  ```bash
  npx tsx scripts/extract-pdf-catalogue.ts "data/ArticlePVPhoto.pdf 13 06 2026.pdf" --out=data/pdf-extract
  ```
- Résultat brut : **199 lignes OCR**, toutes marquées `manual_review` / `NEEDS_REVIEW`.
- **52 lignes OCR** contiennent une référence candidate qui existe dans l'inventaire importé.
- Exemple important :
  - page 1, ligne 5, référence OCR brut `|7703800107`
  - image : `data/pdf-extract/products/page-01/row-05.png`
  - statut : `manual_review`
- **Aucune image n'a été liée automatiquement.**
  L'OCR est bruité (ex. `|7703800107`, `|M255.04`, `162366S/7700838242`) et les recadrages actuels couvrent parfois deux cellules produit. Un lien automatique serait un choix arbitraire → interdit.

## 4. Recommandation pour les images

1. Ouvrir `data/pdf-extract/products/page-XX/row-YY.png` et la page correspondante `data/pdf-extract/pages/page-XX.png`.
2. Calibrer `--photo-x`, `--photo-w`, et la hauteur de découpe pour isoler **une cellule produit** par image.
3. Confirmer la relation `référence → image` ligne par ligne.
4. Copier uniquement les images confirmées dans `uploads/parts/`.
5. Lier via la table `images` (une image canonique par pièce).

Toute image non confirmée reste `NEEDS_REVIEW`. Aucune image inventée, aucune compatibilité inventée.

## 5. Fichiers de sortie locale (non commités)

- `data/pdf-extract/products/matches.json`
- `data/pdf-extract/products/matches.csv`
- `data/pdf-extract/pages/page-XX.png`
- `data/pdf-extract/products/page-XX/row-YY.png`

Le dossier `data/pdf-extract/` est ajouté à `.gitignore` (volumes générés, 5.2 Mo).
