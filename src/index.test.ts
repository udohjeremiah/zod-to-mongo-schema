import { describe, expect, it } from "vitest";
import { z } from "zod";

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
        isStudent: { bsonType: "bool" },
        hobbies: { type: "array", items: { type: "string" } },
      },
      required: ["name", "age", "isStudent", "hobbies"],
      additionalProperties: false,
    });
  });

  it("converts deeply nested `boolean` to `bool`", () => {
    const schema = z.object({ a: z.object({ b: z.boolean() }) });
    const r = zodToMongoSchema(schema);
    expect(r.properties.a.properties.b.bsonType).toBe("bool");
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

  it("keeps custom min/max for number", () => {
    const schema = z.object({ age: z.number().min(0).max(100) });

    const r = zodToMongoSchema(schema);

    expect(r.properties.age.type).toBe("number");
    expect(r.properties.age.minimum).toBe(0);
    expect(r.properties.age.maximum).toBe(100);
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
        baz: { bsonType: "bool" },
      },
    });
  });
});
