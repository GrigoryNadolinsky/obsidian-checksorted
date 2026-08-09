export interface CheckSortedSettings {
	completedAreaHierarchy: string;
	completedAreaName: string;
	showIcon: boolean;
	showStatusBar: boolean;
	autoMove: boolean;
	autocomplete: boolean;
	showDeleteButton: boolean;
	dateStamp: boolean;
	dateFormat: string;
	sortOrder: "append" | "prepend";
	sortMethod: "global" | "in-place";
	keepEmptyParents: boolean;
	cascadeRestore: boolean;
	contextStatus: string;
	completedParentBehavior: "none" | "move" | "stay";
	parentDeleteBehavior: "cascade" | "promote";
}

export const DEFAULT_SETTINGS: CheckSortedSettings = {
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
	parentDeleteBehavior: "cascade",
};
