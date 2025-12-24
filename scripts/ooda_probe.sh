#!/usr/bin/env bash
# Read-only tmux probe for OODA loop experiments.
# Prints a width-aware table: Agent | Busy/Free | Title
# Optional logging to history/ooda_probe_<ts>.txt

set -euo pipefail

DEFAULT_INTERVAL=${OODA_PROBE_INTERVAL:-5}
DEFAULT_BACKOFF_CYCLES=${OODA_PROBE_BACKOFF_CYCLES:-12}
DEFAULT_BACKOFF_MAX=${OODA_PROBE_BACKOFF_MAX:-60}
DEFAULT_LOG_PATH=${OODA_PROBE_LOG:-"history/ooda_probe_$(date +%s).txt"}
JITTER_MAX=${OODA_PROBE_JITTER_MAX:-1}

sample_mode=false
once=false
interval=$DEFAULT_INTERVAL
log_path=$DEFAULT_LOG_PATH
log_enabled=true

usage() {
  cat <<'EOF'
Usage: ooda_probe.sh [--once] [--interval <seconds>] [--log <path>] [--no-log] [--sample]

Options:
  --once          Run a single probe and exit
  --interval, -i  Poll interval in seconds (default: 5)
  --log, -l       Log path (default: history/ooda_probe_<ts>.txt)
  --no-log        Disable logging
  --sample        Use built-in sample data (no tmux required)
  -h, --help      Show this help
EOF
}

log() {
  printf '%s\n' "$*" >&2
}

truncate_field() {
  local text=$1
  local max_len=$2
  local len=${#text}
  if (( len <= max_len )); then
    printf '%s' "$text"
  else
    printf '%s…' "${text:0:max_len-1}"
  fi
}

sample_panes() {
  cat <<'EOF'
map:0.0	Map busy wf-cvz	12345
forge:1.0	Forge idle	23456
ship:2.0	ship running tests	34567
sentinel:3.1	idle	-
EOF
}

collect_tmux_panes() {
  tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index}\t#{pane_title}\t#{pane_pid}'
}

ps_stats() {
  local pid=$1
  ps -p "$pid" -o stat= -o pcpu= 2>/dev/null | head -n1
}

