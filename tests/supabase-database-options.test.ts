import { describe, expect, it } from "vitest";

import { supabaseDatabaseOptions } from "@/modules/supabase/database";

describe("supabaseDatabaseOptions", () => {
  it("truyền pool đã được validate mà không làm thay đổi các guard Supavisor", () => {
    expect(
      supabaseDatabaseOptions({
        SUPABASE_DATABASE_URL: "postgresql://example.test/postgres",
        SUPABASE_POOL_MAX: 3,
      }),
    ).toEqual({
      prepare: false,
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: "require",
      transform: { undefined: null },
    });
  });
});
