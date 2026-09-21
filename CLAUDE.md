# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A maintained fork of the unmaintained upstream `khairul169/garage-webui` — a web
admin UI for [Garage](https://garagehq.deuxfleurs.fr/) S3. Fixes and features are
re-implemented cleanly here rather than cherry-picked from foreign branches.

- Frontend: React 18 + TypeScript + Vite + Tailwind + daisyUI/react-daisyui (`src/`)
- Backend: Go, single binary that serves the built frontend and proxies the Garage
  admin + S3 APIs (`backend/`)
- Deployed as a bare binary under systemd (not Docker) on the maintainer's cluster

Out of scope: SSO (upstream #60) and LDAP (#57).

## Workflow

1. **Propose before implementing.** For anything beyond a small fix, present
   grouped, prioritized proposals (bugfix / security / feature) with rough effort,
   cross-checked against upstream open issues and PRs to avoid redundant work. Wait
   for a pick, then implement.
2. **Verify before reporting done.** Frontend: `npx tsc -b` and a `vite build`.
   Backend: `go build ./... && go vet ./...`.
3. **Bump `version` in `package.json` with every change.** It is shown in the
   sidebar (`__APP_VERSION__`, injected by Vite) and is what `deploy.sh` turns into
   the release tag. Exception: changes to files that ship outside the release
   artifact (e.g. `install.sh`, docs) don't need a bump on their own.

## Commits and releases

The division of labour:

- **Commits are made per change, with a descriptive message** — subject line in the
  imperative, body explaining *why* when the reason isn't obvious from the diff.
  Claude commits its own work unless asked not to. Author identity may not be
  configured in the sandbox shell; pass it explicitly:

  ```bash
  git -c user.name="David Schöfberger" -c user.email="david@schoefberger.at" commit ...
  ```

- **`./deploy.sh` releases.** It reads `version` from `package.json`, pushes the
  branch, and pushes tag `vX.Y.Z`, which triggers the GitHub Actions release
  workflow (linux amd64/arm64 binaries + multi-arch GHCR image).
  It **requires a clean working tree** and aborts otherwise — release tags should
  point at described commits, not a catch-all "Release vX.Y.Z" holding unrelated
  work. `./deploy.sh --commit "message"` is the escape hatch for leftovers.

- **`./install.sh`** (run as root on the server, also published for users) downloads
  a release binary to `/usr/local/bin/garage-webui` and restarts the systemd unit.
  Never build the binary manually for deployment — the release artifact has the
  correct frontend embedded, manual builds cause "new binary, stale UI".

So: Claude commits → `./deploy.sh` tags and releases → `./install.sh` on the server.

## Build and verify

```bash
# frontend
npm install --legacy-peer-deps      # sandbox may also need @rollup/rollup-linux-arm64-gnu
npx tsc -b
npx vite build --outDir /tmp/vite-out --emptyOutDir   # mount blocks unlinking ./dist

# backend
cd backend && go build ./... && go vet ./...
```

## Code notes

- **Theming: never hardcode a bare `text-primary` / `bg-primary` for meaning.** The
  default theme is daisyUI `pastel`, where `primary` is a washed-out lavender that
  reads as disabled. Use paired semantic classes (`badge badge-warning`,
  `progress-success`, `alert-error`) so foreground/background contrast holds across
  all themes in `src/app/themes.ts`.
- **Don't fake grid alignment with percentage margins** (`ml-[calc(33%+…)]`) —
  percentages resolve against the element's own containing block. Extend the shared
  component (e.g. `DetailItem` takes `children`) instead.
- Dropdown/context menus in scrollable lists use `createPortal` with fixed
  positioning, otherwise they're clipped by the scroll container.
- Backend secrets read via `utils.GetSecret` (supports `*_FILE` env variants).
  All new endpoints go behind the existing `AuthMiddleware`.
- The update checker (`backend/router/update.go`, `src/hooks/useUpdateCheck.ts`)
  only *notifies*: latest tags cached 6h server-side, 1h `staleTime` client-side.
  There is deliberately no self-update — Garage has none either, and its upgrades
  need cluster-wide coordination.

## Testing reality

There is no test Garage cluster available. Changes touching the alias refactor,
lifecycle rules, rename, multipart upload, bulk operations and key-permission
verification are unverified at runtime — say so when reporting, rather than
implying they were tested.
