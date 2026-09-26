export function getServerStatus() {
  // Only these public flags may cross the server/client boundary.
  return {
    mode: process.env.DATABASE_URL ? "online" : "local",
    ready:
      !process.env.VERCEL ||
      Boolean(process.env.DATABASE_URL && process.env.TEACHER_ACCESS_KEY),
    keyRequired: Boolean(process.env.VERCEL || process.env.TEACHER_ACCESS_KEY),
  };
}

export type ServerStatus = ReturnType<typeof getServerStatus>;
