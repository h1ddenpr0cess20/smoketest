import { describe, expect, it } from "vitest";
import {
  enabledSkills,
  parseSkillMarkdown,
  restoreSeededSkillNames,
  restoreSkillList,
  restoreSkillPreferences,
  runSkillToolCall,
  serializeSkillMarkdown,
  skillsForPrompt,
  withSkillAdded,
  withSkillPreferenceRemoved,
  withSkillPreferenceSet,
  withSkillRemoved,
  type SkillDefinition,
} from "../lib/skills";

const baseSkill: SkillDefinition = {
  id: "user:test-skill",
  name: "Test Skill",
  description: "a test skill",
  instructions: "do the thing carefully",
  resources: [],
};

describe("restoreSkillList", () => {
  it("keeps only well-formed entries", () => {
    expect(
      restoreSkillList([
        baseSkill,
        { id: "x" },
        null,
        { id: 5, name: "bad id type" },
        "nonsense",
      ]),
    ).toEqual([baseSkill]);
  });

  it("defaults missing description/instructions/resources", () => {
    expect(restoreSkillList([{ id: "a", name: "A" }])).toEqual([
      { id: "a", name: "A", description: "", instructions: "", resources: [] },
    ]);
  });

  it("filters malformed resource entries", () => {
    expect(
      restoreSkillList([
        {
          id: "a",
          name: "A",
          resources: [{ name: "ok.md", content: "hi" }, { name: "bad" }, null],
        },
      ]),
    ).toEqual([
      {
        id: "a",
        name: "A",
        description: "",
        instructions: "",
        resources: [{ name: "ok.md", content: "hi" }],
      },
    ]);
  });

  it("rejects non-array input", () => {
    expect(restoreSkillList(null)).toEqual([]);
    expect(restoreSkillList({ 0: baseSkill })).toEqual([]);
  });
});

describe("restoreSkillPreferences", () => {
  it("keeps only boolean values", () => {
    expect(
      restoreSkillPreferences({ a: true, b: false, c: "yes", d: 1 }),
    ).toEqual({ a: true, b: false });
  });

  it("rejects non-object input", () => {
    expect(restoreSkillPreferences(null)).toEqual({});
    expect(restoreSkillPreferences([true, false])).toEqual({});
  });
});

describe("restoreSeededSkillNames", () => {
  it("keeps only strings", () => {
    expect(restoreSeededSkillNames(["a", 2, "b", null])).toEqual(["a", "b"]);
  });

  it("rejects non-array input", () => {
    expect(restoreSeededSkillNames(null)).toEqual([]);
  });
});

describe("withSkillAdded", () => {
  it("appends a trimmed skill with a slugified id", () => {
    const { skill, skills } = withSkillAdded([], {
      name: "  My Skill!  ",
      description: " desc ",
      instructions: " body ",
    });
    expect(skill.id).toBe("user:my-skill");
    expect(skill).toEqual({
      id: "user:my-skill",
      name: "My Skill!",
      description: "desc",
      instructions: "body",
      resources: [],
    });
    expect(skills).toEqual([skill]);
  });

  it("de-duplicates ids for repeated names", () => {
    const first = withSkillAdded([], {
      name: "Dup",
      description: "",
      instructions: "a",
    });
    const second = withSkillAdded(first.skills, {
      name: "Dup",
      description: "",
      instructions: "b",
    });
    expect(first.skill.id).toBe("user:dup");
    expect(second.skill.id).toBe("user:dup-2");
    expect(second.skills).toHaveLength(2);
  });

  it("drops blank/whitespace-only resources", () => {
    const { skill } = withSkillAdded([], {
      name: "R",
      description: "",
      instructions: "body",
      resources: [
        { name: "ok.md", content: "content" },
        { name: "  ", content: "content" },
        { name: "blank.md", content: "   " },
      ],
    });
    expect(skill.resources).toEqual([{ name: "ok.md", content: "content" }]);
  });

  it("throws when name or instructions are blank", () => {
    expect(() =>
      withSkillAdded([], { name: "  ", description: "", instructions: "x" }),
    ).toThrow("Skill name is required");
    expect(() =>
      withSkillAdded([], { name: "x", description: "", instructions: "  " }),
    ).toThrow("Skill instructions are required");
  });
});

describe("withSkillRemoved", () => {
  it("removes the matching skill by id", () => {
    expect(withSkillRemoved([baseSkill], baseSkill.id)).toEqual([]);
  });

  it("is a no-op for an unknown id", () => {
    expect(withSkillRemoved([baseSkill], "missing")).toEqual([baseSkill]);
  });
});

describe("withSkillPreferenceSet / withSkillPreferenceRemoved", () => {
  it("sets and overwrites a preference", () => {
    const enabled = withSkillPreferenceSet({}, "a", true);
    expect(enabled).toEqual({ a: true });
    expect(withSkillPreferenceSet(enabled, "a", false)).toEqual({ a: false });
  });

  it("removes a preference, and is a no-op when absent", () => {
    const prefs = { a: true, b: false };
    expect(withSkillPreferenceRemoved(prefs, "a")).toEqual({ b: false });
    expect(withSkillPreferenceRemoved(prefs, "missing")).toBe(prefs);
  });
});

describe("enabledSkills", () => {
  it("filters to skills with a truthy preference", () => {
    const other = { ...baseSkill, id: "user:other", name: "Other" };
    expect(enabledSkills([baseSkill, other], { [baseSkill.id]: true })).toEqual(
      [baseSkill],
    );
  });
});

