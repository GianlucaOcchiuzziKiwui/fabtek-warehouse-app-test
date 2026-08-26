export function resolveSafeNextPath(next: string | null, origin: string) {
  if (!next?.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  try {
    const destination = new URL(next, origin);

    if (destination.origin !== origin) {
      return "/";
    }

    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/";
  }
}
