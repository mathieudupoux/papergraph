#!/usr/bin/env bash

set -e

# 1. Format de date : 2026.04.07 1432
DATE_COMMIT=$(date +"%Y.%m.%d %H%M")

echo "🌿 Synchronisation de la branche de déploiement ($DATE_COMMIT)..."

# 2. On s'assure d'être propre sur main
git checkout main

# 3. On prépare la branche gh-pages
# Si elle n'existe pas localement, on la récupère ou on la crée
if ! git rev-parse --verify gh-pages >/dev/null 2>&1; then
    git checkout -b gh-pages
else
    git checkout gh-pages
fi

# 4. On FUSIONNE main dans gh-pages (On garde tout ton code source !)
git merge main --no-edit

# 5. On lance le build
npm install
npm run build

# 6. ÉTAPE CRUCIALE : On sort les fichiers du dossier 'dist' pour les mettre à la racine
# car GitHub Pages cherche l'index.html à la racine, pas dans /dist
cp -r dist/* .

# 7. On commit le build par-dessus le code
git add .
git commit -m "📦 Build: $DATE_COMMIT"

# 8. On push
git push origin gh-pages

# 9. On revient sur main pour continuer à bosser
git checkout main

echo "✅ Déploiement terminé ! Ton code ET ton build sont sur gh-pages."