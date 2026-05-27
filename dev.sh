#!/usr/bin/env bash
# cheese_erp — Local development helper
# Usage: ./dev.sh [up|down|restart|site|demo|clear-demo|logs|login]

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
    echo ">>> Running migrations..."
    $COMPOSE exec -T backend bench --site frontend migrate
    echo ">>> Clearing cache..."
    $COMPOSE exec -T backend bench --site frontend clear-cache
    $COMPOSE exec -T backend bench --site frontend clear-website-cache
    echo ""
    echo "=============================================="
    echo "  Ready! Open http://localhost:8080"
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
    curl -s -X POST http://localhost:8080/api/method/login \
      -H "Content-Type: application/json" \
      -d '{"usr":"Administrator","pwd":"admin"}' | python3 -m json.tool 2>/dev/null || \
    curl -s -X POST http://localhost:8080/api/method/login \
      -H "Content-Type: application/json" \
      -d '{"usr":"Administrator","pwd":"admin"}'
    ;;

  *)
    echo "Usage: ./dev.sh [up|down|restart|site|demo|clear-demo|logs|login]"
    exit 1
    ;;
esac
