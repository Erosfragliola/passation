// Loaded as a blocking script in the home page's <head> (before the style sheets): decides at once whether the
// opening animation plays, to avoid a flash of the content. A separate file rather than an inline script, so that the
// content security policy (src/lib/entetes.js) allows no inline script.
try {
  var d = document.documentElement;
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches && !location.hash && !location.search && !sessionStorage.getItem("passation-intro")) d.classList.add("avec-intro");
} catch (e) { /* storage unavailable: no animation */ }
