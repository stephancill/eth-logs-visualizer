export function resolveContentUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${trimmed.slice("ipfs://".length)}`;
  }

  if (trimmed.startsWith("ipns://")) {
    return `https://ipfs.io/ipns/${trimmed.slice("ipns://".length)}`;
  }

  if (trimmed.startsWith("ar://")) {
    return `https://arweave.net/${trimmed.slice("ar://".length)}`;
  }

  return trimmed;
}

export function buildErc1155MetadataUrl(rawUrl: string, tokenIdRaw: string): string {
  const tokenIdHex = BigInt(tokenIdRaw).toString(16).padStart(64, "0");
  return rawUrl.replace("{id}", tokenIdHex);
}