classify_status() {
  local title=$1
  local stat=$2
  local cpu=$3

  local lower=${title,,}
  if [[ $lower == *busy* || $lower == *in_progress* || $lower == *running* || $lower == *agent* || $lower =~ [a-z]+-[a-z0-9.]+ ]]; then
    printf 'Busy\tkeyword'
    return
  fi

  if [[ -z ${lower// } || $lower == *idle* ]]; then
    printf 'Free\tidle-title'
    return
  fi

  if [[ -n ${stat:-} || -n ${cpu:-} ]]; then
    local cpu_int=${cpu%.*}
    if [[ -n $cpu && ${cpu%%.*} != "$cpu" ]]; then
      cpu_int=${cpu%%.*}
    fi
    if [[ -n $cpu && ${cpu%%.*} -gt 0 ]]; then
      printf 'Busy\tprocess-cpu'
      return
    fi
    if [[ -n $stat && ${stat:0:1} != "S" && ${stat:0:1} != "I" ]]; then
      printf 'Busy\tprocess-state'
      return
    fi
    printf 'Free\tprocess-idle'
    return
  fi

  printf 'Free\tfallback'
}

probe_once() {
  local panes_raw
  if $sample_mode; then
    panes_raw=$(sample_panes)
  else
    if ! command -v tmux >/dev/null 2>&1; then
      log "tmux not found; rerun with --sample for synthetic data"
      return 1
    fi
    panes_raw=$(collect_tmux_panes)
  fi

  local rows=()
  while IFS=$'\t' read -r agent title pid; do
    [[ -z $agent ]] && continue
    if [[ $pid == "" || $pid == "-" || $pid == "-1" ]]; then
      pid=""
    fi
    local stat="" cpu=""
    if [[ -n $pid ]]; then
      read -r stat cpu <<<"$(ps_stats "$pid")" || true
    fi
    read -r status reason <<<"$(classify_status "$title" "${stat:-}" "${cpu:-}")"
    rows+=("$agent|$status|$title|${pid:-}|${stat:-}|${cpu:-}|$reason")
  done <<<"$panes_raw"

  print_table rows[@]
  log_raw "$panes_raw" rows[@]
}

print_table() {
  local -a data=("${!1}")
  local header_agent="Agent"
  local header_status="Status"
  local header_title="Title"
  local agent_w=${#header_agent}
  local status_w=${#header_status}
  local title_w=${#header_title}

  for row in "${data[@]}"; do
    IFS='|' read -r agent status title _ <<<"$row"
    (( ${#agent} > agent_w )) && agent_w=${#agent}
    (( ${#status} > status_w )) && status_w=${#status}
  done

  local term_cols=${COLUMNS:-$(tput cols 2>/dev/null || echo 120)}
  local padding=6
  local computed_title=$(( term_cols - agent_w - status_w - padding ))
  if (( computed_title > title_w )); then
    title_w=$computed_title
  fi
  if (( title_w < 10 )); then
    title_w=10
  fi

  printf '%-*s | %-*s | %-*s\n' "$agent_w" "$header_agent" "$status_w" "$header_status" "$title_w" "$header_title"
  printf '%-*s-+-%-*s-+-%-*s\n' "$agent_w" "$(printf '%.0s-' $(seq 1 $agent_w))" "$status_w" "$(printf '%.0s-' $(seq 1 $status_w))" "$title_w" "$(printf '%.0s-' $(seq 1 $title_w))"
  for row in "${data[@]}"; do
    IFS='|' read -r agent status title _stat _cpu _reason <<<"$row"
    printf '%-*s | %-*s | %-*s\n' "$agent_w" "$agent" "$status_w" "$status" "$title_w" "$(truncate_field "$title" $title_w)"
  done
}

log_raw() {
  $log_enabled || return 0
  local panes_raw=$1
  shift
  local -a data=("${!1}")
  local ts
  ts=$(date -Is)
  mkdir -p "$(dirname "$log_path")"

  if [[ ! -f $log_path ]]; then
    printf '# ooda probe log\n' >"$log_path"
  fi
  {
    printf '\n[%s]\n' "$ts"
    printf 'tmux\t%s\n' "$panes_raw" | sed 's/\n/\\n/g'
    for row in "${data[@]}"; do
      IFS='|' read -r agent status title pid stat cpu reason <<<"$row"
      printf 'pane=%s\tstatus=%s\ttitle=%s\tpid=%s\tstat=%s\tpcpu=%s\treason=%s\n' \
        "$agent" "$status" "$title" "${pid:-}" "${stat:-}" "${cpu:-}" "$reason"
    done
  } >>"$log_path"
}

main() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      --once) once=true; shift ;;
      --interval|-i) interval=${2:?}; shift 2 ;;
      --log|-l) log_path=$2; shift 2 ;;
      --no-log) log_enabled=false; shift ;;
      --sample) sample_mode=true; shift ;;
      -h|--help) usage; exit 0 ;;
      *) log "Unknown option: $1"; usage; exit 1 ;;
    esac
  done

  if $once; then
    probe_once
    exit $?
  fi

  local stable_cycles=0
  local last_fingerprint=""
  local current_interval=$interval

  while true; do
    if ! output=$(probe_once); then
      exit 1
    fi
    printf '%s\n' "$output"

    local fingerprint
    fingerprint=$(printf '%s\n' "$output" | sha1sum | awk '{print $1}')
    if [[ $fingerprint == "$last_fingerprint" ]]; then
      ((stable_cycles++))
      if (( stable_cycles >= DEFAULT_BACKOFF_CYCLES )); then
        current_interval=$DEFAULT_BACKOFF_MAX
      fi
    else
      stable_cycles=0
      current_interval=$interval
      last_fingerprint=$fingerprint
    fi

    local jitter=0
    if (( JITTER_MAX > 0 )); then
      jitter=$(( RANDOM % (JITTER_MAX + 1) ))
    fi
    sleep $(( current_interval + jitter ))
  done
}

main "$@"
