ARG FRAPPE_BRANCH=version-15

FROM ghcr.io/deepzide/cheese-base:${FRAPPE_BRANCH} AS builder

COPY --chown=frappe:frappe . /home/frappe/frappe-bench/apps/cheese

USER frappe
WORKDIR /home/frappe/frappe-bench

RUN cd apps/cheese \
    && /home/frappe/frappe-bench/env/bin/pip install --no-deps -e .

RUN echo "cheese" >> sites/apps.txt

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
