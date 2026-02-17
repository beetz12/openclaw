/**
 * Tests for SSE event replay functionality
 */

import { describe, it, expect } from "vitest";
import { EventBuffer } from "./sse.js";

describe("EventBuffer", () => {
  it("stores events with sequential IDs", () => {
    const buffer = new EventBuffer(10);

    const id1 = buffer.add({ type: "test1", data: "data1" });
    const id2 = buffer.add({ type: "test2", data: "data2" });
    const id3 = buffer.add({ type: "test3", data: "data3" });

    expect(id1).toBe(1);
    expect(id2).toBe(2);
    expect(id3).toBe(3);
  });

  it("replays events since a given ID", () => {
    const buffer = new EventBuffer(10);

    buffer.add({ type: "event1", data: "data1" });
    buffer.add({ type: "event2", data: "data2" });
    buffer.add({ type: "event3", data: "data3" });
    buffer.add({ type: "event4", data: "data4" });
    buffer.add({ type: "event5", data: "data5" });

    const replayed = buffer.replaySince(2);

    expect(replayed).toHaveLength(3);
    expect(replayed[0]).toEqual({ id: 3, event: { type: "event3", data: "data3" } });
    expect(replayed[1]).toEqual({ id: 4, event: { type: "event4", data: "data4" } });
    expect(replayed[2]).toEqual({ id: 5, event: { type: "event5", data: "data5" } });
  });

  it("returns all events when lastId is 0", () => {
    const buffer = new EventBuffer(10);

    buffer.add({ type: "event1", data: "data1" });
    buffer.add({ type: "event2", data: "data2" });
    buffer.add({ type: "event3", data: "data3" });

    const replayed = buffer.replaySince(0);

    expect(replayed).toHaveLength(3);
  });

  it("returns empty array when lastId is current", () => {
    const buffer = new EventBuffer(10);

    buffer.add({ type: "event1", data: "data1" });
    buffer.add({ type: "event2", data: "data2" });
    const lastId = buffer.add({ type: "event3", data: "data3" });

    const replayed = buffer.replaySince(lastId);

    expect(replayed).toHaveLength(0);
  });

  it("evicts oldest events when capacity is exceeded", () => {
    const buffer = new EventBuffer(3);

    buffer.add({ type: "event1", data: "data1" });
    buffer.add({ type: "event2", data: "data2" });
    buffer.add({ type: "event3", data: "data3" });
    buffer.add({ type: "event4", data: "data4" });
    buffer.add({ type: "event5", data: "data5" });

    // Should only have the last 3 events (3, 4, 5)
    const replayed = buffer.replaySince(0);

    expect(replayed).toHaveLength(3);
    expect(replayed[0]).toEqual({ id: 3, event: { type: "event3", data: "data3" } });
    expect(replayed[1]).toEqual({ id: 4, event: { type: "event4", data: "data4" } });
    expect(replayed[2]).toEqual({ id: 5, event: { type: "event5", data: "data5" } });
  });

  it("handles replay when some events have been evicted", () => {
    const buffer = new EventBuffer(3);

    buffer.add({ type: "event1", data: "data1" }); // id: 1
    buffer.add({ type: "event2", data: "data2" }); // id: 2
    buffer.add({ type: "event3", data: "data3" }); // id: 3
    buffer.add({ type: "event4", data: "data4" }); // id: 4 (evicts event1)
    buffer.add({ type: "event5", data: "data5" }); // id: 5 (evicts event2)

    // Trying to replay since ID 1 should only get events 3, 4, 5
    const replayed = buffer.replaySince(1);

    expect(replayed).toHaveLength(3);
    expect(replayed[0].id).toBe(3);
    expect(replayed[1].id).toBe(4);
    expect(replayed[2].id).toBe(5);
  });

  it("maintains sequential IDs even after eviction", () => {
    const buffer = new EventBuffer(2);

    const id1 = buffer.add({ type: "event1", data: "data1" });
    const id2 = buffer.add({ type: "event2", data: "data2" });
    const id3 = buffer.add({ type: "event3", data: "data3" }); // evicts event1
    const id4 = buffer.add({ type: "event4", data: "data4" }); // evicts event2

    expect(id1).toBe(1);
    expect(id2).toBe(2);
    expect(id3).toBe(3);
    expect(id4).toBe(4);

    const replayed = buffer.replaySince(0);
    expect(replayed).toHaveLength(2);
    expect(replayed[0].id).toBe(3);
    expect(replayed[1].id).toBe(4);
  });
});
