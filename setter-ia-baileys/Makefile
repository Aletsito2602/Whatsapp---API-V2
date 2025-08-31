# Setter IA Baileys - Development Makefile

.PHONY: help install build dev test lint typecheck clean docker-build docker-up docker-down docker-logs setup-dev

# Default target
help:
	@echo "Setter IA Baileys - Available commands:"
	@echo ""
	@echo "Development:"
	@echo "  install      Install all dependencies"
	@echo "  build        Build all services"
	@echo "  dev          Start development servers"
	@echo "  test         Run all tests"
	@echo "  lint         Run linting"
	@echo "  typecheck    Run TypeScript type checking"
	@echo "  clean        Clean build artifacts"
	@echo ""
	@echo "Docker:"
	@echo "  docker-build Build all Docker images"
	@echo "  docker-up    Start all services with Docker"
	@echo "  docker-down  Stop all Docker services"
	@echo "  docker-logs  Show Docker logs"
	@echo "  docker-dev   Start development environment"
	@echo ""
	@echo "Setup:"
	@echo "  setup-dev    Setup development environment"
	@echo "  setup-prod   Setup production environment"

# Development commands
install:
	@echo "Installing dependencies..."
	npm run install:all

build:
	@echo "Building all services..."
	npm run build

dev:
	@echo "Starting development servers..."
	npm run dev

test:
	@echo "Running tests..."
	npm run test

lint:
	@echo "Running linter..."
	npm run lint

typecheck:
	@echo "Running TypeScript type checking..."
	npm run typecheck

clean:
	@echo "Cleaning build artifacts..."
	npm run clean
	rm -rf node_modules */node_modules */*/node_modules
	rm -rf */dist */*/dist
	rm -rf logs sessions uploads media

# Docker commands
docker-build:
	@echo "Building Docker images..."
	docker-compose build

docker-up:
	@echo "Starting Docker services..."
	docker-compose up -d

docker-down:
	@echo "Stopping Docker services..."
	docker-compose down

docker-logs:
	@echo "Showing Docker logs..."
	docker-compose logs -f

docker-dev:
	@echo "Starting development environment..."
	docker-compose -f docker-compose.yml -f docker-compose.override.yml up -d

docker-clean:
	@echo "Cleaning Docker resources..."
	docker-compose down -v
	docker system prune -f

# Development environment setup
setup-dev:
	@echo "Setting up development environment..."
	cp .env.example .env
	npm run install:all
	mkdir -p logs sessions uploads media
	@echo "Development environment ready!"
	@echo "1. Update .env file with your configuration"
	@echo "2. Run 'make docker-up' to start services"
	@echo "3. Run 'make dev' for local development"

setup-prod:
	@echo "Setting up production environment..."
	@echo "Please ensure you have:"
	@echo "1. Production database configured"
	@echo "2. Redis instance configured"
	@echo "3. SSL certificates in nginx/ssl/"
	@echo "4. Environment variables set"
	@echo "5. Run 'make docker-build && make docker-up'"

# Database commands
db-setup:
	@echo "Setting up database..."
	docker-compose exec postgres psql -U postgres -d setter_baileys -f /docker-entrypoint-initdb.d/init.sql

db-migrate:
	@echo "Running database migrations..."
	# Add migration commands here

db-seed:
	@echo "Seeding database..."
	# Add seeding commands here

db-reset:
	@echo "Resetting database..."
	docker-compose exec postgres psql -U postgres -c "DROP DATABASE IF EXISTS setter_baileys;"
	docker-compose exec postgres psql -U postgres -c "CREATE DATABASE setter_baileys;"
	make db-setup

# Monitoring commands
logs:
	@echo "Showing application logs..."
	tail -f logs/*.log

logs-session:
	@echo "Showing session manager logs..."
	docker-compose logs -f session-manager

logs-messages:
	@echo "Showing message gateway logs..."
	docker-compose logs -f message-gateway

# Health checks
health:
	@echo "Checking service health..."
	@echo "Session Manager: $$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health)"
	@echo "Message Gateway: $$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/health)"
	@echo "User Management: $$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3003/health)"

# Testing commands
test-api:
	@echo "Running API tests..."
	# Add API testing commands here

test-integration:
	@echo "Running integration tests..."
	# Add integration testing commands here

# Production commands
deploy:
	@echo "Deploying to production..."
	@echo "This should be handled by your CI/CD pipeline"
	
backup:
	@echo "Creating backup..."
	docker-compose exec postgres pg_dump -U postgres setter_baileys > backup_$$(date +%Y%m%d_%H%M%S).sql

restore:
	@echo "Restoring from backup..."
	@echo "Usage: make restore BACKUP_FILE=backup_file.sql"
	@test -n "$(BACKUP_FILE)" || (echo "BACKUP_FILE is required" && exit 1)
	docker-compose exec -T postgres psql -U postgres setter_baileys < $(BACKUP_FILE)