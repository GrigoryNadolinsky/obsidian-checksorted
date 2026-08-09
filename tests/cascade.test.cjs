const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
class ObsidianBase {}
Module._load = (request, parent, isMain) => request === "obsidian"
	? {
		Plugin: ObsidianBase,
		MarkdownRenderChild: ObsidianBase,
		EditorSuggest: ObsidianBase,
		PluginSettingTab: ObsidianBase,
		Setting: ObsidianBase,
		moment: () => ({ format: () => "2026-08-09" }),
		addIcon: () => {},
		Notice: class {},
	}
	: originalLoad(request, parent, isMain);

const CheckSortedPlugin = require("../main.js").default;

function plugin(overrides = {}) {
	const instance = new CheckSortedPlugin();
	instance.settings = {
		completedAreaHierarchy: "2",
		completedAreaName: "Куплено",
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
		parentDeleteBehavior: "cascade",
		...overrides,
	};
	return instance;
}

function withoutIdentityMetadata(content) {
	return content
		.replace(/\s*%%checksorted-(?:id:[A-Za-z0-9_-]+|order:\d+(?:\.\d+)*)%%/g, "")
		.replace(/[ \t]+$/gm, "");
}

function withoutInternalMetadata(content) {
	return content
		.replace(/\s*%%checksorted-(?:context|cascade|auto-stay|id:[A-Za-z0-9_-]+|order:\d+(?:\.\d+)*)%%/g, "")
		.replace(/\s*✅.*$/gm, "")
		.replace(/[ \t]+$/gm, "");
}

function setTaskStateByText(content, text, state) {
	const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return content.replace(new RegExp(`^(\\s*(?:[-*+]|\\d+\\.) )\\[[^\\]]\\]( ${escaped}(?:\\s|$).*)$`, "m"), `$1[${state}]$2`);
}

function setLastTaskStateByText(content, text, state) {
	const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`^(\\s*(?:[-*+]|\\d+\\.) )\\[[^\\]]\\]( ${escaped}(?:\\s|$).*)$`, "gm");
	const matches = [...content.matchAll(pattern)];
	const match = matches.at(-1);
	if (!match || match.index === undefined) return content;
	const replacement = `${match[1]}[${state}]${match[2]}`;
	return content.slice(0, match.index) + replacement + content.slice(match.index + match[0].length);
}

{
	const instance = plugin();
	const input = [
		"- [ ] овощи:",
		"    Комментарий",
		"    ![[pic.png]]",
		"    - [ ] огурцы",
		"    - [x] редиска",
		"",
		"## Куплено",
		"- [x] хлеб",
	].join("\n");
	const expected = [
		"- [ ] овощи:",
		"    Комментарий",
		"    ![[pic.png]]",
		"    - [ ] огурцы",
		"",
		"## Куплено",
		"- [x] хлеб",
		"- [c] овощи: %%checksorted-context%%",
		"    Комментарий",
		"    ![[pic.png]]",
		"    - [x] редиска",
	].join("\n");
	assert.equal(withoutIdentityMetadata(instance.transformGlobalContent(input, "move").content), expected);
}

{
	const instance = plugin({ dateStamp: true });
	const input = [
		"- [x] овощи:",
		"    - [ ] огурцы",
		"    - [/] помидоры",
		"",
		"## Куплено",
		"- [c] овощи: %%checksorted-context%%",
		"    - [x] редиска ✅ 2026-08-08",
	].join("\n");
	const result = instance.transformGlobalContent(input, "move").content;
	assert.match(withoutIdentityMetadata(result), /- \[x\] овощи: %%checksorted-cascade%% ✅ 2026-08-09/);
	assert.match(withoutIdentityMetadata(result), /    - \[x\] огурцы ✅ 2026-08-09/);
	assert.match(withoutIdentityMetadata(result), /    - \[x\] помидоры ✅ 2026-08-09/);
	assert.equal((result.match(/редиска/g) ?? []).length, 1);
}

{
	const instance = plugin({ dateStamp: true, cascadeRestore: true });
	const input = [
		"## Куплено",
		"- [ ] овощи: %%checksorted-cascade%% ✅ 2026-08-09",
		"    Комментарий",
		"    - [x] редиска ✅ 2026-08-08",
		"    - [x] огурцы ✅ 2026-08-09",
	].join("\n");
	assert.equal(
		withoutIdentityMetadata(instance.transformGlobalContent(input, "restore-unchecked").content),
		["- [ ] овощи:", "    Комментарий", "    - [ ] редиска", "    - [ ] огурцы"].join("\n")
	);
}

