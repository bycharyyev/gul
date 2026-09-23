import { canTransition, type TransitionMap } from "./state-machine";

describe("canTransition", () => {
  const transitions: TransitionMap<"NEW" | "DONE"> = { NEW: ["DONE"], DONE: [] };

  it("allows only explicitly declared edges", () => {
    expect(canTransition(transitions, "NEW", "DONE")).toBe(true);
    expect(canTransition(transitions, "DONE", "NEW")).toBe(false);
  });
});
