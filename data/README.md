# Données réelles du client

Placez ici les fichiers de référence fournis par le client :

- `Liste-des-Articles-samedi-11-04-2026-.csv`  (inventaire CSV)
- `ArticlePVPhoto.pdf 13 06 2026.pdf`          (catalogue prix + photos)

Ces fichiers sont exclus du dépôt Git (voir `.gitignore`) car ce sont des données
clients et des volumes binaires. Ils ne sont jamais commités.

## Usage CLI

Au démarrage de la base, exécuter :

```bash
DATABASE_URL=postgres://user:pass@host/db npm run data:load
# ou avec PGlite (uniquement en démo locale, un seul processus à la fois)
DATABASE_URL=pglite://./data/autostock.db npm run data:load
```

Le script `scripts/load-client-data.ts` lit tous les `.csv / .xlsx / .xls`
de `data/`, applique le même pipeline que l'application (mapping automatique,
détection de doublons, références alternatives, réconciliation de stock tracée)
et affiche un bilan.

## Usage application

`Import / Export` → Import Excel permet aussi de charger les fichiers via
l'interface, avec validation et choix de stratégie (mise à jour / ignorer).

## Export PDF / photos

```bash
DATABASE_URL=... npm run pdf:extract -- "data/ArticlePVPhoto.pdf 13 06 2026.pdf"
```

Le pipeline est volontairement conservateur : chaque produit extrait est marqué
`manual_review` (`NEEDS_REVIEW`) — aucune image n'est associée automatiquement
sans confirmation manuelle.
