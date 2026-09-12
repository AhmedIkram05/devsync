COMPOSE_DB := docker-compose.local-postgres.yml
COMPOSE_ALL := docker-compose.local.yml

DC_DB := docker compose -f $(COMPOSE_DB)
DC_ALL := docker compose -f $(COMPOSE_DB) -f $(COMPOSE_ALL)

GCP_REGION ?= us-central1
AR_REPOSITORY ?= devsync-repo

.PHONY: help up down logs backend-rebuild frontend-rebuild backend-shell db-up db-down db-shell db-reset k8s-up k8s-live k8s-logs k8s-down

help: ## Show this help message
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
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

k8s-up: ## Render + deploy prod overlay (requires GCP_PROJECT_ID + BACKEND_DIGEST + FRONTEND_DIGEST; GCP_REGION/AR_REPOSITORY optional)
	@if [ -z "$(GCP_PROJECT_ID)" ] || [ -z "$(BACKEND_DIGEST)" ] || [ -z "$(FRONTEND_DIGEST)" ]; then \
		echo "error: refusing to apply unresolved/placeholder images or tokens."; \
		echo "usage: make k8s-up GCP_PROJECT_ID=<project-id> BACKEND_DIGEST=sha256:<hex> FRONTEND_DIGEST=sha256:<hex>"; \
		echo "(digests come from building + pushing manifests to Artifact Registry; see docs/k8s.md Images)"; \
		exit 1; \
	fi
	kustomize build k8s/overlays/prod \
	  | sed -e "s|image: devsync-backend$$|image: $(GCP_REGION)-docker.pkg.dev/$(GCP_PROJECT_ID)/$(AR_REPOSITORY)/devsync-backend@$(BACKEND_DIGEST)|" \
	        -e "s|image: devsync-frontend$$|image: $(GCP_REGION)-docker.pkg.dev/$(GCP_PROJECT_ID)/$(AR_REPOSITORY)/devsync-frontend@$(FRONTEND_DIGEST)|" \
	        -e "s/GCP_PROJECT_ID/$(GCP_PROJECT_ID)/g" \
	  > /tmp/devsync-prod-render.yaml
	@if grep -q "REGION-docker.pkg.dev/PROJECT\|GCP_PROJECT_ID\|image: devsync-.*$$" /tmp/devsync-prod-render.yaml; then \
		echo "error: unresolved placeholders or unpinned image names in render:"; \
		grep -n "REGION-docker.pkg.dev/PROJECT\|GCP_PROJECT_ID\|image: devsync-.*$$" /tmp/devsync-prod-render.yaml; \
		exit 1; \
	fi
	kubectl delete job devsync-migrate -n devsync --ignore-not-found=true
	kubectl apply -f /tmp/devsync-prod-render.yaml
	kubectl wait --for=condition=complete job/devsync-migrate -n devsync --timeout=600s
	kubectl wait --for=condition=available deploy/devsync-backend -n devsync --timeout=10m
	kubectl wait --for=condition=available deploy/devsync-frontend -n devsync --timeout=10m

k8s-live: ## Print Ingress IP for the Namecheap A-record step (gcp.devsyncapp.me)
	kubectl get ingress devsync-frontend -n devsync -o jsonpath='{.status.loadBalancer.ingress[0].ip}{"\n"}'
	@echo "Point gcp.devsyncapp.me A-record at the IP above, then: kubectl get managedcertificate devsync-prod-cert -n devsync -w"

k8s-logs: ## Tail backend + frontend + migrate logs
	kubectl logs -l app.kubernetes.io/part-of=devsync -n devsync --tail=200

k8s-down: ## Delete standing-env workloads (then terraform destroy -target=module.gke to $0)
	kubectl delete -k k8s/overlays/prod --ignore-not-found=true
	@echo "Next: terraform -chdir=infra/terraform destroy -target=module.gke"
