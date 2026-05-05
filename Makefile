COMPOSE_DB := docker-compose.local-postgres.yml
COMPOSE_BACKEND := docker-compose.backend-local.yml

DC_DB := docker compose -f $(COMPOSE_DB)
DC_ALL := docker compose -f $(COMPOSE_DB) -f $(COMPOSE_BACKEND)

.PHONY: db-up db-down db-inspect db-logs db-reset
.PHONY: backend-build backend-up backend-down backend-logs
.PHONY: up down reset

# Database
db-up:
	$(DC_DB) up -d --wait

db-down:
	$(DC_DB) down

db-inspect:
	$(DC_DB) ps

db-logs:
	$(DC_DB) logs -f

db-reset:
	$(DC_DB) down -v
	$(DC_DB) up -d --wait

# Backend
backend-build:
	$(DC_ALL) build backend

backend-up:
	$(DC_ALL) up -d backend

backend-down:
	$(DC_ALL) stop backend

backend-logs:
	$(DC_ALL) logs -f backend

# Combined
up:
	$(DC_ALL) up -d --wait

down:
	$(DC_ALL) down

reset:
	$(DC_ALL) down
	$(DC_DB) down -v
	$(DC_ALL) up -d --wait