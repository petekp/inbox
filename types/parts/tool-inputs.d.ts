// Built by scripts/build-tool-inputs.mjs from the schemas in hooks/tools.ts. Edit a schema, then run it and
// scripts/build-types.mjs.

export {}

declare module 'claude-code' {
  /** The arguments of the agent's tools, as their schemas in `hooks/tools.ts` give them. */
  interface McpToolInputs {
    mcp__inbox__record: {
      kind: 'question' | 'task' | 'finding'
      ask?: string
      options?: string[]
      rec?: string
      why?: string
      steps?: string[]
      design_choice?: boolean
      finding_kind?: 'issue' | 'opportunity'
      title?: string
      detail?: string
      path?: string
    }
    mcp__inbox__close: {
      id: string
      answer?: string
      reason?: string
    }
    mcp__inbox__order_prs: {
      repo?: string
      numbers: number[]
      label?: string
      why?: string
    }
  }
}
