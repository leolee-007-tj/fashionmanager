#!/usr/bin/env bash
# Deterministic local Supabase auth/RPC integration runner.
# Modes:
#   --preflight  read-only environment checks (no start/stop/reset/write)
#   --run        preflight first, then db reset + integration tests + cleanup
# No auto start/stop/restart. No Docker Node fallback. No health-check bypass.
set -euo pipefail
set +x
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# Modes
# ---------------------------------------------------------------------------
MODE=""
if [[ $# -ne 1 ]]; then
    cat >&2 <<'USAGE'
Usage:
  bash scripts/run-local-auth-rpc-integration.sh --preflight
  bash scripts/run-local-auth-rpc-integration.sh --run
USAGE
    exit 2
fi

case "$1" in
    --preflight)
        MODE="preflight"
        ;;
    --run)
        MODE="run"
        ;;
    *)
        echo "ERROR: unknown argument '$1'" >&2
        echo "Usage:" >&2
        echo "  bash scripts/run-local-auth-rpc-integration.sh --preflight" >&2
        echo "  bash scripts/run-local-auth-rpc-integration.sh --run" >&2
        exit 2
        ;;
esac

# ---------------------------------------------------------------------------
# Temp files (cleaned on EXIT). chmod 600. Never print contents.
# ---------------------------------------------------------------------------
STATUS_ENV_FILE=""
STDERR_LOG=""
cleanup() {
    if [[ -n "$STATUS_ENV_FILE" && -f "$STATUS_ENV_FILE" ]]; then
        rm -f "$STATUS_ENV_FILE"
    fi
    if [[ -n "$STDERR_LOG" && -f "$STDERR_LOG" ]]; then
        rm -f "$STDERR_LOG"
    fi
}
trap cleanup EXIT
STATUS_ENV_FILE=$(mktemp)
chmod 600 "$STATUS_ENV_FILE"
STDERR_LOG=$(mktemp)
chmod 600 "$STDERR_LOG"

# ---------------------------------------------------------------------------
# run_with_timeout <seconds> <label> <cmd...>
# Uses python3 subprocess to enforce a hard upper bound. Captures stderr to
# $STDERR_LOG so we can print a redacted tail on failure. Prints stdout
# directly. Returns the child exit code (or 124 on timeout).
# ---------------------------------------------------------------------------
run_with_timeout() {
    local timeout_sec="$1"
    local label="$2"
    shift 2
    : > "$STDERR_LOG"
    python3 - "$timeout_sec" "$label" "$STDERR_LOG" "$@" <<'PYEOF'
import subprocess
import sys

timeout = int(sys.argv[1])
label = sys.argv[2]
stderr_path = sys.argv[3]
cmd = sys.argv[4:]

stderr_fh = open(stderr_path, "w")
try:
    result = subprocess.run(
        cmd,
        timeout=timeout,
        stdout=subprocess.PIPE,
        stderr=stderr_fh,
    )
    sys.stdout.buffer.write(result.stdout)
    sys.exit(result.returncode)
except subprocess.TimeoutExpired:
    sys.stderr.write(
        "TIMEOUT: %s exceeded %ds (cmd: %s)\n" % (label, timeout, " ".join(cmd))
    )
    sys.exit(124)
finally:
    stderr_fh.close()
PYEOF
}

# ---------------------------------------------------------------------------
# print_stderr_tail <max_lines>
# Prints the last N lines of $STDERR_LOG with secrets redacted.
# ---------------------------------------------------------------------------
print_stderr_tail() {
    local max_lines="${1:-80}"
    if [[ -s "$STDERR_LOG" ]]; then
        echo "--- stderr (redacted, last ${max_lines} lines) ---" >&2
        tail -n "$max_lines" "$STDERR_LOG" \
            | sed -E \
                -e 's/(ANON_KEY=).*/\1<redacted>/g' \
                -e 's/(SERVICE_ROLE_KEY=).*/\1<redacted>/g' \
                -e 's/(JWT_SECRET=).*/\1<redacted>/g' \
                -e 's/(access_token[^ ]*).*/\1=<redacted>/g' \
                -e 's/(refresh_token[^ ]*).*/\1=<redacted>/g' \
                -e 's/(Bearer )[A-Za-z0-9._-]+/\1<redacted>/g' \
                >&2
    fi
}

