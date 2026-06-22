#!/usr/bin/env bash
# cheese_erp — Local development helper
# Usage: ./dev.sh [up|down|restart|site|demo|clear-demo|logs|login|build-frontend|sync-assets]

set -euo pipefail
cd "$(dirname "$0")"

cmd="${1:-up}"
COMPOSE="docker compose"

case "$cmd" in
  up)
    echo ">>> Pulling images..."
    $COMPOSE pull
    echo ">>> Starting stack..."
    $COMPOSE up -d
    echo ">>> Waiting for backend..."
    for i in $(seq 1 60); do
      if $COMPOSE exec -T backend bench --version >/dev/null 2>&1; then break; fi
      sleep 5
    done
    echo ">>> Checking site..."
    if ! $COMPOSE exec -T backend bash -c '[ -d sites/frontend ]' 2>/dev/null; then
      echo ">>> Creating site..."
      $COMPOSE run --rm create-site
    fi
    echo ">>> Installing/Updating frappe_helpers..."
    $COMPOSE exec -T backend pip install -e apps/frappe_helpers
    if ! $COMPOSE exec -T backend bench --site frontend list-apps 2>/dev/null | grep -q "frappe_helpers"; then
      echo ">>> Installing frappe_helpers app onto site frontend..."
      $COMPOSE exec -T backend bench --site frontend install-app frappe_helpers
    fi
    echo ">>> Running migrations..."
    $COMPOSE exec -T backend bench --site frontend migrate
    echo ">>> Clearing cache..."
    $COMPOSE exec -T backend bench --site frontend clear-cache
    $COMPOSE exec -T backend bench --site frontend clear-website-cache
    echo ""
    echo "=============================================="
    echo "  Ready! Open http://localhost:8090"
    echo "  Login: Administrator / admin"
    echo "=============================================="
    ;;

  down)
    $COMPOSE down
    ;;

  restart)
    echo ">>> Restarting backend + workers..."
    $COMPOSE restart backend scheduler queue-short queue-long
    echo ">>> Clearing cache..."
    $COMPOSE exec -T backend bench --site frontend clear-cache 2>/dev/null || true
    echo ">>> Done. Changes should be reflected."
    ;;

  site)
    echo ">>> Checking site..."
    if ! $COMPOSE exec -T backend bash -c '[ -d sites/frontend ]' 2>/dev/null; then
      echo ">>> Creating site..."
      $COMPOSE run --rm create-site
    else
      echo "Site frontend already exists."
    fi
    ;;

  demo)
    echo ">>> Loading demo data..."
    $COMPOSE exec -T backend bench --site frontend execute cheese.demo.setup_demo_data
    ;;

  clear-demo)
    echo ">>> Clearing demo data..."
    $COMPOSE exec -T backend bench --site frontend execute cheese.demo.clear_demo_data
    ;;

  logs)
    shift 2>/dev/null || true
    $COMPOSE logs -f --tail=100 ${@:-backend}
    ;;

  login)
    echo ">>> Testing login..."
    curl -s -X POST http://localhost:8090/api/method/login \
      -H "Content-Type: application/json" \
      -d '{"usr":"Administrator","pwd":"admin"}' | python3 -m json.tool 2>/dev/null || \
    curl -s -X POST http://localhost:8090/api/method/login \
      -H "Content-Type: application/json" \
      -d '{"usr":"Administrator","pwd":"admin"}'
    ;;

  build-frontend)
    echo ">>> Installing npm dependencies..."
    $COMPOSE exec -T backend bash -c "cd apps/cheese/frontend && npm install"
    echo ">>> Building frontend..."
    $COMPOSE exec -T backend bash -c "cd apps/cheese/frontend && npm run build"
    echo ">>> Copying build output to public/..."
    $COMPOSE exec -T backend bash -c "cd apps/cheese && mkdir -p public/frontend/assets www && cp -r frontend/dist/assets/* public/frontend/assets/ && cp frontend/dist/index.html public/frontend/index.html && cp frontend/dist/index.html www/cheese.html"
    echo ">>> Running bench build..."
    $COMPOSE exec -T backend bench build --app cheese
    echo ">>> Syncing assets to sites-assets volume..."
    ASSET_DIR=$(mktemp -d)
    docker cp cheese_erp-backend-1:/home/frappe/frappe-bench/apps/cheese/public/frontend/ "$ASSET_DIR/frontend"
    docker cp cheese_erp-backend-1:/home/frappe/frappe-bench/apps/cheese/cheese/www/cheese.html "$ASSET_DIR/cheese.html" 2>/dev/null || true
    docker run --rm --user root \
      -v cheese_erp_sites-assets:/target \
      -v "$ASSET_DIR":/src \
      alpine sh -c '
        rm -rf /target/cheese/frontend
        mkdir -p /target/cheese/frontend
        cp -a /src/frontend/. /target/cheese/frontend/
        chown -R 1000:1000 /target/cheese/frontend/
        echo "Synced $(ls /target/cheese/frontend/assets/ | wc -l) asset files"
      '
    rm -rf "$ASSET_DIR"
    echo ">>> Restarting frontend..."
    $COMPOSE restart frontend
    echo ">>> Done! Frontend rebuilt."
    ;;

  sync-assets)
    echo ">>> Syncing cheese assets to sites-assets volume..."
    ASSET_DIR=$(mktemp -d)
    docker cp cheese_erp-backend-1:/home/frappe/frappe-bench/apps/cheese/public/frontend/ "$ASSET_DIR/frontend" 2>/dev/null || true
    if [ ! -d "$ASSET_DIR/frontend/assets" ]; then
      echo "No assets found in public/frontend/assets/"
      rm -rf "$ASSET_DIR"
      exit 1
    fi
    docker run --rm --user root \
      -v cheese_erp_sites-assets:/target \
      -v "$ASSET_DIR":/src \
      alpine sh -c '
        rm -rf /target/cheese/frontend
        mkdir -p /target/cheese/frontend
        cp -a /src/frontend/. /target/cheese/frontend/
        chown -R 1000:1000 /target/cheese/frontend/
        echo "Synced $(ls /target/cheese/frontend/assets/ | wc -l) asset files"
      '
    rm -rf "$ASSET_DIR"
    $COMPOSE restart frontend
    echo ">>> Done!"
    ;;

  *)
    echo "Usage: ./dev.sh [up|down|restart|site|demo|clear-demo|logs|login|build-frontend|sync-assets]"
    exit 1
    ;;
esac
