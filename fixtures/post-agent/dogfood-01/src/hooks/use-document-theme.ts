import { useEffect, useState } from "react";

/** "dark" while <html> has the `.dark` class (how Skeleton previews dark mode), else "light". */
export function useDocumentTheme(): "light" | "dark" {
  const read = (): "light" | "dark" => (document.documentElement.classList.contains("dark") ? "dark" : "light");
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}
