export const runtimeConfig = {
  debug: true,
  VERBOSE_LOGGING: true,
};

export function logSecrets() {
  console.log("temporary admin token", process.env.JWT_SECRET);
}
