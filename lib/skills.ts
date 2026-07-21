// Agent skills, adapted from wordmark's skillsStore.ts/skills.ts as pure functions.

export type SkillResource = { name: string; content: string };

export type SkillDefinition = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  resources: SkillResource[];
};

export type SkillInput = {
  name: string;
  description: string;
  instructions: string;
  resources?: SkillResource[];
};

export function restoreSkillList(saved: unknown): SkillDefinition[] {
  if (!Array.isArray(saved)) return [];
  const result: SkillDefinition[] = [];
  for (const item of saved) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<SkillDefinition>;
    if (typeof raw.id !== "string" || typeof raw.name !== "string") continue;
    result.push({
      id: raw.id,
      name: raw.name,
      description: typeof raw.description === "string" ? raw.description : "",
      instructions:
        typeof raw.instructions === "string" ? raw.instructions : "",
      resources: Array.isArray(raw.resources)
        ? raw.resources.filter(
            (resource): resource is SkillResource =>
              Boolean(resource) &&
              typeof (resource as SkillResource).name === "string" &&
              typeof (resource as SkillResource).content === "string",
          )
        : [],
    });
  }
  return result;
}

export function restoreSkillPreferences(
  saved: unknown,
): Record<string, boolean> {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
  const result: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(saved as Record<string, unknown>)) {
    if (typeof value === "boolean") result[key] = value;
  }
  return result;
}

export function restoreSeededSkillNames(saved: unknown): string[] {
  if (!Array.isArray(saved)) return [];
  return saved.filter((item): item is string => typeof item === "string");
}

export function restoreForcedSkillIds(saved: unknown): string[] {
  if (!Array.isArray(saved)) return [];
  return saved.filter((item): item is string => typeof item === "string");
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "skill"
  );
}

function uniqueSkillId(name: string, existing: SkillDefinition[]): string {
  const base = `user:${slugify(name)}`;
  const ids = new Set(existing.map((skill) => skill.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export type NewSkillResult = {
  skill: SkillDefinition;
  skills: SkillDefinition[];
};

// Throws when name or instructions are blank.
export function withSkillAdded(
  skills: SkillDefinition[],
  input: SkillInput,
): NewSkillResult {
  const name = input.name.trim();
  const instructions = input.instructions.trim();
  if (!name) throw new Error("Skill name is required");
  if (!instructions) throw new Error("Skill instructions are required");
  const skill: SkillDefinition = {
    id: uniqueSkillId(name, skills),
    name,
    description: input.description.trim(),
    instructions,
    resources: (input.resources || [])
      .map((resource) => ({
        name: resource.name.trim(),
        content: resource.content,
      }))
      .filter((resource) => resource.name && resource.content.trim()),
  };
  return { skill, skills: [...skills, skill] };
}

export function withSkillRemoved(
  skills: SkillDefinition[],
  id: string,
): SkillDefinition[] {
  return skills.filter((skill) => skill.id !== id);
}

export function withSkillPreferenceSet(
  preferences: Record<string, boolean>,
  id: string,
  enabled: boolean,
): Record<string, boolean> {
  return { ...preferences, [id]: enabled };
}

export function withSkillPreferenceRemoved(
  preferences: Record<string, boolean>,
  id: string,
): Record<string, boolean> {
  if (!(id in preferences)) return preferences;
  const next = { ...preferences };
  delete next[id];
  return next;
}

export function enabledSkills(
  skills: SkillDefinition[],
  preferences: Record<string, boolean>,
): SkillDefinition[] {
  return skills.filter((skill) => preferences[skill.id]);
}

export function withForcedSkillToggled(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

// Case-insensitive lookup for the /skill command: an exact name match wins;
// otherwise a single unambiguous substring match is used. Returns null when
// nothing matches, or when the query is too vague to pick one skill.
export function findSkillByName(
  skills: SkillDefinition[],
  query: string,
): SkillDefinition | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  const exact = skills.find((skill) => skill.name.toLowerCase() === needle);
  if (exact) return exact;
  const partial = skills.filter((skill) =>
    skill.name.toLowerCase().includes(needle),
  );
  return partial.length === 1 ? partial[0] : null;
}

const RESOURCE_BLOCK =
  /<!--\s*skill:resource\s+name="([^"]+)"\s*-->\n([\s\S]*?)\n<!--\s*\/skill:resource\s*-->/g;

export function serializeSkillMarkdown(skill: SkillDefinition): string {
  const lines = [
    "---",
    `name: ${skill.name}`,
    `description: ${skill.description}`,
    "---",
    "",
    skill.instructions.trim(),
    "",
  ];
  for (const resource of skill.resources) {
    lines.push(
      `<!-- skill:resource name="${resource.name}" -->`,
      resource.content.trim(),
      "<!-- /skill:resource -->",
      "",
    );
  }
  return `${lines.join("\n").trim()}\n`;
}

// Throws when the resulting instructions body is empty.
export function parseSkillMarkdown(text: string): SkillInput {
  let body = text.replace(/\r\n/g, "\n").trim();
  let name = "";
  let description = "";

  const frontmatter = body.match(/^---\n([\s\S]*?)\n---\n?/);
  if (frontmatter) {
    body = body.slice(frontmatter[0].length);
    for (const line of frontmatter[1].split("\n")) {
      const separator = line.indexOf(":");
      if (separator === -1) continue;
      const key = line.slice(0, separator).trim().toLowerCase();
      const value = line.slice(separator + 1).trim();
      if (key === "name") name = value;
      else if (key === "description") description = value;
    }
  }

  const resources: SkillResource[] = [];
  RESOURCE_BLOCK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RESOURCE_BLOCK.exec(body)) !== null) {
    resources.push({ name: match[1].trim(), content: match[2].trim() });
  }
  body = body.replace(RESOURCE_BLOCK, "").trim();

  if (!name) {
    const heading = body.match(/^#\s+(.+)$/m);
    name = heading ? heading[1].trim() : "Imported Skill";
  }
  if (!body) throw new Error("SKILL.md has no instructions body");

  return { name, description, instructions: body, resources };
}

