var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => CheckSortedPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");

// src/settings.ts
var DEFAULT_SETTINGS = {
  completedAreaHierarchy: "2",
  completedAreaName: "Completed",
  showIcon: true,
  showStatusBar: true,
  autoMove: true,
  autocomplete: true,
  showDeleteButton: true,
  dateStamp: false,
  dateFormat: "YYYY-MM-DD",
  sortOrder: "append",
  sortMethod: "global",
  keepEmptyParents: true,
  cascadeRestore: true,
  contextStatus: "c",
  completedParentBehavior: "none",
  parentDeleteBehavior: "cascade"
};

// src/settingsTab.ts
var import_obsidian = require("obsidian");
var CheckSortedSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.activeTab = "general";
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const tabBar = containerEl.createDiv("checksorted-tab-bar");
    const tabs = [
      { id: "general", label: "General" },
      { id: "interface", label: "Interface" },
      { id: "behavior", label: "Behavior" }
    ];
    const contentEl = containerEl.createDiv("checksorted-tab-content");
    tabs.forEach(({ id, label }) => {
      const btn = tabBar.createEl("button", {
        text: label,
        cls: "checksorted-tab-btn" + (this.activeTab === id ? " is-active" : "")
      });
      btn.addEventListener("click", () => {
        this.activeTab = id;
        this.display();
      });
    });
    if (this.activeTab === "general") this.renderGeneral(contentEl);
    else if (this.activeTab === "interface") this.renderInterface(contentEl);
    else if (this.activeTab === "behavior") this.renderBehavior(contentEl);
  }
  section(containerEl, title, open = true) {
    const details = containerEl.createEl("details", { cls: "checksorted-section" });
    if (open) details.setAttribute("open", "");
    details.createEl("summary", { text: title, cls: "checksorted-section-title" });
    return details;
  }
  renderGeneral(el) {
    const areaSection = this.section(el, "Sorting & Completed Area");
    new import_obsidian.Setting(areaSection).setName("Sort method").setDesc("Choose how completed items are sorted.").addDropdown(
      (drop) => drop.addOptions({ "global": "Global completed area", "in-place": "In-place list sorting" }).setValue(this.plugin.settings.sortMethod).onChange(async (value) => {
        this.plugin.settings.sortMethod = value;
        await this.plugin.saveSettings();
        this.display();
      })
    );
    if (this.plugin.settings.sortMethod === "global") {
      new import_obsidian.Setting(areaSection).setName("Header level").setDesc("Heading level for the completed area (H1\u2013H6).").addDropdown(
        (drop) => drop.addOptions({ "1": "H1", "2": "H2", "3": "H3", "4": "H4", "5": "H5", "6": "H6" }).setValue(this.plugin.settings.completedAreaHierarchy).onChange(async (value) => {
          this.plugin.settings.completedAreaHierarchy = value;
          await this.plugin.saveSettings();
        })
      );
      new import_obsidian.Setting(areaSection).setName("Header name").setDesc("Text of the completed area heading.").addText(
        (text) => text.setPlaceholder("Completed").setValue(this.plugin.settings.completedAreaName).onChange(async (value) => {
          this.plugin.settings.completedAreaName = value || "Completed";
          await this.plugin.saveSettings();
        })
      );
      new import_obsidian.Setting(areaSection).setName("New items order").setDesc("Where to place newly moved items within the completed area.").addDropdown(
        (drop) => drop.addOptions({ append: "Append (bottom)", prepend: "Prepend (top)" }).setValue(this.plugin.settings.sortOrder).onChange(async (value) => {
          this.plugin.settings.sortOrder = value;
          await this.plugin.saveSettings();
        })
      );
      new import_obsidian.Setting(areaSection).setName("Keep empty parent items").setDesc(
        "Keep a parent in the active list after its last child is moved to the completed area."
      ).addToggle(
        (toggle) => toggle.setValue(this.plugin.settings.keepEmptyParents).onChange(async (value) => {
          this.plugin.settings.keepEmptyParents = value;
          await this.plugin.saveSettings();
        })
      );
      new import_obsidian.Setting(areaSection).setName("Context checkbox status").setDesc(
        "One character used internally for hidden structural parent copies in the completed area. Space, x, X, and / are reserved. Default: c."
      ).addText((text) => {
        text.inputEl.maxLength = 1;
        text.setPlaceholder("c").setValue(this.plugin.settings.contextStatus).onChange(async (value) => {
          const candidate = value.slice(0, 1);
          if (!candidate || [" ", "x", "X", "/", "[", "]"].includes(candidate)) return;
          this.plugin.settings.contextStatus = candidate;
          await this.plugin.saveSettings();
          this.app.workspace.updateOptions();
        });
      });
    }
    const dateSection = this.section(el, "Date Stamp");
    new import_obsidian.Setting(dateSection).setName("Date stamp").setDesc("Append a completion date when items are moved.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.dateStamp).onChange(async (value) => {
        this.plugin.settings.dateStamp = value;
        await this.plugin.saveSettings();
        this.display();
      })
    );
    if (this.plugin.settings.dateStamp) {
      new import_obsidian.Setting(dateSection).setName("Date format").setDesc(
        `Moment.js format string. Preview: ${(0, import_obsidian.moment)().format(
          this.plugin.settings.dateFormat
        )}`
      ).addText(
        (text) => text.setPlaceholder("YYYY-MM-DD").setValue(this.plugin.settings.dateFormat).onChange(async (value) => {
          this.plugin.settings.dateFormat = value || "YYYY-MM-DD";
          await this.plugin.saveSettings();
        })
      );
    }
  }
  renderInterface(el) {
    const sidebarSection = this.section(el, "Sidebar & Status Bar");
    new import_obsidian.Setting(sidebarSection).setName("Show ribbon icon").setDesc("Show the move-completed icon in the left sidebar.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.showIcon).onChange(async (value) => {
        this.plugin.settings.showIcon = value;
        await this.plugin.saveSettings();
        this.plugin.updateRibbonIcon();
      })
    );
    new import_obsidian.Setting(sidebarSection).setName("Show status bar toggle").setDesc(
      "Show a button in the bottom status bar that toggles auto-move on/off and displays its current state."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.showStatusBar).onChange(async (value) => {
        this.plugin.settings.showStatusBar = value;
        await this.plugin.saveSettings();
        this.plugin.updateStatusBar();
      })
    );
    const editorSection = this.section(el, "Editor");
    new import_obsidian.Setting(editorSection).setName("Show delete button").setDesc(
      "Show a \xD7 on the right of each checkbox line in the editor; click it to delete that task."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.showDeleteButton).onChange(async (value) => {
        this.plugin.settings.showDeleteButton = value;
        await this.plugin.saveSettings();
        this.app.workspace.updateOptions();
      })
    );
    new import_obsidian.Setting(editorSection).setName("Task autocomplete").setDesc(
      "While typing in a checkbox, suggest matching tasks from elsewhere in the note. Selecting one moves that task to the line you are typing."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autocomplete).onChange(async (value) => {
        this.plugin.settings.autocomplete = value;
        await this.plugin.saveSettings();
      })
    );
  }
  renderBehavior(el) {
    const autoSection = this.section(el, "Automation");
    new import_obsidian.Setting(autoSection).setName("Auto-move on complete").setDesc(
      "Automatically move items to the completed area when a checkbox is checked."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoMove).onChange(async (value) => {
        this.plugin.settings.autoMove = value;
        await this.plugin.saveSettings();
        this.plugin.refreshStatusBar();
      })
    );
    new import_obsidian.Setting(autoSection).setName("Restore descendants with parent").setDesc(
      "When a completed parent is unchecked, restore its entire subtree and uncheck every descendant. When off, restore only the parent."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.cascadeRestore).onChange(async (value) => {
        this.plugin.settings.cascadeRestore = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(autoSection).setName("When all child tasks are completed").setDesc(
      "Choose whether the parent stays open, is completed and moved normally, or is completed in place."
    ).addDropdown(
      (drop) => drop.addOptions({
        none: "Leave parent open",
        move: "Complete and move parent",
        stay: "Complete parent in place"
      }).setValue(this.plugin.settings.completedParentBehavior).onChange(async (value) => {
        this.plugin.settings.completedParentBehavior = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(autoSection).setName("When deleting a parent task").setDesc(
      "Apply this only when the deleted task has child tasks, including children already in the completed area."
    ).addDropdown(
      (drop) => drop.addOptions({
        cascade: "Delete parent and children",
        promote: "Delete parent only and promote children"
      }).setValue(this.plugin.settings.parentDeleteBehavior).onChange(async (value) => {
        this.plugin.settings.parentDeleteBehavior = value;
        await this.plugin.saveSettings();
      })
    );
  }
};

// src/taskTree.ts
var CONTEXT_MARKER = "%%checksorted-context%%";
var CASCADE_MARKER = "%%checksorted-cascade%%";
var AUTO_STAY_MARKER = "%%checksorted-auto-stay%%";
var ID_MARKER_PREFIX = "%%checksorted-id:";
var ORDER_MARKER_PREFIX = "%%checksorted-order:";
var ID_MARKER = /%%checksorted-id:([A-Za-z0-9_-]+)%%/;
var ORDER_MARKER = /%%checksorted-order:(\d+(?:\.\d+)*)%%/;
var INTERNAL_MARKER = /\s*%%checksorted-(?:context|cascade|auto-stay|id:[A-Za-z0-9_-]+|order:\d+(?:\.\d+)*)%%/g;
var generatedId = 0;
var LIST_ITEM = /^([ \t]*)([-*+]|\d+\.) (?:\[([^\]])\] )?(.*)$/;
function isTreeNode(entry) {
  return typeof entry !== "string";
}
function indentationWidth(indent) {
  let width = 0;
  for (const char of indent) width += char === "	" ? 4 - width % 4 : 1;
  return width;
}
function parseTree(content) {
  var _a, _b, _c;
  if (!content) return [];
  const root = [];
  const stack = [];
  for (const line of content.split("\n")) {
    const match = LIST_ITEM.exec(line);
    if (match) {
      const width = indentationWidth(match[1]);
      while (stack.length && stack[stack.length - 1].indentWidth >= width) {
        stack.pop();
      }
      const node = {
        kind: "item",
        line,
        indent: match[1],
        indentWidth: width,
        marker: match[2],
        state: (_a = match[3]) != null ? _a : null,
        text: match[4],
        entries: []
      };
      const destination = stack.length ? stack[stack.length - 1].entries : root;
      destination.push(node);
      stack.push(node);
      continue;
    }
    if (!stack.length) {
      root.push(line);
      continue;
    }
    if (line.trim() === "") {
      stack[stack.length - 1].entries.push(line);
      continue;
    }
    const indent = (_c = (_b = /^[ \t]*/.exec(line)) == null ? void 0 : _b[0]) != null ? _c : "";
    if (indentationWidth(indent) > stack[stack.length - 1].indentWidth) {
      stack[stack.length - 1].entries.push(line);
    } else {
      stack.length = 0;
      root.push(line);
    }
  }
  return root;
}
function serializeTree(entries) {
  const lines = [];
  const append = (items) => {
    for (const entry of items) {
      if (typeof entry === "string") {
        lines.push(entry);
      } else {
        lines.push(entry.line);
        append(entry.entries);
      }
    }
  };
  append(entries);
  return lines.join("\n");
}
function cloneEntry(entry) {
  if (typeof entry === "string") return entry;
  return {
    ...entry,
    entries: entry.entries.map((child) => cloneEntry(child))
  };
}
function refreshNode(node) {
  var _a;
  const match = LIST_ITEM.exec(node.line);
  if (!match) return;
  node.indent = match[1];
  node.indentWidth = indentationWidth(match[1]);
  node.marker = match[2];
  node.state = (_a = match[3]) != null ? _a : null;
  node.text = match[4];
}
function setTaskState(node, state) {
  if (node.state === null) {
    node.line = `${node.indent}${node.marker} [${state}] ${node.text}`;
  } else {
    node.line = node.line.replace(/^(\s*(?:[-*+]|\d+\.) )\[[^\]]\]/, `$1[${state}]`);
  }
  refreshNode(node);
}
function appendMarker(node, marker) {
  if (node.line.includes(marker)) return;
  const dateIndex = node.line.search(/ ✅ \S/);
  if (dateIndex === -1) node.line = `${node.line.trimEnd()} ${marker}`;
  else node.line = `${node.line.slice(0, dateIndex).trimEnd()} ${marker}${node.line.slice(dateIndex)}`;
  refreshNode(node);
}
function removeMarker(node, marker) {
  node.line = node.line.replace(new RegExp(`\\s*${escapeRegex(marker)}`, "g"), "").trimEnd();
  refreshNode(node);
}
function stripTaskMetadata(node) {
  node.line = node.line.replace(/\s*✅.*$/, "").replace(new RegExp(`\\s*${escapeRegex(CASCADE_MARKER)}`, "g"), "").trimEnd();
  refreshNode(node);
}
function normalizedText(node) {
  return node.text.replace(INTERNAL_MARKER, "").replace(/\s*✅.*$/, "").trim();
}
function taskId(node) {
  var _a, _b;
  return (_b = (_a = ID_MARKER.exec(node.line)) == null ? void 0 : _a[1]) != null ? _b : null;
}
function taskOrder(node) {
  var _a, _b;
  return (_b = (_a = ORDER_MARKER.exec(node.line)) == null ? void 0 : _a[1]) != null ? _b : null;
}
function newTaskId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi == null ? void 0 : cryptoApi.randomUUID) return cryptoApi.randomUUID().replace(/-/g, "");
  generatedId++;
  return `${Date.now().toString(36)}${generatedId.toString(36)}`;
}
function setIdentity(node, id, order) {
  if (!taskId(node)) appendMarker(node, `${ID_MARKER_PREFIX}${id}%%`);
  if (taskOrder(node) === null) appendMarker(node, `${ORDER_MARKER_PREFIX}${order}%%`);
}
function nodeMatches(a, b) {
  const aId = taskId(a);
  const bId = taskId(b);
  if (aId && bId) return aId === bId;
  return normalizedText(a) === normalizedText(b);
}
function ensureMetadata(entries) {
  var _a, _b;
  let order = 0;
  for (const entry of entries) {
    if (!isTreeNode(entry)) continue;
    const ownsTask = entry.state !== null || entry.entries.some(
      (child) => isTreeNode(child) && (child.state !== null || hasChildItems(child))
    );
    if (ownsTask) setIdentity(entry, (_a = taskId(entry)) != null ? _a : newTaskId(), (_b = taskOrder(entry)) != null ? _b : String(order));
    ensureMetadata(entry.entries);
    order++;
  }
}
function inheritContextMetadata(activeEntries, completedEntries, contextStatus) {
  const used = /* @__PURE__ */ new Set();
  for (const completed of completedEntries) {
    if (!isTreeNode(completed) || !isContextNode(completed, contextStatus)) continue;
    const match = activeEntries.find(
      (candidate) => isTreeNode(candidate) && !used.has(candidate) && nodeMatches(candidate, completed)
    );
    if (!match) continue;
    used.add(match);
    const id = taskId(match);
    if (id && !taskId(completed)) appendMarker(completed, `${ID_MARKER_PREFIX}${id}%%`);
    const order = taskOrder(match);
    if (order !== null && taskOrder(completed) === null) {
      appendMarker(completed, `${ORDER_MARKER_PREFIX}${order}%%`);
    }
    inheritContextMetadata(match.entries, completed.entries, contextStatus);
  }
}
function ensureCascadeMetadata(main, completed, contextStatus) {
  ensureMetadata(main);
  inheritContextMetadata(main, completed, contextStatus);
  ensureMetadata(completed);
}
function isContextNode(node, contextStatus) {
  return node.line.includes(CONTEXT_MARKER) || node.state === contextStatus;
}
function hasChildItems(node) {
  return node.entries.some(isTreeNode);
}
function reindentNode(node, indent) {
  const oldWidth = node.indentWidth;
  const newWidth = indentationWidth(indent);
  const delta = newWidth - oldWidth;
  node.line = indent + node.line.slice(node.indent.length);
  refreshNode(node);
  const adjust = (entries) => {
    var _a, _b;
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      if (typeof entry === "string") {
        if (entry.trim() !== "") {
          const currentIndent = (_b = (_a = /^[ \t]*/.exec(entry)) == null ? void 0 : _a[0]) != null ? _b : "";
          const targetWidth2 = Math.max(0, indentationWidth(currentIndent) + delta);
          entries[index] = " ".repeat(targetWidth2) + entry.slice(currentIndent.length);
        }
        continue;
      }
      const targetWidth = Math.max(0, entry.indentWidth + delta);
      const targetIndent = " ".repeat(targetWidth);
      entry.line = targetIndent + entry.line.slice(entry.indent.length);
      refreshNode(entry);
      adjust(entry.entries);
    }
  };
  adjust(node.entries);
}
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function isChecked(node) {
  return node.state === "x" || node.state === "X";
}
function isRestorable(node, options) {
  return !isContextNode(node, options.contextStatus) && (node.state === " " || node.state === "/");
}
function stamp(node, value) {
  if (!value || / ✅ \S/.test(node.line)) return;
  node.line = `${node.line.trimEnd()} \u2705 ${value}`;
  refreshNode(node);
}
function cascadeComplete(node, options) {
  let descendantTasks = 0;
  const visit = (entries) => {
    for (const entry of entries) {
      if (!isTreeNode(entry)) continue;
      if (entry.state !== null && !isContextNode(entry, options.contextStatus)) {
        setTaskState(entry, "x");
        stamp(entry, options.dateStamp);
        descendantTasks++;
      }
      visit(entry.entries);
    }
  };
  setTaskState(node, "x");
  stamp(node, options.dateStamp);
  visit(node.entries);
  if (descendantTasks > 0) appendMarker(node, CASCADE_MARKER);
}
function cascadeUncheck(node, contextStatus) {
  const visit = (entry) => {
    if (entry.state !== null && !isContextNode(entry, contextStatus)) {
      setTaskState(entry, " ");
      stripTaskMetadata(entry);
    }
    for (const child of entry.entries) {
      if (isTreeNode(child)) visit(child);
    }
  };
  visit(node);
}
function contextClone(ancestor, pathChild, branch, options) {
  const copy = cloneEntry(ancestor);
  copy.entries = [];
  setTaskState(copy, options.contextStatus);
  stripTaskMetadata(copy);
  appendMarker(copy, CONTEXT_MARKER);
  for (const entry of ancestor.entries) {
    if (typeof entry === "string") copy.entries.push(entry);
    else if (entry === pathChild) copy.entries.push(branch);
  }
  return copy;
}
function archiveBranch(ancestors, node, options) {
  let branch = cloneEntry(node);
  for (let index = ancestors.length - 1; index >= 0; index--) {
    const child = index === ancestors.length - 1 ? node : ancestors[index + 1];
    branch = contextClone(ancestors[index], child, branch, options);
  }
  return branch;
}
function insertStringBeforeChildren(entries, value) {
  if (entries.some((entry) => typeof entry === "string" && entry.trim() === value.trim())) return;
  const firstChild = entries.findIndex(isTreeNode);
  if (firstChild === -1) entries.push(value);
  else entries.splice(firstChild, 0, value);
}
function matchingNode(entries, incoming, options) {
  for (const entry of entries) {
    if (!isTreeNode(entry) || !nodeMatches(entry, incoming)) continue;
    const incomingContext = isContextNode(incoming, options.contextStatus);
    const existingContext = isContextNode(entry, options.contextStatus);
    if (incomingContext || existingContext || entry.state === incoming.state) return entry;
  }
  return null;
}
function insertNodeInOriginalOrder(entries, node) {
  const order = taskOrder(node);
  if (order === null) {
    entries.push(node);
    return;
  }
  const next = entries.findIndex(
    (entry) => isTreeNode(entry) && compareOrders(taskOrder(entry), order) > 0
  );
  if (next === -1) entries.push(node);
  else entries.splice(next, 0, node);
}
function compareOrders(left, right) {
  if (left === null) return 1;
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    if (index >= a.length) return -1;
    if (index >= b.length) return 1;
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}
function setTaskOrder(node, order) {
  const marker = `${ORDER_MARKER_PREFIX}${order}%%`;
  if (ORDER_MARKER.test(node.line)) node.line = node.line.replace(ORDER_MARKER, marker);
  else appendMarker(node, marker);
  refreshNode(node);
}
function mergeNode(existing, incoming, options) {
  const incomingContext = isContextNode(incoming, options.contextStatus);
  const existingContext = isContextNode(existing, options.contextStatus);
  if (!incomingContext && existingContext) {
    const indent = existing.indent;
    existing.line = incoming.line;
    refreshNode(existing);
    reindentNode(existing, indent);
  } else if (incomingContext && existingContext) {
    setTaskState(existing, options.contextStatus);
    stripTaskMetadata(existing);
    appendMarker(existing, CONTEXT_MARKER);
  }
  for (const entry of incoming.entries) {
    if (typeof entry === "string") {
      insertStringBeforeChildren(existing.entries, entry);
      continue;
    }
    const match = matchingNode(existing.entries, entry, options);
    if (match) mergeNode(match, entry, options);
    else if (options.sortOrder === "prepend") {
      const firstNode = existing.entries.findIndex(isTreeNode);
      existing.entries.splice(firstNode === -1 ? existing.entries.length : firstNode, 0, entry);
    } else existing.entries.push(entry);
  }
  if (!isContextNode(existing, options.contextStatus) && isChecked(existing) && existing.entries.some((entry) => isTreeNode(entry) && entry.state !== null)) {
    appendMarker(existing, CASCADE_MARKER);
  }
}
function mergeArchiveBranch(completed, branch, options) {
  const match = matchingNode(completed, branch, options);
  if (match) {
    mergeNode(match, branch, options);
    return;
  }
  if (options.sortOrder === "prepend") {
    const firstNode = completed.findIndex(isTreeNode);
    completed.splice(firstNode === -1 ? completed.length : firstNode, 0, branch);
  } else completed.push(branch);
}
function moveCompletedFromContainer(entries, ancestors, completed, options) {
  let moved = 0;
  for (let index = 0; index < entries.length; ) {
    const entry = entries[index];
    if (!isTreeNode(entry)) {
      index++;
      continue;
    }
    if (isChecked(entry) && !isContextNode(entry, options.contextStatus) && !entry.line.includes(AUTO_STAY_MARKER)) {
      cascadeComplete(entry, options);
      mergeArchiveBranch(completed, archiveBranch(ancestors, entry, options), options);
      entries.splice(index, 1);
      moved++;
      continue;
    }
    const childMoves = moveCompletedFromContainer(
      entry.entries,
      [...ancestors, entry],
      completed,
      options
    );
    moved += childMoves;
    if (childMoves > 0 && !options.keepEmptyParents && options.completedParentBehavior === "none" && entry.state !== null && !hasChildItems(entry)) {
      entries.splice(index, 1);
      continue;
    }
    index++;
  }
  return moved;
}
function activeContextClone(context) {
  const copy = cloneEntry(context);
  setTaskState(copy, " ");
  removeMarker(copy, CONTEXT_MARKER);
  stripTaskMetadata(copy);
  copy.entries = copy.entries.filter((entry) => typeof entry === "string");
  return copy;
}
function mergeActiveNode(existing, incoming) {
  for (const entry of incoming.entries) {
    if (typeof entry === "string") {
      insertStringBeforeChildren(existing.entries, entry);
      continue;
    }
    const match = existing.entries.find(
      (candidate) => isTreeNode(candidate) && nodeMatches(candidate, entry)
    );
    if (match) mergeActiveNode(match, entry);
    else insertNodeInOriginalOrder(existing.entries, entry);
  }
}
function mergeIntoActive(main, contexts, restored) {
  let destination = main;
  for (const context of contexts) {
    let parent = destination.find(
      (entry) => isTreeNode(entry) && nodeMatches(entry, context)
    );
    if (!parent) {
      parent = activeContextClone(context);
      destination.push(parent);
    } else {
      for (const own of context.entries) {
        if (typeof own === "string") insertStringBeforeChildren(parent.entries, own);
      }
    }
    destination = parent.entries;
  }
  const match = destination.find(
    (entry) => isTreeNode(entry) && nodeMatches(entry, restored)
  );
  if (match) mergeActiveNode(match, restored);
  else insertNodeInOriginalOrder(destination, restored);
}
function pruneEmptyContexts(entries, options) {
  for (let index = 0; index < entries.length; ) {
    const entry = entries[index];
    if (!isTreeNode(entry)) {
      index++;
      continue;
    }
    pruneEmptyContexts(entry.entries, options);
    if (isContextNode(entry, options.contextStatus) && !hasChildItems(entry)) {
      entries.splice(index, 1);
      continue;
    }
    index++;
  }
}
function findNodeById(entries, id) {
  for (const entry of entries) {
    if (!isTreeNode(entry)) continue;
    if (taskId(entry) === id) return entry;
    const nested = findNodeById(entry.entries, id);
    if (nested) return nested;
  }
  return null;
}
function updateAutomaticParents(main, completed, options) {
  if (options.completedParentBehavior === "none") return 0;
  let changed = 0;
  const visit = (entries) => {
    for (const entry of entries) {
      if (!isTreeNode(entry)) continue;
      visit(entry.entries);
      if (entry.state === null || isContextNode(entry, options.contextStatus)) continue;
      const id = taskId(entry);
      const archived = id ? findNodeById(completed, id) : null;
      const activeChildren = entry.entries.filter(isTreeNode).filter((child) => child.state !== null);
      const archivedChildren = archived ? archived.entries.filter(isTreeNode).filter((child) => child.state !== null) : [];
      const hasKnownChildren = activeChildren.length > 0 || archivedChildren.length > 0;
      const allCompleted = hasKnownChildren && activeChildren.every((child) => isChecked(child));
      if (allCompleted && !isChecked(entry)) {
        setTaskState(entry, "x");
        if (options.completedParentBehavior === "stay") {
          appendMarker(entry, AUTO_STAY_MARKER);
          stamp(entry, options.dateStamp);
        }
        changed++;
      } else if (!allCompleted && entry.line.includes(AUTO_STAY_MARKER)) {
        setTaskState(entry, " ");
        removeMarker(entry, AUTO_STAY_MARKER);
        stripTaskMetadata(entry);
        changed++;
      }
    }
  };
  visit(main);
  return changed;
}
function taskIdAtOrdinal(entries, ordinal) {
  let current = 0;
  let result = null;
  const visit = (items) => {
    for (const entry of items) {
      if (!isTreeNode(entry) || result) continue;
      if (current === ordinal) {
        result = taskId(entry);
        return;
      }
      current++;
      visit(entry.entries);
    }
  };
  visit(entries);
  return result;
}
function deleteTaskCascadeTrees(main, completed, targetId, behavior, options) {
  ensureCascadeMetadata(main, completed, options.contextStatus);
  const occurrences = [findNodeById(main, targetId), findNodeById(completed, targetId)].filter((node) => node !== null);
  const hasChildren = occurrences.some(hasChildItems);
  const promote = hasChildren && behavior === "promote";
  let deleted = false;
  const remove = (entries) => {
    var _a, _b;
    for (let index = 0; index < entries.length; ) {
      const entry = entries[index];
      if (!isTreeNode(entry)) {
        index++;
        continue;
      }
      if (taskId(entry) !== targetId) {
        remove(entry.entries);
        index++;
        continue;
      }
      deleted = true;
      if (!promote) {
        entries.splice(index, 1);
        continue;
      }
      const children = entry.entries.filter(isTreeNode);
      const parentOrder = (_a = taskOrder(entry)) != null ? _a : String(index);
      for (let childIndex = 0; childIndex < children.length; childIndex++) {
        const child = children[childIndex];
        setTaskOrder(child, `${parentOrder}.${(_b = taskOrder(child)) != null ? _b : childIndex}`);
        reindentNode(child, entry.indent);
      }
      entries.splice(index, 1, ...children);
      index += children.length;
    }
  };
  remove(main);
  remove(completed);
  pruneEmptyContexts(completed, options);
  return { main, completed, deleted, promoted: promote };
}
function restoreFromContainer(entries, contexts, main, options) {
  let restoredCount = 0;
  for (let index = 0; index < entries.length; ) {
    const entry = entries[index];
    if (!isTreeNode(entry)) {
      index++;
      continue;
    }
    if (isContextNode(entry, options.contextStatus)) {
      restoredCount += restoreFromContainer(
        entry.entries,
        [...contexts, entry],
        main,
        options
      );
      index++;
      continue;
    }
    if (!isRestorable(entry, options)) {
      restoredCount += restoreFromContainer(
        entry.entries,
        entry.state !== null ? [...contexts, entry] : contexts,
        main,
        options
      );
      index++;
      continue;
    }
    const cascade = options.cascadeRestore && entry.line.includes(CASCADE_MARKER);
    if (cascade) {
      const restored2 = cloneEntry(entry);
      cascadeUncheck(restored2, options.contextStatus);
      mergeIntoActive(main, contexts, restored2);
      entries.splice(index, 1);
      restoredCount++;
      continue;
    }
    const restored = cloneEntry(entry);
    restored.entries = restored.entries.filter((child) => typeof child === "string");
    setTaskState(restored, " ");
    stripTaskMetadata(restored);
    mergeIntoActive(main, contexts, restored);
    if (hasChildItems(entry)) {
      setTaskState(entry, options.contextStatus);
      stripTaskMetadata(entry);
      appendMarker(entry, CONTEXT_MARKER);
      index++;
    } else entries.splice(index, 1);
    restoredCount++;
  }
  return restoredCount;
}
function synchronizeCascadeTrees(main, completed, options) {
  ensureCascadeMetadata(main, completed, options.contextStatus);
  const restored = restoreFromContainer(completed, [], main, options);
  pruneEmptyContexts(completed, options);
  let moved = moveCompletedFromContainer(main, [], completed, options);
  updateAutomaticParents(main, completed, options);
  if (options.completedParentBehavior === "move") {
    moved += moveCompletedFromContainer(main, [], completed, options);
  }
  pruneEmptyContexts(completed, options);
  return { main, completed, moved, restored };
}
function moveCompletedCascadeTrees(main, completed, options) {
  ensureCascadeMetadata(main, completed, options.contextStatus);
  let moved = moveCompletedFromContainer(main, [], completed, options);
  updateAutomaticParents(main, completed, options);
  if (options.completedParentBehavior === "move") {
    moved += moveCompletedFromContainer(main, [], completed, options);
  }
  pruneEmptyContexts(completed, options);
  return { main, completed, moved, restored: 0 };
}
function restoreUncheckedCascadeTrees(main, completed, options) {
  ensureCascadeMetadata(main, completed, options.contextStatus);
  const restored = restoreFromContainer(completed, [], main, options);
  updateAutomaticParents(main, completed, options);
  pruneEmptyContexts(completed, options);
  return { main, completed, moved: 0, restored };
}
function restoreAllCascadeTrees(main, completed, options) {
  ensureCascadeMetadata(main, completed, options.contextStatus);
  const markRestorable = (entries) => {
    for (const entry of entries) {
      if (!isTreeNode(entry)) continue;
      if (!isContextNode(entry, options.contextStatus) && entry.state !== null) {
        setTaskState(entry, " ");
        appendMarker(entry, CASCADE_MARKER);
      }
      markRestorable(entry.entries);
    }
  };
  markRestorable(completed);
  const restoreOptions = { ...options, cascadeRestore: true };
  const restored = restoreFromContainer(completed, [], main, restoreOptions);
  pruneEmptyContexts(completed, restoreOptions);
  return { main, completed, moved: 0, restored };
}

