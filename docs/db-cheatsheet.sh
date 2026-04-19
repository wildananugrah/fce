#!/usr/bin/env bash
# =============================================================================
# FCE Database Cheatsheet Script
# Quick access to common database operations
# Usage: bash docs/db-cheatsheet.sh [command]
# =============================================================================

DB_HOST="localhost"
DB_PORT="5433"
DB_NAME="fce_dashboard"
DB_USER="fce"
DB_PASS="fce_secret"
CONN="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

usage() {
  echo -e "${CYAN}FCE Database Cheatsheet${NC}"
  echo ""
  echo "Usage: bash docs/db-cheatsheet.sh <command>"
  echo ""
  echo -e "${GREEN}Connection:${NC}"
  echo "  connect           Open psql shell (host)"
  echo "  connect-docker    Open psql shell (docker container)"
  echo "  studio            Open Prisma Studio (port 5555)"
  echo "  conn-string       Print connection string"
  echo ""
  echo -e "${GREEN}Inspect:${NC}"
  echo "  tables            List all tables"
  echo "  describe <table>  Show table structure"
  echo "  count <table>     Count rows in a table"
  echo "  count-all         Count rows in all tables"
  echo ""
  echo -e "${GREEN}Quick Queries:${NC}"
  echo "  users             List all users"
  echo "  workspaces        List all workspaces"
  echo "  brands <ws_id>    List brands for a workspace"
  echo "  products <ws_id>  List products for a workspace"
  echo "  members <ws_id>   List members of a workspace"
  echo "  jobs              Show recent pg-boss jobs"
  echo "  generations       Show recent generation outputs"
  echo ""
  echo -e "${GREEN}Roles:${NC}"
  echo "  role <email>            Show user's role in all workspaces"
  echo "  promote <email> <ws_id> Promote user to admin in a workspace"
  echo "  demote <email> <ws_id>  Demote user to member in a workspace"
  echo ""
  echo -e "${GREEN}Projects (RBAC):${NC}"
  echo "  projects <ws_id>        List projects for a workspace"
  echo "  project-members <proj_id>"
  echo "                          List memberships for a project"
  echo ""
  echo -e "${GREEN}Users:${NC}"
  echo "  add-user <email> <password> [fullName] [--superadmin]"
  echo "                          Create a new user account (hashes password)"
  echo "  delete-user <email>     Delete a user account (cascades to memberships)"
  echo "  reset-password <email> <new-password>"
  echo "                          Reset a user's password (hashes with bcrypt)"
  echo "  reset-password <email> --random"
  echo "                          Reset to a random 16-char password and print it"
  echo "  make-superadmin <email>"
  echo "                          Flip User.isSuperadmin = true"
  echo "  revoke-superadmin <email>"
  echo "                          Flip User.isSuperadmin = false"
  echo ""
  echo -e "${GREEN}Admin:${NC}"
  echo "  seed              Run database seed"
  echo "  push              Sync Prisma schema to DB"
  echo "  reset             Reset DB (drop + recreate tables)"
  echo "  delete-all        Delete all data (keep schema)"
  echo "  query '<sql>'     Run a custom SQL query"
  echo ""
}

run_sql() {
  if command -v psql &>/dev/null; then
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "$1"
  else
    docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -c "$1"
  fi
}

run_sql_docker() {
  docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -c "$1"
}

