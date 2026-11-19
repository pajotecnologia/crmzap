import { Request, Response } from "express";

jest.mock("../models/User", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));

import User from "../models/User";
import isAdminEmailOnly from "../middleware/isAdminEmailOnly";

const findByPk = User.findByPk as unknown as jest.Mock;

const run = (user?: { id: string | number }) => {
  const req = { user } as unknown as Request;
  const next = jest.fn();
  return { promise: isAdminEmailOnly(req, {} as Response, next), next };
};

describe("isAdminEmailOnly", () => {
  it("allows admin@admin.com (case/space insensitive)", async () => {
    findByPk.mockResolvedValue({ id: 1, email: " Admin@Admin.com " });
    const { promise, next } = run({ id: 1 });
    await promise;
    expect(next).toHaveBeenCalledTimes(1);
    expect(findByPk).toHaveBeenCalledWith(1, { attributes: ["id", "email"] });
  });

  it("rejects other users with 403", async () => {
    findByPk.mockResolvedValue({ id: 2, email: "admin@admin.com.br" });
    const { promise, next } = run({ id: 2 });
    await expect(promise).rejects.toMatchObject({ statusCode: 403 });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects when the user does not exist", async () => {
    findByPk.mockResolvedValue(null);
    const { promise, next } = run({ id: 3 });
    await expect(promise).rejects.toMatchObject({ statusCode: 403 });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests without querying the database", async () => {
    const { promise, next } = run(undefined);
    await expect(promise).rejects.toMatchObject({ statusCode: 403 });
    expect(findByPk).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
