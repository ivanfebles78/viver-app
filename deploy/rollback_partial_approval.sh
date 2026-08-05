#!/usr/bin/env bash
# ============================================================
# Rollback — Per-item approval feature (migration b8c4f9a2e106)
# ============================================================
# Convenience wrapper around the rollback runbook.  Run locally
# with the Railway CLI logged in to the right project.
#
# Usage:
#   ./deploy/rollback_partial_approval.sh
#
# This will:
#   1. Print what will happen and ask for confirmation.
#   2. Trigger `alembic downgrade -1` on the Railway backend.
#   3. Verify the column is gone.
#
# Does NOT revert the code — do that manually with `git revert`
# and `git push` first (Railway auto-deploys the revert).
# ============================================================

set -euo pipefail

RAILWAY_SERVICE="${RAILWAY_SERVICE:-backend}"

echo "================================================================"
echo "  Rollback: drop pedido_items.estado_item on Railway"
echo "  Service:  ${RAILWAY_SERVICE}"
echo "================================================================"
echo
echo "BEFORE proceeding:"
echo "  [1] You have taken a fresh DB dump from Railway."
echo "  [2] You have already reverted the code commit"
echo "      (git revert <sha> && git push) and Railway finished"
echo "      deploying the revert."
echo
read -rp "Type 'rollback' to continue, anything else to abort: " confirm
if [[ "${confirm}" != "rollback" ]]; then
  echo "Aborted." >&2
  exit 1
fi

echo
echo "→ alembic downgrade -1"
railway run --service "${RAILWAY_SERVICE}" alembic downgrade -1

echo
echo "→ verifying schema..."
railway run --service "${RAILWAY_SERVICE}" python -c "
from sqlalchemy import inspect
from db import engine
cols = {c['name'] for c in inspect(engine).get_columns('pedido_items')}
assert 'estado_item' not in cols, f'estado_item still present: {cols}'
print('OK — estado_item is gone. Columns now:', sorted(cols))
"

echo
echo "Rollback complete."
echo "Re-test legacy flow: Aprobaciones → row-level Aprobar/Denegar → PDF."
