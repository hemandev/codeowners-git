import Codeowners from "codeowners";
import { getChangedFiles } from "./git";

type CodeOwnersFile = InstanceType<typeof Codeowners>;

let codeowners: CodeOwnersFile;

const getCodeownersInstance = (): CodeOwnersFile => {
  if (!codeowners) {
    try {
      codeowners = new Codeowners();
    } catch (error) {
      // If no CODEOWNERS file is found, return a mock instance
      // This allows the tool to work even without a CODEOWNERS file
      return {
        getOwner: () => [],
      } as unknown as CodeOwnersFile;
    }
  }
  return codeowners;
};

export const getOwner = (filePath: string): string[] => {
  const instance = getCodeownersInstance();
  const owner = instance.getOwner(filePath);
  return owner;
};

export const getOwnerFiles = async (owner: string): Promise<string[]> => {
  const changedFiles = await getChangedFiles();

  return changedFiles.filter((file) => {
    const owners = getOwner(file);
    return owners.includes(owner);
  });
};
