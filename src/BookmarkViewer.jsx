import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react";

const LS_KEY = "bookmark-viewer-state-v1";

/* ── utils ── */
const getDomain = (url) => { try { return new URL(url).hostname; } catch { return ""; } };
const getFavicon = (url) => `https://www.google.com/s2/favicons?domain=${getDomain(url)}&sz=64`;
const getThumb = (url) => `https://image.thum.io/get/width/400/crop/600/${url}`;
const uid = () => Math.random().toString(36).slice(2);

function IconPencil({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function IconTrash({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function normalizeUrl(url) {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    return u.href;
  } catch {
    return url.trim();
  }
}

let _persistedCache;
function readPersisted() {
  if (_persistedCache !== undefined) return _persistedCache;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      _persistedCache = null;
      return null;
    }
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.bookmarks) || data.bookmarks.length === 0) {
      _persistedCache = null;
      return null;
    }
    const fromBm = [...new Set(data.bookmarks.map((b) => b.group))];
    const groups = [...new Set([...(Array.isArray(data.groups) ? data.groups : []), ...fromBm])];
    _persistedCache = { bookmarks: data.bookmarks, groups };
    return _persistedCache;
  } catch {
    _persistedCache = null;
    return null;
  }
}

function savePersisted(bookmarks, groups) {
  if (bookmarks.length === 0 && groups.length === 0) {
    localStorage.removeItem(LS_KEY);
    return;
  }
  localStorage.setItem(LS_KEY, JSON.stringify({ bookmarks, groups }));
}

/* ── parse Netscape bookmark HTML ── */
function parseBookmarks(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const results = [];
  function walk(node, folder) {
    for (const child of node.children) {
      if (child.tagName === "DT") {
        const a = child.querySelector(":scope > A");
        const h3 = child.querySelector(":scope > H3");
        const dl = child.querySelector(":scope > DL");
        if (a && a.href && !a.href.startsWith("javascript")) {
          results.push({ id: uid(), title: a.textContent.trim() || getDomain(a.href), url: a.href, group: folder });
        }
        if (h3 && dl) walk(dl, h3.textContent.trim());
      } else if (child.tagName === "DL") {
        walk(child, folder);
      }
    }
  }
  const topDL = doc.querySelector("DL");
  if (topDL) walk(topDL, "미분류");
  return results;
}