// Tool-based discovery text for the system prompt (every provider here supports client-side tools).
export function skillsForPrompt(skills: SkillDefinition[]): string {
  if (!skills.length) return "";
  const list = skills.map((skill) => {
    const desc = skill.description ? ` — ${skill.description}` : "";
    const resourceNote = skill.resources.length ? " (has resources)" : "";
    return `- ${skill.name}${desc}\n  id: ${skill.id}${resourceNote}`;
  });
  return (
    `\nAvailable skills, each loadable with the activate_skill tool:\n${list.join("\n")}\n` +
    "If the user's request matches one of these skills, you MUST call activate_skill " +
    'with that skill\'s id (the value after "id:") before you answer, then follow the ' +
    "instructions it returns. Do not rely on the one-line description alone, and do not " +
    "mention this process to the user.\n"
  );
}

// Full instructions for skills force-loaded via the /skill command, bypassing
// the model's own activate_skill judgement call for cases where auto-trigger
// doesn't fire.
export function forcedSkillsForPrompt(skills: SkillDefinition[]): string {
  if (!skills.length) return "";
  const blocks = skills.map((skill) => {
    const resourceNote = skill.resources.length
      ? `\n(Resources available via read_skill_resource with skill_id "${skill.id}": ${skill.resources
          .map((resource) => resource.name)
          .join(", ")})`
      : "";
    return `### ${skill.name}\n${skill.instructions}${resourceNote}`;
  });
  return (
    "\nThe user manually loaded the following skill(s) with /skill. Follow " +
    `their instructions below for the rest of your replies:\n\n${blocks.join("\n\n")}\n`
  );
}

export type SkillToolResult = { output: string };

export function runSkillToolCall(
  name: string,
  rawArguments: string,
  skills: SkillDefinition[],
): SkillToolResult {
  let args: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(rawArguments || "{}");
    if (parsed && typeof parsed === "object")
      args = parsed as Record<string, unknown>;
  } catch {
    // Malformed arguments are treated as an empty object below.
  }

  if (name === "activate_skill") {
    const skillId =
      typeof args.skill_id === "string" ? args.skill_id.trim() : "";
    if (!skillId) {
      return {
        output: JSON.stringify({ ok: false, message: "Missing skill_id" }),
      };
    }
    const skill = skills.find((item) => item.id === skillId);
    if (!skill) {
      return {
        output: JSON.stringify({
          ok: false,
          message: `No skill found with id "${skillId}"`,
        }),
      };
    }
    return {
      output: JSON.stringify({
        ok: true,
        id: skill.id,
        name: skill.name,
        instructions: skill.instructions,
        resources: skill.resources.map((resource) => resource.name),
      }),
    };
  }

  if (name === "read_skill_resource") {
    const skillId =
      typeof args.skill_id === "string" ? args.skill_id.trim() : "";
    const resourceName =
      typeof args.resource_name === "string" ? args.resource_name.trim() : "";
    if (!skillId || !resourceName) {
      return {
        output: JSON.stringify({
          ok: false,
          message: "Both skill_id and resource_name are required",
        }),
      };
    }
    const skill = skills.find((item) => item.id === skillId);
    if (!skill) {
      return {
        output: JSON.stringify({
          ok: false,
          message: `No skill found with id "${skillId}"`,
        }),
      };
    }
    const resource = skill.resources.find((item) => item.name === resourceName);
    if (!resource) {
      return {
        output: JSON.stringify({
          ok: false,
          message: `Skill "${skillId}" has no resource named "${resourceName}"`,
        }),
      };
    }
    return {
      output: JSON.stringify({
        ok: true,
        id: skill.id,
        resource_name: resource.name,
        content: resource.content,
      }),
    };
  }

  return {
    output: JSON.stringify({ ok: false, message: `Unknown tool: ${name}` }),
  };
}
