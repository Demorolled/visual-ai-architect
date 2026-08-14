# Visual AI Architect — build-time checks for the training pipeline.
# Wired into package.json "build" too; this is the Makefile equivalent.

.PHONY: check-training check-training-quick tsc-concurrency probe-self-check test-cleanup-round

## test-cleanup-round — retention logic for the round-artifact auto-cleanup
## (scripts/cleanup-round-artifacts.py)
test-cleanup-round:
	python3 tests/test-cleanup-round-artifacts.py

## check-training — full build-time gate (py_compile + concurrency test + probe self-check)
check-training:
	bash scripts/check-training.sh
	python3 tests/test-cleanup-round-artifacts.py

## check-training-quick — fewer calls (fast local iteration; probe self-check still runs)
check-training-quick:
	bash scripts/check-training.sh --quick

## tsc-concurrency — run only the tsc_check concurrency safety test
tsc-concurrency:
	python3 tests/test-tsc-concurrency.py

## probe-self-check — CI self-check: the shared-scratch probe must still detect the bug it guards
probe-self-check:
	python3 tests/test-tsc-concurrency.py --fail-on-probe-clean