// A: a single child returns to the same parent and position.
{
	const instance = plugin();
	const original = ["- [ ] Parent", "    - [ ] Child 1", "    - [ ] Child 2"].join("\n");
	let content = setTaskStateByText(original, "Child 1", "x");
	content = instance.transformGlobalContent(content, "move").content;
	content = setTaskStateByText(content, "Child 1", " ");
	content = instance.transformGlobalContent(content, "restore-unchecked").content;
	assert.equal(withoutInternalMetadata(content), original);
}

// B/J: arbitrary completion/restoration order preserves a multi-level tree.
{
	const instance = plugin();
	const original = [
		"- [ ] Parent",
		"    - [ ] Child 1",
		"        - [ ] Grandchild",
		"    - [ ] Child 2",
	].join("\n");
	let content = setTaskStateByText(original, "Grandchild", "x");
	content = instance.transformGlobalContent(content, "move").content;
	content = setTaskStateByText(content, "Child 1", "x");
	content = instance.transformGlobalContent(content, "move").content;
	content = setTaskStateByText(content, "Child 2", "x");
	content = instance.transformGlobalContent(content, "move").content;
	content = setTaskStateByText(content, "Parent", "x");
	content = instance.transformGlobalContent(content, "move").content;
	for (const name of ["Grandchild", "Child 2", "Child 1", "Parent"]) {
		content = setLastTaskStateByText(content, name, " ");
		content = instance.transformGlobalContent(content, "restore-unchecked").content;
	}
	assert.equal(withoutInternalMetadata(content), original);
}

