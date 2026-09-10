import Ajv, { type ValidateFunction } from 'ajv'
import addFormats from 'ajv-formats'

// OpenAPI 3.0 documents use `nullable: true` alongside a `type` keyword to
// mean "this type, or null" — plain JSON Schema (what Ajv validates
// against) has no `nullable` keyword at all, so Ajv silently ignores it,
// and a real null value would then incorrectly fail against `type:
// 'string'`. This walks the document and rewrites every
// `{ type: X, nullable: true }` into the JSON Schema form
// `{ type: [X, 'null'] }` before handing it to Ajv, so validation enforces
// what the OpenAPI document actually documents.
function convertOpenApiNullable(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(convertOpenApiNullable)
  }
  if (node !== null && typeof node === 'object') {
    const converted: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      converted[key] = convertOpenApiNullable(value)
    }
    if (converted.nullable === true && typeof converted.type === 'string') {
      converted.type = [converted.type, 'null']
    }
    delete converted.nullable
    return converted
  }
  return node
}

// Compiles a validator for one named schema out of a full, live
// OpenAPI document (e.g. fetched from /swagger/v1/swagger.json) — not a
// hand-copied fragment — so drift between the real generated contract and
// what a test expects has nowhere to hide. Registers the whole document
// under one key so `$ref`s between schemas (rare here, but real in
// general OpenAPI documents) resolve correctly.
export function compileOpenApiSchemaValidator(openApiDocument: object, schemaName: string): ValidateFunction {
  const ajv = new Ajv({ strict: false, allErrors: true })
  addFormats(ajv)
  const converted = convertOpenApiNullable(openApiDocument) as Record<string, unknown>
  ajv.addSchema(converted, 'openapi')
  return ajv.compile({ $ref: `openapi#/components/schemas/${schemaName}` })
}
