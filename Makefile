COMPOSE_FILE := docker-compose.local-postgres.yml
PYTHON := ./.venv/bin/python

.PHONY: db-up db-down db-reset db-setup db-inspect db-status

db-up:
	docker compose -f $(COMPOSE_FILE) up -d --wait

db-down:
	docker compose -f $(COMPOSE_FILE) down

db-reset:
	docker compose -f $(COMPOSE_FILE) down -v
	docker compose -f $(COMPOSE_FILE) up -d --wait
	$(PYTHON) backend/src/db/scripts/setup_database.py

db-setup:
	$(PYTHON) backend/src/db/scripts/setup_database.py

db-inspect:
	$(PYTHON) backend/src/db/scripts/inspect_database.py

db-status:
	docker compose -f $(COMPOSE_FILE) ps
