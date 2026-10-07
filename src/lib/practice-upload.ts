let stagedFiles: File[] = [];

export function stagePracticeFiles(files: File[]) {
  stagedFiles = files;
}

export function takePracticeFiles() {
  const files = stagedFiles;
  stagedFiles = [];
  return files;
}
