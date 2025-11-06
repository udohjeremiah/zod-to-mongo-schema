/* eslint-disable @typescript-eslint/no-explicit-any */

import * as z4 from "zod/v4/core";

import type { MongoSchema } from "./zod.js";

/**
 * JSON Schema keys not supported by MongoDB's `$jsonSchema` operator
 * @see https://www.mongodb.com/docs/manual/reference/operator/query/jsonSchema/#omissions
 */
const UNSUPPORTED_KEYS = [
  "$ref",
  "$schema",
  "default",
  "definitions",
  "format",
  "id",
] as const;

/** @internal */
function _typeForNumber(json: Record<string, any>) {
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
function _isPropertiesMap(object: any): boolean {
  if (!object || typeof object !== "object") {
    return false;
  }

  return Object.values(object).every(
    (v) => v && typeof v === "object" && ("type" in v || "bsonType" in v),
  );
}

/** @internal */
function _sanitizeSchema(schema: any, inProperties = false): any {
  if (Array.isArray(schema)) {
    return schema.map((element) => _sanitizeSchema(element, inProperties));
  }

  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(schema)) {
    // Determine if this key's value is an actual "properties" map
    const isPropertiesMap = key === "properties" && _isPropertiesMap(value);

    // If not inside a properties map, then skip unsupported JSON Schema keywords
    if (!inProperties && UNSUPPORTED_KEYS.includes(key as any)) continue;

    sanitized[key] = _sanitizeSchema(value, isPropertiesMap);
  }

  // Handle numeric type conversion
  if (
    ["integer", "number"].includes(sanitized.type) ||
    ["integer", "number"].includes(sanitized.bsonType)
  ) {
    sanitized.bsonType = _typeForNumber(sanitized);
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
 * @param zodSchema
 * @returns A MongoDB-compatible JSON Schema object ready for use in `$jsonSchema` validation.
 */
function zodToMongoSchema(zodSchema: z4.$ZodType): MongoSchema {
  if (!zodSchema) return {};

  // Convert to JSON Schema Draft 4
  const rawJsonSchema = z4.toJSONSchema(zodSchema, { target: "draft-4" });

  // Sanitize to make it MongoDB-compatible
  return _sanitizeSchema(rawJsonSchema);
}

export default zodToMongoSchema;