// src/main.ts
var RIBBON_ICON = `<g transform="scale(0.33333)">
  <defs>
    <mask id="checksorted-check-gap">
      <rect x="0" y="0" width="300" height="300" fill="white"></rect>
      <polyline points="90,200 140,245 250,110" fill="none" stroke="black" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"></polyline>
    </mask>
  </defs>
  <g mask="url(#checksorted-check-gap)">
    <line x1="150" y1="45" x2="150" y2="15" stroke="currentColor" stroke-width="10" stroke-linecap="round"></line>
    <circle cx="150" cy="15" r="10" fill="currentColor"></circle>
    <rect x="25" y="100" width="20" height="40" rx="5" fill="currentColor"></rect>
    <rect x="255" y="100" width="20" height="40" rx="5" fill="currentColor"></rect>
    <rect x="45" y="45" width="210" height="150" rx="15" fill="none" stroke="currentColor" stroke-width="12"></rect>
    <circle cx="105" cy="105" r="16" fill="currentColor"></circle>
    <circle cx="195" cy="105" r="16" fill="currentColor"></circle>
    <polyline points="115,155 135,165 165,165 185,155" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"></polyline>
  </g>
  <polyline points="90,200 140,245 250,110" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"></polyline>
</g>`;
var READING_SYNC_DEBOUNCE_MS = 75;
var READING_SYNC_FALLBACK_MS = 1500;
var CheckSortedPlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    this.ribbonIconEl = null;
    this.statusBarEl = null;
    this.isProcessing = false;
    this.lastCursorLine = -1;
    this.lastCheckboxSnapshot = "";
    this.pendingReadingSyncs = /* @__PURE__ */ new Map();
    this.processingReadingFiles = /* @__PURE__ */ new Set();
    this.handleCheckboxMouseDown = (evt) => {
      const target = evt.target;
      if (!target) return;
      const isCheckboxInput = target.tagName === "INPUT" && target.type === "checkbox";
      const isCheckboxClass = target.classList.contains("task-list-item-checkbox");
      if (!isCheckboxInput && !isCheckboxClass) return;
      const view = this.app.workspace.getActiveViewOfType(import_obsidian2.MarkdownView);
      if (!view || !view.editor) return;
      const editor = view.editor;
      const cm = editor.cm;
      if (!cm || typeof cm.posAtDOM !== "function") return;
      try {
        const cmLine = target.closest(".cm-line");
        if (!cmLine) return;
        const pos = cm.posAtDOM(cmLine);
        const lineNum = editor.offsetToPos(pos).line;
        const lineText = editor.getLine(lineNum);
        const contextState = this.settings.contextStatus;
        const stateMatch = /^\s*(?:[-*+]|\d+\.) \[([^\]])\]/.exec(lineText);
        if (lineText.includes(CONTEXT_MARKER) || (stateMatch == null ? void 0 : stateMatch[1]) === contextState) {
          evt.preventDefault();
          evt.stopPropagation();
          return;
        }
        if (!(evt.ctrlKey || evt.metaKey)) return;
        evt.preventDefault();
        evt.stopPropagation();
        const match = /^(\s*[-*+] )\[([ xX\/])\] (.*)$/.exec(lineText);
        if (match) {
          const prefix = match[1];
          const state = match[2];
          const rest = match[3];
          const newState = state === "/" ? " " : "/";
          const newLineText = `${prefix}[${newState}] ${rest}`;
          editor.setLine(lineNum, newLineText);
        }
      } catch (e) {
        console.error("CheckSorted: Failed to handle Ctrl/Cmd+click on mousedown", e);
      }
    };
    this.handleCheckboxClick = (evt) => {
      const target = evt.target;
      if (!target) return;
      const isCheckboxInput = target.tagName === "INPUT" && target.type === "checkbox";
      const isCheckboxClass = target.classList.contains("task-list-item-checkbox");
      const isContext = !!target.closest(".checksorted-context-line, li.checksorted-context-task");
      if ((isCheckboxInput || isCheckboxClass) && (isContext || evt.ctrlKey || evt.metaKey)) {
        evt.preventDefault();
        evt.stopPropagation();
      }
    };
  }
  async onload() {
    await this.loadSettings();
    (0, import_obsidian2.addIcon)("checksorted", RIBBON_ICON);
    this.updateRibbonIcon();
    this.addCommand({
      id: "move-completed-items",
      name: "Move completed items to completed area",
      editorCallback: (editor) => this.moveCompletedItems(editor)
    });
    this.addCommand({
      id: "restore-completed-items",
      name: "Restore all items from completed area",
      editorCallback: (editor) => this.restoreCompletedItems(editor)
    });
    this.addCommand({
      id: "clear-completed-area",
      name: "Clear completed area",
      editorCallback: (editor) => this.clearCompletedArea(editor)
    });
    this.addSettingTab(new CheckSortedSettingTab(this.app, this));
    this.registerEditorSuggest(new CheckboxSuggest(this));
    this.registerEditorExtension(deleteButtonExtension(this));
    this.registerEditorExtension(dateStampExtension(this));
    this.registerEditorExtension(contextTaskExtension(this));
    this.registerMarkdownPostProcessor((el, ctx) => {
      var _a;
      decorateReadingContexts(
        el,
        this.settings.contextStatus,
        (_a = ctx.getSectionInfo(el)) == null ? void 0 : _a.text
      );
      ctx.addChild(new ReadingViewCheckboxHandler(
        el,
        ctx.sourcePath,
        (path) => this.queueReadingViewSync(path)
      ));
      el.querySelectorAll("li.task-list-item.is-checked").forEach((li) => {
        var _a2, _b;
        const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
        const hits = [];
        let n;
        while (n = walker.nextNode()) {
          const text = (_a2 = n.textContent) != null ? _a2 : "";
          const idx = text.search(/ ✅ \S/);
          if (idx !== -1) hits.push({ node: n, idx });
        }
        for (const { node, idx } of hits) {
          const text = (_b = node.textContent) != null ? _b : "";
          const before = document.createTextNode(text.slice(0, idx));
          const span = document.createElement("span");
          span.className = "checksorted-date";
          span.textContent = text.slice(idx);
          node.parentNode.replaceChild(span, node);
          span.parentNode.insertBefore(before, span);
        }
      });
    });
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof import_obsidian2.TFile) this.handleReadingViewFileModified(file);
      })
    );
    this.updateStatusBar();
    this.setupAutoMove();
    document.addEventListener("mousedown", this.handleCheckboxMouseDown, true);
    document.addEventListener("click", this.handleCheckboxClick, true);
  }
  onunload() {
    document.removeEventListener("mousedown", this.handleCheckboxMouseDown, true);
    document.removeEventListener("click", this.handleCheckboxClick, true);
    for (const pending of this.pendingReadingSyncs.values()) {
      if (pending.settleTimer !== null) window.clearTimeout(pending.settleTimer);
      if (pending.fallbackTimer !== null) window.clearTimeout(pending.fallbackTimer);
    }
    this.pendingReadingSyncs.clear();
    this.processingReadingFiles.clear();
  }
  queueReadingViewSync(path) {
    if (!this.settings.autoMove || !path) return;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian2.TFile) || file.extension.toLowerCase() !== "md") return;
    const existing = this.pendingReadingSyncs.get(path);
    if (existing) return;
    const pending = {
      settleTimer: null,
      // Normally vault "modify" starts processing. The fallback covers
      // platform/version differences where that event is delayed or omitted.
      fallbackTimer: window.setTimeout(() => {
        void this.processPendingReadingSync(path);
      }, READING_SYNC_FALLBACK_MS)
    };
    this.pendingReadingSyncs.set(path, pending);
  }
  handleReadingViewFileModified(file) {
    const pending = this.pendingReadingSyncs.get(file.path);
    if (!pending || this.processingReadingFiles.has(file.path)) return;
    if (pending.settleTimer !== null) window.clearTimeout(pending.settleTimer);
    pending.settleTimer = window.setTimeout(() => {
      void this.processPendingReadingSync(file.path);
    }, READING_SYNC_DEBOUNCE_MS);
  }
  async processPendingReadingSync(path) {
    const pending = this.pendingReadingSyncs.get(path);
    if (!pending || this.processingReadingFiles.has(path)) return;
    if (pending.settleTimer !== null) window.clearTimeout(pending.settleTimer);
    if (pending.fallbackTimer !== null) window.clearTimeout(pending.fallbackTimer);
    this.pendingReadingSyncs.delete(path);
    if (!this.settings.autoMove) return;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian2.TFile) || file.extension.toLowerCase() !== "md") return;
    this.processingReadingFiles.add(path);
    try {
      const current = await this.app.vault.read(file);
      const preview = this.transformReadingViewContent(current);
      if (preview === current) return;
      await this.app.vault.process(
        file,
        (latest) => this.transformReadingViewContent(latest)
      );
    } catch (error) {
      console.error(`CheckSorted: Failed to sync reading-view checkbox in ${path}`, error);
    } finally {
      this.processingReadingFiles.delete(path);
      if (this.pendingReadingSyncs.has(path)) {
        const next = this.pendingReadingSyncs.get(path);
        if (next.settleTimer !== null) window.clearTimeout(next.settleTimer);
        next.settleTimer = window.setTimeout(() => {
          void this.processPendingReadingSync(path);
        }, READING_SYNC_DEBOUNCE_MS);
      }
    }
  }
  transformReadingViewContent(content) {
    if (this.settings.sortMethod === "in-place") {
      return this.sortItemsInPlaceContent(content);
    }
    return this.transformGlobalContent(content, "sync").content;
  }
  getCascadeOptions() {
    return {
      contextStatus: this.settings.contextStatus,
      keepEmptyParents: this.settings.keepEmptyParents,
      cascadeRestore: this.settings.cascadeRestore,
      dateStamp: this.settings.dateStamp ? (0, import_obsidian2.moment)().format(this.settings.dateFormat) : null,
      sortOrder: this.settings.sortOrder,
      completedParentBehavior: this.settings.completedParentBehavior
    };
  }
  transformGlobalContent(content, mode) {
    const match = this.getHeaderRegex().exec(content);
    const mainSource = match ? content.substring(0, match.index).trimEnd() : content;
    const completedSource = match ? content.substring(match.index + match[0].length).trimStart() : "";
    const main = parseTree(mainSource);
    const completed = parseTree(completedSource);
    for (const entry of completed) {
      if (isTreeNode(entry) && entry.indentWidth > 0) reindentNode(entry, "");
    }
    const options = this.getCascadeOptions();
    const result = mode === "sync" ? synchronizeCascadeTrees(main, completed, options) : mode === "move" ? moveCompletedCascadeTrees(main, completed, options) : mode === "restore-all" ? restoreAllCascadeTrees(main, completed, options) : restoreUncheckedCascadeTrees(main, completed, options);
    const newMain = serializeTree(result.main).trimEnd();
    const newCompleted = serializeTree(result.completed).trim();
    const newContent = newCompleted ? newMain ? `${newMain}

${this.getHeaderStr()}
${newCompleted}` : `${this.getHeaderStr()}
${newCompleted}` : newMain;
    return {
      content: newContent,
      moved: result.moved,
      restored: result.restored
    };
  }
  deleteTaskAtOffset(view, offset) {
    const content = view.state.doc.toString();
    const targetLine = view.state.doc.lineAt(offset);
    const newContent = this.transformDeleteContent(content, targetLine.number - 1);
    if (newContent === content) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: newContent } });
  }
  transformDeleteContent(content, targetLineNumber) {
    const lines = content.split("\n");
    if (targetLineNumber < 0 || targetLineNumber >= lines.length) return content;
    const targetOffset = lines.slice(0, targetLineNumber).reduce((length, line) => length + line.length + 1, 0);
    const header = this.settings.sortMethod === "global" ? this.getHeaderRegex().exec(content) : null;
    const inCompleted = !!header && targetOffset > header.index + header[0].length;
    const mainSource = header ? content.substring(0, header.index).trimEnd() : content;
    const completedSource = header ? content.substring(header.index + header[0].length).trimStart() : "";
    const sideStart = inCompleted ? content.indexOf(completedSource, header.index + header[0].length) : 0;
    const preceding = content.substring(sideStart, targetOffset);
    const ordinal = preceding.split("\n").filter((line) => /^\s*(?:[-*+]|\d+\.) (?:\[[^\]]\] )?/.test(line)).length;
    const main = parseTree(mainSource);
    const completed = parseTree(completedSource);
    const options = this.getCascadeOptions();
    ensureCascadeMetadata(main, completed, options.contextStatus);
    const targetId = taskIdAtOrdinal(inCompleted ? completed : main, ordinal);
    if (!targetId) return content;
    const result = deleteTaskCascadeTrees(
      main,
      completed,
      targetId,
      this.settings.parentDeleteBehavior,
      options
    );
    if (!result.deleted) return content;
    const newMain = serializeTree(result.main).trimEnd();
    const newCompleted = serializeTree(result.completed).trim();
    const newContent = newCompleted ? newMain ? `${newMain}

${this.getHeaderStr()}
${newCompleted}` : `${this.getHeaderStr()}
${newCompleted}` : newMain;
    return newContent;
  }
  updateRibbonIcon() {
    if (this.settings.showIcon && !this.ribbonIconEl) {
      this.ribbonIconEl = this.addRibbonIcon(
        "checksorted",
        "CheckSorted: move completed items",
        () => {
          const view = this.app.workspace.getActiveViewOfType(import_obsidian2.MarkdownView);
          if (view) {
            this.returnUncheckedItems(view.editor, true);
            this.moveCompletedItems(view.editor);
          } else {
            new import_obsidian2.Notice("No active markdown file.");
          }
        }
      );
    } else if (!this.settings.showIcon && this.ribbonIconEl) {
      this.ribbonIconEl.remove();
      this.ribbonIconEl = null;
    }
  }
  updateStatusBar() {
    if (this.settings.showStatusBar && !this.statusBarEl) {
      this.statusBarEl = this.addStatusBarItem();
      this.statusBarEl.addClass("checksorted-status-bar");
      this.statusBarEl.setAttribute("aria-label", "Toggle CheckSorted auto-move");
      this.registerDomEvent(this.statusBarEl, "click", async () => {
        this.settings.autoMove = !this.settings.autoMove;
        await this.saveSettings();
        this.refreshStatusBar();
      });
      this.refreshStatusBar();
    } else if (!this.settings.showStatusBar && this.statusBarEl) {
      this.statusBarEl.remove();
      this.statusBarEl = null;
    }
  }
  refreshStatusBar() {
    if (!this.statusBarEl) return;
    this.statusBarEl.setText(
      this.settings.autoMove ? "CheckSorted \u2713" : "CheckSorted \u2717"
    );
  }
  setupAutoMove() {
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.lastCursorLine = -1;
        this.lastCheckboxSnapshot = "";
      })
    );
    this.registerEvent(
      this.app.workspace.on("editor-change", () => {
        if (this.isProcessing) return;
        const view = this.app.workspace.getActiveViewOfType(import_obsidian2.MarkdownView);
        if (!view) return;
        const editor = view.editor;
        const currentLine = editor.getCursor().line;
        const content = editor.getValue();
        const prevCursorLine = this.lastCursorLine;
        const lineChanged = prevCursorLine !== -1 && currentLine !== prevCursorLine;
        this.lastCursorLine = currentLine;
        const snapshot = this.getCheckboxSnapshot(content);
        const checkboxChanged = snapshot !== this.lastCheckboxSnapshot;
        this.lastCheckboxSnapshot = snapshot;
        const headerMatch = this.getHeaderRegex().exec(content);
        const headerLine = headerMatch ? content.substring(0, headerMatch.index).split("\n").length - 1 : -1;
        const exitedCompleted = lineChanged && headerLine >= 0 && prevCursorLine > headerLine && currentLine <= headerLine;
        if (!this.settings.autoMove) return;
        if (this.settings.sortMethod === "global") {
          if (exitedCompleted || checkboxChanged) {
            this.returnUncheckedItems(editor, exitedCompleted);
          }
          if (lineChanged || checkboxChanged) {
            this.moveCompletedItems(editor, true);
          }
        } else {
          if (checkboxChanged) {
            this.moveCompletedItems(editor, true);
          }
        }
      })
    );
  }
  getCheckboxSnapshot(content) {
    var _a;
    return ((_a = content.match(/^[ \t]*(?:[-*+]|\d+\.) \[[xX \/]\]/gm)) != null ? _a : []).join("");
  }
  returnUncheckedItems(editor, _cleanEmpty = false) {
    if (this.isProcessing) return;
    const content = editor.getValue();
    const result = this.transformGlobalContent(content, "restore-unchecked");
    if (result.restored === 0 || result.content === content) return;
    this.isProcessing = true;
    this.setValuePreservingScroll(editor, result.content, editor.getCursor().line);
    this.isProcessing = false;
  }
  getHeaderStr() {
    const level = +this.settings.completedAreaHierarchy;
    return `${"#".repeat(level)} ${this.settings.completedAreaName}`;
  }
  getHeaderRegex() {
    const hashes = escapeRegex2(
      "#".repeat(+this.settings.completedAreaHierarchy)
    );
    const name = escapeRegex2(this.settings.completedAreaName);
    return new RegExp(`^${hashes}\\s+${name}\\s*$`, "m");
  }
  splitContent(content) {
    const headerRegex = this.getHeaderRegex();
    const match = headerRegex.exec(content);
    if (!match) {
      return { main: content, completedItems: [] };
    }
    const main = content.substring(0, match.index).trimEnd();
    const afterHeader = content.substring(match.index + match[0].length).trimStart();
    const itemRegex = /^(\s*[-*+] \[[xX]\] .+)$/gm;
    const completedItems = [...afterHeader.matchAll(itemRegex)].map(
      (m) => m[1]
    );
    return { main, completedItems };
  }
  moveCompletedItems(editor, silent = false) {
    if (this.isProcessing) return;
    if (this.settings.sortMethod === "in-place") {
      this.sortItemsInPlace(editor, silent);
      return;
    }
    const content = editor.getValue();
    const cursor = editor.getCursor();
    const result = this.transformGlobalContent(content, "move");
    if (result.content === content) {
      if (!silent) new import_obsidian2.Notice("No completed items to move.");
      return;
    }
    this.isProcessing = true;
    this.setValuePreservingScroll(editor, result.content, cursor.line);
    this.isProcessing = false;
  }
  sortItemsInPlace(editor, silent = false) {
    const content = editor.getValue();
    const cursor = editor.getCursor();
    const tag = `___CS_CURSOR_TAG___${Math.random()}`;
    const lines = content.split("\n");
    if (cursor.line < lines.length) {
      const line = lines[cursor.line];
      lines[cursor.line] = line.slice(0, cursor.ch) + tag + line.slice(cursor.ch);
    }
    const taggedContent = lines.join("\n");
    const sortedTaggedContent = this.sortItemsInPlaceContent(taggedContent);
    const sortedLines = sortedTaggedContent.split("\n");
    let newCursorLine = cursor.line;
    let newCursorCh = cursor.ch;
    for (let i = 0; i < sortedLines.length; i++) {
      const idx = sortedLines[i].indexOf(tag);
      if (idx !== -1) {
        newCursorLine = i;
        newCursorCh = idx;
        sortedLines[i] = sortedLines[i].replace(tag, "");
        break;
      }
    }
    const finalContent = sortedLines.join("\n");
    if (finalContent === content) {
      if (!silent) new import_obsidian2.Notice("List is already sorted.");
      return;
    }
    this.isProcessing = true;
    this.setValuePreservingScroll(editor, finalContent, newCursorLine);
    editor.setCursor({ line: newCursorLine, ch: newCursorCh });
    this.isProcessing = false;
  }
  sortItemsInPlaceContent(content) {
    const tree = parseTree(content);
    const contextStatus = this.settings.contextStatus;
    const date = this.settings.dateStamp ? (0, import_obsidian2.moment)().format(this.settings.dateFormat) : null;
    const stamp2 = (node) => {
      if (date && !/ ✅ \S/.test(node.line)) {
        node.line = `${node.line.trimEnd()} \u2705 ${date}`;
      }
    };
    const uncheckSubtree = (node) => {
      if (node.state !== null && !isContextNode(node, contextStatus)) {
        setTaskState(node, " ");
        stripTaskMetadata(node);
      }
      for (const child of node.entries) {
        if (isTreeNode(child)) uncheckSubtree(child);
      }
    };
    const completeDescendants = (node) => {
      let count = 0;
      for (const child of node.entries) {
        if (!isTreeNode(child)) continue;
        if (child.state !== null && !isContextNode(child, contextStatus)) {
          setTaskState(child, "x");
          stamp2(child);
          count++;
        }
        count += completeDescendants(child);
      }
      return count;
    };
    const rank = (node) => {
      if (node.line.includes(AUTO_STAY_MARKER)) return 0;
      if (isContextNode(node, contextStatus)) return 2;
      if (node.state === "/") return 1;
      if (node.state === "x" || node.state === "X") return 2;
      return 0;
    };
    const visit = (entries) => {
      for (const entry of entries) {
        if (!isTreeNode(entry)) continue;
        visit(entry.entries);
        let checked = entry.state === "x" || entry.state === "X";
        if (!checked && entry.line.includes(CASCADE_MARKER)) {
          if (this.settings.cascadeRestore) uncheckSubtree(entry);
          else stripTaskMetadata(entry);
        }
        const directChildren = entry.entries.filter(isTreeNode).filter((child) => child.state !== null && !isContextNode(child, contextStatus));
        const allChildrenCompleted = directChildren.length > 0 && directChildren.every(
          (child) => child.state === "x" || child.state === "X"
        );
        if (this.settings.completedParentBehavior !== "none" && allChildrenCompleted && entry.state !== null && !(entry.state === "x" || entry.state === "X")) {
          setTaskState(entry, "x");
          if (this.settings.completedParentBehavior === "stay") {
            appendMarker(entry, AUTO_STAY_MARKER);
          }
        } else if (!allChildrenCompleted && entry.line.includes(AUTO_STAY_MARKER)) {
          setTaskState(entry, " ");
          entry.line = entry.line.replace(new RegExp(`\\s*${escapeRegex2(AUTO_STAY_MARKER)}`, "g"), "").trimEnd();
          stripTaskMetadata(entry);
        }
        checked = entry.state === "x" || entry.state === "X";
        if (checked && !isContextNode(entry, contextStatus)) {
          stamp2(entry);
          if (completeDescendants(entry) > 0) appendMarker(entry, CASCADE_MARKER);
        }
      }
      for (let start = 0; start < entries.length; ) {
        if (!isTreeNode(entries[start])) {
          start++;
          continue;
        }
        let end = start + 1;
        while (end < entries.length && isTreeNode(entries[end])) end++;
        const sorted = entries.slice(start, end).sort((a, b) => rank(a) - rank(b));
        entries.splice(start, sorted.length, ...sorted);
        start = end;
      }
    };
    visit(tree);
    return serializeTree(tree);
  }
  // Called by CheckboxSuggest when an autocomplete suggestion is accepted.
  // Rebuilds the line being typed with its own checkbox state and the chosen
  // task text, then deletes the original occurrence. If the source item had a
  // different state, this effectively changes its state to the typing line's.
  applyCheckboxSuggestion(editor, sourceLine, targetLine, text) {
    if (this.isProcessing) return;
    const lines = editor.getValue().split("\n");
    if (sourceLine < 0 || sourceLine >= lines.length || targetLine < 0 || targetLine >= lines.length || sourceLine === targetLine) {
      return;
    }
    const prefix = /^\s*[-*+] \[[ xX\/]\] /.exec(lines[targetLine]);
    if (!prefix) return;
    lines[targetLine] = `${prefix[0]}${text}`;
    lines.splice(sourceLine, 1);
    const finalLine = sourceLine < targetLine ? targetLine - 1 : targetLine;
    const newContent = this.dropEmptyCompletedSection(lines.join("\n"));
    this.isProcessing = true;
    this.setValuePreservingScroll(editor, newContent, finalLine);
    this.isProcessing = false;
  }
  // If the completed area has no content left under its header, remove the
  // header (and any trailing whitespace) so no empty section lingers.
  dropEmptyCompletedSection(content) {
    const match = this.getHeaderRegex().exec(content);
    if (!match) return content;
    const afterHeader = content.substring(match.index + match[0].length);
    if (afterHeader.trim() !== "") return content;
    return content.substring(0, match.index).trimEnd();
  }
  restoreCompletedItems(editor) {
    if (this.settings.sortMethod === "in-place") {
      this.restoreCompletedItemsInPlace(editor);
      return;
    }
    const content = editor.getValue();
    const result = this.transformGlobalContent(content, "restore-all");
    if (result.restored === 0 || result.content === content) {
      new import_obsidian2.Notice("No completed items to restore.");
      return;
    }
    this.isProcessing = true;
    this.setValuePreservingScroll(editor, result.content);
    this.isProcessing = false;
    new import_obsidian2.Notice(
      `Restored ${result.restored} item${result.restored !== 1 ? "s" : ""}.`
    );
  }
  restoreCompletedItemsInPlace(editor) {
    const tree = parseTree(editor.getValue());
    let count = 0;
    const restore = (entries) => {
      for (const entry of entries) {
        if (!isTreeNode(entry)) continue;
        if (entry.state !== null && !isContextNode(entry, this.settings.contextStatus) && entry.state !== " ") {
          setTaskState(entry, " ");
          stripTaskMetadata(entry);
          count++;
        }
        restore(entry.entries);
      }
    };
    restore(tree);
    if (count === 0) {
      new import_obsidian2.Notice("No completed or half-completed items to restore.");
      return;
    }
    this.isProcessing = true;
    this.setValuePreservingScroll(editor, serializeTree(tree));
    this.isProcessing = false;
    new import_obsidian2.Notice(`Restored ${count} item${count !== 1 ? "s" : ""}.`);
  }
  clearCompletedArea(editor) {
    if (this.settings.sortMethod === "in-place") {
      this.clearCompletedItemsInPlace(editor);
      return;
    }
    const content = editor.getValue();
    const { main, completedItems } = this.splitContent(content);
    if (completedItems.length === 0) {
      new import_obsidian2.Notice("Completed area is already empty.");
      return;
    }
    this.isProcessing = true;
    this.setValuePreservingScroll(editor, main.trimEnd());
    this.isProcessing = false;
    new import_obsidian2.Notice(
      `Cleared ${completedItems.length} item${completedItems.length !== 1 ? "s" : ""}.`
    );
  }
  clearCompletedItemsInPlace(editor) {
    const tree = parseTree(editor.getValue());
    let count = 0;
    const removeChecked = (entries) => {
      for (let index = 0; index < entries.length; ) {
        const entry = entries[index];
        if (!isTreeNode(entry)) {
          index++;
          continue;
        }
        if (!isContextNode(entry, this.settings.contextStatus) && (entry.state === "x" || entry.state === "X")) {
          const countTasks = (node) => (node.state === "x" || node.state === "X" ? 1 : 0) + node.entries.reduce((sum, child) => sum + (isTreeNode(child) ? countTasks(child) : 0), 0);
          count += countTasks(entry);
          entries.splice(index, 1);
          continue;
        }
        removeChecked(entry.entries);
        index++;
      }
    };
    removeChecked(tree);
    if (count === 0) {
      new import_obsidian2.Notice("No completed items to clear.");
      return;
    }
    this.isProcessing = true;
    this.setValuePreservingScroll(editor, serializeTree(tree));
    this.isProcessing = false;
    new import_obsidian2.Notice(`Cleared ${count} completed item${count !== 1 ? "s" : ""}.`);
  }
  setValuePreservingScroll(editor, content, cursorLine) {
    const scroll = editor.getScrollInfo();
    editor.setValue(content);
    const line = Math.min(
      cursorLine != null ? cursorLine : editor.getCursor().line,
      editor.lineCount() - 1
    );
    editor.setCursor({ line, ch: editor.getLine(line).length });
    this.lastCursorLine = line;
    this.lastCheckboxSnapshot = this.getCheckboxSnapshot(content);
    window.requestAnimationFrame(() => {
      editor.scrollTo(scroll.left, scroll.top);
    });
  }
  async loadSettings() {
    const stored = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
    if (this.settings.contextStatus.length !== 1 || [" ", "x", "X", "/", "[", "]"].includes(this.settings.contextStatus)) {
      this.settings.contextStatus = DEFAULT_SETTINGS.contextStatus;
    }
    if (!["none", "move", "stay"].includes(this.settings.completedParentBehavior)) {
      this.settings.completedParentBehavior = DEFAULT_SETTINGS.completedParentBehavior;
    }
    if (!["cascade", "promote"].includes(this.settings.parentDeleteBehavior)) {
      this.settings.parentDeleteBehavior = DEFAULT_SETTINGS.parentDeleteBehavior;
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
function escapeRegex2(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var ReadingViewCheckboxHandler = class extends import_obsidian2.MarkdownRenderChild {
  constructor(containerEl, sourcePath, onCheckboxActivated) {
    super(containerEl);
    this.sourcePath = sourcePath;
    this.onCheckboxActivated = onCheckboxActivated;
    this.handleActivation = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const checkbox = target.closest("input.task-list-item-checkbox");
      if (!checkbox || !this.containerEl.contains(checkbox)) return;
      if (checkbox.closest("li.checksorted-context-task")) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      this.onCheckboxActivated(this.sourcePath);
    };
  }
  onload() {
    this.containerEl.addEventListener("click", this.handleActivation, true);
    this.containerEl.addEventListener("change", this.handleActivation, true);
  }
  onunload() {
    this.containerEl.removeEventListener("click", this.handleActivation, true);
    this.containerEl.removeEventListener("change", this.handleActivation, true);
  }
};
var CheckboxSuggest = class extends import_obsidian2.EditorSuggest {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
  }
  onTrigger(cursor, editor) {
    if (!this.plugin.settings.autocomplete) return null;
    const line = editor.getLine(cursor.line);
    const prefix = /^\s*[-*+] \[[ xX\/]\] /.exec(line);
    if (!prefix) return null;
    const textStart = prefix[0].length;
    if (cursor.ch < textStart) return null;
    const query = line.substring(textStart, cursor.ch);
    if (query.trim().length === 0) return null;
    return {
      start: { line: cursor.line, ch: textStart },
      end: cursor,
      query
    };
  }
  getSuggestions(context) {
    const query = context.query.toLowerCase();
    const currentLine = context.start.line;
    const lines = context.editor.getValue().split("\n");
    const itemRegex = /^\s*[-*+] \[([ xX\/])\] (.*)$/;
    const seen = /* @__PURE__ */ new Set();
    const results = [];
    for (let i = 0; i < lines.length && results.length < 8; i++) {
      if (i === currentLine) continue;
      const m = itemRegex.exec(lines[i]);
      if (!m) continue;
      const text = m[2].replace(/\s*✅.*$/, "").trim();
      if (!text || !text.toLowerCase().startsWith(query)) continue;
      const checked = m[1] !== " " && m[1] !== "/";
      const key = `${checked ? "1" : "0"}:${text.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ text, checked, line: i });
    }
    return results;
  }
  renderSuggestion(item, el) {
    el.createSpan({
      cls: "checksorted-suggest-state",
      text: item.checked ? "\u2611" : "\u2610"
    });
    el.createSpan({ text: item.text });
  }
  selectSuggestion(item) {
    if (!this.context) return;
    this.plugin.applyCheckboxSuggestion(
      this.context.editor,
      item.line,
      this.context.start.line,
      item.text
    );
    this.close();
  }
};
var DeleteTaskWidget = class extends import_view.WidgetType {
  constructor(plugin) {
    super();
    this.plugin = plugin;
  }
  toDOM(view) {
    const btn = createSpan({
      cls: "checksorted-delete-task",
      text: "\xD7",
      attr: { "aria-label": "Delete task" }
    });
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = view.posAtDOM(btn);
      const line = view.state.doc.lineAt(pos);
      this.plugin.deleteTaskAtOffset(view, line.from);
    });
    return btn;
  }
  eq() {
    return false;
  }
  ignoreEvent() {
    return true;
  }
};
function decorateReadingContexts(el, contextStatus, sectionSource) {
  const items = el.querySelectorAll("li.task-list-item");
  const sourceTasks = (sectionSource != null ? sectionSource : "").split("\n").filter((line) => /^\s*(?:[-*+]|\d+\.) \[[^\]]\]\s/.test(line));
  items.forEach((item, index) => {
    var _a, _b, _c, _d;
    const checkbox = Array.from(
      item.querySelectorAll("input.task-list-item-checkbox")
    ).find((candidate) => candidate.closest("li.task-list-item") === item);
    if (!checkbox) return;
    let hasMarker = false;
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_COMMENT);
    let comment;
    while (comment = walker.nextNode()) {
      if (((_a = comment.textContent) != null ? _a : "").includes("checksorted-context")) {
        hasMarker = true;
        break;
      }
    }
    const state = (_b = item.getAttribute("data-task")) != null ? _b : checkbox.getAttribute("data-task");
    const sourceLine = (_c = sourceTasks[index]) != null ? _c : "";
    if (!hasMarker && !sourceLine.includes(CONTEXT_MARKER) && state !== contextStatus) return;
    item.addClass("checksorted-context-task");
    checkbox.checked = true;
    checkbox.disabled = true;
    checkbox.tabIndex = -1;
    checkbox.setAttribute("aria-disabled", "true");
    for (const child of Array.from(item.childNodes)) {
      if (child instanceof HTMLElement && (child.tagName === "UL" || child.tagName === "OL")) continue;
      if (child instanceof HTMLElement) {
        child.addClass("checksorted-context-content");
      } else if (((_d = child.textContent) != null ? _d : "").trim()) {
        const hidden = document.createElement("span");
        hidden.className = "checksorted-context-content";
        hidden.textContent = child.textContent;
        item.replaceChild(hidden, child);
      }
    }
  });
}
function contextTaskExtension(plugin) {
  const internalMarker = /%%checksorted-(?:context|cascade|auto-stay|id:[A-Za-z0-9_-]+|order:\d+(?:\.\d+)*)%%/g;
  return import_view.ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = this.build(view);
      }
      update(update) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.build(update.view);
        }
      }
      build(view) {
        var _a;
        const builder = new import_state.RangeSetBuilder();
        for (const { from, to } of view.visibleRanges) {
          let position = from;
          while (position <= to) {
            const line = view.state.doc.lineAt(position);
            const state = (_a = /^\s*(?:[-*+]|\d+\.) \[([^\]])\]/.exec(line.text)) == null ? void 0 : _a[1];
            const isContext = line.text.includes(CONTEXT_MARKER) || state === plugin.settings.contextStatus;
            if (isContext) {
              builder.add(
                line.from,
                line.to,
                import_view.Decoration.replace({})
              );
            } else {
              internalMarker.lastIndex = 0;
              let marker;
              while (marker = internalMarker.exec(line.text)) {
                builder.add(
                  line.from + marker.index,
                  line.from + marker.index + marker[0].length,
                  import_view.Decoration.replace({})
                );
              }
            }
            position = line.to + 1;
          }
        }
        return builder.finish();
      }
    },
    { decorations: (value) => value.decorations }
  );
}
var DateStampWidget = class extends import_view.WidgetType {
  constructor(text) {
    super();
    this.text = text;
  }
  toDOM() {
    return createSpan({ cls: "checksorted-date", text: this.text });
  }
  eq(other) {
    return this.text === other.text;
  }
  ignoreEvent() {
    return false;
  }
};
function dateStampExtension(plugin) {
  const checkedLine = /^\s*[-*+] \[[xX]\] /;
  return import_view.ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = this.build(view);
      }
      update(update) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.build(update.view);
        }
      }
      build(view) {
        const builder = new import_state.RangeSetBuilder();
        for (const { from, to } of view.visibleRanges) {
          let pos = from;
          while (pos <= to) {
            const line = view.state.doc.lineAt(pos);
            if (checkedLine.test(line.text)) {
              const stampIdx = line.text.search(/ ✅ \S/);
              if (stampIdx !== -1) {
                const stampText = line.text.slice(stampIdx);
                builder.add(
                  line.from + stampIdx,
                  line.to,
                  import_view.Decoration.replace({
                    widget: new DateStampWidget(stampText)
                  })
                );
              }
            }
            pos = line.to + 1;
          }
        }
        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations }
  );
}
function deleteButtonExtension(plugin) {
  const checkbox = /^\s*(?:[-*+]|\d+\.) \[[^\]]\]\s/;
  return import_view.ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = this.build(view);
      }
      update(update) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.build(update.view);
        }
      }
      build(view) {
        var _a;
        const builder = new import_state.RangeSetBuilder();
        if (!plugin.settings.showDeleteButton) return builder.finish();
        for (const { from, to } of view.visibleRanges) {
          let pos = from;
          while (pos <= to) {
            const line = view.state.doc.lineAt(pos);
            const state = (_a = /^\s*(?:[-*+]|\d+\.) \[([^\]])\]/.exec(line.text)) == null ? void 0 : _a[1];
            if (checkbox.test(line.text) && !line.text.includes(CONTEXT_MARKER) && state !== plugin.settings.contextStatus) {
              builder.add(
                line.to,
                line.to,
                import_view.Decoration.widget({
                  widget: new DeleteTaskWidget(plugin),
                  side: 1
                })
              );
            }
            pos = line.to + 1;
          }
        }
        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations
    }
  );
}
