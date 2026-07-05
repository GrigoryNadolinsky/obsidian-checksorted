import {
	addIcon,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	MarkdownView,
	moment,
	Notice,
	Plugin,
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

export default class CheckSortedPlugin extends Plugin {
	settings: CheckSortedSettings;
	ribbonIconEl: HTMLElement | null = null;
	statusBarEl: HTMLElement | null = null;

	private isProcessing = false;
	private lastCursorLine = -1;
	private lastCheckboxSnapshot = '';

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
		this.registerMarkdownPostProcessor((el) => {
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
		this.updateStatusBar();
		this.setupAutoMove();
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
		return (content.match(/^[ \t]*[-*+] \[[xX \/]\]/gm) ?? []).join('');
	}

	// cleanEmpty=true: also discard empty "- [ ] " continuation lines (called on exit from completed).
	// cleanEmpty=false: only return items with real content (called on checkbox toggle).
	private returnUncheckedItems(editor: Editor, cleanEmpty = false): void {
		if (this.isProcessing) return;

		const content = editor.getValue();
		const headerRegex = this.getHeaderRegex();
		const match = headerRegex.exec(content);

		if (!match) return;

		const main = content.substring(0, match.index).trimEnd();
		const rawAfterHeader = content.substring(match.index + match[0].length);
		const afterHeader = rawAfterHeader.trimStart();

		// With cleanEmpty, .* also catches empty "- [ ] " continuation lines.
		const uncheckedRegex = cleanEmpty
			? /^([ \t]*[-*+] \[[ \/]\] .*)\r?\n?/gm
			: /^([ \t]*[-*+] \[[ \/]\] .+)\r?\n?/gm;
		const uncheckedMatches = [...afterHeader.matchAll(uncheckedRegex)];

		if (uncheckedMatches.length === 0) return;

		// Also strip any empty "- [ ] " continuation lines that Obsidian inserts when
		// Enter is pressed on an unchecked item. Otherwise a stray empty checkbox is left
		// behind in the completed section and renders with a bullet (● ☐).
		const cleanedSection = afterHeader
			.replace(uncheckedRegex, "")
			.replace(/^[ \t]*[-*+] \[[ \/]\][ \t]*(\r?\n|$)/gm, "")
			.trimEnd();

		const hasContent = /^[ \t]*[-*+] \[[ \/]\] \S/;
		const returnedItems = uncheckedMatches
			.filter((m) => hasContent.test(m[1]))
			.map((m) => m[1].replace(/\s*✅.*$/, ""));

		const newMain =
			returnedItems.length > 0
				? main
					? `${main}\n${returnedItems.join("\n")}`
					: returnedItems.join("\n")
				: main;
		const newContent = cleanedSection
			? `${newMain}\n\n${this.getHeaderStr()}\n${cleanedSection}`
			: newMain;

		// Cursor adjustment: start from pre-change cursor, subtract lines removed above it
		// (in completed), add lines inserted into main before it (returned items, only relevant
		// when cursor is already in completed and the section shifts down).
		const preCursorLine = editor.getCursor().line;
		const headerLine = content.substring(0, match.index).split("\n").length - 1;
		const cursorInCompleted = preCursorLine > headerLine;

		const leadingTrim = rawAfterHeader.length - afterHeader.length;
		const afterHeaderDocLine =
			content.substring(0, match.index + match[0].length + leadingTrim).split("\n").length - 1;

		// Use the same predicate as uncheckedRegex so we only count actually-removed lines.
		const removedPredicate = cleanEmpty
			? /^[ \t]*[-*+] \[[ \/]\] /
			: /^[ \t]*[-*+] \[[ \/]\] \S/;
		const removedAboveCursor = afterHeader
			.split("\n")
			.slice(0, Math.max(0, preCursorLine - afterHeaderDocLine))
			.filter((l) => removedPredicate.test(l)).length;

		const cursorLine = Math.max(
			0,
			preCursorLine - removedAboveCursor + (cursorInCompleted ? returnedItems.length : 0)
		);

		this.isProcessing = true;
		this.setValuePreservingScroll(editor, newContent, cursorLine);
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
		const { main, completedItems: existing } = this.splitContent(content);

		const completedRegex = /^([ \t]*[-*+] \[[xX]\] \S.*)\r?\n?/gm;
		const newItems = [...main.matchAll(completedRegex)].map((m) => m[1]);

		if (newItems.length === 0) {
			if (!silent) new Notice("No completed items to move.");
			return;
		}

		// Count [x] lines removed above the cursor so we can land on the right line
		const singleItemRegex = /^[ \t]*[-*+] \[[xX]\] \S.*/;
		const mainLines = main.split("\n");
		let removedAbove = 0;
		for (let i = 0; i < Math.min(cursor.line, mainLines.length); i++) {
			if (singleItemRegex.test(mainLines[i])) removedAbove++;
		}

		const suffix = this.settings.dateStamp
			? ` ✅ ${moment().format(this.settings.dateFormat)}`
			: "";

		const stamped = newItems.map((item) => `${item}${suffix}`);
		const allItems =
			this.settings.sortOrder === "prepend"
				? [...stamped, ...existing]
				: [...existing, ...stamped];

		const cleanMain = main
			.replace(completedRegex, "")
			.replace(/^[ \t]*[-*+] \[[xX ]\] [ \t]*$/gm, "")
			.replace(/\n{3,}/g, "\n\n")
			.trimEnd();

		const completedSection = `${this.getHeaderStr()}\n${allItems.join("\n")}`;
		const newContent = cleanMain
			? `${cleanMain}\n\n${completedSection}`
			: completedSection;

		this.isProcessing = true;
		this.setValuePreservingScroll(
			editor,
			newContent,
			Math.max(0, cursor.line - removedAbove)
		);
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
		const lines = content.split("\n");
		let outLines: string[] = [];
		const listItemRegex = /^([ \t]*)([-*+]|\d+\.) (?:\[([ xX\/])\] )?(.*)$/;

		interface Node {
			indent: number;
			originalLine: string;
			state: number; // 0=unchecked/none, 1=half, 2=checked
			children: Node[];
			isContinuation: boolean;
			order: number;
		}

		let i = 0;
		while (i < lines.length) {
			if (listItemRegex.test(lines[i])) {
				let blockLines: string[] = [];
				while (i < lines.length) {
					const line = lines[i];
					if (line.trim() === "") {
						let nextNonEmpty = i + 1;
						while (nextNonEmpty < lines.length && lines[nextNonEmpty].trim() === "") nextNonEmpty++;
						if (nextNonEmpty < lines.length) {
							const nextLine = lines[nextNonEmpty];
							const match = listItemRegex.exec(nextLine);
							const isIndented = /^[ \t]+/.test(nextLine);
							if (match || isIndented) {
								blockLines.push(line);
								i++;
								continue;
							}
						}
						break;
					}
					const match = listItemRegex.exec(line);
					const isIndented = /^[ \t]+/.test(line);
					if (match || isIndented) {
						blockLines.push(line);
						i++;
					} else {
						break;
					}
				}

				const root: Node = { indent: -1, originalLine: "", state: 0, children: [], isContinuation: false, order: 0 };
				const stack: Node[] = [root];

				for (let j = 0; j < blockLines.length; j++) {
					let line = blockLines[j];
					const match = listItemRegex.exec(line);
					if (match) {
						const indent = match[1].length;
						const checkbox = match[3];
						let state = 0;
						if (checkbox === "/") state = 1;
						else if (checkbox === "x" || checkbox === "X") {
							state = 2;
							if (this.settings.dateStamp && !/ ✅ \S/.test(line)) {
								line = line + ` ✅ ${moment().format(this.settings.dateFormat)}`;
							}
						}

						const node: Node = {
							indent,
							originalLine: line,
							state,
							children: [],
							isContinuation: false,
							order: j
						};

						while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
							stack.pop();
						}

						stack[stack.length - 1].children.push(node);
						stack.push(node);
					} else {
						const node: Node = {
							indent: Infinity,
							originalLine: line,
							state: 0,
							children: [],
							isContinuation: true,
							order: j
						};
						stack[stack.length - 1].children.push(node);
					}
				}

				const sortNode = (node: Node) => {
					node.children.sort((a, b) => {
						if (a.isContinuation && !b.isContinuation) return -1;
						if (!a.isContinuation && b.isContinuation) return 1;
						if (a.state !== b.state) return a.state - b.state;
						return a.order - b.order;
					});
					for (const child of node.children) {
						sortNode(child);
					}
				};

				sortNode(root);

				const flatten = (node: Node) => {
					for (const child of node.children) {
						outLines.push(child.originalLine);
						flatten(child);
					}
				};
				flatten(root);
			} else {
				outLines.push(lines[i]);
				i++;
			}
		}
		return outLines.join("\n");
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
		const { main, completedItems } = this.splitContent(content);

		if (completedItems.length === 0) {
			new Notice("No completed items to restore.");
			return;
		}

		const restored = completedItems.map((item) =>
			item.replace(/\[[xX]\]/, "[ ]").replace(/\s*✅.*$/, "")
		);

		this.isProcessing = true;
		this.setValuePreservingScroll(editor, `${main}\n${restored.join("\n")}`.trim());
		this.isProcessing = false;

		new Notice(
			`Restored ${completedItems.length} item${
				completedItems.length !== 1 ? "s" : ""
			}.`
		);
	}

	private restoreCompletedItemsInPlace(editor: Editor): void {
		const content = editor.getValue();
		const lines = content.split("\n");
		let count = 0;
		const lineRegex = /^([ \t]*[-*+] )\[[xX\/]\] (.*)$/;
		for (let i = 0; i < lines.length; i++) {
			const match = lineRegex.exec(lines[i]);
			if (match) {
				const prefix = match[1];
				const rest = match[2].replace(/\s*✅.*$/, "");
				lines[i] = `${prefix}[ ] ${rest}`;
				count++;
			}
		}
		if (count === 0) {
			new Notice("No completed or half-completed items to restore.");
			return;
		}
		this.isProcessing = true;
		this.setValuePreservingScroll(editor, lines.join("\n"));
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
		const content = editor.getValue();
		const lines = content.split("\n");
		const newLines: string[] = [];
		let count = 0;
		const checkedRegex = /^[ \t]*[-*+] \[[xX]\]/;
		for (let i = 0; i < lines.length; i++) {
			if (checkedRegex.test(lines[i])) {
				count++;
				const baseIndentMatch = /^[ \t]*/.exec(lines[i]);
				const baseIndent = baseIndentMatch ? baseIndentMatch[0].length : 0;
				while (i + 1 < lines.length) {
					const nextLine = lines[i + 1];
					if (nextLine.trim() === "") {
						let nextNonEmpty = i + 2;
						while (nextNonEmpty < lines.length && lines[nextNonEmpty].trim() === "") nextNonEmpty++;
						if (nextNonEmpty < lines.length && /^[ \t]+/.test(lines[nextNonEmpty])) {
							const nextIndent = /^[ \t]*/.exec(lines[nextNonEmpty])![0].length;
							if (nextIndent > baseIndent) {
								i = nextNonEmpty;
								continue;
							}
						}
						break;
					}
					const isListItem = /^[ \t]*[-*+]/.test(nextLine);
					const nextIndent = /^[ \t]*/.exec(nextLine)![0].length;
					if (!isListItem && nextIndent > baseIndent) {
						i++;
					} else {
						break;
					}
				}
			} else {
				newLines.push(lines[i]);
			}
		}
		if (count === 0) {
			new Notice("No completed items to clear.");
			return;
		}
		this.isProcessing = true;
		this.setValuePreservingScroll(editor, newLines.join("\n"));
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
	toDOM(view: EditorView): HTMLElement {
		const btn = createSpan({
			cls: "checksorted-delete-task",
			text: "×",
			attr: { "aria-label": "Delete task" },
		});
		btn.addEventListener("mousedown", (e) => {
			// Stop the editor from moving the cursor / starting a selection.
			e.preventDefault();
			e.stopPropagation();
			const pos = view.posAtDOM(btn);
			const line = view.state.doc.lineAt(pos);
			const isLast = line.to >= view.state.doc.length;
			// Remove the line and one adjacent newline so no blank gap remains.
			const from = isLast && line.from > 0 ? line.from - 1 : line.from;
			const to = isLast ? line.to : line.to + 1;
			view.dispatch({ changes: { from, to, insert: "" } });
		});
		return btn;
	}

	eq(): boolean {
		return true;
	}

	ignoreEvent(): boolean {
		return true;
	}
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
	const checkbox = /^\s*[-*+] \[[ xX\/]\]\s/;

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
						if (checkbox.test(line.text)) {
							builder.add(
								line.to,
								line.to,
								Decoration.widget({
									widget: new DeleteTaskWidget(),
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