describe("serializeSkillMarkdown / parseSkillMarkdown", () => {
  it("round-trips a skill with a bundled resource", () => {
    const skill: SkillDefinition = {
      id: "user:roundtrip",
      name: "Roundtrip",
      description: "rt desc",
      instructions: "body line one\nbody line two",
      resources: [{ name: "notes.md", content: "note content" }],
    };
    const markdown = serializeSkillMarkdown(skill);
    expect(markdown).toContain("---");
    expect(markdown).toContain('skill:resource name="notes.md"');

    const parsed = parseSkillMarkdown(markdown);
    expect(parsed).toEqual({
      name: "Roundtrip",
      description: "rt desc",
      instructions: "body line one\nbody line two",
      resources: [{ name: "notes.md", content: "note content" }],
    });
  });

  it("falls back to a heading when there is no frontmatter", () => {
    const parsed = parseSkillMarkdown("# Heading Name\n\nsome instructions");
    expect(parsed.name).toBe("Heading Name");
    expect(parsed.instructions).toContain("some instructions");
  });

  it("falls back to Imported Skill when there is no name at all", () => {
    const parsed = parseSkillMarkdown("just a body, no heading");
    expect(parsed.name).toBe("Imported Skill");
  });

  it("throws when the instructions body is empty", () => {
    expect(() => parseSkillMarkdown("---\nname: Empty\n---\n")).toThrow(
      "SKILL.md has no instructions body",
    );
  });
});

describe("skillsForPrompt", () => {
  it("lists enabled skills with id and an activate_skill instruction", () => {
    const withResource: SkillDefinition = {
      ...baseSkill,
      id: "user:with-resource",
      resources: [{ name: "ref.md", content: "x" }],
    };
    const text = skillsForPrompt([baseSkill, withResource]);
    expect(text).toContain("activate_skill");
    expect(text).toContain(baseSkill.id);
    expect(text).toContain("(has resources)");
  });

  it("returns an empty string for no skills", () => {
    expect(skillsForPrompt([])).toBe("");
  });
});

describe("runSkillToolCall", () => {
  const resourceSkill: SkillDefinition = {
    id: "user:with-resource",
    name: "With Resource",
    description: "",
    instructions: "full instructions",
    resources: [{ name: "ref.md", content: "reference body" }],
  };

  it("activates a skill and lists its resource names", () => {
    const result = runSkillToolCall(
      "activate_skill",
      JSON.stringify({ skill_id: resourceSkill.id }),
      [resourceSkill],
    );
    expect(JSON.parse(result.output)).toEqual({
      ok: true,
      id: resourceSkill.id,
      name: resourceSkill.name,
      instructions: resourceSkill.instructions,
      resources: ["ref.md"],
    });
  });

  it("reports failure when activate_skill gets an unknown id", () => {
    const result = runSkillToolCall(
      "activate_skill",
      JSON.stringify({ skill_id: "nope" }),
      [],
    );
    expect(JSON.parse(result.output)).toEqual({
      ok: false,
      message: 'No skill found with id "nope"',
    });
  });

  it("reports failure when activate_skill gets no skill_id", () => {
    const result = runSkillToolCall("activate_skill", "{}", [resourceSkill]);
    expect(JSON.parse(result.output)).toEqual({
      ok: false,
      message: "Missing skill_id",
    });
  });

  it("reads a bundled resource", () => {
    const result = runSkillToolCall(
      "read_skill_resource",
      JSON.stringify({ skill_id: resourceSkill.id, resource_name: "ref.md" }),
      [resourceSkill],
    );
    expect(JSON.parse(result.output)).toEqual({
      ok: true,
      id: resourceSkill.id,
      resource_name: "ref.md",
      content: "reference body",
    });
  });

  it("reports failure when the resource name doesn't match", () => {
    const result = runSkillToolCall(
      "read_skill_resource",
      JSON.stringify({
        skill_id: resourceSkill.id,
        resource_name: "absent.md",
      }),
      [resourceSkill],
    );
    expect(JSON.parse(result.output)).toEqual({
      ok: false,
      message: `Skill "${resourceSkill.id}" has no resource named "absent.md"`,
    });
  });

  it("reports failure when the skill id doesn't match for read_skill_resource", () => {
    const result = runSkillToolCall(
      "read_skill_resource",
      JSON.stringify({ skill_id: "nope", resource_name: "ref.md" }),
      [resourceSkill],
    );
    expect(JSON.parse(result.output)).toEqual({
      ok: false,
      message: 'No skill found with id "nope"',
    });
  });

  it("reports failure when read_skill_resource is missing arguments", () => {
    const result = runSkillToolCall(
      "read_skill_resource",
      JSON.stringify({ skill_id: resourceSkill.id }),
      [resourceSkill],
    );
    expect(JSON.parse(result.output)).toEqual({
      ok: false,
      message: "Both skill_id and resource_name are required",
    });
  });

  it("tolerates malformed JSON arguments", () => {
    const result = runSkillToolCall("activate_skill", "{not json", []);
    expect(JSON.parse(result.output)).toEqual({
      ok: false,
      message: "Missing skill_id",
    });
  });

  it("rejects an unknown tool name", () => {
    const result = runSkillToolCall("wipe", "{}", [resourceSkill]);
    expect(JSON.parse(result.output)).toEqual({
      ok: false,
      message: "Unknown tool: wipe",
    });
  });
});
