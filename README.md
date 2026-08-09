# CheckSorted

An [Obsidian](https://obsidian.md) plugin that keeps your checkbox lists tidy; completed items move into a dedicated section at the bottom of your note, and typing, completing, and deleting tasks all get out of your way.

![CheckSorted](docs/img/hero.png)


## Features

#### Move tasks where they belong

Check a task and it slips into a **Completed** section at the foot of your note. Do it on demand from the command palette or ribbon, or turn on **auto-move** and watch each task leave the instant you tick it. Uncheck something by mistake? It quietly returns to your active list on its own.

Auto-move works in both editing and Reading view on desktop and mobile. In Reading view, CheckSorted waits for Obsidian to save the checkbox change before reorganizing the note, so taps are handled consistently without racing the file write.

![Completed tasks moved into their own section](docs/img/move.png)

#### Keep nested tasks together

Completing a child stores its full parent path in the completed area and merges it with an existing matching path. Those structural parent rows and all CheckSorted metadata stay hidden; only the real completed child is rendered. Completing a parent checks and moves its entire subtree. Unchecking it can restore either the whole subtree or only the parent, depending on your settings. Stable hidden metadata keeps duplicate task names, arbitrary nesting, and original sibling order unambiguous throughout completion and restoration.

Indented comments, links, images, and other continuation content travel with their owning task. The one-click delete button can either remove a parent's complete logical subtree—including children already in Completed—or remove only the parent and promote its children one level.

#### Sync both ways in one click

The sidebar ribbon runs a full pass: completed tasks move down, anything you un-ticked moves back up, and leftover empty checkboxes are swept away; so neither list ever drifts out of sync.

#### Autocomplete tasks as you type

Start typing in a checkbox and CheckSorted suggests matching tasks from anywhere in the note, done or not. Pick one and that task hops onto the line you're typing, with its original copy removed, so duplicates collapse into a single entry. The task lands in the state of the line you're typing: type into an unchecked box and an archived task comes back active; type into a checked box and an open task is marked done; all in one keystroke.

![Task autocomplete suggesting matching checkboxes](docs/img/autocomplete.png)

#### Delete a task in one click

Hover a checkbox line in the editor and a **×** appears on the right, just like Google Keep. Click it to remove that task; no selecting, no backspacing.

![Click-to-delete button on a checkbox line](docs/img/delete.png)

#### Tidy up in bulk

- **Restore all** — pull every archived task back into the active list at once
- **Clear** — delete the completed section and everything in it in a single step

#### Shape it to your workflow

- **Custom heading** — name the archive section and pick its level, H1 through H6
- **Completion dates** — stamp each finished task with a date like `✅ 2026-06-19`, in any [Moment.js](https://momentjs.com/docs/#/displaying/format/) format
- **Newest first or last**  add completed items to the top or bottom of the archive
- **Status bar toggle** — flip auto-move on or off and read its state (`✓` / `✗`) at a glance

---

## Usage

### Commands

All commands are available via the Command Palette (`Ctrl/Cmd + P`):

| Command | Description |
|---|---|
| **Move completed items to completed area** | Moves all `- [x]` items from your note body into the completed section |
| **Restore all items from completed area** | Unchecks all items and moves them back to the note body |
| **Clear completed area** | Deletes the completed section and all items in it |

You can assign custom hotkeys to any of these in **Settings → Hotkeys**.

### Ribbon icon

Clicking the CheckSorted ribbon icon in the left sidebar runs a **full sync** in one step:

1. Any unchecked `- [ ]` items left in the completed area are returned to the main list (and stray empty checkboxes are cleared).
2. All checked `- [x]` items in the note body are moved into the completed area.

### Example

Before running Move:

```markdown
- [ ] Write proposal
- [x] Research topic
- [ ] Schedule meeting
- [x] Review notes
```

After running Move:

```markdown
- [ ] Write proposal
- [ ] Schedule meeting

## Completed
- [x] Research topic
- [x] Review notes
```

Unchecking an item in the completed area automatically returns it to the main list.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| Sort method | Global completed area | Move completed trees to one archive or sort them in place |
| Header level | H2 | Heading level for the completed section |
| Header name | `Completed` | Text of the completed section heading |
| Keep empty parent items | On | Keep a parent in the active list after its last child moves to the completed area |
| Context checkbox status | `c` | Custom one-character status used internally for hidden structural parent copies |
| Show ribbon icon | On | Display the trigger icon in the left sidebar |
| Show status bar toggle | On | Show `CheckSorted ✓ / ✗` in the bottom status bar — click to toggle auto-move |
| Auto-move on complete | On | Automatically move items to the completed area when checked |
| Restore descendants with parent | On | Unchecking a completed parent restores and unchecks its entire subtree |
| When all child tasks are completed | Leave parent open | Leave the parent open, complete and move it, or complete it in place |
| When deleting a parent task | Delete parent and children | Delete the complete logical subtree or promote the parent's children one level |
| Show delete button | On | Show a × on the right of each checkbox line in the editor; click it to delete that task |
| Task autocomplete | On | Suggest matching tasks while typing in a checkbox; selecting one moves it to the line you're typing |
| Date stamp | Off | Append `✅ <date>` when items are moved |
| Date format | `YYYY-MM-DD` | [Moment.js](https://momentjs.com/docs/#/displaying/format/) format for the stamp |
| New items order | Append | Add new completed items at the bottom or top of the section |

---

## Installation

### From Community Plugins

Once approved, CheckSorted will be installable directly from Obsidian:

1. Open **Settings → Community Plugins** and click **Browse**
2. Search for **CheckSorted**
3. Click **Install**, then **Enable**

### Using BRAT

[BRAT](https://github.com/TfTHacker/obsidian42-brat) lets you install plugins directly from GitHub before community store approval.

1. Install **BRAT** from the Obsidian community plugins
2. Open BRAT settings and click **Add Beta Plugin**
3. Paste this URL: `https://github.com/GrigoryNadolinsky/obsidian-checksorted`
4. Enable **CheckSorted** in **Settings → Community Plugins**

BRAT will also handle updates automatically.

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/GrigoryNadolinsky/obsidian-checksorted/releases)
2. Copy all three files into your vault at `.obsidian/plugins/checksorted/`
3. Reload Obsidian and enable **CheckSorted** in **Settings → Community Plugins**

---

## Credits

Inspired by [obsidian-completed-area](https://github.com/DahaWong/obsidian-completed-area) by [DahaWong](https://github.com/DahaWong).

---

## License

MIT