// C: the parent is completed and moved after its last direct child.
{
	const instance = plugin({ completedParentBehavior: "move" });
	let content = ["- [ ] Parent", "    - [x] Child 1", "    - [x] Child 2"].join("\n");
	content = instance.transformGlobalContent(content, "move").content;
	const visible = withoutInternalMetadata(content);
	assert.doesNotMatch(visible, /^- \[ \] Parent/m);
	assert.match(visible, /^## Куплено\n- \[x\] Parent/m);
	assert.match(visible, /^    - \[x\] Child 1/m);
	assert.match(visible, /^    - \[x\] Child 2/m);
	content = setLastTaskStateByText(content, "Parent", " ");
	content = instance.transformGlobalContent(content, "restore-unchecked").content;
	assert.equal(
		withoutInternalMetadata(content),
		["- [ ] Parent", "    - [ ] Child 1", "    - [ ] Child 2"].join("\n")
	);
}

// D: the parent can instead be completed without moving.
{
	const instance = plugin({ completedParentBehavior: "stay" });
	let content = ["- [ ] Parent", "    - [x] Child 1", "    - [x] Child 2"].join("\n");
	content = instance.transformGlobalContent(content, "move").content;
	assert.match(withoutInternalMetadata(content), /^- \[x\] Parent/m);
	assert.match(content, /Parent.*%%checksorted-auto-stay%%/);
}

// E-I: leaf deletion, recursive parent deletion, and promotion at any depth.
{
	const original = ["- [ ] Parent", "    - [ ] Child 1", "    - [ ] Child 2"].join("\n");
	const leaf = plugin().transformDeleteContent(original, 1);
	assert.equal(withoutInternalMetadata(leaf), ["- [ ] Parent", "    - [ ] Child 2"].join("\n"));
	assert.equal(plugin({ parentDeleteBehavior: "cascade" }).transformDeleteContent(original, 0), "");
	const promoted = plugin({ parentDeleteBehavior: "promote" }).transformDeleteContent(original, 0);
	assert.equal(withoutInternalMetadata(promoted), ["- [ ] Child 1", "- [ ] Child 2"].join("\n"));

	const nested = [
		"- [ ] Parent",
		"    - [ ] Child",
		"        Child note",
		"        - [ ] Grandchild",
	].join("\n");
	assert.equal(plugin({ parentDeleteBehavior: "cascade" }).transformDeleteContent(nested, 0), "");
	assert.equal(
		withoutInternalMetadata(plugin({ parentDeleteBehavior: "promote" }).transformDeleteContent(nested, 0)),
		["- [ ] Child", "    Child note", "    - [ ] Grandchild"].join("\n")
	);
}

// Deletion also removes/promotes branches already represented in Completed.
{
	for (const behavior of ["cascade", "promote"]) {
		const instance = plugin({ parentDeleteBehavior: behavior });
		let content = ["- [ ] Parent", "    - [x] Child 1", "    - [ ] Child 2"].join("\n");
		content = instance.transformGlobalContent(content, "move").content;
		content = instance.transformDeleteContent(content, 0);
		const visible = withoutInternalMetadata(content);
		if (behavior === "cascade") assert.equal(visible, "");
		else {
			assert.match(visible, /^- \[ \] Child 2/m);
			assert.match(visible, /^## Куплено\n- \[x\] Child 1/m);
			content = setLastTaskStateByText(content, "Child 1", " ");
			content = instance.transformGlobalContent(content, "restore-unchecked").content;
			assert.equal(
				withoutInternalMetadata(content),
				["- [ ] Child 1", "- [ ] Child 2"].join("\n")
			);
		}
	}
}

// Reverse completion/restoration still returns siblings to their original order.
{
	const instance = plugin();
	const original = [
		"- [ ] Parent",
		"    - [ ] Child 1",
		"    - [ ] Child 2",
		"    - [ ] Child 3",
	].join("\n");
	let content = original;
	for (const name of ["Child 3", "Child 1", "Child 2"]) {
		content = setTaskStateByText(content, name, "x");
		content = instance.transformGlobalContent(content, "move").content;
	}
	for (const name of ["Child 2", "Child 3", "Child 1"]) {
		content = setLastTaskStateByText(content, name, " ");
		content = instance.transformGlobalContent(content, "restore-unchecked").content;
	}
	assert.equal(withoutInternalMetadata(content), original);
}

// Identical task text under different parents is disambiguated by stable IDs.
{
	const instance = plugin();
	const original = [
		"- [ ] First",
		"    - [x] Same",
		"- [ ] Second",
		"    - [ ] Same",
	].join("\n");
	let content = instance.transformGlobalContent(original, "move").content;
	content = setLastTaskStateByText(content, "Same", " ");
	content = instance.transformGlobalContent(content, "restore-unchecked").content;
	assert.equal(withoutInternalMetadata(content), original.replace("[x] Same", "[ ] Same"));
}

{
	const instance = plugin({ cascadeRestore: false });
	const input = [
		"## Куплено",
		"- [ ] овощи: %%checksorted-cascade%%",
		"    Комментарий",
		"    - [x] редиска",
	].join("\n");
	const result = instance.transformGlobalContent(input, "restore-unchecked").content;
	assert.match(result, /^- \[ \] овощи:/);
	assert.match(withoutIdentityMetadata(result), /- \[c\] овощи: %%checksorted-context%%/);
	assert.match(result, /    - \[x\] редиска/);
}

{
	const instance = plugin({ keepEmptyParents: false });
	const input = [
		"- [ ] продукты:",
		"    - [ ] овощи:",
		"        - [x] редиска",
	].join("\n");
	const result = instance.transformGlobalContent(input, "move").content;
	assert.ok(result.startsWith("## Куплено\n"));
	assert.match(result, /- \[c\] продукты:/);
	assert.match(result, /    - \[c\] овощи:/);
}

{
	const instance = plugin({ sortMethod: "in-place", cascadeRestore: true });
	const completed = instance.sortItemsInPlaceContent([
		"- [x] овощи:",
		"    - [ ] огурцы",
		"    - [/] редиска",
		"- [ ] хлеб",
	].join("\n"));
	assert.match(withoutIdentityMetadata(completed), /- \[x\] овощи: %%checksorted-cascade%%/);
	assert.match(completed, /    - \[x\] огурцы/);
	assert.ok(completed.indexOf("хлеб") < completed.indexOf("овощи"));

	const restored = instance.sortItemsInPlaceContent(
		completed.replace("- [x] овощи:", "- [ ] овощи:")
	);
	assert.doesNotMatch(restored, /checksorted-cascade/);
	assert.match(restored, /    - \[ \] огурцы/);
	assert.match(restored, /    - \[ \] редиска/);
}

// Parent automation and deletion also preserve in-place sorting semantics.
{
	const stay = plugin({ sortMethod: "in-place", completedParentBehavior: "stay" });
	const input = [
		"- [ ] Parent",
		"    - [x] Child 1",
		"    - [x] Child 2",
		"- [ ] Sibling",
	].join("\n");
	const stayed = stay.sortItemsInPlaceContent(input);
	assert.ok(stayed.indexOf("Parent") < stayed.indexOf("Sibling"));
	assert.match(stayed, /- \[x\] Parent.*%%checksorted-auto-stay%%/);

	const move = plugin({ sortMethod: "in-place", completedParentBehavior: "move" });
	const moved = move.sortItemsInPlaceContent(input);
	assert.ok(moved.indexOf("Sibling") < moved.indexOf("Parent"));

	const deletion = plugin({ sortMethod: "in-place", parentDeleteBehavior: "promote" });
	const underMatchingHeading = ["## Куплено", "- [ ] Parent", "    - [ ] Child"].join("\n");
	assert.equal(
		withoutInternalMetadata(deletion.transformDeleteContent(underMatchingHeading, 1)),
		["## Куплено", "- [ ] Child"].join("\n")
	);
}

console.log("Cascade task tests: OK");
