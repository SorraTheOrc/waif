# OODA scheduler config examples (test fixtures)

This file collects example YAML configs used by config-loader/validation tests.

These are **fixtures**, not canonical operator docs.

## valid

```yaml
version: v1
retention:
  maxDays: 7
  maxFiles: 50
  maxBytes: 50000000
jobs:
  - id: probe-map
    name: Map status probe
    cron: "*/1 * * * *"
    events: .opencode/logs/events.jsonl
    snapshot:
      path: history/ooda_snapshot.jsonl
      mode: append
    capture:
      includeRawEvents: false
```

## invalid-id

```yaml
version: v1
jobs:
  - id: "bad id with spaces"
    name: Bad id
    cron: "*/5 * * * *"
    events: .opencode/logs/events.jsonl
    snapshot:
      path: history/ooda_snapshot.jsonl
      mode: append
```

## invalid-cron

```yaml
version: v1
jobs:
  - id: probe-map
    name: Bad cron
    cron: "not a cron"
    events: .opencode/logs/events.jsonl
    snapshot:
      path: history/ooda_snapshot.jsonl
      mode: append
```

## invalid-capture

```yaml
version: v1
jobs:
  - id: probe-map
    name: Bad capture
    cron: "*/5 * * * *"
    events: .opencode/logs/events.jsonl
    snapshot:
      path: history/ooda_snapshot.jsonl
      mode: append
    capture:
      includeRawEvents: "yes" # should be boolean
```

## missing-name

```yaml
version: v1
jobs:
  - id: probe-map
    cron: "*/5 * * * *"
    events: .opencode/logs/events.jsonl
    snapshot:
      path: history/ooda_snapshot.jsonl
      mode: append
```

## invalid-retention

```yaml
version: v1
retention:
  maxDays: -1
  maxFiles: 0
  maxBytes: -5
jobs:
  - id: probe-map
    name: Bad retention
    cron: "*/5 * * * *"
    events: .opencode/logs/events.jsonl
    snapshot:
      path: history/ooda_snapshot.jsonl
      mode: append
```

## invalid-yaml

```yaml
version: v1
jobs:
  - id: probe-map
    name: invalid yaml example
    cron "*/5 * * * *"  # missing ':'
    events: .opencode/logs/events.jsonl
```