/* ── export to Netscape HTML ── */
function exportHTML(bookmarks, groups) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let body = "";
  groups.forEach((g) => {
    const items = bookmarks.filter((b) => b.group === g);
    if (!items.length) return;
    body += `    <DT><H3>${esc(g)}</H3>\n    <DL><p>\n`;
    items.forEach((b) => { body += `        <DT><A HREF="${esc(b.url)}">${esc(b.title)}</A>\n`; });
    body += `    </DL><p>\n`;
  });
  const ungrouped = bookmarks.filter((b) => !groups.includes(b.group));
  ungrouped.forEach((b) => { body += `    <DT><A HREF="${esc(b.url)}">${esc(b.title)}</A>\n`; });

  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${body}</DL><p>`;
}

function clampMenuRect(clientX, clientY, w, h) {
  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = clientX;
  let top = clientY;
  if (left + w > vw - pad) left = vw - w - pad;
  if (top + h > vh - pad) top = vh - h - pad;
  if (left < pad) left = pad;
  if (top < pad) top = pad;
  return { left, top };
}

/* ── Context menu ── */
function CardContextMenu({
  x,
  y,
  bookmark,
  groups,
  menuRef,
  onClose,
  onOpenTab,
  onMove,
  onDelete,
}) {
  const [pos, setPos] = useState({ left: x, top: y });
  const [subOpen, setSubOpen] = useState(false);
  const [subFlip, setSubFlip] = useState(false);
  const moveWrapRef = useRef(null);
  const subRef = useRef(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = menuRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const w = Math.max(r.width, 160);
      const h = Math.max(r.height, 80);
      setPos(clampMenuRect(x, y, w, h));
    };
    measure();
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [x, y, menuRef]);

  useLayoutEffect(() => {
    if (!subOpen || !moveWrapRef.current || !subRef.current) return;
    const row = moveWrapRef.current.getBoundingClientRect();
    const sub = subRef.current;
    const sw = 200;
    const sh = Math.min(sub.scrollHeight, 280);
    sub.style.maxHeight = `${sh}px`;
    let subLeft = row.right - 2;
    let flip = false;
    if (subLeft + sw > window.innerWidth - 8) {
      subLeft = row.left - sw + 2;
      flip = true;
    }
    setSubFlip(flip);
    let subTop = row.top;
    if (subTop + sh > window.innerHeight - 8) subTop = window.innerHeight - sh - 8;
    if (subTop < 8) subTop = 8;
    sub.style.left = `${subLeft}px`;
    sub.style.top = `${subTop}px`;
    sub.style.width = `${sw}px`;
  }, [subOpen, groups.length, bookmark.id]);

  const targetGroups = groups.filter((g) => g !== bookmark.group);

  useEffect(() => {
    const down = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down, true);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose, menuRef]);

  return (
    <div
      ref={menuRef}
      className="bm-ctx"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      <button type="button" className="bm-ctx__item" role="menuitem" onClick={() => { onOpenTab(bookmark.url); onClose(); }}>
        새 탭에서 열기
      </button>
      <div
        ref={moveWrapRef}
        className="bm-ctx__move-wrap"
        onMouseEnter={() => setSubOpen(true)}
        onMouseLeave={() => setSubOpen(false)}
      >
        <div className="bm-ctx__row">
          <span className="bm-ctx__item bm-ctx__item--static">그룹 이동</span>
          <span className="bm-ctx__chevron" aria-hidden>{subFlip ? "◀" : "▶"}</span>
        </div>
        {subOpen && (
          <div
            ref={subRef}
            className="bm-ctx__sub"
            role="menu"
            onMouseEnter={() => setSubOpen(true)}
            onMouseLeave={() => setSubOpen(false)}
          >
            {targetGroups.length === 0 ? (
              <div className="bm-ctx__sub-empty">다른 그룹 없음</div>
            ) : (
              targetGroups.map((g) => (
                <button
                  key={g}
                  type="button"
                  className="bm-ctx__sub-item"
                  role="menuitem"
                  onClick={() => { onMove(bookmark.id, g); onClose(); }}
                >
                  {g}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        className="bm-ctx__item bm-ctx__item--danger bm-ctx__item--row"
        role="menuitem"
        onClick={() => { onDelete(bookmark.id); onClose(); }}
      >
        <IconTrash />
        삭제
      </button>
    </div>
  );
}

/* ── Lazy thumbnail ── */
function LazyThumb({ url, onError }) {
  const wrapRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { root: null, rootMargin: "120px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="bm-card__thumb-wrap">
      {visible ? (
        <img src={url} alt="" className="bm-card__img" onError={onError} />
      ) : (
        <div className="bm-card__img bm-card__img--placeholder" aria-hidden />
      )}
    </div>
  );
}

/* ── Card ── */
function Card({ bookmark, selected, onToggle, onContextMenu }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [coarsePointer, setCoarsePointer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none)");
    const sync = () => setCoarsePointer(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const showCheckbox = hovered || selected || coarsePointer;

  const handleCtx = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e.clientX, e.clientY, bookmark);
  };

  return (
    <div
      className="bm-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={handleCtx}
    >
      {showCheckbox && (
        <div
          role="checkbox"
          aria-checked={selected}
          className={`bm-card__check ${selected ? "bm-card__check--on" : ""}`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(bookmark.id); }}
        >
          {selected && <span className="bm-card__checkmark">✓</span>}
        </div>
      )}

      <a href={bookmark.url} target="_blank" rel="noopener noreferrer" className="bm-card__link" onContextMenu={handleCtx}>
        {thumbFailed ? (
          <div className="bm-card__thumb bm-card__thumb--fallback">
            <img src={getFavicon(bookmark.url)} width={40} height={40} alt="" onError={(e) => { e.target.style.display = "none"; }} />
          </div>
        ) : (
          <LazyThumb url={getThumb(bookmark.url)} onError={() => setThumbFailed(true)} />
        )}
        <div className="bm-card__body">
          <div className="bm-card__title">{bookmark.title}</div>
          <div className="bm-card__domain">{getDomain(bookmark.url)}</div>
        </div>
      </a>
    </div>
  );
}

/* ── Sidebar group item ── */
function GroupItem({ name, active, count, onClick, onRename, onDelete, undeletable }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  const inputRef = useRef();

  const commit = () => {
    const t = val.trim();
    if (t && t !== name) onRename(name, t);
    else setVal(name);
    setEditing(false);
  };

  return (
    <div onClick={onClick} className={`bm-group ${active ? "bm-group--active" : ""}`}>
      {editing ? (
        <input
          ref={inputRef} value={val} autoFocus
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setVal(name); setEditing(false); } }}
          className="bm-group__input"
        />
      ) : (
        <span className="bm-group__name">{name}</span>
      )}
      <span className="bm-group__count">{count}</span>
      {!undeletable && (
        <div className="bm-group__actions">
          <button
            type="button"
            title="이름 변경"
            onClick={(e) => { e.stopPropagation(); setEditing(true); setTimeout(() => inputRef.current?.focus(), 0); }}
            className="bm-group__btn"
          >
            <IconPencil />
          </button>
          <button
            type="button"
            title="그룹 삭제"
            onClick={(e) => { e.stopPropagation(); onDelete(name); }}
            className="bm-group__btn bm-group__btn--danger"
          >
            <IconTrash />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Move modal ── */
function MoveModal({ groups, selectedCount, onMove, onCancel }) {
  return (
    <div className="bm-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="bm-move-title">
      <div className="bm-modal">
        <p id="bm-move-title" className="bm-modal__title">{selectedCount}개를 이동할 그룹 선택</p>
        <div className="bm-modal__list">
          {groups.map((g) => (
            <button key={g} type="button" onClick={() => onMove(g)} className="bm-modal__item">
              {g}
            </button>
          ))}
        </div>
        <button type="button" onClick={onCancel} className="bm-modal__cancel">
          취소
        </button>
      </div>
    </div>
  );
}

/* ── Upload zone ── */
function UploadZone({ onLoad }) {
  const [dragging, setDragging] = useState(false);
  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => onLoad(e.target.result);
    reader.readAsText(file);
  };
  return (
    <div
      className={`bm-upload ${dragging ? "bm-upload--drag" : ""}`}
      onClick={() => document.getElementById("bm-file-input").click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
    >
      <input id="bm-file-input" type="file" accept=".html,.htm" className="bm-upload__input"
        onChange={(e) => handleFile(e.target.files[0])} />
      <p className="bm-upload__lead">북마크 파일 업로드</p>
      <p className="bm-upload__hint">브라우저에서보낸 .html 파일을 여기에 드롭하거나 클릭해서 선택하세요</p>
      <p className="bm-upload__meta">Chrome · Firefox · Safari · Edge 북마크 형식 지원</p>
    </div>
  );
}

/* ── Root ── */
export default function BookmarkViewer() {
  const [bookmarks, setBookmarks] = useState(() => readPersisted()?.bookmarks ?? []);
  const [groups, setGroups] = useState(() => readPersisted()?.groups ?? []);
  const [activeGroup, setActiveGroup] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState("default");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [exportDirty, setExportDirty] = useState(false);
  const [ctx, setCtx] = useState(null);
  const ctxMenuRef = useRef(null);

  useEffect(() => {
    savePersisted(bookmarks, groups);
  }, [bookmarks, groups]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => { if (mq.matches) setSidebarOpen(false); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const markDirty = useCallback(() => setExportDirty(true), []);

  const handleLoad = useCallback((html) => {
    const parsed = parseBookmarks(html);
    const groupList = [...new Set(parsed.map((b) => b.group))];
    setBookmarks(parsed);
    setGroups(groupList);
    setActiveGroup("all");
    setSelected(new Set());
    setQuery("");
    setDuplicatesOnly(false);
    setExportDirty(false);
  }, []);

  const handleReset = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    _persistedCache = null;
    setBookmarks([]);
    setGroups([]);
    setSelected(new Set());
    setQuery("");
    setActiveGroup("all");
    setDuplicatesOnly(false);
    setSortOrder("default");
    setExportDirty(false);
    setCtx(null);
  }, []);

  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name || groups.includes(name)) return;
    setGroups((g) => [...g, name]);
    setNewGroupName("");
    setAddingGroup(false);
    markDirty();
  };

  const deleteGroup = (name) => {
    if (!window.confirm(`「${name}」 그룹을 삭제할까요?\n해당 북마크는「미분류」로 옮겨집니다.`)) return;
    setBookmarks((bm) => bm.map((b) => (b.group === name ? { ...b, group: "미분류" } : b)));
    setGroups((prev) => {
      const next = prev.filter((x) => x !== name);
      return next.includes("미분류") ? next : ["미분류", ...next];
    });
    if (activeGroup === name) setActiveGroup("all");
    markDirty();
  };

  const renameGroup = (oldName, newName) => {
    if (groups.includes(newName)) return;
    setGroups((g) => g.map((x) => (x === oldName ? newName : x)));
    setBookmarks((bm) => bm.map((b) => (b.group === oldName ? { ...b, group: newName } : b)));
    if (activeGroup === oldName) setActiveGroup(newName);
    markDirty();
  };

  const toggleSelect = (id) => setSelected((s) => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const moveSelected = (targetGroup) => {
    setBookmarks((bm) => bm.map((b) => (selected.has(b.id) ? { ...b, group: targetGroup } : b)));
    setSelected(new Set());
    setShowMoveModal(false);
    markDirty();
  };

  const moveOne = (id, targetGroup) => {
    setBookmarks((bm) => bm.map((b) => (b.id === id ? { ...b, group: targetGroup } : b)));
    markDirty();
  };

  const deleteOne = (id) => {
    setBookmarks((bm) => bm.filter((b) => b.id !== id));
    setSelected((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    markDirty();
  };

  const removeDuplicateUrls = () => {
    const seen = new Set();
    setBookmarks((bm) => {
      const out = [];
      for (const b of bm) {
        const k = normalizeUrl(b.url);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(b);
      }
      return out;
    });
    markDirty();
  };

  const allGroups = useMemo(() => {
    const g = groups.includes("미분류") ? groups
      : bookmarks.some((b) => b.group === "미분류") ? ["미분류", ...groups] : groups;
    return g;
  }, [groups, bookmarks]);

  const urlCounts = useMemo(() => {
    const m = new Map();
    for (const b of bookmarks) {
      const k = normalizeUrl(b.url);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [bookmarks]);

  const duplicateExtraCount = useMemo(() => {
    let n = 0;
    for (const c of urlCounts.values()) {
      if (c > 1) n += c - 1;
    }
    return n;
  }, [urlCounts]);

  useEffect(() => {
    if (duplicatesOnly && duplicateExtraCount === 0) setDuplicatesOnly(false);
  }, [duplicatesOnly, duplicateExtraCount]);

  const handleExport = () => {
    const html = exportHTML(bookmarks, allGroups);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bookmarks_export.html";
    a.click();
    URL.revokeObjectURL(a.href);
    setExportDirty(false);
  };

  const openContextMenu = useCallback((clientX, clientY, bookmark) => {
    setCtx({ x: clientX, y: clientY, bookmark });
  }, []);

  const closeContextMenu = useCallback(() => setCtx(null), []);

  const filtered = useMemo(() => {
    let list = bookmarks
      .filter((b) => activeGroup === "all" || b.group === activeGroup)
      .filter((b) => !query || b.title.toLowerCase().includes(query.toLowerCase()) || b.url.toLowerCase().includes(query.toLowerCase()));
    if (duplicatesOnly) {
      list = list.filter((b) => (urlCounts.get(normalizeUrl(b.url)) || 0) > 1);
    }
    if (sortOrder === "name") {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title, "ko"));
    } else if (sortOrder === "domain") {
      list = [...list].sort((a, b) => {
        const da = getDomain(a.url);
        const db = getDomain(b.url);
        const c = da.localeCompare(db, "ko");
        return c !== 0 ? c : a.title.localeCompare(b.title, "ko");
      });
    }
    return list;
  }, [bookmarks, activeGroup, query, duplicatesOnly, urlCounts, sortOrder]);

  const pickGroup = (g) => {
    setActiveGroup(g);
    closeSidebar();
  };

  const ctxBookmark = ctx?.bookmark;

  if (bookmarks.length === 0) {
    return (
      <div className="bm-empty">
        <UploadZone onLoad={handleLoad} />
      </div>
    );
  }

  return (
    <div className="bm-app">
      {showMoveModal && (
        <MoveModal
          groups={allGroups}
          selectedCount={selected.size}
          onMove={moveSelected}
          onCancel={() => setShowMoveModal(false)}
        />
      )}

      {ctxBookmark && (
        <CardContextMenu
          x={ctx.x}
          y={ctx.y}
          bookmark={ctxBookmark}
          groups={allGroups}
          menuRef={ctxMenuRef}
          onClose={closeContextMenu}
          onOpenTab={(url) => window.open(url, "_blank", "noopener,noreferrer")}
          onMove={moveOne}
          onDelete={deleteOne}
        />
      )}

      {sidebarOpen && (
        <button type="button" className="bm-scrim" aria-label="메뉴 닫기" onClick={closeSidebar} />
      )}

      <header className="bm-topbar">
        <button
          type="button"
          className="bm-menu-btn"
          aria-expanded={sidebarOpen}
          aria-controls="bm-sidebar"
          onClick={() => setSidebarOpen((o) => !o)}
        >
          <span className="bm-menu-btn__icon" aria-hidden>☰</span>
          <span className="bm-menu-btn__text">그룹</span>
        </button>
        <span className="bm-topbar__title">Bookmark Viewer</span>
      </header>

      <aside id="bm-sidebar" className={`bm-sidebar ${sidebarOpen ? "bm-sidebar--open" : ""}`}>
        <p className="bm-sidebar__label">그룹</p>

        <div
          onClick={() => pickGroup("all")}
          className={`bm-group bm-group--all ${activeGroup === "all" ? "bm-group--active" : ""}`}
        >
          <span className="bm-group__name">전체</span>
          <span className="bm-group__count">{bookmarks.length}</span>
        </div>

        {allGroups.map((g) => (
          <GroupItem
            key={g} name={g} active={activeGroup === g}
            count={bookmarks.filter((b) => b.group === g).length}
            onClick={() => pickGroup(g)}
            onRename={renameGroup}
            onDelete={deleteGroup}
            undeletable={allGroups.length === 1}
          />
        ))}

        <div className="bm-sidebar__add">
          {addingGroup ? (
            <div className="bm-add-row">
              <input
                autoFocus value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addGroup(); if (e.key === "Escape") setAddingGroup(false); }}
                placeholder="그룹 이름"
                className="bm-add-row__input"
              />
              <button type="button" onClick={addGroup} className="bm-add-row__submit">+</button>
            </div>
          ) : (
            <button type="button" onClick={() => setAddingGroup(true)} className="bm-add-group">
              + 그룹 추가
            </button>
          )}
        </div>

        <div className="bm-sidebar__footer">
          <button
            type="button"
            onClick={handleExport}
            className={`bm-btn bm-btn--primary ${exportDirty ? "bm-btn--unsaved" : ""}`}
          >
           내보내기 (.html)
          </button>
          <button type="button" onClick={handleReset} className="bm-btn bm-btn--ghost">
            다시 불러오기
          </button>
        </div>
      </aside>

      <main className="bm-main">
        <div className="bm-toolbar">
          <input
            type="search"
            placeholder="검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bm-toolbar__search"
            enterKeyHint="search"
          />
          <label className="bm-toolbar__sort-label">
            <span className="bm-sr-only">정렬</span>
            <select
              className="bm-toolbar__select"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              aria-label="정렬"
            >
              <option value="default">기본 (파일 순서)</option>
              <option value="name">이름순 (가나다)</option>
              <option value="domain">도메인순</option>
            </select>
          </label>
          {duplicateExtraCount > 0 && (
            <button
              type="button"
              className={`bm-badge ${duplicatesOnly ? "bm-badge--active" : ""}`}
              onClick={() => setDuplicatesOnly((v) => !v)}
              title={duplicatesOnly ? "전체 목록으로" : "중복 URL만 보기"}
            >
              중복 {duplicateExtraCount}개
            </button>
          )}
          {duplicatesOnly && duplicateExtraCount > 0 && (
            <button type="button" className="bm-toolbar__dedupe" onClick={removeDuplicateUrls}>
              중복 정리 (URL당 1개만 유지)
            </button>
          )}
          {selected.size > 0 && (
            <>
              <span className="bm-toolbar__meta">{selected.size}개 선택</span>
              <button type="button" onClick={() => setShowMoveModal(true)} className="bm-toolbar__action">
                그룹 이동
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="bm-toolbar__link">
                선택 해제
              </button>
            </>
          )}
          <span className="bm-toolbar__count">{filtered.length}개</span>
        </div>

        <div className="bm-scroll">
          {filtered.length === 0 ? (
            <div className="bm-placeholder">북마크가 없습니다</div>
          ) : (
            <div className="bm-grid">
              {filtered.map((b) => (
                <Card
                  key={b.id}
                  bookmark={b}
                  selected={selected.has(b.id)}
                  onToggle={toggleSelect}
                  onContextMenu={openContextMenu}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
