#!/usr/bin/env bash
set -euo pipefail
npx vitest run
bash -lc 'set -o pipefail; npx next typegen 2>&1 | tee /tmp/next-typegen.log'
bash -lc 'set -o pipefail; npm exec tsc -- --noEmit --pretty false 2>&1 | tee /tmp/tsc.log'
bash -lc 'set -o pipefail; npm run build 2>&1 | tee /tmp/build.log'
printf '\nBuild checks complete. Run Playwright against the production preview next.\n'
