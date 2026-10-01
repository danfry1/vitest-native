// Worker preload (`--import`, from `test.execArgv`): installs the export-condition
// recovery before Vitest loads the test environment. See export-condition-recovery.mjs.
import { installExportConditionRecovery } from "./export-condition-recovery.mjs";

installExportConditionRecovery();