# ---------------------------------------------------------------------------
# Executable discovery (no side effects, no installs)
# ---------------------------------------------------------------------------
find_supabase() {
    local p
    if p=$(command -v supabase 2>/dev/null) && [[ -x "$p" ]]; then
        echo "$p"
        return 0
    fi
    if [[ -x "$HOME/bin/supabase" ]]; then
        echo "$HOME/bin/supabase"
        return 0
    fi
    return 1
}

find_node() {
    local p
    # 1. command -v node
    if p=$(command -v node 2>/dev/null) && [[ -x "$p" ]]; then
        echo "$p"
        return 0
    fi
    # 2. zsh -lic 'command -v node' (login + interactive to load .zshrc / nvm)
    if p=$(zsh -lic 'command -v node' 2>/dev/null) && [[ -n "$p" && -x "$p" ]]; then
        echo "$p"
        return 0
    fi
    # 3. nvm: ~/.nvm/versions/node/*/bin/node (highest version)
    local nvm_node
    nvm_node=$(ls "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1 || true)
    if [[ -n "$nvm_node" && -x "$nvm_node" ]]; then
        echo "$nvm_node"
        return 0
    fi
    # 4. /usr/local/bin/node
    if [[ -x "/usr/local/bin/node" ]]; then
        echo "/usr/local/bin/node"
        return 0
    fi
    # 5. /opt/homebrew/bin/node
    if [[ -x "/opt/homebrew/bin/node" ]]; then
        echo "/opt/homebrew/bin/node"
        return 0
    fi
    return 1
}

find_docker() {
    local p
    if p=$(command -v docker 2>/dev/null) && [[ -x "$p" ]]; then
        echo "$p"
        return 0
    fi
    # Docker.app (Docker Desktop default on macOS)
    if [[ -x "/Applications/Docker.app/Contents/Resources/bin/docker" ]]; then
        echo "/Applications/Docker.app/Contents/Resources/bin/docker"
        return 0
    fi
    if [[ -x "/usr/local/bin/docker" ]]; then
        echo "/usr/local/bin/docker"
        return 0
    fi
    if [[ -x "/opt/homebrew/bin/docker" ]]; then
        echo "/opt/homebrew/bin/docker"
        return 0
    fi
    return 1
}

# ---------------------------------------------------------------------------
# get_env_value <key> <file>  (never prints value to stdout; used internally)
# ---------------------------------------------------------------------------
get_env_value() {
    local key="$1"
    local file="$2"
    grep "^${key}=" "$file" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' || true
}

# ---------------------------------------------------------------------------
# Preflight (read-only). Returns 0 on PASS, non-zero on FAIL.
# Prints only safe facts. Never prints keys/tokens.
# ---------------------------------------------------------------------------
run_preflight() {
    local start_ts
    start_ts=$(date +%s)

    echo "== preflight start ==" >&2

    # 1. Repository path
    if [[ ! -f "supabase/config.toml" ]]; then
        echo "FAIL: not in repository root (supabase/config.toml missing)" >&2
        echo "preflight=FAIL" >&2
        return 1
    fi
    echo "repo_root=$REPO_ROOT" >&2

    # 2. Current branch
    local branch
    branch=$(git branch --show-current 2>/dev/null || true)
    if [[ "$branch" != "feature/supabase-cloud-migration" ]]; then
        echo "FAIL: branch is '$branch' (expected feature/supabase-cloud-migration)" >&2
        echo "preflight=FAIL" >&2
        return 1
    fi
    echo "branch=$branch" >&2

    # 3. Supabase CLI path + version
    local supabase_path
    if ! supabase_path=$(find_supabase); then
        echo "FAIL: supabase CLI not found (checked command -v and \$HOME/bin/supabase)" >&2
        echo "preflight=FAIL" >&2
        return 1
    fi
    echo "supabase_path=$supabase_path" >&2
    local supabase_version
    supabase_version=$(SUPABASE_TELEMETRY_DISABLED=1 "$supabase_path" --version 2>/dev/null | head -1 || true)
    echo "supabase_version=$supabase_version" >&2

    # 4. Native Node path + version
    local node_path
    if ! node_path=$(find_node); then
        echo "FAIL: native node not found (checked command -v, zsh -lc, /usr/local/bin, /opt/homebrew/bin)" >&2
        echo "preflight=FAIL" >&2
        return 1
    fi
    echo "node_path=$node_path" >&2
    local node_version
    node_version=$("$node_path" --version 2>&1 | head -1 || true)
    echo "node_version=$node_version" >&2
    local node_major
    node_major=$(echo "$node_version" | sed -E 's/^v([0-9]+)\..*/\1/')
    if [[ -z "$node_major" || "$node_major" -lt 20 ]]; then
        echo "FAIL: node version must be >= 20 (got $node_version)" >&2
        echo "preflight=FAIL" >&2
        return 1
    fi

    # 5. Docker CLI path + version
    local docker_path
    if ! docker_path=$(find_docker); then
        echo "FAIL: docker CLI not found (checked command -v, /usr/local/bin, /opt/homebrew/bin)" >&2
        echo "preflight=FAIL" >&2
        return 1
    fi
    echo "docker_path=$docker_path" >&2
    local docker_version
    docker_version=$("$docker_path" --version 2>&1 | head -1 || true)
    echo "docker_version=$docker_version" >&2

    # 6. docker info (15s timeout)
    local docker_info_exit=0
    local docker_info_start
    docker_info_start=$(date +%s)
    run_with_timeout 15 "docker info" "$docker_path" info >/dev/null 2>&1 || docker_info_exit=$?
    local docker_info_end
    docker_info_end=$(date +%s)
    local docker_info_elapsed=$((docker_info_end - docker_info_start))
    echo "command=docker info" >&2
    echo "exit_code=$docker_info_exit" >&2
    echo "elapsed_seconds=$docker_info_elapsed" >&2
    if [[ "$docker_info_exit" -ne 0 ]]; then
        if [[ "$docker_info_exit" -eq 124 ]]; then
            echo "FAIL: docker info exceeded 15 seconds" >&2
        else
            echo "FAIL: docker info exit=$docker_info_exit (Docker daemon not reachable)" >&2
        fi
        print_stderr_tail
        echo "preflight=FAIL" >&2
        return 1
    fi
    echo "docker_reachable=yes" >&2

    # 7. supabase status -o env (20s timeout). Output to temp file (contains secrets).
    : > "$STATUS_ENV_FILE"
    local status_exit=0
    local status_start
    status_start=$(date +%s)
    run_with_timeout 20 "supabase status" env SUPABASE_TELEMETRY_DISABLED=1 "$supabase_path" status -o env > "$STATUS_ENV_FILE" 2>&1 || status_exit=$?
    local status_end
    status_end=$(date +%s)
    local status_elapsed=$((status_end - status_start))
    echo "command=supabase status -o env" >&2
    echo "exit_code=$status_exit" >&2
    echo "elapsed_seconds=$status_elapsed" >&2
    if [[ "$status_exit" -ne 0 ]]; then
        if [[ "$status_exit" -eq 124 ]]; then
            echo "FAIL: supabase status -o env exceeded 20 seconds" >&2
        else
            echo "FAIL: supabase status -o env exit=$status_exit" >&2
        fi
        print_stderr_tail
        echo "preflight=FAIL" >&2
        return 1
    fi

    # 8. API_URL existence
    local api_url
    api_url=$(get_env_value "API_URL" "$STATUS_ENV_FILE")
    if [[ -z "$api_url" ]]; then
        echo "FAIL: API_URL not found in supabase status output" >&2
        echo "preflight=FAIL" >&2
        return 1
    fi

    # 9. API_URL localhost check
    local url_protocol url_host
    url_protocol=$(echo "$api_url" | cut -d':' -f1)
    url_host=$(echo "$api_url" | cut -d'/' -f3 | cut -d':' -f1)
    if [[ "$url_protocol" != "http" ]]; then
        echo "FAIL: API_URL must use http protocol (got $url_protocol)" >&2
        echo "preflight=FAIL" >&2
        return 1
    fi
    case "$url_host" in
        127.0.0.1|localhost|::1)
            ;;
        *)
            echo "FAIL: API_URL hostname must be localhost (got $url_host)" >&2
            echo "preflight=FAIL" >&2
            return 1
            ;;
    esac
    echo "api_host=$url_host" >&2

    # 10. supabase/config.toml existence (already checked in step 1, reaffirm)
    echo "config_toml=exists" >&2

    # ANON_KEY != SERVICE_ROLE_KEY sanity (values never printed)
    local anon_key service_role_key
    anon_key=$(get_env_value "ANON_KEY" "$STATUS_ENV_FILE")
    service_role_key=$(get_env_value "SERVICE_ROLE_KEY" "$STATUS_ENV_FILE")
    if [[ -z "$anon_key" || -z "$service_role_key" ]]; then
        echo "FAIL: ANON_KEY or SERVICE_ROLE_KEY missing from supabase status" >&2
        echo "preflight=FAIL" >&2
        return 1
    fi
    if [[ "$anon_key" == "$service_role_key" ]]; then
        echo "FAIL: ANON_KEY and SERVICE_ROLE_KEY must differ" >&2
        echo "preflight=FAIL" >&2
        return 1
    fi

    local end_ts
    end_ts=$(date +%s)
    local elapsed=$((end_ts - start_ts))
    echo "preflight_elapsed=${elapsed}s" >&2
    echo "preflight=PASS" >&2
    echo "== preflight end ==" >&2
    return 0
}