case "${1:-help}" in
  # --- Connection ---
  connect)
    echo -e "${CYAN}Connecting to $DB_NAME via psql...${NC}"
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"
    ;;
  connect-docker)
    echo -e "${CYAN}Connecting via docker container...${NC}"
    docker compose exec postgres psql -U "$DB_USER" -d "$DB_NAME"
    ;;
  studio)
    echo -e "${CYAN}Opening Prisma Studio...${NC}"
    cd backend && bunx prisma studio
    ;;
  conn-string)
    echo "$CONN"
    ;;

  # --- Inspect ---
  tables)
    run_sql "\dt public.*"
    ;;
  describe)
    if [ -z "$2" ]; then
      echo "Usage: db-cheatsheet.sh describe <table_name>"
      exit 1
    fi
    run_sql "\d $2"
    ;;
  count)
    if [ -z "$2" ]; then
      echo "Usage: db-cheatsheet.sh count <table_name>"
      exit 1
    fi
    run_sql "SELECT COUNT(*) FROM \"$2\";"
    ;;
  count-all)
    run_sql "
      SELECT schemaname, relname AS table_name, n_live_tup AS row_count
      FROM pg_stat_user_tables
      ORDER BY n_live_tup DESC;
    "
    ;;

  # --- Quick Queries ---
  users)
    run_sql "SELECT id, email, full_name, is_superadmin, status, created_at FROM users ORDER BY created_at DESC;"
    ;;
  workspaces)
    run_sql "SELECT id, name, slug, status, created_at FROM workspaces ORDER BY created_at DESC;"
    ;;
  brands)
    if [ -z "$2" ]; then
      echo "Usage: db-cheatsheet.sh brands <workspace_id>"
      exit 1
    fi
    run_sql "SELECT id, name, slug, status, project_id FROM brands WHERE workspace_id = '$2';"
    ;;
  products)
    if [ -z "$2" ]; then
      echo "Usage: db-cheatsheet.sh products <workspace_id>"
      exit 1
    fi
    run_sql "SELECT id, name, slug, status FROM products WHERE workspace_id = '$2';"
    ;;
  members)
    if [ -z "$2" ]; then
      echo "Usage: db-cheatsheet.sh members <workspace_id>"
      exit 1
    fi
    run_sql "
      SELECT u.email, u.full_name, uwr.role
      FROM user_workspace_roles uwr
      JOIN users u ON u.id = uwr.user_id
      WHERE uwr.workspace_id = '$2'
      ORDER BY uwr.role;
    "
    ;;
  jobs)
    run_sql "
      SELECT id, name, state, created_on, completed_on
      FROM pgboss.job
      ORDER BY created_on DESC
      LIMIT 20;
    "
    ;;
  generations)
    run_sql "
      SELECT o.id, o.status, o.version_no, o.created_at, r.platform, r.content_type
      FROM generation_outputs o
      JOIN generation_requests r ON r.id = o.request_id
      ORDER BY o.created_at DESC
      LIMIT 20;
    "
    ;;

  # --- Roles ---
  role)
    if [ -z "$2" ]; then
      echo "Usage: db-cheatsheet.sh role <email>"
      exit 1
    fi
    run_sql "
      SELECT w.name AS workspace, w.id AS workspace_id, uwr.role
      FROM user_workspace_roles uwr
      JOIN users u ON u.id = uwr.user_id
      JOIN workspaces w ON w.id = uwr.workspace_id
      WHERE u.email = '$2'
      ORDER BY w.name;
    "
    ;;
  promote)
    if [ -z "$2" ] || [ -z "$3" ]; then
      echo "Usage: db-cheatsheet.sh promote <email> <workspace_id>"
      exit 1
    fi
    run_sql "
      UPDATE user_workspace_roles
      SET role = 'admin'
      FROM users u
      WHERE user_workspace_roles.user_id = u.id
        AND u.email = '$2'
        AND user_workspace_roles.workspace_id = '$3';
    "
    echo -e "${GREEN}User $2 promoted to admin.${NC}"
    ;;
  demote)
    if [ -z "$2" ] || [ -z "$3" ]; then
      echo "Usage: db-cheatsheet.sh demote <email> <workspace_id>"
      exit 1
    fi
    # Per RBAC: non-admin workspace role is 'member'. Project-level menus
    # + approver are managed separately via Workspace Settings → Projects.
    run_sql "
      UPDATE user_workspace_roles
      SET role = 'member'
      FROM users u
      WHERE user_workspace_roles.user_id = u.id
        AND u.email = '$2'
        AND user_workspace_roles.workspace_id = '$3';
    "
    echo -e "${GREEN}User $2 demoted to member.${NC}"
    ;;

  # --- Projects (RBAC) ---
  projects)
    if [ -z "$2" ]; then
      echo "Usage: db-cheatsheet.sh projects <workspace_id>"
      exit 1
    fi
    run_sql "
      SELECT p.id, p.name, p.slug, p.archived_at,
             (SELECT COUNT(*) FROM user_project_memberships m WHERE m.project_id = p.id) AS members,
             (SELECT COUNT(*) FROM brands b WHERE b.project_id = p.id) AS brands
      FROM projects p
      WHERE p.workspace_id = '$2'
      ORDER BY p.created_at ASC;
    "
    ;;
  project-members)
    if [ -z "$2" ]; then
      echo "Usage: db-cheatsheet.sh project-members <project_id>"
      exit 1
    fi
    run_sql "
      SELECT u.email, u.full_name, m.is_approver, m.menu_access
      FROM user_project_memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.project_id = '$2'
      ORDER BY u.email;
    "
    ;;

  # --- Users ---
  add-user)
    if [ -z "$2" ] || [ -z "$3" ]; then
      echo "Usage: db-cheatsheet.sh add-user <email> <password> [fullName] [--superadmin]"
      exit 1
    fi
    echo -e "${CYAN}Creating user $2...${NC}"
    # Delegate to the bun script so bcrypt hashes the password correctly.
    cd backend && bun run scripts/create-user.ts "${@:2}"
    ;;
  delete-user)
    if [ -z "$2" ]; then
      echo "Usage: db-cheatsheet.sh delete-user <email>"
      exit 1
    fi
    echo -e "${YELLOW}About to delete user $2 and all their memberships.${NC}"
    read -p "Are you sure? (y/N) " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
      run_sql "DELETE FROM users WHERE email = '$2';"
      echo -e "${GREEN}User $2 deleted.${NC}"
    else
      echo "Aborted."
    fi
    ;;
  reset-password)
    if [ -z "$2" ] || [ -z "$3" ]; then
      echo "Usage: db-cheatsheet.sh reset-password <email> <new-password>"
      echo "       db-cheatsheet.sh reset-password <email> --random"
      exit 1
    fi
    cd backend && bun run scripts/reset-password.ts "${@:2}"
    ;;
  make-superadmin)
    if [ -z "$2" ]; then
      echo "Usage: db-cheatsheet.sh make-superadmin <email>"
      exit 1
    fi
    cd backend && bun run scripts/seed-superadmin.ts "$2"
    ;;
  revoke-superadmin)
    if [ -z "$2" ]; then
      echo "Usage: db-cheatsheet.sh revoke-superadmin <email>"
      exit 1
    fi
    cd backend && bun run scripts/seed-superadmin.ts "$2" --revoke
    ;;

  # --- Admin ---
  seed)
    echo -e "${CYAN}Running database seed...${NC}"
    cd backend && bunx prisma db seed
    ;;
  push)
    echo -e "${CYAN}Syncing Prisma schema to database...${NC}"
    cd backend && bunx prisma db push
    ;;
  reset)
    echo -e "${YELLOW}WARNING: This will drop all tables and recreate them!${NC}"
    read -p "Are you sure? (y/N) " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
      cd backend && bunx prisma db push --force-reset
    else
      echo "Aborted."
    fi
    ;;
  delete-all)
    echo -e "${YELLOW}WARNING: This will delete all data but keep the schema!${NC}"
    read -p "Are you sure? (y/N) " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
      cd backend && bun run scripts/delete-all-data.ts
    else
      echo "Aborted."
    fi
    ;;
  query)
    if [ -z "$2" ]; then
      echo "Usage: db-cheatsheet.sh query 'SELECT ...'"
      exit 1
    fi
    run_sql "$2"
    ;;

  # --- Help ---
  help|--help|-h|*)
    usage
    ;;
esac
