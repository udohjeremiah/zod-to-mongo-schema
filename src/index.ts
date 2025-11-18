/* eslint-disable @typescript-eslint/no-explicit-any */

import * as z4 from "zod/v4/core";

import type { MongoSchema } from "./zod.js";

/**
 * MongoDB available JSON Schema keywords
 * @see https://www.mongodb.com/docs/manual/reference/operator/query/jsonSchema/#available-keywords
 */
const AVAILABLE_KEYWORDS = new Set([
  "additionalItems",
  "additionalProperties",
  "allOf",
  "anyOf",
  "bsonType",
  "dependencies",
  "description",
  "enum",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "items",
  "maximum",
  "maxItems",
  "maxLength",
  "maxProperties",
  "minimum",
  "minItems",
  "minLength",
  "minProperties",
  "multipleOf",
  "not",
  "oneOf",
  "pattern",
  "patternProperties",
  "properties",
  "required",
  "title",
  "type",
  "uniqueItems",
] as const);

/** @internal */
function _inferMongoNumericType(json: Record<string, any>) {
  const type = json.type ?? json.bsonType;

  // Only process number-like schemas
  if (type !== "integer" && type !== "number") {
    return type;
  }

  // Integer ranges
  const INT32_MIN = -2_147_483_648;
  const INT32_MAX = 2_147_483_647;
  const INT53_MIN = -9_007_199_254_740_991;
  const INT53_MAX = 9_007_199_254_740_991;
  const INT64_MIN = -9_223_372_036_854_775_808n;
  const INT64_MAX = 9_223_372_036_854_775_808n;

  // Float ranges
  const FLOAT32_MIN = -3.402_823_466_385_288_6e38;
  const FLOAT32_MAX = 3.402_823_466_385_288_6e38;
  const FLOAT64_MIN = -1.797_693_134_862_315_7e308;
  const FLOAT64_MAX = 1.797_693_134_862_315_7e308;

  const min = json.minimum ?? undefined;
  const max = json.maximum ?? undefined;

  // Handle integers
  if (type === "integer") {
    // Match exact `int32` range
    if (min === INT32_MIN && max === INT32_MAX) {
      // Range same as MongoDB `int`, so remove redundant bounds
      delete json.minimum;
      delete json.maximum;
      return "int";
    }

    // Match exact `int` (JS safe integer) range
    if (min === INT53_MIN && max === INT53_MAX) {
      // `int` is upgraded to MongoDB `long`, so remove redundant bounds
      delete json.minimum;
      delete json.maximum;
      return "long";
    }

    // If a custom range is specified, then let the range decide.
    if (min !== undefined && max !== undefined) {
      // Zod automatically adds minimum and maximum for `int32` and `int`,
      // even if the user doesn't specify them. We want to detect those
      // auto-added bounds and remove them so only user-specified bounds
      // are present.
      if (min >= INT32_MIN && max <= INT32_MAX) {
        if (json.minimum === INT32_MIN) delete json.minimum;
        if (json.maximum === INT32_MAX) delete json.maximum;
        return "int";
      }

      if (BigInt(min) >= INT64_MIN && BigInt(max) <= INT64_MAX) {
        if (json.minimum === INT53_MIN) delete json.minimum;
        if (json.maximum === INT53_MAX) delete json.maximum;
        return "long";
      }
    }

    // Beyond 64-bit integers — fallback
    return "number";
  }

  // Handle floating numbers
  if (type === "number") {
    /**
     * ⚠️ Why only canonical float ranges are supported:
     *
     * Zod's `z.number()`, `z.float32()`, and `z.float64()` all serialize
     * to plain `"type": "number"` in JSON Schema. This means the original
     * intent (float32 vs float64 vs generic number) is lost during conversion.
     *
     * To prevent incorrect type inference, we only treat *exact* IEEE-754
     * float32/float64 ranges as `double`. Any custom or partial numeric
     * range simply falls back to `"number"`, with its range preserved.
     *
     * This ensures precision is never assumed where intent is ambiguous.
     */

    // Match exact `float32` range
    if (min === FLOAT32_MIN && max === FLOAT32_MAX) {
      return "double"; // keep range
    }

    // Match exact `float64` range
    if (min === FLOAT64_MIN && max === FLOAT64_MAX) {
      // Range same as MongoDB `double`, so remove redundant bounds
      delete json.minimum;
      delete json.maximum;
      return "double";
    }

    // Anything else stays as generic number
    return "number";
  }

  return type;
}

