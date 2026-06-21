// Renders a single release row. Pure DOM construction given a release item and a
// pair of handlers, so the releases module stays focused on loading/paging.
(function () {
  "use strict";

  const YTSP = (window.YTSP = window.YTSP || {});

  // rel — a Discogs release list item.
  // handlers: { activate(rel), attach(li, activateFn) } — activate runs the
  //   YouTube search; attach binds roving-tabindex keyboard nav to the row.
  YTSP.createReleaseRow = function (rel, handlers) {
    const li = document.createElement("li");
    li.className = "yt-rel";
    li.tabIndex = -1; // roving tabindex; the active row is promoted to 0
    li.setAttribute("role", "button");
    li.setAttribute(
      "aria-label",
      `${rel.title || "(untitled)"}${rel.year ? `, ${rel.year}` : ""}`
    );

    const main = document.createElement("div");
    main.className = "yt-rel-main";

    const title = document.createElement("div");
    title.className = "yt-rel-title";
    title.textContent = rel.title || "(untitled)";

    // Year leads the meta line, ahead of type/role/format-or-label.
    const metaParts = [
      rel.year ? String(rel.year) : null,
      rel.type,
      rel.role,
      rel.format || rel.label,
    ].filter(Boolean);
    const meta = document.createElement("div");
    meta.className = "yt-rel-meta";
    meta.textContent = metaParts.join(" · ");

    main.appendChild(title);
    if (metaParts.length) main.appendChild(meta);
    li.appendChild(main);

    const activate = () => handlers.activate(rel);
    li.addEventListener("click", activate);
    handlers.attach(li, activate);

    return li;
  };
})();
