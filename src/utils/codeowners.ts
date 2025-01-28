import Codeowners from "codeowners";
import { getChangedFiles } from "./git";

const codeowners = new Codeowners();

export const getOwner = (filePath: string): string[] => {
  const owner = codeowners.getOwner(filePath);
  return owner;
};

export const getOwnerFiles = async (owner: string): Promise<string[]> => {
  const changedFiles = await getChangedFiles();

  return changedFiles.filter((file) => {
    const owners = getOwner(file);
    return owners.includes(owner);
  });
};
