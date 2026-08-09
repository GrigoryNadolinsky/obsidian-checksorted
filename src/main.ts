import {
	addIcon,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	MarkdownRenderChild,
	MarkdownView,
	moment,
	Notice,
	Plugin,
	TFile,
} from "obsidian";
import { RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { CheckSortedSettings, DEFAULT_SETTINGS } from "./settings";
import { CheckSortedSettingTab } from "./settingsTab";
import {
	appendMarker,
	AUTO_STAY_MARKER,
	CASCADE_MARKER,
	CascadeOptions,
	CONTEXT_MARKER,
	deleteTaskCascadeTrees,
	ensureCascadeMetadata,
	isContextNode,
	isTreeNode,
	moveCompletedCascadeTrees,
	parseTree,
	reindentNode,
	restoreAllCascadeTrees,
	restoreUncheckedCascadeTrees,
	serializeTree,
	setTaskState,
	stripTaskMetadata,
	synchronizeCascadeTrees,
	taskIdAtOrdinal,
	TaskTreeNode,
	TreeEntry,
} from "./taskTree";

const RIBBON_ICON = `<g transform="scale(0.33333)">
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

const READING_SYNC_DEBOUNCE_MS = 75;
const READING_SYNC_FALLBACK_MS = 1500;

interface PendingReadingSync {
	settleTimer: number | null;
	fallbackTimer: number | null;
}

interface GlobalTransformResult {
	content: string;
	moved: number;
	restored: number;
}

export default class CheckSortedPlugin extends Plugin {
	settings: CheckSortedSettings;
	ribbonIconEl: HTMLElement | null = null;
	statusBarEl: HTMLElement | null = null;

	private isProcessing = false;
	private lastCursorLine = -1;
	private lastCheckboxSnapshot = '';
	private pendingReadingSyncs = new Map<string, PendingReadingSync>();
	private processingReadingFiles = new Set<string>();

	private handleCheckboxMouseDown = (evt: MouseEvent) => {
		const target = evt.target as HTMLElement;
		if (!target) return;

		const isCheckboxInput = target.tagName === "INPUT" && (target as HTMLInputElement).type === "checkbox";
		const isCheckboxClass = target.classList.contains("task-list-item-checkbox");
		if (!isCheckboxInput && !isCheckboxClass) return;

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || !view.editor) return;

		const editor = view.editor;
		const cm = (editor as any).cm;
		if (!cm || typeof cm.posAtDOM !== "function") return;

		try {
			const cmLine = target.closest(".cm-line");
			if (!cmLine) return;

			const pos = cm.posAtDOM(cmLine);
			const lineNum = editor.offsetToPos(pos).line;
			const lineText = editor.getLine(lineNum);
			const contextState = this.settings.contextStatus;
			const stateMatch = /^\s*(?:[-*+]|\d+\.) \[([^\]])\]/.exec(lineText);
			if (lineText.includes(CONTEXT_MARKER) || stateMatch?.[1] === contextState) {
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

	private handleCheckboxClick = (evt: MouseEvent) => {
		const target = evt.target as HTMLElement;
		if (!target) return;

		const isCheckboxInput = target.tagName === "INPUT" && (target as HTMLInputElement).type === "checkbox";
		const isCheckboxClass = target.classList.contains("task-list-item-checkbox");
		const isContext = !!target.closest(".checksorted-context-line, li.checksorted-context-task");
		if ((isCheckboxInput || isCheckboxClass) && (isContext || evt.ctrlKey || evt.metaKey)) {
			evt.preventDefault();
			evt.stopPropagation();
		}
	};

	async onload() {
		await this.loadSettings();
		addIcon("checksorted", RIBBON_ICON);
		this.updateRibbonIcon();

		this.addCommand({
			id: "move-completed-items",
			name: "Move completed items to completed area",
			editorCallback: (editor: Editor) => this.moveCompletedItems(editor),
		});

		this.addCommand({
			id: "restore-completed-items",
			name: "Restore all items from completed area",
			editorCallback: (editor: Editor) => this.restoreCompletedItems(editor),
		});

		this.addCommand({
			id: "clear-completed-area",
			name: "Clear completed area",
			editorCallback: (editor: Editor) => this.clearCompletedArea(editor),
		});

		this.addSettingTab(new CheckSortedSettingTab(this.app, this));
		this.registerEditorSuggest(new CheckboxSuggest(this));
		this.registerEditorExtension(deleteButtonExtension(this));
		this.registerEditorExtension(dateStampExtension(this));
		this.registerEditorExtension(contextTaskExtension(this));
		this.registerMarkdownPostProcessor((el, ctx) => {
			decorateReadingContexts(
				el,
				this.settings.contextStatus,
				ctx.getSectionInfo(el)?.text
			);
			// Reading view checkboxes are not guaranteed to emit workspace
			// "editor-change" events. Watch their DOM events on every platform,
			// then wait for Obsidian's corresponding vault modification before
			// transforming the file.
			ctx.addChild(new ReadingViewCheckboxHandler(
				el,
				ctx.sourcePath,
				(path) => this.queueReadingViewSync(path)
			));

			el.querySelectorAll("li.task-list-item.is-checked").forEach((li) => {
				const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
				const hits: { node: Text; idx: number }[] = [];
				let n: Text | null;
				while ((n = walker.nextNode() as Text | null)) {
					const text = n.textContent ?? "";
					// Only match the plugin-generated stamp: " ✅ <date>" at end of text
					const idx = text.search(/ ✅ \S/);
					if (idx !== -1) hits.push({ node: n, idx });
				}
				for (const { node, idx } of hits) {
					const text = node.textContent ?? "";
					const before = document.createTextNode(text.slice(0, idx));
					const span = document.createElement("span");
					span.className = "checksorted-date";
					span.textContent = text.slice(idx);
					node.parentNode!.replaceChild(span, node);
					span.parentNode!.insertBefore(before, span);
				}
			});
		});
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile) this.handleReadingViewFileModified(file);
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

	private queueReadingViewSync(path: string): void {
		if (!this.settings.autoMove || !path) return;

		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") return;

		const existing = this.pendingReadingSyncs.get(path);
		// A normal activation commonly produces both "click" and "change".
		// Keep the first pending request; vault modify events still debounce a
		// burst of genuinely separate taps on the same note.
		if (existing) return;

		const pending: PendingReadingSync = {
			settleTimer: null,
			// Normally vault "modify" starts processing. The fallback covers
			// platform/version differences where that event is delayed or omitted.
			fallbackTimer: window.setTimeout(() => {
				void this.processPendingReadingSync(path);
			}, READING_SYNC_FALLBACK_MS),
		};
		this.pendingReadingSyncs.set(path, pending);
	}

	private handleReadingViewFileModified(file: TFile): void {
		const pending = this.pendingReadingSyncs.get(file.path);
		if (!pending || this.processingReadingFiles.has(file.path)) return;

		if (pending.settleTimer !== null) window.clearTimeout(pending.settleTimer);
		pending.settleTimer = window.setTimeout(() => {
			void this.processPendingReadingSync(file.path);
		}, READING_SYNC_DEBOUNCE_MS);
	}

	private async processPendingReadingSync(path: string): Promise<void> {
		const pending = this.pendingReadingSyncs.get(path);
		if (!pending || this.processingReadingFiles.has(path)) return;

		if (pending.settleTimer !== null) window.clearTimeout(pending.settleTimer);
		if (pending.fallbackTimer !== null) window.clearTimeout(pending.fallbackTimer);
		this.pendingReadingSyncs.delete(path);

		if (!this.settings.autoMove) return;
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") return;

		this.processingReadingFiles.add(path);
		try {
			// Avoid a needless write (and therefore a sync round-trip) when the
			// click did not ultimately change a task or another plugin handled it.
			const current = await this.app.vault.read(file);
			const preview = this.transformReadingViewContent(current);
			if (preview === current) return;

			// Re-read atomically at write time so a concurrent mobile/desktop edit
			// is transformed rather than overwritten with the earlier snapshot.
			await this.app.vault.process(file, (latest) =>
				this.transformReadingViewContent(latest)
			);
		} catch (error) {
			console.error(`CheckSorted: Failed to sync reading-view checkbox in ${path}`, error);
		} finally {
			this.processingReadingFiles.delete(path);
			// A second tap may have arrived while this file was being processed.
			if (this.pendingReadingSyncs.has(path)) {
				const next = this.pendingReadingSyncs.get(path)!;
				if (next.settleTimer !== null) window.clearTimeout(next.settleTimer);
				next.settleTimer = window.setTimeout(() => {
					void this.processPendingReadingSync(path);
				}, READING_SYNC_DEBOUNCE_MS);
			}
		}
	}

	private transformReadingViewContent(content: string): string {
		if (this.settings.sortMethod === "in-place") {
			return this.sortItemsInPlaceContent(content);
		}
		return this.transformGlobalContent(content, "sync").content;
	}

	private getCascadeOptions(): CascadeOptions {
		return {
			contextStatus: this.settings.contextStatus,
			keepEmptyParents: this.settings.keepEmptyParents,
			cascadeRestore: this.settings.cascadeRestore,
			dateStamp: this.settings.dateStamp
				? moment().format(this.settings.dateFormat)
				: null,
			sortOrder: this.settings.sortOrder,
			completedParentBehavior: this.settings.completedParentBehavior,
		};
	}

	private transformGlobalContent(
		content: string,
		mode: "sync" | "move" | "restore-unchecked" | "restore-all"
	): GlobalTransformResult {
		const match = this.getHeaderRegex().exec(content);
		const mainSource = match
			? content.substring(0, match.index).trimEnd()
			: content;
		const completedSource = match
			? content.substring(match.index + match[0].length).trimStart()
			: "";
		const main = parseTree(mainSource);
		const completed = parseTree(completedSource);
		for (const entry of completed) {
			if (isTreeNode(entry) && entry.indentWidth > 0) reindentNode(entry, "");
		}
		const options = this.getCascadeOptions();
		const result = mode === "sync"
			? synchronizeCascadeTrees(main, completed, options)
			: mode === "move"
				? moveCompletedCascadeTrees(main, completed, options)
				: mode === "restore-all"
					? restoreAllCascadeTrees(main, completed, options)
					: restoreUncheckedCascadeTrees(main, completed, options);

		const newMain = serializeTree(result.main).trimEnd();
		const newCompleted = serializeTree(result.completed).trim();
		const newContent = newCompleted
			? newMain
				? `${newMain}\n\n${this.getHeaderStr()}\n${newCompleted}`
				: `${this.getHeaderStr()}\n${newCompleted}`
			: newMain;
		return {
			content: newContent,
			moved: result.moved,
			restored: result.restored,
		};
	}

	deleteTaskAtOffset(view: EditorView, offset: number): void {
		const content = view.state.doc.toString();
		const targetLine = view.state.doc.lineAt(offset);
		const newContent = this.transformDeleteContent(content, targetLine.number - 1);
		if (newContent === content) return;
		view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: newContent } });
	}

	private transformDeleteContent(content: string, targetLineNumber: number): string {
		const lines = content.split("\n");
		if (targetLineNumber < 0 || targetLineNumber >= lines.length) return content;
		const targetOffset = lines
			.slice(0, targetLineNumber)
			.reduce((length, line) => length + line.length + 1, 0);
		const header = this.settings.sortMethod === "global"
			? this.getHeaderRegex().exec(content)
			: null;
		const inCompleted = !!header && targetOffset > header.index + header[0].length;
		const mainSource = header ? content.substring(0, header.index).trimEnd() : content;
		const completedSource = header
			? content.substring(header.index + header[0].length).trimStart()
			: "";
		const sideStart = inCompleted
			? content.indexOf(completedSource, header!.index + header![0].length)
			: 0;
		const preceding = content.substring(sideStart, targetOffset);
		const ordinal = preceding
			.split("\n")
			.filter((line) => /^\s*(?:[-*+]|\d+\.) (?:\[[^\]]\] )?/.test(line))
			.length;
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
		const newContent = newCompleted
			? newMain
				? `${newMain}\n\n${this.getHeaderStr()}\n${newCompleted}`
				: `${this.getHeaderStr()}\n${newCompleted}`
			: newMain;
		return newContent;
	}

	updateRibbonIcon(): void {
		if (this.settings.showIcon && !this.ribbonIconEl) {
			this.ribbonIconEl = this.addRibbonIcon(
				"checksorted",
				"CheckSorted: move completed items",
				() => {
					const view =
						this.app.workspace.getActiveViewOfType(MarkdownView);
					if (view) {
						// Full sync: return unchecked items out of the completed
						// area, then move newly completed items into it.
						this.returnUncheckedItems(view.editor, true);
						this.moveCompletedItems(view.editor);
					} else {
						new Notice("No active markdown file.");
					}
				}
			);
		} else if (!this.settings.showIcon && this.ribbonIconEl) {
			this.ribbonIconEl.remove();
			this.ribbonIconEl = null;
		}
	}

	updateStatusBar(): void {
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

	refreshStatusBar(): void {
		if (!this.statusBarEl) return;
		this.statusBarEl.setText(
			this.settings.autoMove ? "CheckSorted ✓" : "CheckSorted ✗"
		);
	}

	private setupAutoMove(): void {
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.lastCursorLine = -1;
				this.lastCheckboxSnapshot = '';
			})
		);

		this.registerEvent(
			this.app.workspace.on("editor-change", () => {
				if (this.isProcessing) return;

				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
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

				// Detect cursor leaving the completed section for the main section
				const headerMatch = this.getHeaderRegex().exec(content);
				const headerLine = headerMatch
					? content.substring(0, headerMatch.index).split('\n').length - 1
					: -1;
				const exitedCompleted =
					lineChanged &&
					headerLine >= 0 &&
					prevCursorLine > headerLine &&
					currentLine <= headerLine;

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

	private getCheckboxSnapshot(content: string): string {
		return (content.match(/^[ \t]*(?:[-*+]|\d+\.) \[[xX \/]\]/gm) ?? []).join('');
	}

	private returnUncheckedItems(editor: Editor, _cleanEmpty = false): void {
		if (this.isProcessing) return;
		const content = editor.getValue();
		const result = this.transformGlobalContent(content, "restore-unchecked");
		if (result.restored === 0 || result.content === content) return;
		this.isProcessing = true;
		this.setValuePreservingScroll(editor, result.content, editor.getCursor().line);
		this.isProcessing = false;
	}

	private getHeaderStr(): string {
		const level = +this.settings.completedAreaHierarchy;
		return `${"#".repeat(level)} ${this.settings.completedAreaName}`;
	}

	private getHeaderRegex(): RegExp {
		const hashes = escapeRegex(
			"#".repeat(+this.settings.completedAreaHierarchy)
		);
		const name = escapeRegex(this.settings.completedAreaName);
		return new RegExp(`^${hashes}\\s+${name}\\s*$`, "m");
	}

	private splitContent(content: string): {
		main: string;
		completedItems: string[];
	} {
		const headerRegex = this.getHeaderRegex();
		const match = headerRegex.exec(content);

		if (!match) {
			return { main: content, completedItems: [] };
		}

		const main = content.substring(0, match.index).trimEnd();
		const afterHeader = content
			.substring(match.index + match[0].length)
			.trimStart();

		const itemRegex = /^(\s*[-*+] \[[xX]\] .+)$/gm;
		const completedItems = [...afterHeader.matchAll(itemRegex)].map(
			(m) => m[1]
		);

		return { main, completedItems };
	}

	moveCompletedItems(editor: Editor, silent = false): void {
		if (this.isProcessing) return;

		if (this.settings.sortMethod === "in-place") {
			this.sortItemsInPlace(editor, silent);
			return;
		}

		const content = editor.getValue();
		const cursor = editor.getCursor();
		const result = this.transformGlobalContent(content, "move");
		if (result.content === content) {
			if (!silent) new Notice("No completed items to move.");
			return;
		}
		this.isProcessing = true;
		this.setValuePreservingScroll(editor, result.content, cursor.line);
		this.isProcessing = false;
	}

	private sortItemsInPlace(editor: Editor, silent = false): void {
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
			if (!silent) new Notice("List is already sorted.");
			return;
		}

		this.isProcessing = true;
		this.setValuePreservingScroll(editor, finalContent, newCursorLine);
		editor.setCursor({ line: newCursorLine, ch: newCursorCh });
		this.isProcessing = false;
	}

	private sortItemsInPlaceContent(content: string): string {
		const tree = parseTree(content);
		const contextStatus = this.settings.contextStatus;
		const date = this.settings.dateStamp
			? moment().format(this.settings.dateFormat)
			: null;

		const stamp = (node: TaskTreeNode) => {
			if (date && !/ ✅ \S/.test(node.line)) {
				node.line = `${node.line.trimEnd()} ✅ ${date}`;
			}
		};
		const uncheckSubtree = (node: TaskTreeNode) => {
			if (node.state !== null && !isContextNode(node, contextStatus)) {
				setTaskState(node, " ");
				stripTaskMetadata(node);
			}
			for (const child of node.entries) {
				if (isTreeNode(child)) uncheckSubtree(child);
			}
		};
		const completeDescendants = (node: TaskTreeNode): number => {
			let count = 0;
			for (const child of node.entries) {
				if (!isTreeNode(child)) continue;
				if (child.state !== null && !isContextNode(child, contextStatus)) {
					setTaskState(child, "x");
					stamp(child);
					count++;
				}
				count += completeDescendants(child);
			}
			return count;
		};
		const rank = (node: TaskTreeNode): number => {
			if (node.line.includes(AUTO_STAY_MARKER)) return 0;
			if (isContextNode(node, contextStatus)) return 2;
			if (node.state === "/") return 1;
			if (node.state === "x" || node.state === "X") return 2;
			return 0;
		};
		const visit = (entries: TreeEntry[]) => {
			for (const entry of entries) {
				if (!isTreeNode(entry)) continue;
				visit(entry.entries);
				let checked = entry.state === "x" || entry.state === "X";
				if (!checked && entry.line.includes(CASCADE_MARKER)) {
					if (this.settings.cascadeRestore) uncheckSubtree(entry);
					else stripTaskMetadata(entry);
				}

				const directChildren = entry.entries
					.filter(isTreeNode)
					.filter((child) => child.state !== null && !isContextNode(child, contextStatus));
				const allChildrenCompleted = directChildren.length > 0 && directChildren.every(
					(child) => child.state === "x" || child.state === "X"
				);
				if (
					this.settings.completedParentBehavior !== "none" &&
					allChildrenCompleted &&
					entry.state !== null &&
					!(entry.state === "x" || entry.state === "X")
				) {
					setTaskState(entry, "x");
					if (this.settings.completedParentBehavior === "stay") {
						appendMarker(entry, AUTO_STAY_MARKER);
					}
				} else if (
					!allChildrenCompleted &&
					entry.line.includes(AUTO_STAY_MARKER)
				) {
					setTaskState(entry, " ");
					entry.line = entry.line.replace(new RegExp(`\\s*${escapeRegex(AUTO_STAY_MARKER)}`, "g"), "").trimEnd();
					stripTaskMetadata(entry);
				}

				checked = entry.state === "x" || entry.state === "X";
				if (checked && !isContextNode(entry, contextStatus)) {
					stamp(entry);
					if (completeDescendants(entry) > 0) appendMarker(entry, CASCADE_MARKER);
				}
			}

			// Sort only adjacent sibling items. A heading, paragraph, or other
			// root-level text separates independent Markdown list blocks.
			for (let start = 0; start < entries.length;) {
				if (!isTreeNode(entries[start])) {
					start++;
					continue;
				}
				let end = start + 1;
				while (end < entries.length && isTreeNode(entries[end])) end++;
				const sorted = (entries.slice(start, end) as TaskTreeNode[])
					.sort((a, b) => rank(a) - rank(b));
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
	applyCheckboxSuggestion(
		editor: Editor,
		sourceLine: number,
		targetLine: number,
		text: string
	): void {
		if (this.isProcessing) return;

		const lines = editor.getValue().split("\n");
		if (
			sourceLine < 0 ||
			sourceLine >= lines.length ||
			targetLine < 0 ||
			targetLine >= lines.length ||
			sourceLine === targetLine
		) {
			return;
		}

		// m[0] is the "<indent>- [<state>] " prefix of the line being typed.
		const prefix = /^\s*[-*+] \[[ xX\/]\] /.exec(lines[targetLine]);
		if (!prefix) return;

		lines[targetLine] = `${prefix[0]}${text}`;
		lines.splice(sourceLine, 1);

		// Removing a line above the target shifts the target up by one.
		const finalLine = sourceLine < targetLine ? targetLine - 1 : targetLine;

		// Pulling the source out may leave the completed area empty; if so, drop
		// its now-orphaned header. This only ever trims content below the target
		// line, so finalLine stays valid.
		const newContent = this.dropEmptyCompletedSection(lines.join("\n"));

		this.isProcessing = true;
		this.setValuePreservingScroll(editor, newContent, finalLine);
		this.isProcessing = false;
	}

	// If the completed area has no content left under its header, remove the
	// header (and any trailing whitespace) so no empty section lingers.
	private dropEmptyCompletedSection(content: string): string {
		const match = this.getHeaderRegex().exec(content);
		if (!match) return content;

		const afterHeader = content.substring(match.index + match[0].length);
		if (afterHeader.trim() !== "") return content;

		return content.substring(0, match.index).trimEnd();
	}

	restoreCompletedItems(editor: Editor): void {
		if (this.settings.sortMethod === "in-place") {
			this.restoreCompletedItemsInPlace(editor);
			return;
		}

		const content = editor.getValue();
		const result = this.transformGlobalContent(content, "restore-all");
		if (result.restored === 0 || result.content === content) {
			new Notice("No completed items to restore.");
			return;
		}

		this.isProcessing = true;
		this.setValuePreservingScroll(editor, result.content);
		this.isProcessing = false;

		new Notice(
			`Restored ${result.restored} item${
				result.restored !== 1 ? "s" : ""
			}.`
		);
	}

	private restoreCompletedItemsInPlace(editor: Editor): void {
		const tree = parseTree(editor.getValue());
		let count = 0;
		const restore = (entries: TreeEntry[]) => {
			for (const entry of entries) {
				if (!isTreeNode(entry)) continue;
				if (
					entry.state !== null &&
					!isContextNode(entry, this.settings.contextStatus) &&
					entry.state !== " "
				) {
					setTaskState(entry, " ");
					stripTaskMetadata(entry);
					count++;
				}
				restore(entry.entries);
			}
		};
		restore(tree);
		if (count === 0) {
			new Notice("No completed or half-completed items to restore.");
			return;
		}
		this.isProcessing = true;
		this.setValuePreservingScroll(editor, serializeTree(tree));
		this.isProcessing = false;
		new Notice(`Restored ${count} item${count !== 1 ? "s" : ""}.`);
	}

	clearCompletedArea(editor: Editor): void {
		if (this.settings.sortMethod === "in-place") {
			this.clearCompletedItemsInPlace(editor);
			return;
		}

		const content = editor.getValue();
		const { main, completedItems } = this.splitContent(content);

		if (completedItems.length === 0) {
			new Notice("Completed area is already empty.");
			return;
		}

		this.isProcessing = true;
		this.setValuePreservingScroll(editor, main.trimEnd());
		this.isProcessing = false;

		new Notice(
			`Cleared ${completedItems.length} item${
				completedItems.length !== 1 ? "s" : ""
			}.`
		);
	}

	private clearCompletedItemsInPlace(editor: Editor): void {
		const tree = parseTree(editor.getValue());
		let count = 0;
		const removeChecked = (entries: TreeEntry[]) => {
			for (let index = 0; index < entries.length;) {
				const entry = entries[index];
				if (!isTreeNode(entry)) {
					index++;
					continue;
				}
				if (
					!isContextNode(entry, this.settings.contextStatus) &&
					(entry.state === "x" || entry.state === "X")
				) {
					const countTasks = (node: TaskTreeNode): number =>
						(node.state === "x" || node.state === "X" ? 1 : 0) +
						node.entries.reduce((sum, child) =>
							sum + (isTreeNode(child) ? countTasks(child) : 0), 0);
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
			new Notice("No completed items to clear.");
			return;
		}
		this.isProcessing = true;
		this.setValuePreservingScroll(editor, serializeTree(tree));
		this.isProcessing = false;
		new Notice(`Cleared ${count} completed item${count !== 1 ? "s" : ""}.`);
	}

	private setValuePreservingScroll(
		editor: Editor,
		content: string,
		cursorLine?: number
	): void {
		const scroll = editor.getScrollInfo();
		editor.setValue(content);
		const line = Math.min(
			cursorLine ?? editor.getCursor().line,
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
		const stored = (await this.loadData()) as Partial<CheckSortedSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
		if (
			this.settings.contextStatus.length !== 1 ||
			[" ", "x", "X", "/", "[", "]"].includes(this.settings.contextStatus)
		) {
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
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface CheckboxSuggestion {
	text: string;
	checked: boolean;
	line: number;
}

// A lifecycle-managed delegated listener for checkboxes rendered in Reading
// view. "click" is the cross-platform activation event for mouse, touch, pen,
// and keyboard; "change" is a fallback for hosts that replace the input while
// handling the click. Repeated signals are coalesced by queueReadingViewSync.
class ReadingViewCheckboxHandler extends MarkdownRenderChild {
	constructor(
		containerEl: HTMLElement,
		private sourcePath: string,
		private onCheckboxActivated: (path: string) => void
	) {
		super(containerEl);
	}

	private handleActivation = (event: Event): void => {
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

	onload(): void {
		this.containerEl.addEventListener("click", this.handleActivation, true);
		this.containerEl.addEventListener("change", this.handleActivation, true);
	}

	onunload(): void {
		this.containerEl.removeEventListener("click", this.handleActivation, true);
		this.containerEl.removeEventListener("change", this.handleActivation, true);
	}
}

// Autocomplete for checkbox tasks: while typing in a checkbox, suggest tasks
// from elsewhere in the note whose text starts with what you've typed. Accepting
// a suggestion moves that task onto the line being typed (see
// CheckSortedPlugin.applyCheckboxSuggestion).
class CheckboxSuggest extends EditorSuggest<CheckboxSuggestion> {
	private plugin: CheckSortedPlugin;

	constructor(plugin: CheckSortedPlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onTrigger(
		cursor: EditorPosition,
		editor: Editor
	): EditorSuggestTriggerInfo | null {
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
			query,
		};
	}

	getSuggestions(context: EditorSuggestContext): CheckboxSuggestion[] {
		const query = context.query.toLowerCase();
		const currentLine = context.start.line;
		const lines = context.editor.getValue().split("\n");
		const itemRegex = /^\s*[-*+] \[([ xX\/])\] (.*)$/;

		const seen = new Set<string>();
		const results: CheckboxSuggestion[] = [];

		for (let i = 0; i < lines.length && results.length < 8; i++) {
			if (i === currentLine) continue;
			const m = itemRegex.exec(lines[i]);
			if (!m) continue;

			// Match on the task text only, ignoring any "✅ <date>" stamp.
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

	renderSuggestion(item: CheckboxSuggestion, el: HTMLElement): void {
		el.createSpan({
			cls: "checksorted-suggest-state",
			text: item.checked ? "☑" : "☐",
		});
		el.createSpan({ text: item.text });
	}

	selectSuggestion(item: CheckboxSuggestion): void {
		if (!this.context) return;
		this.plugin.applyCheckboxSuggestion(
			this.context.editor,
			item.line,
			this.context.start.line,
			item.text
		);
		this.close();
	}
}

// A clickable "×" rendered at the end of a checkbox line that deletes that line.
class DeleteTaskWidget extends WidgetType {
	constructor(private plugin: CheckSortedPlugin) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		const btn = createSpan({
			cls: "checksorted-delete-task",
			text: "×",
			attr: { "aria-label": "Delete task" },
		});
		btn.addEventListener("pointerdown", (e) => {
			// Stop the editor from moving the cursor / starting a selection.
			e.preventDefault();
			e.stopPropagation();
			const pos = view.posAtDOM(btn);
			const line = view.state.doc.lineAt(pos);
			this.plugin.deleteTaskAtOffset(view, line.from);
		});
		return btn;
	}

	eq(): boolean {
		return false;
	}

	ignoreEvent(): boolean {
		return true;
	}
}

function decorateReadingContexts(
	el: HTMLElement,
	contextStatus: string,
	sectionSource?: string
): void {
	const items = el.querySelectorAll<HTMLElement>("li.task-list-item");
	const sourceTasks = (sectionSource ?? "")
		.split("\n")
		.filter((line) => /^\s*(?:[-*+]|\d+\.) \[[^\]]\]\s/.test(line));
	items.forEach((item, index) => {
		const checkbox = Array.from(
			item.querySelectorAll<HTMLInputElement>("input.task-list-item-checkbox")
		).find((candidate) => candidate.closest("li.task-list-item") === item);
		if (!checkbox) return;

		let hasMarker = false;
		const walker = document.createTreeWalker(item, NodeFilter.SHOW_COMMENT);
		let comment: Comment | null;
		while ((comment = walker.nextNode() as Comment | null)) {
			if ((comment.textContent ?? "").includes("checksorted-context")) {
				hasMarker = true;
				break;
			}
		}
		const state = item.getAttribute("data-task") ?? checkbox.getAttribute("data-task");
		const sourceLine = sourceTasks[index] ?? "";
		if (
			!hasMarker &&
			!sourceLine.includes(CONTEXT_MARKER) &&
			state !== contextStatus
		) return;

		item.addClass("checksorted-context-task");
		checkbox.checked = true;
		checkbox.disabled = true;
		checkbox.tabIndex = -1;
		checkbox.setAttribute("aria-disabled", "true");
		// Keep the structural <li> (and therefore its nested list) in the DOM,
		// but hide every direct piece of the synthetic parent row. The real child
		// tasks remain visible through their nested <ul>/<ol>.
		for (const child of Array.from(item.childNodes)) {
			if (
				child instanceof HTMLElement &&
				(child.tagName === "UL" || child.tagName === "OL")
			) continue;
			if (child instanceof HTMLElement) {
				child.addClass("checksorted-context-content");
			} else if ((child.textContent ?? "").trim()) {
				const hidden = document.createElement("span");
				hidden.className = "checksorted-context-content";
				hidden.textContent = child.textContent;
				item.replaceChild(hidden, child);
			}
		}
	});
}

function contextTaskExtension(plugin: CheckSortedPlugin) {
	const internalMarker = /%%checksorted-(?:context|cascade|auto-stay|id:[A-Za-z0-9_-]+|order:\d+(?:\.\d+)*)%%/g;
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.build(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = this.build(update.view);
				}
			}

			build(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();
				for (const { from, to } of view.visibleRanges) {
					let position = from;
					while (position <= to) {
						const line = view.state.doc.lineAt(position);
						const state = /^\s*(?:[-*+]|\d+\.) \[([^\]])\]/.exec(line.text)?.[1];
						const isContext =
							line.text.includes(CONTEXT_MARKER) ||
							state === plugin.settings.contextStatus;
						if (isContext) {
							builder.add(
								line.from,
								line.to,
								Decoration.replace({})
							);
						} else {
							internalMarker.lastIndex = 0;
							let marker: RegExpExecArray | null;
							while ((marker = internalMarker.exec(line.text))) {
								builder.add(
									line.from + marker.index,
									line.from + marker.index + marker[0].length,
									Decoration.replace({})
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

// Widget that renders the date stamp as a replaced element so that no
// ancestor text-decoration (strikethrough) can paint through it.
class DateStampWidget extends WidgetType {
	constructor(private text: string) { super(); }

	toDOM(): HTMLElement {
		return createSpan({ cls: "checksorted-date", text: this.text });
	}

	eq(other: DateStampWidget): boolean {
		return this.text === (other as DateStampWidget).text;
	}

	ignoreEvent(): boolean { return false; }
}

// Editor extension that replaces the "✅ <date>" stamp with a widget so the
// date is immune to strikethrough inherited from [x] task lines.
function dateStampExtension(plugin: CheckSortedPlugin) {
	const checkedLine = /^\s*[-*+] \[[xX]\] /;

	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.build(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = this.build(update.view);
				}
			}

			build(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();

				for (const { from, to } of view.visibleRanges) {
					let pos = from;
					while (pos <= to) {
						const line = view.state.doc.lineAt(pos);
						if (checkedLine.test(line.text)) {
							// Only match the plugin-generated stamp: " ✅ <date>" at end of line
							const stampIdx = line.text.search(/ ✅ \S/);
							if (stampIdx !== -1) {
								const stampText = line.text.slice(stampIdx);
								builder.add(
									line.from + stampIdx,
									line.to,
									Decoration.replace({
										widget: new DateStampWidget(stampText),
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

// Editor extension that puts a DeleteTaskWidget at the end of every checkbox line.
function deleteButtonExtension(plugin: CheckSortedPlugin) {
	const checkbox = /^\s*(?:[-*+]|\d+\.) \[[^\]]\]\s/;

	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.build(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = this.build(update.view);
				}
			}

			build(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();
				if (!plugin.settings.showDeleteButton) return builder.finish();

				for (const { from, to } of view.visibleRanges) {
					let pos = from;
					while (pos <= to) {
						const line = view.state.doc.lineAt(pos);
						const state = /^\s*(?:[-*+]|\d+\.) \[([^\]])\]/.exec(line.text)?.[1];
						if (
							checkbox.test(line.text) &&
							!line.text.includes(CONTEXT_MARKER) &&
							state !== plugin.settings.contextStatus
						) {
							builder.add(
								line.to,
								line.to,
								Decoration.widget({
									widget: new DeleteTaskWidget(plugin),
									side: 1,
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
			decorations: (v) => v.decorations,
		}
	);
}
