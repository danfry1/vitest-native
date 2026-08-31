import { BaseSequencer } from "vitest/node";

export default class AlphabeticalSequencer extends BaseSequencer {
  async sort(files) {
    return [...files].sort((left, right) => left.moduleId.localeCompare(right.moduleId));
  }
}
