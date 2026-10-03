#!/usr/bin/env bash
# Point git at the repo's tracked hooks (.githooks/). Run once after cloning.
# Committed with mode 755, as is .githooks/pre-commit: git silently skips a
# hook that is not executable, so the gate would look installed and never fire.
set -e
git config core.hooksPath .githooks
echo "Installed: core.hooksPath -> .githooks"
