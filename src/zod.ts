import type { JSONSchema } from "zod/v4/core";

type MongoType = "object" | "array" | "number" | "boolean" | "string" | "null";
type MongoBSONType =
  | "double"
  | "string"
  | "object"
  | "array"
  | "binData"
  | "objectId"
  | "bool"
  | "date"
  | "null"
  | "regex"
  | "javascript"
  | "int"
  | "long"
  | "decimal"
  | "number";

/**
 * MongoDB available keywords
 * @see https://www.mongodb.com/docs/manual/reference/operator/query/jsonSchema/#available-keywords
 */
interface MongoSchema {
  additionalItems?: boolean | MongoSchema;
  additionalProperties?: boolean | MongoSchema;
  allOf?: MongoSchema[];
  anyOf?: MongoSchema[];
  bsonType?: MongoBSONType | MongoBSONType[];
  dependencies?: {
    [k: string]: string[] | MongoSchema;
  };
  description?: string;
  enum?: Array<
    | string
    | number
    | boolean
    | JSONSchema.ObjectSchema
    | JSONSchema.ArraySchema
    | null
  >;
  exclusiveMaximum?: boolean;
  exclusiveMinimum?: boolean;
  items?: MongoSchema | MongoSchema[];
  maximum?: number;
  maxItems?: number;
  maxLength?: number;
  maxProperties?: number;
  minimum?: number;
  minItems?: number;
  minLength?: number;
  minProperties?: number;
  multipleOf?: number;
  not?: MongoSchema;
  oneOf?: MongoSchema[];
  pattern?: string;
  patternProperties?: {
    [reg: string]: MongoSchema;
  };
  properties?: {
    [key: string]: MongoSchema;
  };
  required?: string[];
  title?: string;
  type?: MongoType | MongoType[];
  uniqueItems?: boolean;
}

declare module "zod/v4/core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface GlobalMeta extends MongoSchema {}
}

export type { MongoSchema };
