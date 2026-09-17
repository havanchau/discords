/** A default sticker/clip name from a file name, shaped to the shared `SERVER_ASSET_NAME_PATTERN`. */
export function assetNameFromFile(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .slice(0, 32);
}
