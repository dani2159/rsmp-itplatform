.PHONY: help build up down restart logs ps seed-admin db-shell backend-shell clean \
        dev-backend dev-frontend install

help:
	@echo "Docker (deployment):"
	@echo "  make build          Build semua image (backend, frontend, novnc-proxy)"
	@echo "  make up             Start semua service (background)"
	@echo "  make down           Stop semua service"
	@echo "  make restart        Restart semua service"
	@echo "  make logs           Tail log semua service"
	@echo "  make ps             Status service"
	@echo "  make seed-admin     Buat/reset user admin pertama"
	@echo "  make db-shell       Buka mysql shell ke database"
	@echo "  make backend-shell  Shell ke container backend"
	@echo "  make clean          Stop + hapus volume (DATA DB & KEYS HILANG)"
	@echo ""
	@echo "Lokal (dev tanpa Docker):"
	@echo "  make install        npm install backend + frontend"
	@echo "  make dev-backend    Jalankan backend (nodemon)"
	@echo "  make dev-frontend   Jalankan frontend (vite dev server)"

# ── Docker ──────────────────────────────────────────────────────
build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f

ps:
	docker compose ps

seed-admin:
	docker compose exec backend npm run seed:admin

db-shell:
	docker compose exec mariadb mysql -u$${DB_USER:-rsmpitadmin} -p$${DB_PASS} $${DB_NAME:-rsmpitdb}

backend-shell:
	docker compose exec backend sh

clean:
	docker compose down -v

# ── Lokal ───────────────────────────────────────────────────────
install:
	cd backend && npm install
	cd frontend && npm install

dev-backend:
	cd backend && npm run dev

dev-frontend:
	cd frontend && npm run dev
