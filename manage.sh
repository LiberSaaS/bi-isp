#!/usr/bin/env bash

# ISP Analytics BI - Management Script
# Complete management interface for Docker Compose operations

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${SCRIPT_DIR}"
BACKEND_DIR="${INSTALL_DIR}/backend"

# Helper functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Check if Docker is available
check_docker() {
  if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed or not in PATH"
    return 1
  fi
  if ! command -v docker-compose &> /dev/null; then
    log_error "Docker Compose is not installed or not in PATH"
    return 1
  fi
  return 0
}

# Start services
cmd_start() {
  log_info "Starting ISP Analytics BI services..."
  cd "${BACKEND_DIR}"
  docker-compose up -d
  log_success "Services started successfully"
  docker-compose ps
}

# Stop services
cmd_stop() {
  log_info "Stopping ISP Analytics BI services..."
  cd "${BACKEND_DIR}"
  docker-compose down
  log_success "Services stopped successfully"
}

# Restart API service
cmd_restart() {
  log_info "Restarting API service..."
  cd "${BACKEND_DIR}"
  docker-compose restart api
  log_success "API service restarted successfully"
}

# View logs
cmd_logs() {
  cd "${BACKEND_DIR}"
  docker-compose logs -f api
}

# Show service status
cmd_status() {
  log_info "Service Status:"
  cd "${BACKEND_DIR}"
  docker-compose ps
}

# Run data sync
cmd_sync() {
  if [[ -z "${1:-}" ]]; then
    log_error "ERP name required. Usage: manage.sh sync <erp>"
    echo "Available ERPs: sistema, intelbras, gpon, etc."
    return 1
  fi

  local erp="$1"
  log_info "Running sync for ERP: ${erp}..."
  cd "${BACKEND_DIR}"
  docker-compose exec -T api npm run "sync:${erp}"
  log_success "Sync completed for ${erp}"
}

# Validate ERP data
cmd_validate() {
  if [[ -z "${1:-}" ]]; then
    log_error "ERP name required. Usage: manage.sh validate <erp>"
    echo "Available ERPs: sistema, intelbras, gpon, etc."
    return 1
  fi

  local erp="$1"
  log_info "Validating data for ERP: ${erp}..."
  cd "${BACKEND_DIR}"
  docker-compose exec -T api npm run "validate:${erp}"
  log_success "Validation completed for ${erp}"
}

# Bootstrap database
cmd_bootstrap() {
  log_info "Running database bootstrap..."
  cd "${BACKEND_DIR}"
  docker-compose exec -T api node scripts/bootstrap.js
  log_success "Bootstrap completed successfully"
}

# Update and restart
cmd_update() {
  log_info "Updating ISP Analytics BI..."
  cd "${INSTALL_DIR}"
  
  log_info "Pulling latest changes..."
  git pull || log_warning "Git pull failed - continuing anyway"
  
  log_info "Rebuilding Docker image..."
  cd "${BACKEND_DIR}"
  docker-compose build --no-cache api
  
  log_info "Restarting services..."
  docker-compose up -d
  
  log_success "Update completed successfully"
  docker-compose ps
}

# Backup database
cmd_backup() {
  local timestamp=$(date +%Y%m%d_%H%M%S)
  local backup_dir="${INSTALL_DIR}/backups/backup_${timestamp}"
  
  mkdir -p "${backup_dir}"
  
  log_info "Creating database backup: ${backup_dir}..."
  
  cd "${BACKEND_DIR}"
  docker-compose exec -T mongo mongodump \
    --username "${MONGO_ROOT_USER:-admin}" \
    --password "${MONGO_ROOT_PASSWORD:-changeme}" \
    --authenticationDatabase admin \
    --out "${backup_dir}" || {
    log_error "Backup failed"
    return 1
  }
  
  log_success "Backup created at ${backup_dir}"
}

# Show help
cmd_help() {
  cat << 'HELP'
ISP Analytics BI - Management Script

USAGE:
  manage.sh [COMMAND] [OPTIONS]

COMMANDS:
  start              Start all services (API + MongoDB)
  stop               Stop all services
  restart            Restart API service only
  logs               View API service logs (follow mode)
  status             Show running services status
  
  sync <erp>         Run data sync for specific ERP
                     Examples: sync sistema, sync intelbras, sync gpon
  
  validate <erp>     Validate ERP data
                     Examples: validate sistema, validate intelbras
  
  bootstrap          Initialize database with seed data
  
  update             Pull latest changes, rebuild, and restart
  
  backup             Create timestamped database backup
  
  help               Show this help message

ENVIRONMENT VARIABLES:
  API_PORT           API port (default: 3001)
  MONGO_ROOT_USER    MongoDB root user (default: admin)
  MONGO_ROOT_PASSWORD MongoDB root password (default: changeme)

EXAMPLES:
  manage.sh start
  manage.sh logs
  manage.sh sync sistema
  manage.sh backup
  manage.sh update

For more information, see README.md

HELP
}

# Main command router
main() {
  if ! check_docker; then
    log_error "Docker environment check failed"
    return 1
  fi

  local cmd="${1:-help}"

  case "${cmd}" in
    start)
      cmd_start
      ;;
    stop)
      cmd_stop
      ;;
    restart)
      cmd_restart
      ;;
    logs)
      cmd_logs
      ;;
    status)
      cmd_status
      ;;
    sync)
      cmd_sync "${2:-}"
      ;;
    validate)
      cmd_validate "${2:-}"
      ;;
    bootstrap)
      cmd_bootstrap
      ;;
    update)
      cmd_update
      ;;
    backup)
      cmd_backup
      ;;
    help|--help|-h)
      cmd_help
      ;;
    *)
      log_error "Unknown command: ${cmd}"
      cmd_help
      return 1
      ;;
  esac
}

main "$@"
