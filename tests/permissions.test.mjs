import assert from "node:assert/strict";
import test from "node:test";

import {
  can,
  hasRole,
  isAdmin,
} from "../lib/auth/permissions.ts";

const user = {
  id: "00000000-0000-0000-0000-000000000001",
  full_name: "Mario Rossi",
  role: "user",
  is_active: true,
};

const admin = {
  ...user,
  id: "00000000-0000-0000-0000-000000000002",
  role: "admin",
};

test("an active user can use user operations but not admin operations", () => {
  assert.equal(can(user, "catalog:read"), true);
  assert.equal(can(user, "requests:create"), true);
  assert.equal(can(user, "requests:manage"), false);
  assert.equal(hasRole(user, "user"), true);
  assert.equal(isAdmin(user), false);
});

test("an active admin inherits user operations and can manage resources", () => {
  assert.equal(can(admin, "catalog:read"), true);
  assert.equal(can(admin, "requests:manage"), true);
  assert.equal(can(admin, "users:manage"), true);
  assert.equal(hasRole(admin, ["user", "admin"]), true);
  assert.equal(isAdmin(admin), true);
});

test("an inactive profile cannot perform any operation", () => {
  const inactiveAdmin = { ...admin, is_active: false };

  assert.equal(can(inactiveAdmin, "catalog:read"), false);
  assert.equal(can(inactiveAdmin, "users:manage"), false);
  assert.equal(hasRole(inactiveAdmin, "admin"), false);
  assert.equal(isAdmin(inactiveAdmin), false);
});