# ---------------------------------------------------------------------------
# Run mode: preflight -> db reset -> status recheck -> tests -> cleanup reset
# ---------------------------------------------------------------------------
run_integration() {
    local start_ts
    start_ts=$(date +%s)

    echo "== run start ==" >&2

    # Preflight first (must PASS).
    if ! run_preflight; then
        echo "FAIL: preflight did not pass; refusing to run integration tests" >&2
        return 1
    fi

    # Re-read env values from the preflight status file (already populated).
    local api_url anon_key service_role_key supabase_path node_path
    api_url=$(get_env_value "API_URL" "$STATUS_ENV_FILE")
    anon_key=$(get_env_value "ANON_KEY" "$STATUS_ENV_FILE")
    service_role_key=$(get_env_value "SERVICE_ROLE_KEY" "$STATUS_ENV_FILE")
    supabase_path=$(find_supabase)
    node_path=$(find_node)

    # 1. db reset (600s timeout). No fixed sleep afterwards.
    echo "Running supabase db reset --local ..." >&2
    local reset_exit=0
    local reset_start
    reset_start=$(date +%s)
    run_with_timeout 600 "supabase db reset" env SUPABASE_TELEMETRY_DISABLED=1 "$supabase_path" db reset --local >/dev/null 2>&1 || reset_exit=$?
    local reset_end
    reset_end=$(date +%s)
    local reset_elapsed=$((reset_end - reset_start))
    echo "command=supabase db reset --local" >&2
    echo "exit_code=$reset_exit" >&2
    echo "elapsed_seconds=$reset_elapsed" >&2
    if [[ "$reset_exit" -ne 0 ]]; then
        if [[ "$reset_exit" -eq 124 ]]; then
            echo "FAIL: supabase db reset --local exceeded 600 seconds" >&2
        else
            echo "FAIL: supabase db reset --local exit=$reset_exit" >&2
        fi
        print_stderr_tail
        return 1
    fi

    # 2. Immediately re-check status (no fixed sleep). 20s timeout.
    : > "$STATUS_ENV_FILE"
    local status2_exit=0
    local status2_start
    status2_start=$(date +%s)
    run_with_timeout 20 "supabase status (post-reset)" env SUPABASE_TELEMETRY_DISABLED=1 "$supabase_path" status -o env > "$STATUS_ENV_FILE" 2>&1 || status2_exit=$?
    local status2_end
    status2_end=$(date +%s)
    local status2_elapsed=$((status2_end - status2_start))
    echo "command=supabase status -o env (post-reset)" >&2
    echo "exit_code=$status2_exit" >&2
    echo "elapsed_seconds=$status2_elapsed" >&2
    if [[ "$status2_exit" -ne 0 ]]; then
        if [[ "$status2_exit" -eq 124 ]]; then
            echo "FAIL: supabase status -o env (post-reset) exceeded 20 seconds" >&2
        else
            echo "FAIL: supabase status -o env (post-reset) exit=$status2_exit" >&2
        fi
        print_stderr_tail
        return 1
    fi
    # Re-read values (they may have changed).
    api_url=$(get_env_value "API_URL" "$STATUS_ENV_FILE")
    anon_key=$(get_env_value "ANON_KEY" "$STATUS_ENV_FILE")
    service_role_key=$(get_env_value "SERVICE_ROLE_KEY" "$STATUS_ENV_FILE")
    if [[ -z "$api_url" || -z "$anon_key" || -z "$service_role_key" ]]; then
        echo "FAIL: env values missing after reset" >&2
        return 1
    fi

    # Re-validate localhost (post-reset).
    local url_host
    url_host=$(echo "$api_url" | cut -d'/' -f3 | cut -d':' -f1)
    case "$url_host" in
        127.0.0.1|localhost|::1)
            ;;
        *)
            echo "FAIL: post-reset API_URL hostname must be localhost (got $url_host)" >&2
            return 1
            ;;
    esac

    # 3. Run integration tests with native Node (180s timeout).
    echo "Running integration tests with native node ..." >&2
    local test_exit=0
    local test_start
    test_start=$(date +%s)
    RUN_LOCAL_SUPABASE_INTEGRATION=1 \
    SUPABASE_LOCAL_API_URL="$api_url" \
    SUPABASE_LOCAL_ANON_KEY="$anon_key" \
    SUPABASE_LOCAL_SERVICE_ROLE_KEY="$service_role_key" \
    run_with_timeout 180 "node --test integration" \
        "$node_path" --test tests/local-auth-rpc.integration.mjs || test_exit=$?
    local test_end
    test_end=$(date +%s)
    local test_elapsed=$((test_end - test_start))
    echo "command=node --test tests/local-auth-rpc.integration.mjs" >&2
    echo "exit_code=$test_exit" >&2
    echo "elapsed_seconds=$test_elapsed" >&2
    if [[ "$test_exit" -eq 124 ]]; then
        echo "FAIL: node --test tests/local-auth-rpc.integration.mjs exceeded 180 seconds" >&2
    fi

    # 4. Cleanup reset (600s timeout). Report failure separately.
    local cleanup_exit=0
    local cleanup_start
    cleanup_start=$(date +%s)
    run_with_timeout 600 "supabase db reset (cleanup)" env SUPABASE_TELEMETRY_DISABLED=1 "$supabase_path" db reset --local >/dev/null 2>&1 || cleanup_exit=$?
    local cleanup_end
    cleanup_end=$(date +%s)
    local cleanup_elapsed=$((cleanup_end - cleanup_start))
    echo "command=supabase db reset --local (cleanup)" >&2
    echo "exit_code=$cleanup_exit" >&2
    echo "elapsed_seconds=$cleanup_elapsed" >&2
    if [[ "$cleanup_exit" -eq 124 ]]; then
        echo "WARN: supabase db reset --local (cleanup) exceeded 600 seconds" >&2
    fi

    local end_ts
    end_ts=$(date +%s)
    local elapsed=$((end_ts - start_ts))
    echo "run_elapsed=${elapsed}s" >&2
    echo "test_exit=$test_exit" >&2
    echo "cleanup_exit=$cleanup_exit" >&2
    echo "== run end ==" >&2

    if [[ "$cleanup_exit" -ne 0 ]]; then
        echo "WARN: cleanup db reset failed (exit=$cleanup_exit) but tests may have passed" >&2
    fi

    return "$test_exit"
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
case "$MODE" in
    preflight)
        if run_preflight; then
            exit 0
        else
            exit 1
        fi
        ;;
    run)
        if run_integration; then
            exit 0
        else
            exit 1
        fi
        ;;
esac
