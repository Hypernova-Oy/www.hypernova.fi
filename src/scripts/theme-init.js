/*
 * The theme a document starts in, applied before the body is painted: the light look is the
 * default, and a visitor who picked dark with the navbar toggle never sees a flash of the
 * light page. BaseLayout.astro inlines this file into the document (a module script would
 * only run after the parser is done, which is the flash it exists to prevent).
 *
 * It is a file rather than a literal in the layout because of the Content Security Policy of
 * the site: an inline script is only allowed if the policy lists its hash, and astro.config.mjs
 * hashes this file (and imports it with `?raw` in the layout), so the script and the hash it
 * is allowed by cannot drift apart. Keep it a classic script: no imports, no `export`, no
 * type annotations - it is inlined as it is written here.
 */
(() => {
  // Keep in sync with the theme toggle in Navbar.astro.
  const THEME_KEY = 'hypernova-theme';
  // Older builds followed the OS colour scheme and wrote the result into the
  // 'theme' key for every visitor, so an entry there is not a deliberate pick.
  // It is dropped once so it can no longer keep a browser stuck on dark.
  const LEGACY_THEME_KEY = 'theme';

  const getPreferredTheme = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LEGACY_THEME_KEY);

      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'dark' || stored === 'light') {
        return stored;
      }
    }
    return 'light';
  };

  // Only the navbar toggle persists a choice, so the default stays
  // "whatever the visitor picked" instead of pinning the fallback.
  const applyTheme = (theme, root = document.documentElement) => {
    root.classList.toggle('dark', theme === 'dark');
  };

  applyTheme(getPreferredTheme());

  if (!window.__zenixThemeBound) {
    window.__zenixThemeBound = true;

    document.addEventListener('astro:before-swap', (event) => {
      event.newDocument.documentElement.classList.toggle('dark', getPreferredTheme() === 'dark');
    });

    document.addEventListener('astro:after-swap', () => {
      applyTheme(getPreferredTheme());
    });

    document.addEventListener('astro:page-load', () => {
      applyTheme(getPreferredTheme());
    });
  }
})();
