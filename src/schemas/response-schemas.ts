import fastJson from 'fast-json-stringify';

// Common position schema
const positionSchema: any = {
  type: 'object',
  properties: {
    row: { type: 'number' },
    column: { type: 'number' }
  },
  required: ['row', 'column']
};

// Parse result schema with recursive node definition
export const stringifyParseResult: (doc: any) => string = fastJson({
  title: 'ParseResult',
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    data: {
      type: 'object',
      properties: {
        language: { type: 'string' },
        rootNode: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            text: { type: 'string' },
            startPosition: positionSchema,
            endPosition: positionSchema,
            children: {
              type: 'array',
              items: { $ref: '#/properties/data/properties/rootNode' }
            }
          },
          required: ['type', 'text', 'startPosition', 'endPosition', 'children']
        },
        nodeCount: { type: 'number' },
        hasError: { type: 'boolean' }
      },
      required: ['language', 'rootNode', 'nodeCount', 'hasError']
    },
    insights: {
      type: 'object',
      additionalProperties: true
    },
    next_actions: {
      type: 'array',
      items: { type: 'string' }
    },
    context: {
      type: 'object',
      additionalProperties: true
    }
  },
  required: ['success']
});

// Query result schema
export const stringifyQueryResult: (doc: any) => string = fastJson({
  title: 'QueryResult',
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    data: {
      type: 'object',
      properties: {
        matches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              pattern: { type: 'number' },
              captures: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    node: {
                      type: 'object',
                      properties: {
                        type: { type: 'string' },
                        text: { type: 'string' },
                        startPosition: positionSchema,
                        endPosition: positionSchema
                      },
                      required: ['type', 'text', 'startPosition', 'endPosition']
                    }
                  },
                  required: ['name', 'node']
                }
              }
            },
            required: ['pattern', 'captures']
          }
        }
      },
      required: ['matches']
    },
    insights: {
      type: 'object',
      additionalProperties: true
    },
    next_actions: {
      type: 'array',
      items: { type: 'string' }
    },
    context: {
      type: 'object',
      additionalProperties: true
    }
  },
  required: ['success']
});

// Node at position result schema
export const stringifyNodeAtPosition: (doc: any) => string = fastJson({
  title: 'NodeAtPositionResult',
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    data: {
      anyOf: [
        {
          type: 'object',
          properties: {
            type: { type: 'string' },
            text: { type: 'string' },
            startPosition: positionSchema,
            endPosition: positionSchema,
            children: {
              type: 'array',
              items: { $ref: '#/properties/data/anyOf/0' }
            }
          },
          required: ['type', 'text', 'startPosition', 'endPosition', 'children']
        },
        { type: 'null' }
      ]
    },
    insights: {
      type: 'object',
      additionalProperties: true
    },
    next_actions: {
      type: 'array',
      items: { type: 'string' }
    },
    context: {
      type: 'object',
      additionalProperties: true
    }
  },
  required: ['success']
});

// Syntax tree result schema
export const stringifySyntaxTree: (doc: any) => string = fastJson({
  title: 'SyntaxTreeResult',
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    data: { type: 'string' },
    insights: {
      type: 'object',
      additionalProperties: true
    },
    next_actions: {
      type: 'array',
      items: { type: 'string' }
    },
    context: {
      type: 'object',
      additionalProperties: true
    }
  },
  required: ['success', 'message', 'data']
});

// Language list result schema
export const stringifyLanguageList: (doc: any) => string = fastJson({
  title: 'LanguageListResult',
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    data: {
      type: 'object',
      properties: {
        languages: {
          type: 'array',
          items: { type: 'string' }
        },
        count: { type: 'number' }
      },
      required: ['languages', 'count']
    },
    insights: {
      type: 'object',
      additionalProperties: true
    },
    next_actions: {
      type: 'array',
      items: { type: 'string' }
    },
    context: {
      type: 'object',
      additionalProperties: true
    }
  },
  required: ['success']
});

// Error result schema
export const stringifyErrorResult: (doc: any) => string = fastJson({
  title: 'ErrorResult',
  type: 'object',
  properties: {
    success: { type: 'boolean', default: false },
    error: { type: 'string' },
    details: { type: 'string' },
    available_tools: {
      type: 'array',
      items: { type: 'string' }
    },
    suggestions: {
      type: 'array',
      items: { type: 'string' }
    },
    tool: { type: 'string' },
    insights: {
      type: 'object',
      additionalProperties: true
    },
    context: {
      type: 'object',
      additionalProperties: true
    }
  },
  required: ['success', 'error']
});

// Generic success result schema
export const stringifyGenericResult: (doc: any) => string = fastJson({
  title: 'GenericResult',
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    details: { type: 'string' },
    insights: {
      type: 'object',
      additionalProperties: true
    },
    next_actions: {
      type: 'array',
      items: { type: 'string' }
    },
    context: {
      type: 'object',
      additionalProperties: true
    }
  },
  required: ['success', 'message']
});