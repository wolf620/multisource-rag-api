import { describe, it, expect } from "vitest";
import { AppError, NotFoundError, ValidationError } from "./errors";

describe("AppError hierarchy", () => {
  it("carries status code and error code", () => {
    const err = new AppError("boom", 502, "BAD_GATEWAY");
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe("BAD_GATEWAY");
    expect(err.message).toBe("boom");
  });

  it("NotFoundError is 404 with resource name in message", () => {
    const err = new NotFoundError("Document");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Document not found");
    expect(err).toBeInstanceOf(AppError);
  });

  it("ValidationError is 400", () => {
    const err = new ValidationError("missing field");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
  });
});
