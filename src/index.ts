/* eslint-disable @typescript-eslint/no-explicit-any */

import z from "zod";

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

function _typeForInteger(json: Record<string, any>) {
  // Only process JSON Schemas with type as `"integer"`
  if (json.type !== "integer" && json.bsonType !== "integer") {
    return json.bsonType;
  }

  const INT32_MIN = -2_147_483_648; // 2^31 * -1
  const INT32_MAX = 2_147_483_647; // 2^31 - 1
  const INT53_MIN = -9_007_199_254_740_991; // -(2^53 - 1)
  const INT53_MAX = 9_007_199_254_740_991; // 2^53 - 1
  const INT64_MIN = -9_223_372_036_854_775_808n; // -(2^63)
  const INT64_MAX = 9_223_372_036_854_775_808n; // 2^63 - 1

  const min = json.minimum ?? INT53_MIN;
  const max = json.maximum ?? INT53_MAX;

  // If the range is exactly the standard 32-bit or 53-bit, or no
  // custom range was specified, then let MongoDB enforce the limits.
  if (
    (min === INT32_MIN && max === INT32_MAX) ||
    (min === INT53_MIN && max === INT53_MAX) ||
    (json.minimum === undefined && json.maximum === undefined)
  ) {
    delete json.minimum;
    delete json.maximum;
    return min < INT32_MIN || max > INT32_MAX ? "long" : "int";
  }

  // If a custom range is specified, then let the range decide
  if (min >= INT32_MIN && max <= INT32_MAX) {
    return "int";
  }

  if (BigInt(min) >= INT64_MIN && BigInt(max) <= INT64_MAX) {
    return "long";
  }

  // Integers beyond 64-bit integers (rare)
  return "number";
}

function _sanitizeSchema(schema: any): any {
  if (Array.isArray(schema)) {
    return schema.map((element) => _sanitizeSchema(element));
  }

  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(schema)) {
    // Skip unsupported JSON Schema keywords
    if (UNSUPPORTED_KEYS.includes(key as any)) continue;

    sanitized[key] = _sanitizeSchema(value);
  }

  // Handle JSON Schema `boolean` to MongoDB `bool`
  if (sanitized.type === "boolean" || sanitized.bsonType === "boolean") {
    sanitized.bsonType = "bool";
    delete sanitized.type;
  }

  // Handle numeric type conversion
  if (sanitized.type === "integer" || sanitized.bsonType === "integer") {
    sanitized.bsonType = _typeForInteger(sanitized);
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
export default function zodToMongoSchema(zodSchema: z.ZodType) {
  if (!zodSchema) return {};

  // Convert to JSON Schema Draft 4
  const rawJsonSchema = z.toJSONSchema(zodSchema, { target: "draft-4" });

  // Sanitize to make it MongoDB-compatible
  return _sanitizeSchema(rawJsonSchema);
}
