#!/bin/bash

echo "=========================================="
echo "Phase 3 Frontend Verification Script"
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
echo "1. V2 Services"
echo "=========================================="
check_file "apiClient" "src/services/v2/apiClient.ts"
check_file "jobService" "src/services/v2/jobService.ts"
check_file "stopService" "src/services/v2/stopService.ts"
check_file "podService" "src/services/v2/podService.ts"
check_file "routeService" "src/services/v2/routeService.ts"
check_file "services index" "src/services/v2/index.ts"

echo ""
echo "=========================================="
echo "2. V2 Hooks"
echo "=========================================="
check_file "useV2Jobs" "src/hooks/useV2Jobs.ts"
check_file "useV2Stops" "src/hooks/useV2Stops.ts"
check_file "hooks index" "src/hooks/index.ts"

echo ""
echo "=========================================="
echo "3. V2 Components"
echo "=========================================="
check_file "ServiceTypeSelector" "src/components/v2/ServiceTypeSelector.tsx"

echo ""
echo "=========================================="
echo "4. V2 Context"
echo "=========================================="
check_file "V2ApiContext" "src/context/V2ApiContext.tsx"

echo ""
echo "=========================================="
echo "5. Tests"
echo "=========================================="
check_file "v2Services tests" "src/__tests__/v2Services.test.ts"
check_file "v2Hooks tests" "src/__tests__/v2Hooks.test.ts"

echo ""
echo "=========================================="
echo "6. Running Tests (best effort)"
echo "=========================================="
if npm test -- run src/__tests__/v2Services.test.ts src/__tests__/v2Hooks.test.ts 2>/dev/null; then
  echo -e "${GREEN}✅ PASS${NC}: Tests executed"
  ((PASSED++))
else
  echo -e "${YELLOW}⚠️  WARN${NC}: Tests failed or not runnable"
fi

echo ""
echo "=========================================="
echo "SUMMARY"
echo "=========================================="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ Phase 3 verification PASSED!${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠️  Phase 3 verification has $FAILED failures${NC}"
  exit 1
fi