/** @internal */
function _isKeywordMap(key: string, value: any) {
  if (!value || typeof value !== "object") {
    return false;
  }

  switch (key) {
    case "dependencies": {
      return Object.values(value).every(
        (v) =>
          (Array.isArray(v) && v.every((s) => typeof s === "string")) ||
          (v && typeof v === "object"),
      );
    }

    case "patternProperties": {
      return Object.values(value).every((v) => v && typeof v === "object");
    }

    case "properties": {
      return Object.values(value).every(
        (v) => v && typeof v === "object" && ("type" in v || "bsonType" in v),
      );
    }

    default: {
      return false;
    }
  }
}

/** @internal */
function _sanitizeSchema(schema: any, inKeywordMap = false): any {
  if (Array.isArray(schema)) {
    return schema.map((element) => _sanitizeSchema(element, inKeywordMap));
  }

  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(schema)) {
    // If not inside a keywords map, then skip unknown/unsupported keywords
    if (!inKeywordMap && !AVAILABLE_KEYWORDS.has(key as any)) continue;

    // Determine if this key's value is an actual keyword's map
    const isKeywordMap = _isKeywordMap(key, value);

    sanitized[key] = _sanitizeSchema(value, isKeywordMap);
  }

  // Handle numeric type conversion
  if (
    ["integer", "number"].includes(sanitized.type) ||
    ["integer", "number"].includes(sanitized.bsonType)
  ) {
    sanitized.bsonType = _inferMongoNumericType(sanitized);
    delete sanitized.type;
  }

  // For consistency, only represent `number` with keyword `type`
  if (sanitized.type === "number" || sanitized.bsonType === "number") {
    sanitized.type = "number";
    delete sanitized.bsonType;
  }

  return sanitized;
}

/**
 * Converts a Zod schema to a MongoDB-compatible JSON Schema.
 *
 * The conversion preserves all structural and validation rules
 * (e.g., `min`, `max`, `enum`), while omitting unknown or
 * unsupported keywords (e.g., `$schema`, `$ref`, `default`).
 *
 * @param zodSchema The Zod schema to convert.
 * @returns A MongoDB-compatible JSON Schema object.
 * @throws {Error} If `bsonType` is used on non-`unknown` Zod types.
 * @throws {Error} If both `type` and `bsonType` are present simultaneously.
 *
 * @example
 * import z from "zod";
 * import zodToMongoSchema from "zod-to-mongo-schema";
 *
 * const userSchema = z.object({
 *   _id: z.unknown().meta({ bsonType: "objectId" }),
 *   name: z.string(),
 *   age: z.number().min(18),
 *   isAdmin: z.boolean(),
 *   createdAt: z.unknown().meta({ bsonType: "date" }),
 * });
 * const mongoSchema = zodToMongoSchema(userSchema);
 */
function zodToMongoSchema(zodSchema: z4.$ZodType): MongoSchema {
  if (!zodSchema) return {};

  // Convert to JSON Schema Draft 4
  const rawJsonSchema = z4.toJSONSchema(zodSchema, {
    target: "draft-4",
    override: (context) => {
      if (
        context.zodSchema._zod.def.type !== "unknown" &&
        context.jsonSchema.bsonType
      ) {
        throw new Error("`bsonType` can only be used with `z.unknown()`.");
      }

      if (context.jsonSchema.type && context.jsonSchema.bsonType) {
        throw new Error(
          "Cannot specify both `type` and `bsonType` simultaneously.",
        );
      }
    },
  });

  // Sanitize to make it MongoDB-compatible
  return _sanitizeSchema(rawJsonSchema);
}

export default zodToMongoSchema;
