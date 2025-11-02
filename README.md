# zod-to-mongo-schema

Convert Zod schemas to MongoDB-compatible JSON Schemas effortlessly.

[![license](https://img.shields.io/github/license/udohjeremiah/zod-to-mongo-schema.svg)](https://github.com/udohjeremiah/zod-to-mongo-schema/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/v/zod-to-mongo-schema.svg)](https://www.npmjs.com/package/zod-to-mongo-schema)
[![downloads](https://img.shields.io/npm/dm/zod-to-mongo-schema.svg)](https://www.npmjs.com/package/zod-to-mongo-schema)
[![ci](https://github.com/udohjeremiah/zod-to-mongo-schema/actions/workflows/ci.yaml/badge.svg)](https://github.com/udohjeremiah/zod-to-mongo-schema/actions/workflows/ci.yaml)
![code style](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)
![lint](https://img.shields.io/badge/lint-eslint-blueviolet.svg)
![tests](https://img.shields.io/badge/tests-vitest-yellow.svg)
[![commitlint](https://img.shields.io/badge/commits-conventional-green.svg)](https://www.conventionalcommits.org)
[![stars](https://img.shields.io/github/stars/udohjeremiah/zod-to-mongo-schema.svg)](https://github.com/udohjeremiah/zod-to-mongo-schema/stargazers)

## Overview

As your project matures, the structure of your database tends to stabilize.
That's where JSON Schemas come in — they let you annotate and validate your
MongoDB documents so that _invalid_ values don't sneak in and break your app in
production.

But writing JSON Schemas by hand isn't fun. As a JavaScript developer, chances
are you're already using **Zod** to define your schemas.

Wouldn't it be great if you could just take your existing Zod schema and
instantly turn it into a MongoDB-compatible JSON Schema?

That's exactly what **zod-to-mongo-schema** does. It takes your Zod schema and
converts it into a ready-to-use JSON Schema that can be applied directly to your
MongoDB collections for validation.

## Installation

> **Note:** This library expects Zod `^3.25.0` or `4.x.x` as a peer dependency.

Install using your preferred package manager:

```bash
# npm
npm install zod-to-mongo-schema

# yarn
yarn add zod-to-mongo-schema

# pnpm
pnpm add zod-to-mongo-schema
```

## Examples

A basic example:

```js
import z from "zod";
import zodToMongoSchema from "zod-to-mongo-schema";

const userSchema = z.object({
  name: z.string(),
  age: z.number().min(18),
  isAdmin: z.boolean(),
});

const mongoSchema = zodToMongoSchema(userSchema);
console.log(JSON.stringify(mongoSchema, null, 2));
```

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "age": {
      "type": "number",
      "minimum": 18
    },
    "isAdmin": {
      "type": "boolean"
    }
  },
  "required": ["name", "age", "isAdmin"],
  "additionalProperties": false
}
```

A nested Zod schema:

```ts
const userSchema = z.object({
  name: z.string().meta({
    title: "User Name",
    description: "This is the name assigned to the user",
  }),
  profile: z.object({
    bio: z.string().optional(),
    followers: z.int().min(0),
  }),
});

const mongoSchema = zodToMongoSchema(userSchema);
console.log(JSON.stringify(mongoSchema, null, 2));
```

```json
{
  "type": "object",
  "properties": {
    "name": {
      "title": "User Name",
      "description": "This is the name assigned to the user",
      "type": "string"
    },
    "profile": {
      "type": "object",
      "properties": {
        "bio": {
          "type": "string"
        },
        "followers": {
          "minimum": 0,
          "bsonType": "long"
        }
      },
      "required": ["followers"],
      "additionalProperties": false
    }
  },
  "required": ["name", "profile"],
  "additionalProperties": false
}
```

To specify a BSON type if there's no Zod API for it, use `z.unknown().meta()`:

```ts
const userSchema = z.object({
  _id: z.unknown().meta({ bsonType: "objectId" }),
  createdAt: z.unknown().meta({ bsonType: "date" }),
  name: z.string(),
});

const mongoSchema = zodToMongoSchema(userSchema);
console.log(JSON.stringify(mongoSchema, null, 2));
```

```json
{
  "type": "object",
  "properties": {
    "_id": {
      "bsonType": "objectId"
    },
    "createdAt": {
      "bsonType": "date"
    },
    "name": {
      "type": "string"
    }
  },
  "required": ["_id", "createdAt", "name"],
  "additionalProperties": false
}
```

For these custom fields, you can use Zod's `.refine()` API before `.meta()` to
apply runtime validation — applying `.refine()` last may strip the metadata:

```ts
import { ObjectId } from "mongodb";

const userSchema = z.object({
  _id: z
    .unknown()
    .refine((value) => ObjectId.isValid(value as any))
    .meta({ bsonType: "objectId" }),
});
```

MongoDB's `$jsonSchema` validation does not support the following JSON Schema
keywords:

- `$ref`
- `$schema`
- `default`
- `definitions`
- `format`
- `id`

These keywords are automatically removed during conversion — except when they
appear as property names within your schema:

```ts
const userSchema = z.object({
  id: z.uuid(),
  name: z.string().default("Anonymous"),
});

const mongoSchema = zodToMongoSchema(userSchema);
console.log(JSON.stringify(mongoSchema, null, 2));
```

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "name": {
      "type": "string"
    }
  },
  "required": ["id", "name"],
  "additionalProperties": false
}
```

For numbers, `z.number()` is enough. It produces `type: "number"`, and it can
represent the integer, decimal, double, and long BSON types. However, if you
want to be specific, use `z.int32()` for the `int` type, `z.int()` for `long`,
and `.meta` to specify `double` or `decimal` types:

```ts
const userSchema = z.object({
  height: z.number(),
  age: z.int32(),
  totalPoints: z.int(),
  balance: z.unknown().meta({ bsonType: "decimal" }),
});

const mongoSchema = zodToMongoSchema(userSchema);
console.log(JSON.stringify(mongoSchema, null, 2));
```

```json
{
  "type": "object",
  "properties": {
    "height": {
      "type": "number"
    },
    "age": {
      "bsonType": "int"
    },
    "totalPoints": {
      "bsonType": "long"
    },
    "balance": {
      "bsonType": "decimal"
    }
  },
  "required": ["height", "age", "totalPoints", "balance"],
  "additionalProperties": false
}
```

For convenience, if a `minimum` or `maximum` is specified for `z.int32` or
`z.int`, the type would be adjusted based on that. `minimum` and `maximum`
within the 32-bit integer range is represented as `int`, above that and within
the 64-bit integer range is `long`. Anything above 64-bit integer range is
represented as `number`:

```js
const userSchema = z.object({
  smallInt: z.int().min(-100).max(100),
  mediumInt: z.int().min(-2_147_483_648).max(2_147_483_647),
  largeInt: z.int().min(-9_000_000_000_000_000).max(9_000_000_000_000_000),
});

const mongoSchema = zodToMongoSchema(userSchema);
console.log(JSON.stringify(mongoSchema, null, 2));
```

```json
{
  "type": "object",
  "properties": {
    "smallInt": {
      "minimum": -100,
      "maximum": 100,
      "bsonType": "int"
    },
    "mediumInt": {
      "bsonType": "int"
    },
    "largeInt": {
      "minimum": -9000000000000000,
      "maximum": 9000000000000000,
      "bsonType": "long"
    }
  },
  "required": ["smallInt", "mediumInt", "largeInt"],
  "additionalProperties": false
}
```

The following Zod APIs are not representable in JSON Schema and will throw an
error if encountered:

- `z.bigint()`
- `z.int64()`
- `z.symbol()`
- `z.void()`
- `z.date()`
- `z.map()`
- `z.set()`
- `z.transform()`
- `z.nan()`
- `z.custom()`

## Use `.meta()` judiciously

Note that any number of items can be added to the object passed to `.meta()`,
and any fields added in `.meta()` will override those defined in the schema:

```js
const userSchema = z
  .object({
    name: z.string().meta({
      title: "Username",
      description: "A unique username",
      example: "johndoe",
      whatever: "trash",
    }),
  })
  .meta({ additionalProperties: true });

const mongoSchema = zodToMongoSchema(userSchema);
console.log(JSON.stringify(mongoSchema, null, 2));
```

```json
{
  "additionalProperties": true,
  "type": "object",
  "properties": {
    "name": {
      "title": "Username",
      "description": "A unique username",
      "example": "johndoe",
      "whatever": "trash",
      "type": "string"
    }
  },
  "required": ["name"]
}
```

This is the intended design of the [`.meta()` API](https://zod.dev/metadata) —
Zod allows arbitrary metadata.

However, `zod-to-mongo-schema` expects you to use it **only for two purposes**:

1. **To specify `title` and `description` fields:**

   ```js
   const userSchema = z.object({
     email: z.email().meta({
       title: "User Email",
       description: "The user's registered email address",
     }),
   });

   const mongoSchema = zodToMongoSchema(userSchema);
   console.log(JSON.stringify(mongoSchema, null, 2));
   ```

   ```json
   {
     "type": "object",
     "properties": {
       "email": {
         "title": "User Email",
         "description": "The user's registered email address",
         "type": "string",
         "pattern": "^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
       }
     },
     "required": ["email"],
     "additionalProperties": false
   }
   ```

2. **To specify a custom bson type with `z.unknown` if the Zod API doesn't have
   it:**

   ```js
   const userSchema = z.object({
     _id: z.unknown().meta({ bsonType: "objectId" }),
     createdAt: z.unknown().meta({ bsonType: "date" }),
   });

   const mongoSchema = zodToMongoSchema(userSchema);
   console.log(JSON.stringify(mongoSchema, null, 2));
   ```

   ```json
   {
     "type": "object",
     "properties": {
       "_id": {
         "bsonType": "objectId"
       },
       "createdAt": {
         "bsonType": "date"
       }
     },
     "required": ["_id", "createdAt"],
     "additionalProperties": false
   }
   ```

Of course, you can choose to _break the rule_ and still extend it beyond those
two cases. In some uses, it won't hurt:

```js
const userSchema = z.object({
  name: z.string().meta({ maxLength: 50, default: "Anonymous" }),
});

const mongoSchema = zodToMongoSchema(userSchema);
console.log(JSON.stringify(mongoSchema, null, 2));
```

```json
{
  "type": "object",
  "properties": {
    "name": {
      "maxLength": 50,
      "type": "string"
    }
  },
  "required": ["name"],
  "additionalProperties": false
}
```

But in most cases — especially when used with something other than `z.unknown` —
it will:

```js
const userSchema = z.object({
  name: z.string().meta({ bsonType: "objectId" }),
});

const mongoSchema = zodToMongoSchema(userSchema);
console.log(JSON.stringify(mongoSchema, null, 2));
```

```json
{
  "type": "object",
  "properties": {
    "name": {
      "bsonType": "objectId",
      "type": "string"
    }
  },
  "required": ["name"],
  "additionalProperties": false
}
```

Outside those two cases, the library assumes you know better than it — so
**you're fully responsible** for ensuring the produced JSON Schema is valid for
MongoDB.

`zod-to-mongo-schema` encourages you to rely on your Zod schemas as much as
possible, and only step outside them for the two supported `.meta()` uses listed
above.

Two tables below show how to express common MongoDB JSON Schema patterns using
standard Zod APIs.

## Type mapping: MongoDB → Zod

| MongoDB      | Zod                                 |
| :----------- | :---------------------------------- |
| `double`     | `.meta({ bsonType: "double" })`     |
| `string`     | `z.string()`                        |
| `object`     | `z.object()`                        |
| `array`      | `z.array()`, `z.tuple()`            |
| `binData`    | `.meta({ bsonType: "binData" })`    |
| `objectId`   | `.meta({ bsonType: "objectId" })`   |
| `bool`       | `z.boolean()`, `z.stringbool()`     |
| `date`       | `.meta({ bsonType: "date" })`       |
| `null`       | `z.null()`                          |
| `regex`      | `.meta({ bsonType: "regex" })`      |
| `javascript` | `.meta({ bsonType: "javascript" })` |
| `int`        | `z.int32()`                         |
| `timestamp`  | `.meta({ bsonType: "timestamp" })`  |
| `long`       | `z.int()`                           |
| `decimal`    | `.meta({ bsonType: "decimal" })`    |
| `minKey`     | `.meta({ bsonType: "minKey" })`     |
| `maxKey`     | `.meta({ bsonType: "maxKey" })`     |
| `number`     | `z.number()`                        |

To learn more about MongoDB BSON types, check out the
[MongoDB docs](https://www.mongodb.com/docs/manual/reference/bson-types).

## Keyword mapping: MongoDB → Zod

This table is a work in progress. If you know of a Zod API that maps to a
MongoDB JSON Schema keyword but it isn't here, please open a PR for it.

| MongoDB                | Zod                                                                                                                                                                                                                                                                                                                                                                                    |
| :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `additionalItems`      | `.rest()`                                                                                                                                                                                                                                                                                                                                                                              |
| `additionalProperties` | `.catchall()`, `.looseObject()`, `.object()`, `.record()`, `.strictObject()`                                                                                                                                                                                                                                                                                                           |
| `allOf`                | `.and()`, `.intersection()`                                                                                                                                                                                                                                                                                                                                                            |
| `anyOf`                | `.discriminatedUnion()`, `.nullable()`, `.nullish()`, `.or()`, `.union()`                                                                                                                                                                                                                                                                                                              |
| `bsonType`             | `.meta({ bsonType: "objectId" })`                                                                                                                                                                                                                                                                                                                                                      |
| `dependencies`         |                                                                                                                                                                                                                                                                                                                                                                                        |
| `description`          | `.meta({ description: "..." })`                                                                                                                                                                                                                                                                                                                                                        |
| `enum`                 | `.enum()`, `.keyOf()`, `.literal()`                                                                                                                                                                                                                                                                                                                                                    |
| `exclusiveMaximum`     | `.lt()`, `.negative()`                                                                                                                                                                                                                                                                                                                                                                 |
| `exclusiveMinimum`     | `.gt()`, `.positive()`                                                                                                                                                                                                                                                                                                                                                                 |
| `items`                | `.array()`                                                                                                                                                                                                                                                                                                                                                                             |
| `maximum`              | `.lte()`, `.max()`, `.nonpositive()`                                                                                                                                                                                                                                                                                                                                                   |
| `maxItems`             | `.length()`, `.max()`                                                                                                                                                                                                                                                                                                                                                                  |
| `maxLength`            | `.length()`, `.max()`                                                                                                                                                                                                                                                                                                                                                                  |
| `maxProperties`        |                                                                                                                                                                                                                                                                                                                                                                                        |
| `minimum`              | `.gte()`, `.min()`, `.nonnegative()`                                                                                                                                                                                                                                                                                                                                                   |
| `minItems`             | `.length()`, `.min()`, `nonEmpty()`                                                                                                                                                                                                                                                                                                                                                    |
| `minLength`            | `.length()`, `.min()`, `nonEmpty()`                                                                                                                                                                                                                                                                                                                                                    |
| `minProperties`        |                                                                                                                                                                                                                                                                                                                                                                                        |
| `multipleOf`           | `.multipleOf()`                                                                                                                                                                                                                                                                                                                                                                        |
| `not`                  | `.never()`                                                                                                                                                                                                                                                                                                                                                                             |
| `oneOf`                |                                                                                                                                                                                                                                                                                                                                                                                        |
| `pattern`              | `.base64()`, `.base64url()`, `.cidrv4()`, `.cidrv6()`, `.cuid()`, `.cuid2()`, `.email()`, `.emoji()`, `.endsWith()`, `.hash()`, `.hex()`, `.hostname()`, `.includes()`, `.ipv4()`, `.ipv6()`, `.iso.duration()`, `.iso.date()`, `.iso.datetime()`, `.iso.time()`, `.lowercase()`, `.nanoid()`, `.regex()`, `.startsWith()`, `.templateLiteral()`, `.ulid()`, `.uppercase()`, `.uuid()` |
| `patternProperties`    |                                                                                                                                                                                                                                                                                                                                                                                        |
| `properties`           | Implicitly created whenever you define a schema that has other schemas nested in it                                                                                                                                                                                                                                                                                                    |
| `required`             | `.optional()`, `.partial()`, `.required()`                                                                                                                                                                                                                                                                                                                                             |
| `title`                | `.meta({ title: "..." })`                                                                                                                                                                                                                                                                                                                                                              |
| `type`                 | Implicitly created whenever you define a schema                                                                                                                                                                                                                                                                                                                                        |
| `uniqueItems`          |                                                                                                                                                                                                                                                                                                                                                                                        |

To learn more about MongoDB JSON Schema keywords, check out the
[MongoDB docs](https://www.mongodb.com/docs/manual/reference/operator/query/jsonSchema/#available-keywords).

## Further reading

I wrote a detailed post about why I built this library, the challenges I faced,
and the design decisions that shaped it.
[Read the full article](https://udohjeremiah.com/blog/how-to-convert-a-zod-schema-to-mongodb-json-schema).
