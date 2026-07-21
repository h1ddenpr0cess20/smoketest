// Bundled example skills, seeded (enabled) on first run. Sourced from
// skills/*.md, mirroring wordmark's skills/*.md + `?raw` import approach.
import frontendDevelopmentMarkdown from "../skills/frontend-development.md?raw";
import backendAndApiDevelopmentMarkdown from "../skills/backend-and-api-development.md?raw";
import debuggingAndCodeReviewMarkdown from "../skills/debugging-and-code-review.md?raw";
import mcpShellCodingAgentMarkdown from "../skills/mcp-shell-coding-agent.md?raw";

export const EXAMPLE_SKILLS: string[] = [
  frontendDevelopmentMarkdown,
  backendAndApiDevelopmentMarkdown,
  debuggingAndCodeReviewMarkdown,
  mcpShellCodingAgentMarkdown,
];
