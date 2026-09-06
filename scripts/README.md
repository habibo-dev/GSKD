# Extraction du catalogue PDF (produits + photos)

## Principe

Le script `extract-pdf-catalogue.ts` est volontairement prudent :

1. Rend chaque page du PDF en PNG (`pdfjs-dist` + `@napi-rs/canvas`).
2. Reconnaît le texte avec OCR local (`tesseract.js`) pour reconstituer les lignes
   `N° / Référence / Désignation / Prix / Marque`.
3. Découpe la zone « Photo » selon une position configurable.
4. Écrit un **répertoire de revue** et un fichier `matches.csv` / `matches.json`
   avec le statut `manual_review` : aucune image n'est associée automatiquement
   à une pièce de façon définitive.

## Usage

```bash
# Copier le PDF dans data/
# puis lancer depuis la racine du projet :
npm run pdf:extract -- data/ArticlePVPhoto.pdf --out=data/pdf-extract
```

Options utiles :

| Option | Défaut | Description |
|---|---|---|
| `--scale=2` | `2` | Résolution de rendu des pages |
| `--photo-x=0.79` | `0.79` | Position horizontale de la zone photo (0..1 de la largeur de page) |
| `--photo-w=0.13` | `0.13` | Largeur de la zone photo |
| `--row-tolerance=0.012` | `0.012` | Tolérance pour regrouper les mots d'une même ligne |
| `--max-pages=18` | `0` (toutes) | Limiter le nombre de pages |
| `--no-ocr` | `false` | Ne pas lancer l'OCR (utile pour un premier diagnostic rapide) |

## Calibration sur le vrai PDF

Avant de confirmer une extraction, il faut regarder une page rendue dans
`data/pdf-extract/pages/page-01.png` et ajuster `--photo-x` / `--photo-w`
afin que le rectangle de découpe tombe bien sur la photo du produit.

Une fois les correspondances vérifiées dans `products/matches.csv`, on pourra :

- copier les images confirmées dans `uploads/parts/`,
- lier chaque image à la pièce via la table `images` (une image canonique par produit),
- créer un écran d'import de catalogue avec revue manuelle dans l'application.
