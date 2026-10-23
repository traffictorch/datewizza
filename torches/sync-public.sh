#!/bin/zsh
cd "$(dirname "$0")"
rm -rf dev-public
mkdir -p dev-public
cd dev-public

for f in style.css tailwind-local.css main.js profile-message.js push-client.js \
         pwa-dock.js pwa-dock.css sw.js messages.js profile.html footer.html torch.html favicon.ico manifest.json \
         desktop-menu.html mobile-menu.html footer.html \
         logo-100w.webp logo-160w.webp logo-320w.webp logo-512w.webp logo-512.webp logo-192.webp; do
  cp "../../$f" . 2>/dev/null
done

ln -s ../../images images
ln -s ../../shared shared

echo "dev-public rebuilt."
