/*
 * Trusted Types. The Content Security Policy of the site (astro.config.mjs) turns the
 * directive on for scripts, and with it in force the browser refuses a plain string at every
 * sink that parses HTML (`innerHTML`, `insertAdjacentHTML`, `document.write`) or loads a
 * script URL: the value has to come out of a policy.
 *
 * The site needs two of them - the markup the search results of the palette are built from,
 * and the `default` policy Astro's view transition router falls back to - and both are
 * created through this helper, for one reason: `createPolicy` throws when a policy of that
 * name already exists, and a client-side navigation re-runs the inline scripts of the new
 * document (the router re-inserts them). Creating a policy therefore has to be safe to call
 * again, and here a second call is simply left without one: the guarded sinks fall back to
 * the string, which the policy of the first call still covers, rather than letting the page
 * break on a throw.
 */

/**
 * @param name the name the `trusted-types` directive of the Content Security Policy lists.
 * @param rules the callbacks of the policy. Every one used here is a pass-through: this site
 *   builds its own markup and escapes the text it puts in it, so there is nothing for a
 *   policy to rewrite - what it does is make the assignment declared.
 * @returns the policy, or `null` when the browser has no Trusted Types, none is allowed under
 *   the active policy list, or a policy of that name was created before.
 */
export function createPolicyOnce(
  name: string,
  rules: TrustedTypePolicyOptions,
): TrustedTypePolicy | null {
  const factory = window.trustedTypes;
  if (!factory) return null;

  try {
    return factory.createPolicy(name, rules);
  } catch {
    return null;
  }
}
