import { describe, expect, it } from "vitest";
import z from "zod";

import zodToMongoSchema from "./index.js";

describe("zod-to-mongo-schema", () => {
  it("returns empty object on falsy/undefined input", () => {
    // @ts-expect-error testing runtime behavior
    expect(zodToMongoSchema()).toEqual({});
    // @ts-expect-error testing runtime behavior
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(zodToMongoSchema(undefined)).toEqual({});
  });

  it("handles empty object schema gracefully", () => {
    const schema = z.object({});
    const r = zodToMongoSchema(schema);
    expect(r).toMatchObject({ type: "object", properties: {} });
  });

  it("converts simple primitives", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      isStudent: z.boolean(),
      hobbies: z.array(z.string()),
    });

    const r = zodToMongoSchema(schema);

    expect(r).toMatchObject({
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
        isStudent: { type: "boolean" },
        hobbies: { type: "array", items: { type: "string" } },
      },
      required: ["name", "age", "isStudent", "hobbies"],
      additionalProperties: false,
    });
  });

  it("converts `integer` type to `int`/`long` based on range", () => {
    const schema = z.object({
      smallInt: z.int32(),
      smallIntDefaultRange: z.int32().min(-2_147_483_648).max(2_147_483_647),
      largeInt: z.int(),
      largeIntDefaultRange: z
        .int()
        .min(-9_007_199_254_740_991)
        .max(9_007_199_254_740_991),
    });

    const r = zodToMongoSchema(schema);

    expect(r.properties.smallInt.bsonType).toBe("int");
    expect(r.properties.smallIntDefaultRange.bsonType).toBe("int");
    expect(r.properties.largeInt.bsonType).toBe("long");
    expect(r.properties.largeIntDefaultRange.bsonType).toBe("long");
  });

  it("uses `number` as long as type isn't `integer` even with default range", () => {
    const schema = z.object({
      val: z.number().min(-2_147_483_648).max(2_147_483_647),
    });
    const r = zodToMongoSchema(schema);
    expect(r.properties.val.type).toBe("number");
  });

  it("keeps custom min/max for `int`/`long`/`number`", () => {
    const schema = z.object({
      smallInt: z.int32().min(-100).max(100),
      minSmallInt: z.int32().min(0),
      largeInt: z.int().min(-5_000_000_000).max(5_000_000_000),
      maxLargeInt: z.int().max(50),
      number: z.number().min(0.1).max(99.9),
    });

    const r = zodToMongoSchema(schema);

    expect(r.properties.smallInt.bsonType).toBe("int");
    expect(r.properties.smallInt.minimum).toBe(-100);
    expect(r.properties.smallInt.maximum).toBe(100);

    expect(r.properties.minSmallInt.bsonType).toBe("int");
    expect(r.properties.minSmallInt.minimum).toBe(0);
    expect(r.properties.minSmallInt.maximum).toBeUndefined();

    expect(r.properties.largeInt.bsonType).toBe("long");
    expect(r.properties.largeInt.minimum).toBe(-5_000_000_000);
    expect(r.properties.largeInt.maximum).toBe(5_000_000_000);

    expect(r.properties.maxLargeInt.bsonType).toBe("long");
    expect(r.properties.maxLargeInt.minimum).toBeUndefined();
    expect(r.properties.maxLargeInt.maximum).toBe(50);

    expect(r.properties.number.type).toBe("number");
    expect(r.properties.number.minimum).toBe(0.1);
    expect(r.properties.number.maximum).toBe(99.9);
  });

  it("preserves `.meta()` fields for title/description", () => {
    const schema = z.object({
      name: z.string().meta({ title: "Full Name", description: "User's name" }),
    });

    const r = zodToMongoSchema(schema);
    expect(r.properties.name).toMatchObject({
      title: "Full Name",
      description: "User's name",
      type: "string",
    });
  });

  it("allows `.meta({ bsonType })` with `z.unknown()`", () => {
    const schema = z.object({
      _id: z.unknown().meta({ bsonType: "objectId" }),
    });

    const r = zodToMongoSchema(schema);
    expect(r.properties._id).toMatchObject({ bsonType: "objectId" });
  });

  it("removes unsupported JSON Schema keys", () => {
    const schema = z.object({
      foo: z.string().meta({
        $schema: "http://json-schema.org/draft-04/schema#",
        default: "bar",
        title: "Foo",
      }),
    });

    const r = zodToMongoSchema(schema);
    expect(r.properties.foo).toMatchObject({
      title: "Foo",
      type: "string",
    });
    expect(r.properties.foo.$schema).toBeUndefined();
    expect(r.properties.foo.default).toBeUndefined();
  });

  it("keeps unsupported JSON Schema keys if they are used as property names", () => {
    const schema = z.object({
      id: z.number(),
      format: z.string(),
      definitions: z.array(z.string()),
    });

    const r = zodToMongoSchema(schema);

    expect(r.properties).toMatchObject({
      id: { type: "number" },
      format: { type: "string" },
      definitions: { type: "array", items: { type: "string" } },
    });

    expect(r.required).toEqual(["id", "format", "definitions"]);
  });

  it("strips unsupported keywords when used inside a `properties` field", () => {
    const schema = z.object({
      properties: z.object({
        field1: z.string().default("foo"),
        field2: z.number().meta({ $schema: "example" }),
      }),
    });

    const r = zodToMongoSchema(schema);

    expect(r.properties.properties).toMatchObject({
      type: "object",
      properties: {
        field1: { type: "string" },
        field2: { type: "number" },
      },
    });

    expect(r.properties.properties.properties.field1.default).toBeUndefined();
    expect(r.properties.properties.properties.field2.$schema).toBeUndefined();
  });

  it("handles nested objects and arrays", () => {
    const schema = z.object({
      posts: z.array(
        z.object({
          title: z.string(),
          likes: z.int(),
          tags: z.array(z.string()),
        }),
      ),
    });

    const r = zodToMongoSchema(schema);
    expect(r.properties.posts).toMatchObject({
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          likes: { bsonType: "long" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    });
  });

  it("overrides base schema fields with those from `.meta()`", () => {
    const schema1 = z
      .object({
        foo: z.string().meta({ type: "number" }),
        nested: z
          .object({
            bar: z.number(),
            baz: z.string(),
          })
          .meta({
            title: "Nested Object",
            additionalProperties: true,
            properties: {
              baz: { type: "boolean" },
            },
          }),
      })
      .meta({
        additionalProperties: true,
        properties: {
          foo: { type: "string" },
        },
      });

    const r1 = zodToMongoSchema(schema1);

    expect(r1).toMatchObject({
      additionalProperties: true,
      properties: {
        foo: { type: "string" },
      },
    });

    const schema2 = z.object({
      foo: z.string().meta({ type: "number" }),
      nested: z
        .object({
          bar: z.number(),
          baz: z.string(),
        })
        .meta({
          additionalProperties: true,
          properties: {
            baz: { type: "boolean" },
          },
        }),
    });

    const r2 = zodToMongoSchema(schema2);

    expect(r2.properties.foo).not.toMatchObject({ type: "string" });

    expect(r2.properties.nested).toMatchObject({
      additionalProperties: true,
      properties: {
        baz: { type: "boolean" },
      },
    });
  });
});
