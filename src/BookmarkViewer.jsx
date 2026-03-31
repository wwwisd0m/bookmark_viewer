import { useState, useCallback, useRef, useEffect } from "react";

/* ── utils ── */
const getDomain = (url) => { try { return new URL(url).hostname; } catch { return ""; } };
const getFavicon = (url) => `https://www.google.com/s2/favicons?domain=${getDomain(url)}&sz=64`;
const getThumb   = (url) => `https://image.thum.io/get/width/400/crop/600/${url}`;
const uid = () => Math.random().toString(36).slice(2);

/* ── parse Netscape bookmark HTML ── */
function parseBookmarks(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const results = [];
  function walk(node, folder) {
    for (const child of node.children) {
      if (child.tagName === "DT") {
        const a  = child.querySelector(":scope > A");
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

/* ── Card ── */
function Card({ bookmark, selected, onToggle }) {
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

  return (
    <div
      className="bm-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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

      <a href={bookmark.url} target="_blank" rel="noopener noreferrer" className="bm-card__link">
        {thumbFailed ? (
          <div className="bm-card__thumb bm-card__thumb--fallback">
            <img src={getFavicon(bookmark.url)} width={32} height={32} alt="" onError={(e) => (e.target.style.display = "none")} />
          </div>
        ) : (
          <img
            src={getThumb(bookmark.url)} alt="" loading="lazy"
            className="bm-card__img"
            onError={() => setThumbFailed(true)}
          />
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
    <div
      onClick={onClick}
      className={`bm-group ${active ? "bm-group--active" : ""}`}
    >
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
          >✎</button>
          <button
            type="button"
            title="그룹 삭제"
            onClick={(e) => { e.stopPropagation(); onDelete(name); }}
            className="bm-group__btn"
          >✕</button>
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
            <button
              key={g} type="button" onClick={() => onMove(g)}
              className="bm-modal__item"
            >
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
  const [bookmarks, setBookmarks] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => { if (mq.matches) setSidebarOpen(false); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const handleLoad = useCallback((html) => {
    const parsed = parseBookmarks(html);
    const groupList = [...new Set(parsed.map((b) => b.group))];
    setBookmarks(parsed);
    setGroups(groupList);
    setActiveGroup("all");
    setSelected(new Set());
    setQuery("");
  }, []);

  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name || groups.includes(name)) return;
    setGroups((g) => [...g, name]);
    setNewGroupName("");
    setAddingGroup(false);
  };

  const deleteGroup = (name) => {
    setBookmarks((bm) => bm.map((b) => b.group === name ? { ...b, group: "미분류" } : b));
    setGroups((prev) => {
      const next = prev.filter((x) => x !== name);
      return next.includes("미분류") ? next : ["미분류", ...next];
    });
    if (activeGroup === name) setActiveGroup("all");
  };

  const renameGroup = (oldName, newName) => {
    if (groups.includes(newName)) return;
    setGroups((g) => g.map((x) => (x === oldName ? newName : x)));
    setBookmarks((bm) => bm.map((b) => b.group === oldName ? { ...b, group: newName } : b));
    if (activeGroup === oldName) setActiveGroup(newName);
  };

  const toggleSelect = (id) => setSelected((s) => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const moveSelected = (targetGroup) => {
    setBookmarks((bm) => bm.map((b) => selected.has(b.id) ? { ...b, group: targetGroup } : b));
    setSelected(new Set());
    setShowMoveModal(false);
  };

  const allGroups = groups.includes("미분류") ? groups
    : bookmarks.some((b) => b.group === "미분류") ? ["미분류", ...groups] : groups;

  const handleExport = () => {
    const html = exportHTML(bookmarks, allGroups);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bookmarks_export.html";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const filtered = bookmarks
    .filter((b) => activeGroup === "all" || b.group === activeGroup)
    .filter((b) => !query || b.title.toLowerCase().includes(query.toLowerCase()) || b.url.toLowerCase().includes(query.toLowerCase()));

  const pickGroup = (g) => {
    setActiveGroup(g);
    closeSidebar();
  };

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

      <aside
        id="bm-sidebar"
        className={`bm-sidebar ${sidebarOpen ? "bm-sidebar--open" : ""}`}
      >
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
              <button type="button" onClick={addGroup} className="bm-add-row__submit">
                +
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setAddingGroup(true)} className="bm-add-group">
              + 그룹 추가
            </button>
          )}
        </div>

        <div className="bm-sidebar__footer">
          <button type="button" onClick={handleExport} className="bm-btn bm-btn--primary">
           보내기 (.html)
          </button>
          <button
            type="button"
            onClick={() => { setBookmarks([]); setGroups([]); setSelected(new Set()); }}
            className="bm-btn bm-btn--ghost"
          >
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
                <Card key={b.id} bookmark={b} selected={selected.has(b.id)} onToggle={toggleSelect} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
