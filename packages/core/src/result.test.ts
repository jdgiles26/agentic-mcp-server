import { describe, expect, it } from "vitest";
import {
  err,
  flatMap,
  fromThrowable,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  unwrapOr,
} from "./result.js";

describe("Result", () => {
  it("ok wraps a value", () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (isOk(r)) expect(r.value).toBe(42);
  });

  it("err wraps an error", () => {
    const r = err("boom");
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
    if (isErr(r)) expect(r.error).toBe("boom");
  });

  it("map transforms the ok branch", () => {
    expect(map(ok(2), (n) => n * 3)).toEqual(ok(6));
  });

  it("map passes err through", () => {
    expect(map(err("x"), (n: number) => n + 1)).toEqual(err("x"));
  });

  it("flatMap chains results", () => {
    const r = flatMap(ok(2), (n) => ok(n + 1));
    expect(r).toEqual(ok(3));
  });

  it("flatMap short-circuits on err", () => {
    const r = flatMap(err("nope"), (n: number) => ok(n + 1));
    expect(r).toEqual(err("nope"));
  });

  it("mapErr transforms only the err branch", () => {
    expect(mapErr(err("a"), (s) => s.toUpperCase())).toEqual(err("A"));
    expect(mapErr(ok(1), (s: string) => s.toUpperCase())).toEqual(ok(1));
  });

  it("unwrapOr returns the value or fallback", () => {
    expect(unwrapOr(ok(7), 0)).toBe(7);
    expect(unwrapOr(err("x"), 0)).toBe(0);
  });

  it("fromThrowable wraps a non-throwing async fn as ok", async () => {
    const r = await fromThrowable(async () => 5, (e) => String(e));
    expect(r).toEqual(ok(5));
  });

  it("fromThrowable wraps a throwing async fn as err", async () => {
    const r = await fromThrowable(
      async () => {
        throw new Error("kapow");
      },
      (e) => (e instanceof Error ? e.message : "unknown"),
    );
    expect(r).toEqual(err("kapow"));
  });
});
