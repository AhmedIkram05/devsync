COMPOSE_DB := docker-compose.local-postgres.yml
COMPOSE_ALL := docker-compose.local.yml

DC_DB := docker compose -f $(COMPOSE_DB)
DC_ALL := docker compose -f $(COMPOSE_DB) -f $(COMPOSE_ALL)

.PHONY: help up down logs backend-rebuild frontend-rebuild backend-shell db-up db-down db-shell db-reset

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'

up: ## Build & start all services (DB + backend + frontend)
	$(DC_ALL) up -d --wait

down: ## Stop all services and remove containers
	$(DC_ALL) down

logs: ## Tail logs. Filter: make logs SVC=backend
	$(DC_ALL) logs -f $(SVC)

backend-rebuild: ## Rebuild backend image & restart (DB stays running)
	$(DC_ALL) build backend
	$(DC_ALL) up -d --wait backend

frontend-rebuild: ## Rebuild frontend image & restart (backend + DB stay running)
	$(DC_ALL) build frontend
	$(DC_ALL) up -d --wait frontend

backend-shell: ## Open a bash shell in the backend container
	$(DC_ALL) exec backend bash

db-up: ## Start PostgreSQL only (for host-based dev)
	$(DC_DB) up -d --wait

db-down: ## Stop PostgreSQL only
	$(DC_DB) down

db-shell: ## Open a psql shell in the database
	$(DC_DB) exec devsync-postgres psql -U devsync -d devsync

db-reset: ## Destroy PostgreSQL data volume & restart
	$(DC_DB) down -v
	$(DC_DB) up -d --wait
