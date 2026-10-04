/** Workers runtime has crypto.randomUUID; tests run on Node 20+ which also has it. */
export function randomUUID(): string {
  return crypto.randomUUID();
}
