import { EMAIL_QUEUE_NAMES, TOPUP_QUEUE } from "./queue.module";

/**
 * Every other email test mocks the queue objects, so nothing ever fed these names to BullMQ --
 * and BullMQ validates the name inside its constructor. Naming the queues "email:critical" etc.
 * passed the entire suite and then failed at container startup in production with "Queue name
 * cannot contain :", rolling the deploy back.
 *
 * The rule is asserted directly rather than by constructing a real Queue: BullMQ opens a Redis
 * connection from its constructor even with lazyConnect, which hangs a unit test that has no
 * Redis. This keeps the guard fast and dependency-free.
 */
describe("queue names", () => {
  const ALL_QUEUES = [...EMAIL_QUEUE_NAMES, TOPUP_QUEUE];

  it.each(ALL_QUEUES)("%s contains no colon (BullMQ key separator)", (name) => {
    expect(name).not.toContain(":");
  });

  it.each(ALL_QUEUES)("%s is a non-empty plain name", (name) => {
    expect(name).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it("uses distinct names, so two lanes cannot share one backlog", () => {
    expect(new Set(ALL_QUEUES).size).toBe(ALL_QUEUES.length);
  });
});
