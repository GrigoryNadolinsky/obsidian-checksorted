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
		...overrides,
	};
	return instance;
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
	assert.equal(instance.transformGlobalContent(input, "move").content, expected);
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
	assert.match(result, /- \[x\] овощи: %%checksorted-cascade%% ✅ 2026-08-09/);
	assert.match(result, /    - \[x\] огурцы ✅ 2026-08-09/);
	assert.match(result, /    - \[x\] помидоры ✅ 2026-08-09/);
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
		instance.transformGlobalContent(input, "restore-unchecked").content,
		["- [ ] овощи:", "    Комментарий", "    - [ ] редиска", "    - [ ] огурцы"].join("\n")
	);
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
	assert.match(result, /- \[c\] овощи: %%checksorted-context%%/);
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
	assert.match(completed, /- \[x\] овощи: %%checksorted-cascade%%/);
	assert.match(completed, /    - \[x\] огурцы/);
	assert.ok(completed.indexOf("хлеб") < completed.indexOf("овощи"));

	const restored = instance.sortItemsInPlaceContent(
		completed.replace("- [x] овощи:", "- [ ] овощи:")
	);
	assert.doesNotMatch(restored, /checksorted-cascade/);
	assert.match(restored, /    - \[ \] огурцы/);
	assert.match(restored, /    - \[ \] редиска/);
}

console.log("Cascade task tests: OK");
