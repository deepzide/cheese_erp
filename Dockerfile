ARG FRAPPE_BRANCH=version-15
ARG APP_BRANCH=main

FROM ghcr.io/deepzide/cheese-base:${FRAPPE_BRANCH} AS builder

USER frappe
WORKDIR /home/frappe/frappe-bench

RUN --mount=type=secret,id=CHEESE_ERP_URL,uid=1000 \
    bench get-app --branch "${APP_BRANCH}" "$(cat /run/secrets/CHEESE_ERP_URL)" && \
    find apps -mindepth 1 -path "*/.git" | xargs rm -fr

RUN cd apps/cheese/frontend && npm ci && npm run build

RUN bench build --app cheese

FROM frappe/base:${FRAPPE_BRANCH} AS backend

USER frappe

COPY --from=builder --chown=frappe:frappe /home/frappe/frappe-bench /home/frappe/frappe-bench

WORKDIR /home/frappe/frappe-bench

VOLUME [ \
  "/home/frappe/frappe-bench/sites", \
  "/home/frappe/frappe-bench/sites/assets", \
  "/home/frappe/frappe-bench/logs" \
]

CMD [ \
  "/home/frappe/frappe-bench/env/bin/gunicorn", \
  "--chdir=/home/frappe/frappe-bench/sites", \
  "--bind=0.0.0.0:8000", \
  "--threads=4", \
  "--workers=2", \
  "--worker-class=gthread", \
  "--worker-tmp-dir=/dev/shm", \
  "--timeout=120", \
  "--preload", \
  "frappe.app:application" \
]
