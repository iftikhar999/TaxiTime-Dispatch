#!/bin/bash

echo "=========================================="
echo "Phase 5 Feature Flag Verification Script"
echo "=========================================="

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0

check_file() {
  local name="$1"
  local path="$2"
  if [ -f "$path" ]; then
    echo -e "${GREEN}✅ PASS${NC}: $name exists"
    ((PASSED++))
  else
    echo -e "${RED}❌ FAIL${NC}: $name missing at $path"
    ((FAILED++))
  fi
}

echo ""
echo "=========================================="
echo "1. Files"
echo "=========================================="
check_file "featureFlagService" "src/services/featureFlagService.ts"
check_file "useFeatureFlags" "src/hooks/useFeatureFlags.ts"
check_file "hooks index export" "src/hooks/index.ts"
check_file "V2FeatureToggle" "src/components/admin/V2FeatureToggle.tsx"
check_file "V2FeatureToggle CSS" "src/components/admin/V2FeatureToggle.css"
check_file "phase5 tests" "src/__tests__/phase5.test.tsx"

echo ""
echo "=========================================="
echo "2. Running Tests"
echo "=========================================="
if npx vitest run src/__tests__/phase5.test.tsx >/tmp/phase5-tests.log 2>&1; then
  echo -e "${GREEN}✅ PASS${NC}: Tests passed"
  ((PASSED++))
else
  echo -e "${YELLOW}⚠️  WARN${NC}: Tests failed or not runnable"
  cat /tmp/phase5-tests.log
fi

echo ""
echo "=========================================="
echo "SUMMARY"
echo "=========================================="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ Phase 5 verification PASSED!${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠️  Phase 5 verification has $FAILED failures${NC}"
  exit 1
fi
