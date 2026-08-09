export const CONTEXT_MARKER = "%%checksorted-context%%";
export const CASCADE_MARKER = "%%checksorted-cascade%%";
export const AUTO_STAY_MARKER = "%%checksorted-auto-stay%%";
export const ID_MARKER_PREFIX = "%%checksorted-id:";
export const ORDER_MARKER_PREFIX = "%%checksorted-order:";

const ID_MARKER = /%%checksorted-id:([A-Za-z0-9_-]+)%%/;
const ORDER_MARKER = /%%checksorted-order:(\d+(?:\.\d+)*)%%/;
const INTERNAL_MARKER = /\s*%%checksorted-(?:context|cascade|auto-stay|id:[A-Za-z0-9_-]+|order:\d+(?:\.\d+)*)%%/g;
let generatedId = 0;

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
		.replace(INTERNAL_MARKER, "")
		.replace(/\s*✅.*$/, "")
		.trim();
}

export function taskId(node: TaskTreeNode): string | null {
	return ID_MARKER.exec(node.line)?.[1] ?? null;
}

export function taskOrder(node: TaskTreeNode): string | null {
	return ORDER_MARKER.exec(node.line)?.[1] ?? null;
}

function newTaskId(): string {
	const cryptoApi = globalThis.crypto as Crypto | undefined;
	if (cryptoApi?.randomUUID) return cryptoApi.randomUUID().replace(/-/g, "");
	generatedId++;
	return `${Date.now().toString(36)}${generatedId.toString(36)}`;
}

function setIdentity(node: TaskTreeNode, id: string, order: string): void {
	if (!taskId(node)) appendMarker(node, `${ID_MARKER_PREFIX}${id}%%`);
	if (taskOrder(node) === null) appendMarker(node, `${ORDER_MARKER_PREFIX}${order}%%`);
}

function nodeMatches(a: TaskTreeNode, b: TaskTreeNode): boolean {
	const aId = taskId(a);
	const bId = taskId(b);
	if (aId && bId) return aId === bId;
	return normalizedText(a) === normalizedText(b);
}

function ensureMetadata(entries: TreeEntry[]): void {
	let order = 0;
	for (const entry of entries) {
		if (!isTreeNode(entry)) continue;
		const ownsTask = entry.state !== null || entry.entries.some((child) =>
			isTreeNode(child) && (child.state !== null || hasChildItems(child))
		);
		if (ownsTask) setIdentity(entry, taskId(entry) ?? newTaskId(), taskOrder(entry) ?? String(order));
		ensureMetadata(entry.entries);
		order++;
	}
}

