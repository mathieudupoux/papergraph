#!/usr/bin/env bash

set -e

# 1. Versions de build / commit
BUILD_VERSION=$(date +"%yw%V.%u")
DATE_COMMIT=$(date +"%Y.%m.%d %H%M")
LAST_UPDATE=$(date +"%B %-d, %Y")
FOOTER_FILES=("footer.html" "landing-footer.html")

update_footer_metadata() {
  local footer_version="v$1"

  for footer_file in "${FOOTER_FILES[@]}"; do
    if [[ ! -f "$footer_file" ]]; then
      echo "❌ Impossible de mettre à jour le footer: $footer_file introuvable"
      exit 1
    fi

    sed -i -E "s|(<span class=\"app-version\">)[^<]*(</span>)|\1${footer_version}\2|" "$footer_file"
    sed -i -E "s|(<span class=\"footer-date\">Last update: )[^<]*(</span>)|\1${LAST_UPDATE}\2|" "$footer_file"
  done
}

commit_footer_version_on_main() {
  git add "${FOOTER_FILES[@]}"
  git commit -m "📝 Footer version: v$BUILD_VERSION" || echo "Pas de changement de version à committer sur main"
}

echo "🚀 Préparation du déploiement propre ($DATE_COMMIT | $BUILD_VERSION)..."

# 2. On se place sur main et on commit la version affichée dans le footer
git checkout main
update_footer_metadata "$BUILD_VERSION"
commit_footer_version_on_main

# 4. On pousse main pour garder l'historique source aligné avec le déploiement
git push origin main

# 3. On s'assure d'avoir les dernières dépendances puis on build le projet
npm install
npm run build



# 5. On bascule sur gh-pages
git checkout gh-pages

# 6. ÉTAPE CLÉ : On réinitialise gh-pages pour qu'elle soit EXACTEMENT comme main
# Cela supprime les vieux fichiers de build qui font planter Vite
git reset --hard main

# 7. On déploie le build à la racine
# Vite a tout mis dans /dist. On copie le contenu à la racine.
cp -r dist/* .
rm -rf dist

# 8. On commit tout (Code source + Build frais)
git add .
# On ignore l'erreur si rien n'a changé
git commit -m "📦 Build: $BUILD_VERSION ($DATE_COMMIT)" || echo "Pas de changements à committer"

# 9. On pousse en force pour écraser les résidus sur GitHub
git push origin gh-pages --force

# 10. On revient sur main
git checkout main

echo "✅ Terminé ! papergraph.net est à jour."
