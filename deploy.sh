#!/usr/bin/env bash

set -e

# 1. Date pour le message de commit
DATE_COMMIT=$(date +"%Y.%m.%d %H%M")

echo "🚀 Préparation du déploiement propre ($DATE_COMMIT)..."

# 2. On s'assure d'être sur main et d'avoir les dernières dépendances
git checkout main
npm install

# 3. On build le projet
npm run build

# 4. On bascule sur gh-pages
git checkout gh-pages

# 5. ÉTAPE CLÉ : On réinitialise gh-pages pour qu'elle soit EXACTEMENT comme main
# Cela supprime les vieux fichiers de build qui font planter Vite
git reset --hard main

# 6. On déploie le build à la racine
# Vite a tout mis dans /dist. On copie le contenu à la racine.
cp -r dist/* .
rm -rf dist

# 7. On commit tout (Code source + Build frais)
git add .
# On ignore l'erreur si rien n'a changé
git commit -m "📦 Build: $DATE_COMMIT" || echo "Pas de changements à committer"

# 8. On pousse en force pour écraser les résidus sur GitHub
git push origin gh-pages --force

# 9. On revient sur main
git checkout main

echo "✅ Terminé ! papergraph.net est à jour."