function inheritContextMetadata(
	activeEntries: TreeEntry[],
	completedEntries: TreeEntry[],
	contextStatus: string
): void {
	const used = new Set<TaskTreeNode>();
	for (const completed of completedEntries) {
		if (!isTreeNode(completed) || !isContextNode(completed, contextStatus)) continue;
		const match = activeEntries.find((candidate) =>
			isTreeNode(candidate) && !used.has(candidate) && nodeMatches(candidate, completed)
		) as TaskTreeNode | undefined;
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

export function ensureCascadeMetadata(
	main: TreeEntry[],
	completed: TreeEntry[],
	contextStatus: string
): void {
	ensureMetadata(main);
	inheritContextMetadata(main, completed, contextStatus);
	ensureMetadata(completed);
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
		for (let index = 0; index < entries.length; index++) {
			const entry = entries[index];
			if (typeof entry === "string") {
				if (entry.trim() !== "") {
					const currentIndent = /^[ \t]*/.exec(entry)?.[0] ?? "";
					const targetWidth = Math.max(0, indentationWidth(currentIndent) + delta);
					entries[index] = " ".repeat(targetWidth) + entry.slice(currentIndent.length);
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

export function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface CascadeOptions {
	contextStatus: string;
	keepEmptyParents: boolean;
	cascadeRestore: boolean;
	dateStamp: string | null;
	sortOrder: "append" | "prepend";
	completedParentBehavior: "none" | "move" | "stay";
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
	for (const entry of entries) {
		if (!isTreeNode(entry) || !nodeMatches(entry, incoming)) continue;
		const incomingContext = isContextNode(incoming, options.contextStatus);
		const existingContext = isContextNode(entry, options.contextStatus);
		if (incomingContext || existingContext || entry.state === incoming.state) return entry;
	}
	return null;
}

function insertNodeInOriginalOrder(entries: TreeEntry[], node: TaskTreeNode): void {
	const order = taskOrder(node);
	if (order === null) {
		entries.push(node);
		return;
	}
	const next = entries.findIndex((entry) =>
		isTreeNode(entry) && compareOrders(taskOrder(entry), order) > 0
	);
	if (next === -1) entries.push(node);
	else entries.splice(next, 0, node);
}

function compareOrders(left: string | null, right: string): number {
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

function setTaskOrder(node: TaskTreeNode, order: string): void {
	const marker = `${ORDER_MARKER_PREFIX}${order}%%`;
	if (ORDER_MARKER.test(node.line)) node.line = node.line.replace(ORDER_MARKER, marker);
	else appendMarker(node, marker);
	refreshNode(node);
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
	if (
		!isContextNode(existing, options.contextStatus) &&
		isChecked(existing) &&
		existing.entries.some((entry) => isTreeNode(entry) && entry.state !== null)
	) {
		appendMarker(existing, CASCADE_MARKER);
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

		if (
			isChecked(entry) &&
			!isContextNode(entry, options.contextStatus) &&
			!entry.line.includes(AUTO_STAY_MARKER)
		) {
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
			options.completedParentBehavior === "none" &&
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
			isTreeNode(candidate) && nodeMatches(candidate, entry)
		) as TaskTreeNode | undefined;
		if (match) mergeActiveNode(match, entry);
		else insertNodeInOriginalOrder(existing.entries, entry);
	}
}

function mergeIntoActive(
	main: TreeEntry[],
	contexts: TaskTreeNode[],
	restored: TaskTreeNode
): void {
	let destination = main;
	for (const context of contexts) {
		let parent = destination.find((entry) =>
			isTreeNode(entry) && nodeMatches(entry, context)
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
		isTreeNode(entry) && nodeMatches(entry, restored)
	) as TaskTreeNode | undefined;
	if (match) mergeActiveNode(match, restored);
	else insertNodeInOriginalOrder(destination, restored);
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

function findNodeById(entries: TreeEntry[], id: string): TaskTreeNode | null {
	for (const entry of entries) {
		if (!isTreeNode(entry)) continue;
		if (taskId(entry) === id) return entry;
		const nested = findNodeById(entry.entries, id);
		if (nested) return nested;
	}
	return null;
}

function updateAutomaticParents(
	main: TreeEntry[],
	completed: TreeEntry[],
	options: CascadeOptions
): number {
	if (options.completedParentBehavior === "none") return 0;
	let changed = 0;
	const visit = (entries: TreeEntry[]) => {
		for (const entry of entries) {
			if (!isTreeNode(entry)) continue;
			visit(entry.entries);
			if (entry.state === null || isContextNode(entry, options.contextStatus)) continue;

			const id = taskId(entry);
			const archived = id ? findNodeById(completed, id) : null;
			const activeChildren = entry.entries.filter(isTreeNode).filter((child) => child.state !== null);
			const archivedChildren = archived
				? archived.entries.filter(isTreeNode).filter((child) => child.state !== null)
				: [];
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

export function taskIdAtOrdinal(entries: TreeEntry[], ordinal: number): string | null {
	let current = 0;
	let result: string | null = null;
	const visit = (items: TreeEntry[]) => {
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

export interface DeleteTaskResult {
	main: TreeEntry[];
	completed: TreeEntry[];
	deleted: boolean;
	promoted: boolean;
}

export function deleteTaskCascadeTrees(
	main: TreeEntry[],
	completed: TreeEntry[],
	targetId: string,
	behavior: "cascade" | "promote",
	options: CascadeOptions
): DeleteTaskResult {
	ensureCascadeMetadata(main, completed, options.contextStatus);
	const occurrences = [findNodeById(main, targetId), findNodeById(completed, targetId)]
		.filter((node): node is TaskTreeNode => node !== null);
	const hasChildren = occurrences.some(hasChildItems);
	const promote = hasChildren && behavior === "promote";
	let deleted = false;

	const remove = (entries: TreeEntry[]) => {
		for (let index = 0; index < entries.length;) {
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
			const parentOrder = taskOrder(entry) ?? String(index);
			for (let childIndex = 0; childIndex < children.length; childIndex++) {
				const child = children[childIndex];
				setTaskOrder(child, `${parentOrder}.${taskOrder(child) ?? childIndex}`);
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
			// A real completed parent is still part of the path of an unchecked
			// descendant. Keeping it in the context chain lets that descendant be
			// reconstructed under the right parent even before the parent itself is
			// restored.
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

export function moveCompletedCascadeTrees(
	main: TreeEntry[],
	completed: TreeEntry[],
	options: CascadeOptions
): CascadeResult {
	ensureCascadeMetadata(main, completed, options.contextStatus);
	let moved = moveCompletedFromContainer(main, [], completed, options);
	updateAutomaticParents(main, completed, options);
	if (options.completedParentBehavior === "move") {
		moved += moveCompletedFromContainer(main, [], completed, options);
	}
	pruneEmptyContexts(completed, options);
	return { main, completed, moved, restored: 0 };
}

export function restoreUncheckedCascadeTrees(
	main: TreeEntry[],
	completed: TreeEntry[],
	options: CascadeOptions
): CascadeResult {
	ensureCascadeMetadata(main, completed, options.contextStatus);
	const restored = restoreFromContainer(completed, [], main, options);
	updateAutomaticParents(main, completed, options);
	pruneEmptyContexts(completed, options);
	return { main, completed, moved: 0, restored };
}

export function restoreAllCascadeTrees(
	main: TreeEntry[],
	completed: TreeEntry[],
	options: CascadeOptions
): CascadeResult {
	ensureCascadeMetadata(main, completed, options.contextStatus);
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
