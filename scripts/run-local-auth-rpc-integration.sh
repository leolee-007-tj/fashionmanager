#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$REPO_ROOT"

if [[ ! -f "supabase/config.toml" ]]; then
    echo "ERROR: Not in repository root" >&2
    exit 1
fi

CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "feature/supabase-cloud-migration" ]]; then
    echo "ERROR: Must be on feature/supabase-cloud-migration branch" >&2
    exit 1
fi

if ! command -v supabase &>/dev/null; then
    echo "ERROR: supabase command not found" >&2
    exit 1
fi

USE_DOCKER_NODE=0
if ! command -v node &>/dev/null; then
    if command -v docker &>/dev/null; then
        USE_DOCKER_NODE=1
    else
        echo "ERROR: node command not found and docker not available" >&2
        exit 1
    fi
else
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ "$NODE_VERSION" -lt 20 ]]; then
        if command -v docker &>/dev/null; then
            USE_DOCKER_NODE=1
        else
            echo "ERROR: Node.js version must be 20 or higher (found v$NODE_VERSION)" >&2
            exit 1
        fi
    fi
fi

ENV_FILE=""
cleanup() {
    if [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]]; then
        rm -f "$ENV_FILE"
    fi
}
trap cleanup EXIT

get_env_value() {
    local key="$1"
    local file="$2"
    grep "^${key}=" "$file" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' || true
}

ensure_supabase_running() {
    local max_retries=3
    local retry=0
    while [[ $retry -lt $max_retries ]]; do
        echo "Checking local Supabase status (attempt $((retry + 1))/$max_retries)..." >&2
        supabase status -o env > "$ENV_FILE" 2>/dev/null || true
        local api_url
        api_url=$(get_env_value "API_URL" "$ENV_FILE")
        if [[ -n "$api_url" ]]; then
            return 0
        fi
        echo "Starting local Supabase..." >&2
        supabase start --ignore-health-check &>/dev/null || true
        sleep 5
        retry=$((retry + 1))
    done
    echo "ERROR: API_URL not available after $max_retries attempts" >&2
    exit 1
}

ENV_FILE=$(mktemp)
chmod 600 "$ENV_FILE"

ensure_supabase_running

echo "Resetting local database..." >&2
supabase db reset --local &>/dev/null || true

# Wait for services to stabilize after reset.
echo "Waiting for services to stabilize..." >&2
sleep 10

# Re-check status after reset (reset may affect services).
ensure_supabase_running

set -a
source "$ENV_FILE"
set +a

if [[ -z "${API_URL:-}" ]]; then
    echo "ERROR: API_URL not found in environment" >&2
    exit 1
fi
if [[ -z "${ANON_KEY:-}" ]]; then
    echo "ERROR: ANON_KEY not found in environment" >&2
    exit 1
fi
if [[ -z "${SERVICE_ROLE_KEY:-}" ]]; then
    echo "ERROR: SERVICE_ROLE_KEY not found in environment" >&2
    exit 1
fi

URL_HOSTNAME=$(echo "$API_URL" | cut -d'/' -f3 | cut -d':' -f1)
URL_PROTOCOL=$(echo "$API_URL" | cut -d':' -f1)

if [[ "$URL_PROTOCOL" != "http" ]]; then
    echo "ERROR: API_URL must use http protocol" >&2
    exit 1
fi

case "$URL_HOSTNAME" in
    127.0.0.1|localhost|::1)
        ;;
    *)
        echo "ERROR: API_URL hostname must be localhost or 127.0.0.1" >&2
        exit 1
        ;;
esac

DOCKER_API_URL="$API_URL"
if [[ "$USE_DOCKER_NODE" -eq 1 ]]; then
    case "$URL_HOSTNAME" in
        127.0.0.1|localhost)
            DOCKER_API_URL=$(echo "$API_URL" | sed "s|${URL_HOSTNAME}|host.docker.internal|")
            ;;
    esac
fi

TEST_EXIT=0

echo "Running local auth RPC integration tests..." >&2
if [[ "$USE_DOCKER_NODE" -eq 1 ]]; then
    docker run --rm \
        -v "$(pwd):/app" \
        -w /app \
        -e RUN_LOCAL_SUPABASE_INTEGRATION=1 \
        -e SUPABASE_LOCAL_API_URL="$DOCKER_API_URL" \
        -e SUPABASE_LOCAL_ANON_KEY="$ANON_KEY" \
        -e SUPABASE_LOCAL_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
        node:20-alpine \
        node --test tests/local-auth-rpc.integration.mjs || TEST_EXIT=$?
else
    RUN_LOCAL_SUPABASE_INTEGRATION=1 \
    SUPABASE_LOCAL_API_URL="$API_URL" \
    SUPABASE_LOCAL_ANON_KEY="$ANON_KEY" \
    SUPABASE_LOCAL_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
    node --test tests/local-auth-rpc.integration.mjs || TEST_EXIT=$?
fi

echo "Cleaning up test data..." >&2
supabase db reset --local &>/dev/null

exit "$TEST_EXIT"
