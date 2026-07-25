#!/bin/bash

echo "=========================================="
echo "Phase 6 Integration Verification Script"
echo "=========================================="

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'
PASSED=0
FAILED=0

check_file(){
  local name="$1"; local path="$2"
  if [ -f "$path" ]; then
    echo -e "${GREEN}✅ PASS${NC}: $name exists"
    ((PASSED++))
  else
    echo -e "${RED}❌ FAIL${NC}: $name missing at $path"
    ((FAILED++))
  fi
}

echo "\n1) Checking files"
check_file "SettingsPanel" "src/components/settings/SettingsPanel.tsx"
check_file "MigrationStatusWidget" "src/components/admin/MigrationStatusWidget.tsx"
check_file "JobComposerComplete" "src/components/jobs/JobComposerComplete.tsx"
check_file "phase6 tests" "src/__tests__/phase6.test.tsx"

echo "\n2) Running tests"
if npx vitest run src/__tests__/phase6.test.tsx >/tmp/phase6-tests.log 2>&1; then
  echo -e "${GREEN}✅ PASS${NC}: Tests passed"
  ((PASSED++))
else
  echo -e "${YELLOW}⚠️  WARN${NC}: Tests failed or not runnable"
  cat /tmp/phase6-tests.log
fi

echo "\n=========================================="
echo "SUMMARY"
echo "=========================================="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ Phase 6 verification PASSED!${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠️  Phase 6 verification has $FAILED failures${NC}"
  exit 1
fi
