export const CONTEXT_MARKER = "%%checksorted-context%%";
export const CASCADE_MARKER = "%%checksorted-cascade%%";

export type TreeEntry = string | TaskTreeNode;

export interface TaskTreeNode {
	kind: "item";
	line: string;
	indent: string;
	indentWidth: number;
	marker: string;
	state: string | null;
	text: string;
	entries: TreeEntry[];
}

const LIST_ITEM = /^([ \t]*)([-*+]|\d+\.) (?:\[([^\]])\] )?(.*)$/;

export function isTreeNode(entry: TreeEntry): entry is TaskTreeNode {
	return typeof entry !== "string";
}

export function indentationWidth(indent: string): number {
	let width = 0;
	for (const char of indent) width += char === "\t" ? 4 - (width % 4) : 1;
	return width;
}

export function parseTree(content: string): TreeEntry[] {
	if (!content) return [];

	const root: TreeEntry[] = [];
	const stack: TaskTreeNode[] = [];
	for (const line of content.split("\n")) {
		const match = LIST_ITEM.exec(line);
		if (match) {
			const width = indentationWidth(match[1]);
			while (stack.length && stack[stack.length - 1].indentWidth >= width) {
				stack.pop();
			}

			const node: TaskTreeNode = {
				kind: "item",
				line,
				indent: match[1],
				indentWidth: width,
				marker: match[2],
				state: match[3] ?? null,
				text: match[4],
				entries: [],
			};
			const destination = stack.length
				? stack[stack.length - 1].entries
				: root;
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

		const indent = /^[ \t]*/.exec(line)?.[0] ?? "";
		if (indentationWidth(indent) > stack[stack.length - 1].indentWidth) {
			stack[stack.length - 1].entries.push(line);
		} else {
			stack.length = 0;
			root.push(line);
		}
	}

	return root;
}

export function serializeTree(entries: TreeEntry[]): string {
	const lines: string[] = [];
	const append = (items: TreeEntry[]) => {
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

export function cloneEntry(entry: TreeEntry): TreeEntry {
	if (typeof entry === "string") return entry;
	return {
		...entry,
		entries: entry.entries.map((child) => cloneEntry(child)),
	};
}

export function refreshNode(node: TaskTreeNode): void {
	const match = LIST_ITEM.exec(node.line);
	if (!match) return;
	node.indent = match[1];
	node.indentWidth = indentationWidth(match[1]);
	node.marker = match[2];
	node.state = match[3] ?? null;
	node.text = match[4];
}

export function setTaskState(node: TaskTreeNode, state: string): void {
	if (node.state === null) {
		node.line = `${node.indent}${node.marker} [${state}] ${node.text}`;
	} else {
		node.line = node.line.replace(/^(\s*(?:[-*+]|\d+\.) )\[[^\]]\]/, `$1[${state}]`);
	}
	refreshNode(node);
}

export function appendMarker(node: TaskTreeNode, marker: string): void {
	if (node.line.includes(marker)) return;
	const dateIndex = node.line.search(/ ✅ \S/);
	if (dateIndex === -1) node.line = `${node.line.trimEnd()} ${marker}`;
	else node.line = `${node.line.slice(0, dateIndex).trimEnd()} ${marker}${node.line.slice(dateIndex)}`;
	refreshNode(node);
}

export function removeMarker(node: TaskTreeNode, marker: string): void {
	node.line = node.line
		.replace(new RegExp(`\\s*${escapeRegex(marker)}`, "g"), "")
		.trimEnd();
	refreshNode(node);
}

export function stripTaskMetadata(node: TaskTreeNode): void {
	node.line = node.line
		.replace(/\s*✅.*$/, "")
		.replace(new RegExp(`\\s*${escapeRegex(CASCADE_MARKER)}`, "g"), "")
		.trimEnd();
	refreshNode(node);
}

export function normalizedText(node: TaskTreeNode): string {
	return node.text
		.replace(new RegExp(escapeRegex(CONTEXT_MARKER), "g"), "")
		.replace(new RegExp(escapeRegex(CASCADE_MARKER), "g"), "")
		.replace(/\s*✅.*$/, "")
		.trim();
}

export function isContextNode(node: TaskTreeNode, contextStatus: string): boolean {
	return node.line.includes(CONTEXT_MARKER) || node.state === contextStatus;
}

export function hasChildItems(node: TaskTreeNode): boolean {
	return node.entries.some(isTreeNode);
}

export function reindentNode(node: TaskTreeNode, indent: string): void {
	const oldWidth = node.indentWidth;
	const newWidth = indentationWidth(indent);
	const delta = newWidth - oldWidth;
	node.line = indent + node.line.slice(node.indent.length);
	refreshNode(node);

	const adjust = (entries: TreeEntry[]) => {
		for (const entry of entries) {
			if (typeof entry === "string") {
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

export function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface CascadeOptions {
	contextStatus: string;
	keepEmptyParents: boolean;
	cascadeRestore: boolean;
	dateStamp: string | null;
	sortOrder: "append" | "prepend";
}

export interface CascadeResult {
	main: TreeEntry[];
	completed: TreeEntry[];
	moved: number;
	restored: number;
}

function isChecked(node: TaskTreeNode): boolean {
	return node.state === "x" || node.state === "X";
}

function isRestorable(node: TaskTreeNode, options: CascadeOptions): boolean {
	return !isContextNode(node, options.contextStatus) &&
		(node.state === " " || node.state === "/");
}

function stamp(node: TaskTreeNode, value: string | null): void {
	if (!value || / ✅ \S/.test(node.line)) return;
	node.line = `${node.line.trimEnd()} ✅ ${value}`;
	refreshNode(node);
}

function cascadeComplete(node: TaskTreeNode, options: CascadeOptions): void {
	let descendantTasks = 0;
	const visit = (entries: TreeEntry[]) => {
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

function cascadeUncheck(node: TaskTreeNode, contextStatus: string): void {
	const visit = (entry: TaskTreeNode) => {
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

function contextClone(
	ancestor: TaskTreeNode,
	pathChild: TaskTreeNode,
	branch: TaskTreeNode,
	options: CascadeOptions
): TaskTreeNode {
	const copy = cloneEntry(ancestor) as TaskTreeNode;
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

function archiveBranch(
	ancestors: TaskTreeNode[],
	node: TaskTreeNode,
	options: CascadeOptions
): TaskTreeNode {
	let branch = cloneEntry(node) as TaskTreeNode;
	for (let index = ancestors.length - 1; index >= 0; index--) {
		const child = index === ancestors.length - 1 ? node : ancestors[index + 1];
		branch = contextClone(ancestors[index], child, branch, options);
	}
	return branch;
}

function insertStringBeforeChildren(entries: TreeEntry[], value: string): void {
	if (entries.some((entry) => typeof entry === "string" && entry.trim() === value.trim())) return;
	const firstChild = entries.findIndex(isTreeNode);
	if (firstChild === -1) entries.push(value);
	else entries.splice(firstChild, 0, value);
}

function matchingNode(
	entries: TreeEntry[],
	incoming: TaskTreeNode,
	options: CascadeOptions
): TaskTreeNode | null {
	const text = normalizedText(incoming);
	for (const entry of entries) {
		if (!isTreeNode(entry) || normalizedText(entry) !== text) continue;
		const incomingContext = isContextNode(incoming, options.contextStatus);
		const existingContext = isContextNode(entry, options.contextStatus);
		if (incomingContext || existingContext || entry.state === incoming.state) return entry;
	}
	return null;
}

function mergeNode(
	existing: TaskTreeNode,
	incoming: TaskTreeNode,
	options: CascadeOptions
): void {
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
}

function mergeArchiveBranch(
	completed: TreeEntry[],
	branch: TaskTreeNode,
	options: CascadeOptions
): void {
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

function moveCompletedFromContainer(
	entries: TreeEntry[],
	ancestors: TaskTreeNode[],
	completed: TreeEntry[],
	options: CascadeOptions
): number {
	let moved = 0;
	for (let index = 0; index < entries.length;) {
		const entry = entries[index];
		if (!isTreeNode(entry)) {
			index++;
			continue;
		}

		if (isChecked(entry) && !isContextNode(entry, options.contextStatus)) {
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
		if (
			childMoves > 0 &&
			!options.keepEmptyParents &&
			entry.state !== null &&
			!hasChildItems(entry)
		) {
			entries.splice(index, 1);
			continue;
		}
		index++;
	}
	return moved;
}

function activeContextClone(context: TaskTreeNode): TaskTreeNode {
	const copy = cloneEntry(context) as TaskTreeNode;
	setTaskState(copy, " ");
	removeMarker(copy, CONTEXT_MARKER);
	stripTaskMetadata(copy);
	copy.entries = copy.entries.filter((entry) => typeof entry === "string");
	return copy;
}

function mergeActiveNode(existing: TaskTreeNode, incoming: TaskTreeNode): void {
	for (const entry of incoming.entries) {
		if (typeof entry === "string") {
			insertStringBeforeChildren(existing.entries, entry);
			continue;
		}
		const match = existing.entries.find((candidate) =>
			isTreeNode(candidate) && normalizedText(candidate) === normalizedText(entry)
		) as TaskTreeNode | undefined;
		if (match) mergeActiveNode(match, entry);
		else existing.entries.push(entry);
	}
}

function mergeIntoActive(
	main: TreeEntry[],
	contexts: TaskTreeNode[],
	restored: TaskTreeNode
): void {
	let destination = main;
	for (const context of contexts) {
		const text = normalizedText(context);
		let parent = destination.find((entry) =>
			isTreeNode(entry) && normalizedText(entry) === text
		) as TaskTreeNode | undefined;
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

	const match = destination.find((entry) =>
		isTreeNode(entry) && normalizedText(entry) === normalizedText(restored)
	) as TaskTreeNode | undefined;
	if (match) mergeActiveNode(match, restored);
	else destination.push(restored);
}

function pruneEmptyContexts(entries: TreeEntry[], options: CascadeOptions): void {
	for (let index = 0; index < entries.length;) {
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

function restoreFromContainer(
	entries: TreeEntry[],
	contexts: TaskTreeNode[],
	main: TreeEntry[],
	options: CascadeOptions
): number {
	let restoredCount = 0;
	for (let index = 0; index < entries.length;) {
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
			restoredCount += restoreFromContainer(entry.entries, contexts, main, options);
			index++;
			continue;
		}

		const cascade = options.cascadeRestore && entry.line.includes(CASCADE_MARKER);
		if (cascade) {
			const restored = cloneEntry(entry) as TaskTreeNode;
			cascadeUncheck(restored, options.contextStatus);
			mergeIntoActive(main, contexts, restored);
			entries.splice(index, 1);
			restoredCount++;
			continue;
		}

		const restored = cloneEntry(entry) as TaskTreeNode;
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

export function synchronizeCascadeTrees(
	main: TreeEntry[],
	completed: TreeEntry[],
	options: CascadeOptions
): CascadeResult {
	const restored = restoreFromContainer(completed, [], main, options);
	pruneEmptyContexts(completed, options);
	const moved = moveCompletedFromContainer(main, [], completed, options);
	pruneEmptyContexts(completed, options);
	return { main, completed, moved, restored };
}

export function moveCompletedCascadeTrees(
	main: TreeEntry[],
	completed: TreeEntry[],
	options: CascadeOptions
): CascadeResult {
	const moved = moveCompletedFromContainer(main, [], completed, options);
	pruneEmptyContexts(completed, options);
	return { main, completed, moved, restored: 0 };
}

export function restoreUncheckedCascadeTrees(
	main: TreeEntry[],
	completed: TreeEntry[],
	options: CascadeOptions
): CascadeResult {
	const restored = restoreFromContainer(completed, [], main, options);
	pruneEmptyContexts(completed, options);
	return { main, completed, moved: 0, restored };
}

export function restoreAllCascadeTrees(
	main: TreeEntry[],
	completed: TreeEntry[],
	options: CascadeOptions
): CascadeResult {
	const markRestorable = (entries: TreeEntry[]) => {
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
