import type { Host } from './model-text'

const LINK_DESCRIPTION =
  'Write links as [label](https://…); the inbox shows the label, and links are clickable where the look allows. Only https links open.'

export function orderDescription(host: Host): string {
  return `Set the order of the user's PRs in ${host.prsIn}, when the user asks for an order there. Those PRs show first, in this order. Each call replaces the order, and an empty numbers list clears it.`
}

export function recordDescription(host: Host): string {
  return `Record something the user must see in ${host.surface}, and still say it in your reply. Use it in the turn you raise it, once for each thing. ${LINK_DESCRIPTION}
- question: a decision, approval or piece of information only the user has, which you need before you go on. Give options, and rec with why when you recommend one. This includes an act you hold until they say so, such as "say when you want those committed".
- task: a step only the user can do, such as signing in or running a command with their password. Put the commands, files and links in steps, and fill detail with what holds the task up and what the step leads to. A step your own tools can take is not a task: take it, or ask for their OK as a question when it changes something other people see.
- finding: something outside the current task that deserves their attention. It waits in ${host.findingsIn} until it is closed, and the user can ask you to address it or discuss it. Record what a careful senior engineer would flag to a teammate, once you have checked it. Leave out style nits, PR checks, conflicts, review threads or readiness, which ${host.prsIn} shows; anything the user already decided; todos or ideas the user mentioned; problems in your own change; progress; and anything only the user can do or decide. Handle those in your reply, or record them as a question or task.
For any kind with a Markdown report the user should read, give its absolute local path in document. The inbox checks the file and shows a short excerpt; do not use this field for a file they should edit.
Do not record rhetorical questions, offers to continue when continuing is the default, FYIs, or invitations to look at finished work.`
}

export const CLOSE_DESCRIPTION = `Close an open item or finding by an id from the latest "inbox:" text.`

export function tasksDescription(host: Host): string {
  return `Keep your task tree current when you make a plan, start work, finish work or drop work. Add, update, move, complete or note tasks. A task is your own work plan, never a question or a step for the user; use ${host.recordTool} for those.\n\nWhen one exists, link the PR, issue or owner agent so finished or stalled work can be noticed.`
}
