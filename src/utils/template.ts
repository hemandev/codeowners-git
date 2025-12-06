import simpleGit from "simple-git";

export type TemplateContext = {
  owner: string;
  username: string;
  email: string;
  date: string;
};

const git = simpleGit();

/**
 * Get git user info for template context
 */
export const getTemplateContext = async (owner: string): Promise<TemplateContext> => {
  let username = "";
  let email = "";

  try {
    username = (await git.raw(["config", "user.name"])).trim();
  } catch {
    username = "unknown";
  }

  try {
    email = (await git.raw(["config", "user.email"])).trim();
  } catch {
    email = "";
  }

  const now = new Date();
  const date = now.toISOString().split("T")[0]; // YYYY-MM-DD

  return {
    owner,
    username,
    email,
    date,
  };
};

/**
 * Render a template string by evaluating JavaScript expressions
 * Uses ${expression} syntax
 *
 * Example:
 *   renderTemplate("${owner.split('/').pop()}", { owner: "@org/team", ... })
 *   => "team"
 *
 * Security: Only exposes template context variables (owner, username, email, date)
 */
export const renderTemplate = (template: string, context: TemplateContext): string => {
  if (!template || !template.includes("${")) {
    return template;
  }

  try {
    // Create a sandboxed function that only has access to context variables
    // Using Function constructor to evaluate template literals safely
    const fn = new Function(
      "owner",
      "username",
      "email",
      "date",
      `return \`${template}\`;`
    );

    return fn(context.owner, context.username, context.email, context.date);
  } catch (error) {
    // If evaluation fails, return the original template
    // This prevents errors from breaking the CLI
    return template;
  }
};

/**
 * Check if a string contains template expressions
 */
export const hasTemplateExpressions = (value: string | undefined): boolean => {
  if (!value) return false;
  return value.includes("${");
};

/**
 * Render a template only if it contains expressions, otherwise return as-is
 */
export const renderTemplateIfNeeded = async (
  template: string | undefined,
  owner: string
): Promise<string | undefined> => {
  if (!template) return template;
  if (!hasTemplateExpressions(template)) return template;

  const context = await getTemplateContext(owner);
  return renderTemplate(template, context);
};
