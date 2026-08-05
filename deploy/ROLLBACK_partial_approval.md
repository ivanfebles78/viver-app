# Rollback — Per-item approval (`b8c4f9a2e106`)

Runbook to safely revert the per-item pedido approval feature on **Railway**
(both code + database).  Use this if the new behaviour breaks production
after deploy.

## What this rollback does

1. Reverts the code on the backend (`main.py`, `schemas.py`, `models.py`) and
   frontend (`Aprobaciones.jsx`) to the pre-feature state.
2. Drops the `pedido_items.estado_item` column and its index via Alembic
   downgrade.
3. Leaves all `pedido_items` rows otherwise untouched — no data loss.

The migration is **non-destructive**: the column carries no information that
the old code reads, and dropping it does not break the legacy
"approve / deny whole pedido" workflow (which reads only `pedidos.estado`).

## Pre-checks

- [ ] Take a fresh DB dump from Railway **before** running anything.
      Postgres → "Data" tab → Export → save the `.sql` somewhere safe.
- [ ] Confirm the broken behaviour is actually caused by this feature.
      Quick test: log a request to `/pedidos/{id}/aprobar` with an empty body —
      that path still goes through the new `_select_items_for_action` helper
      with `item_ids=None`, which approves **all** still-RESERVA items.  If
      this works correctly, the regression is probably elsewhere.

## Step-by-step rollback

### 1) Revert the code

From the repo root:

```bash
# Find the commit that introduced the feature (the one that added the migration):
git log --oneline --grep "per-item approval"

# Revert it (creates a new commit that undoes the changes):
git revert <commit-sha>
git push origin main
```

Railway auto-deploys.  Wait for the build to finish before continuing.

### 2) Downgrade the database

The migration registers a clean `downgrade()` that drops the column and
its index defensively (it inspects the schema first, so it is safe to run
even if the column was never added).

**Via Railway CLI** (recommended):

```bash
railway run --service backend alembic downgrade -1
```

The `-1` is shorthand for "one step before HEAD".  This will go from
`b8c4f9a2e106` back to `671644fc3faf` (the previous migration,
`add pedidos`).

**Via SSH into the Railway container** (alternative):

```bash
railway ssh
cd /app    # or wherever the backend code lives in the container
alembic downgrade -1
exit
```

Verify the schema is clean:

```bash
railway run --service backend python -c \
  "from sqlalchemy import inspect; from db import engine; \
   print({c['name'] for c in inspect(engine).get_columns('pedido_items')})"
```

The set should NOT contain `estado_item`.

### 3) Smoke test the legacy flow

- [ ] Login as manager → Aprobaciones → see the list.
- [ ] Click row-level "Aprobar" on a pedido in RESERVA → goes APROBADO.
- [ ] Click row-level "Denegar" on another → goes DENEGADO.
- [ ] Open the detail modal — it should be read-only (no per-item actions).
- [ ] PDF download still works for APROBADO/SERVIDO pedidos.

## Emergency: skip Alembic, run raw SQL

If Alembic's downgrade fails (rare — usually because a previous migration
is broken or the alembic_version table got out of sync), you can drop the
column directly.  Use `deploy/rollback_db_emergency.sql` — connect to the
Postgres on Railway and run it.

```bash
# Open psql against the Railway DB
railway connect postgres
# then paste the SQL or:
\i /path/to/rollback_db_emergency.sql
```

After running it manually, also rewrite the Alembic head so future
migrations don't try to re-drop the column:

```sql
UPDATE alembic_version SET version_num = '671644fc3faf';
```

## What to do AFTER the rollback

- Identify the actual bug in the feature code locally.  The migration
  itself is simple ADD COLUMN + UPDATE; most regression risk is in the
  endpoint logic (`aprobar_pedido` / `denegar_pedido`) or the frontend
  modal.
- Fix → re-test locally → re-deploy.  The migration can be re-applied
  cleanly with `alembic upgrade head` because it's defensive (no-op if
  the column is already there).

## Files involved (touch nothing else)

```
alembic/versions/b8c4f9a2e106_pedido_items_estado_item.py
models.py                                         (PedidoItem.estado_item)
schemas.py                                        (PedidoActionRequest.item_ids, PedidoItemOut.estado_item)
main.py                                           (helpers + aprobar/denegar/pdf changes)
frontend/src/pages/Aprobaciones.jsx               (interactive modal)
```
