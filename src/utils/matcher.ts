import micromatch from "micromatch";

export const matchOwners = (owners: string[], patterns: string): boolean => {
  if (!patterns || !patterns.trim()) return false;

  const normalizedOwners = owners.map((owner) => {
    return owner.replace(/\//g, "");
  });

  const normalizedPatterns = patterns.replace(/\//g, "").split(",");

  const matches = micromatch(normalizedOwners, normalizedPatterns);
  return matches.length > 0;
};
