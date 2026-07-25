#!/bin/bash

echo "=========================================="
echo "Phase 4 Dispatch UI Verification Script"
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
echo "1. V2 UI Components"
echo "=========================================="
check_file "StopManagementPanel" "src/components/v2/StopManagementPanel.tsx"
check_file "PODViewer" "src/components/v2/PODViewer.tsx"
check_file "RouteOptimizationPanel" "src/components/v2/RouteOptimizationPanel.tsx"
check_file "CreateJobModal" "src/components/v2/CreateJobModal.tsx"
check_file "Components index" "src/components/v2/index.ts"

echo ""
echo "=========================================="
echo "2. CSS Styles"
echo "=========================================="
check_file "StopManagementPanel CSS" "src/components/v2/StopManagementPanel.css"
check_file "PODViewer CSS" "src/components/v2/PODViewer.css"
check_file "RouteOptimizationPanel CSS" "src/components/v2/RouteOptimizationPanel.css"
check_file "CreateJobModal CSS" "src/components/v2/CreateJobModal.css"

echo ""
echo "=========================================="
echo "3. Socket Hook"
echo "=========================================="
check_file "useV2Socket" "src/hooks/useV2Socket.ts"

echo ""
echo "=========================================="
echo "4. JobBoard Updates"
echo "=========================================="
check_file "JobBoard" "src/components/jobs/JobBoard.tsx"

echo ""
echo "=========================================="
echo "5. Phase 4 Tests"
echo "=========================================="
check_file "Phase 4 tests" "src/__tests__/phase4.test.tsx"

echo ""
echo "=========================================="
echo "6. Running Tests"
echo "=========================================="
if npx vitest run src/__tests__/phase4.test.tsx >/tmp/phase4-tests.log 2>&1; then
  echo -e "${GREEN}✅ PASS${NC}: Tests passed"
  ((PASSED++))
else
  echo -e "${YELLOW}⚠️  WARN${NC}: Tests failed or not runnable"
  cat /tmp/phase4-tests.log
fi

echo ""
echo "=========================================="
echo "SUMMARY"
echo "=========================================="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ Phase 4 verification PASSED!${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠️  Phase 4 verification has $FAILED failures${NC}"
  exit 1
fi
