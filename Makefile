COMPOSE_FILE := docker-compose.local-postgres.yml
PYTHON := ./.venv/bin/python

.PHONY: db-up db-down db-reset db-setup db-inspect db-status

# PostgreSQL database Dockertargets
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

# Backend Docker targets
backend-build:
	docker compose -f $(COMPOSE_FILE) -f docker-compose.backend-local.yml build

backend-up:
	docker compose -f $(COMPOSE_FILE) -f docker-compose.backend-local.yml up -d

backend-down:
	docker compose -f $(COMPOSE_FILE) -f docker-compose.backend-local.yml down

backend-logs:
	docker compose -f $(COMPOSE_FILE) -f docker-compose.backend-local.yml logs -f backend
